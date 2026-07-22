// #73 — Self-service password reset: AuthService unit coverage.
//
// Verifies the security-critical logic in isolation (model + mailer mocked):
//  - tokens are high-entropy, hashed-at-rest, and time-boxed
//  - request NEVER reveals account existence (no enumeration) and never emails
//    an unknown address
//  - reset validates token (constant-time) + expiry + single-use, enforces the
//    password policy, and works for OAuth-only accounts (password 'no password')
// These fail against the pre-#73 code (no request/reset logic existed).

import crypto from "crypto";

// --- Mock the persistence + mail boundaries (factory may only close over mock* vars). ---
const mockFindByEmail = jest.fn();
const mockSetToken = jest.fn().mockResolvedValue(true);
const mockFindByHash = jest.fn();
const mockComplete = jest.fn().mockResolvedValue(true);
jest.mock("@/app/api/auth/[...nextauth]/model", () => ({
  __esModule: true,
  default: {
    findByEmail: (...a) => mockFindByEmail(...a),
    setPasswordResetToken: (...a) => mockSetToken(...a),
    findByPasswordResetTokenHash: (...a) => mockFindByHash(...a),
    completePasswordReset: (...a) => mockComplete(...a),
  },
}));

const mockSendReset = jest.fn().mockResolvedValue();
jest.mock("@/app/utils/email.util.js", () => ({
  __esModule: true,
  sendVerificationEmail: jest.fn().mockResolvedValue(),
  sendInviteEmail: jest.fn().mockResolvedValue(),
  sendPasswordResetEmail: (...a) => mockSendReset(...a),
}));

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;
let AuthService;

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"; // exactly 32 bytes
  jest.resetModules();
  AuthService = (await import("@/app/api/auth/[...nextauth]/service")).default;
});
afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
});
beforeEach(() => {
  mockFindByEmail.mockReset();
  mockSetToken.mockReset().mockResolvedValue(true);
  mockFindByHash.mockReset();
  mockComplete.mockReset().mockResolvedValue(true);
  mockSendReset.mockReset().mockResolvedValue();
});

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

describe("#73 token generation", () => {
  test("raw token is 256-bit CSPRNG hex; stored form is its sha-256 hash; ~30min expiry", () => {
    const { rawToken, tokenHash, expires } = AuthService.generatePasswordResetToken();
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
    expect(tokenHash).toBe(sha256(rawToken));
    expect(tokenHash).not.toBe(rawToken); // hashed, never stored raw
    const ms = new Date(expires).getTime() - Date.now();
    expect(ms).toBeGreaterThan(25 * 60_000);
    expect(ms).toBeLessThanOrEqual(30 * 60_000);
  });

  test("each token is unique (entropy)", () => {
    const a = AuthService.generatePasswordResetToken().rawToken;
    const b = AuthService.generatePasswordResetToken().rawToken;
    expect(a).not.toBe(b);
  });
});

describe("#73 requestPasswordReset — no account enumeration", () => {
  test("unknown email: no token stored, no email sent, resolves silently", async () => {
    mockFindByEmail.mockResolvedValue(null);
    await expect(AuthService.requestPasswordReset("nobody@example.com")).resolves.toBeUndefined();
    expect(mockSetToken).not.toHaveBeenCalled();
    expect(mockSendReset).not.toHaveBeenCalled();
  });

  test("known email: stores the HASH (not the raw token) and emails the raw link", async () => {
    mockFindByEmail.mockResolvedValue({ userID: "user-abc", email: "enc", password: "hash" });
    await AuthService.requestPasswordReset("ada@example.com");

    expect(mockSetToken).toHaveBeenCalledTimes(1);
    const [userID, storedHash, expires] = mockSetToken.mock.calls[0];
    expect(userID).toBe("user-abc");
    expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(new Date(expires).getTime()).toBeGreaterThan(Date.now());

    expect(mockSendReset).toHaveBeenCalledTimes(1);
    const [toEmail, rawToken] = mockSendReset.mock.calls[0];
    expect(toEmail).toBe("ada@example.com"); // plaintext recipient
    expect(storedHash).toBe(sha256(rawToken)); // stored is the hash of the emailed token
    expect(storedHash).not.toBe(rawToken);
  });

  test("looks up by ENCRYPTED email (deterministic ciphertext), never plaintext", async () => {
    mockFindByEmail.mockResolvedValue(null);
    await AuthService.requestPasswordReset("ada@example.com");
    const [queried] = mockFindByEmail.mock.calls[0];
    expect(queried).toBe(AuthService.encryptEmail("ada@example.com"));
    expect(queried).not.toBe("ada@example.com");
  });

  test("a mail failure does not throw (best-effort, fail-safe)", async () => {
    mockFindByEmail.mockResolvedValue({ userID: "user-x", email: "enc" });
    mockSendReset.mockRejectedValue(new Error("smtp down"));
    await expect(AuthService.requestPasswordReset("x@example.com")).resolves.toBeUndefined();
  });
});

describe("#73 resetPassword — validation, single-use, OAuth-only", () => {
  const validPw = "correcthorse";

  test("rejects a too-short password before touching the token", async () => {
    await expect(AuthService.resetPassword("tok", "short")).rejects.toThrow(
      "Password does not meet requirements.",
    );
    expect(mockComplete).not.toHaveBeenCalled();
  });

  test("rejects an over-long password (DoS bound)", async () => {
    await expect(AuthService.resetPassword("tok", "a".repeat(129))).rejects.toThrow(
      "Password does not meet requirements.",
    );
  });

  test("unknown/garbage token -> generic error, no write", async () => {
    mockFindByHash.mockResolvedValue(null);
    await expect(AuthService.resetPassword("deadbeef", validPw)).rejects.toThrow(
      "Invalid or expired reset token.",
    );
    expect(mockComplete).not.toHaveBeenCalled();
  });

  test("expired token -> generic error, no write", async () => {
    const raw = "a".repeat(64);
    mockFindByHash.mockResolvedValue({
      userID: "user-1",
      passwordResetTokenHash: sha256(raw),
      passwordResetExpires: new Date(Date.now() - 1000), // in the past
    });
    await expect(AuthService.resetPassword(raw, validPw)).rejects.toThrow(
      "Invalid or expired reset token.",
    );
    expect(mockComplete).not.toHaveBeenCalled();
  });

  test("valid token -> sets a bcrypt hash and consumes the token", async () => {
    const raw = "b".repeat(64);
    mockFindByHash.mockResolvedValue({
      userID: "user-2",
      passwordResetTokenHash: sha256(raw),
      passwordResetExpires: new Date(Date.now() + 60_000),
    });
    const res = await AuthService.resetPassword(raw, validPw);
    expect(res).toEqual({ message: "Password has been reset." });
    expect(mockComplete).toHaveBeenCalledTimes(1);
    const [userID, hashed] = mockComplete.mock.calls[0];
    expect(userID).toBe("user-2");
    expect(hashed).toMatch(/^\$2[aby]\$/); // bcrypt hash, not plaintext
    expect(hashed).not.toBe(validPw);
  });

  test("OAuth-only account (password 'no password') CAN set a password — no old-password gate", async () => {
    const raw = "c".repeat(64);
    mockFindByHash.mockResolvedValue({
      userID: "user-oauth",
      password: "no password", // sentinel for OAuth-only accounts
      passwordResetTokenHash: sha256(raw),
      passwordResetExpires: new Date(Date.now() + 60_000),
    });
    await expect(AuthService.resetPassword(raw, validPw)).resolves.toEqual({
      message: "Password has been reset.",
    });
    expect(mockComplete).toHaveBeenCalledWith("user-oauth", expect.stringMatching(/^\$2[aby]\$/));
  });
});
