// #73 — Self-service password reset: end-to-end (real request -> route -> service
// -> in-memory MongoDB -> response), including the abuse cases from the issue:
//   - unknown email -> generic 200, no email sent, no token stored (no enumeration)
//   - known email   -> generic 200, HASHED token persisted, raw link emailed
//   - valid token   -> password set for an OAuth-only ('no password') account
//   - expired token -> generic 400
//   - used token    -> generic 400 (single-use)
//   - Mongo-operator injection in email/token -> rejected, no bulk match
//   - rate-limit trips (per-account and per-IP)
//   - no token / secret is written to the logs
// These fail against the pre-#73 stub (no backend existed).

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { startMemoryMongo, stopMemoryMongo } from "../helpers/mongo";
import { callRoute } from "../helpers/route";

// Mock the mailer: no real SMTP, and we can assert send / no-send + capture the raw token.
const mockSendReset = jest.fn().mockResolvedValue();
jest.mock("@/app/utils/email.util.js", () => ({
  __esModule: true,
  sendVerificationEmail: jest.fn().mockResolvedValue(),
  sendInviteEmail: jest.fn().mockResolvedValue(),
  sendPasswordResetEmail: (...a) => mockSendReset(...a),
}));

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

let forgotPOST, resetPOST, AuthService, UserModel, db, resetRateLimit;

const ORIG = {
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
};

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"; // 32 bytes
  process.env.JWT_SECRET = "test-jwt-secret";
  process.env.NEXT_PUBLIC_URL = "http://localhost:3000";
  await startMemoryMongo(); // sets MONGODB_URI before the DB singleton connects
  jest.resetModules();
  forgotPOST = (await import("@/app/api/auth/forgot-password/route")).POST;
  resetPOST = (await import("@/app/api/auth/reset-password/route")).POST;
  AuthService = (await import("@/app/api/auth/[...nextauth]/service")).default;
  UserModel = (await import("@/app/api/auth/[...nextauth]/model")).default;
  db = (await import("@/lib/database")).db;
  resetRateLimit = (await import("@/lib/rateLimit"))._resetRateLimit;
});

afterAll(async () => {
  await stopMemoryMongo();
  if (ORIG.ENCRYPTION_KEY === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = ORIG.ENCRYPTION_KEY;
  if (ORIG.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIG.JWT_SECRET;
});

beforeEach(async () => {
  mockSendReset.mockReset().mockResolvedValue();
  resetRateLimit();
  const dbi = await db.connect();
  await dbi.collection("users").deleteMany({});
});

/** Insert a user directly (bypasses register()'s verification email). */
async function seedUser({ email, password }) {
  const dbi = await db.connect();
  const userID = `user-${crypto.randomBytes(4).toString("hex")}`;
  await dbi.collection("users").insertOne({
    userID,
    firstName: "Test",
    lastName: "User",
    email: AuthService.encryptEmail(email),
    password,
    role: "user",
    status: "verified",
  });
  return userID;
}

const getUser = async (userID) => {
  const dbi = await db.connect();
  return dbi.collection("users").findOne({ userID });
};

const forgot = (body, headers) =>
  callRoute(forgotPOST, { method: "POST", url: "http://localhost/api/auth/forgot-password", body, headers });
const reset = (body, headers) =>
  callRoute(resetPOST, { method: "POST", url: "http://localhost/api/auth/reset-password", body, headers });

describe("POST /api/auth/forgot-password (#73)", () => {
  test("unknown email -> generic 200, no email sent, nothing stored (no enumeration)", async () => {
    const res = await forgot({ email: "ghost@example.com" });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
    expect(mockSendReset).not.toHaveBeenCalled();
    const count = await (await db.connect()).collection("users").countDocuments({});
    expect(count).toBe(0);
  });

  test("known email -> generic 200; a HASHED token is persisted and the raw link emailed", async () => {
    const userID = await seedUser({ email: "ada@example.com", password: await bcrypt.hash("oldpassword", 10) });
    const res = await forgot({ email: "ada@example.com" });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });

    expect(mockSendReset).toHaveBeenCalledTimes(1);
    const [toEmail, rawToken] = mockSendReset.mock.calls[0];
    expect(toEmail).toBe("ada@example.com");
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);

    const user = await getUser(userID);
    expect(user.passwordResetTokenHash).toBe(sha256(rawToken)); // stored = hash of emailed token
    expect(user.passwordResetTokenHash).not.toBe(rawToken); // never plaintext
    expect(new Date(user.passwordResetExpires).getTime()).toBeGreaterThan(Date.now());
  });

  test("Mongo-operator injection in email is neutralised (no match, no email)", async () => {
    await seedUser({ email: "victim@example.com", password: "no password" });
    const res = await forgot({ email: { $ne: "" } }); // classic NoSQL operator injection
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
    expect(mockSendReset).not.toHaveBeenCalled(); // did not match every user
  });

  test("per-account rate limit trips after repeated requests -> 429", async () => {
    await seedUser({ email: "target@example.com", password: "no password" });
    // per-account limit is 3/hour; the 4th for the same email is blocked.
    for (let i = 0; i < 3; i++) expect((await forgot({ email: "target@example.com" })).status).toBe(200);
    const blocked = await forgot({ email: "target@example.com" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("POST /api/auth/reset-password (#73)", () => {
  /** Run the request flow and return the raw token the mailer received. */
  async function requestTokenFor(email, password) {
    const userID = await seedUser({ email, password });
    await forgot({ email });
    const [, rawToken] = mockSendReset.mock.calls[0];
    return { userID, rawToken };
  }

  test("valid token sets a password for an OAuth-only account (password 'no password')", async () => {
    const { userID, rawToken } = await requestTokenFor("oauth@example.com", "no password");

    const res = await reset({ token: rawToken, newPassword: "brandnewpass1" });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true, message: "Password has been reset." });

    const user = await getUser(userID);
    expect(user.password).not.toBe("no password");
    expect(await bcrypt.compare("brandnewpass1", user.password)).toBe(true);
    // token consumed (single-use)
    expect(user.passwordResetTokenHash).toBeUndefined();
    expect(user.passwordResetExpires).toBeUndefined();
  });

  test("already-used token is rejected (single-use) -> generic 400", async () => {
    const { rawToken } = await requestTokenFor("used@example.com", "no password");
    expect((await reset({ token: rawToken, newPassword: "firstpass12" })).status).toBe(200);

    const replay = await reset({ token: rawToken, newPassword: "secondpass34" });
    expect(replay.status).toBe(400);
    expect(replay.json.error).toBe("Invalid or expired reset token.");
  });

  test("expired token is rejected -> generic 400", async () => {
    const { userID, rawToken } = await requestTokenFor("expired@example.com", "no password");
    // Force expiry into the past.
    await (await db.connect()).collection("users").updateOne(
      { userID },
      { $set: { passwordResetExpires: new Date(Date.now() - 1000) } },
    );
    const res = await reset({ token: rawToken, newPassword: "totallyvalid9" });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("Invalid or expired reset token.");
  });

  test("garbage token -> generic 400, reveals nothing", async () => {
    const res = await reset({ token: "not-a-real-token", newPassword: "totallyvalid9" });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("Invalid or expired reset token.");
  });

  test("short password -> generic policy 400, no account changed", async () => {
    const { userID, rawToken } = await requestTokenFor("policy@example.com", "no password");
    const res = await reset({ token: rawToken, newPassword: "short" });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("Password does not meet requirements.");
    const user = await getUser(userID);
    expect(user.password).toBe("no password"); // untouched
  });

  test("Mongo-operator injection in token is neutralised -> 400, no user matched", async () => {
    await seedUser({ email: "inj@example.com", password: "no password" });
    const res = await reset({ token: { $gt: "" }, newPassword: "totallyvalid9" });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("Invalid or expired reset token.");
  });

  test("per-IP rate limit trips on repeated resets -> 429", async () => {
    // per-IP limit is 10/15min; the 11th from the same IP is blocked.
    const headers = { "x-forwarded-for": "203.0.113.9" };
    for (let i = 0; i < 10; i++) {
      const r = await reset({ token: "bad", newPassword: "totallyvalid9" }, headers);
      expect([400]).toContain(r.status);
    }
    const blocked = await reset({ token: "bad", newPassword: "totallyvalid9" }, headers);
    expect(blocked.status).toBe(429);
  });
});

describe("#73 no secret leakage in logs", () => {
  test("running the full flow never logs the raw token or its hash", async () => {
    const spies = ["log", "error", "warn", "info", "debug"].map((m) =>
      jest.spyOn(console, m).mockImplementation(() => {}),
    );
    try {
      await seedUser({ email: "logs@example.com", password: "no password" });
      await forgot({ email: "logs@example.com" });
      const [, rawToken] = mockSendReset.mock.calls[0];
      await reset({ token: rawToken, newPassword: "brandnewpass1" });

      const hash = sha256(rawToken);
      const allOutput = spies.flatMap((s) => s.mock.calls).map((args) => args.map(String).join(" ")).join("\n");
      expect(allOutput).not.toContain(rawToken);
      expect(allOutput).not.toContain(hash);
      expect(allOutput).not.toContain("brandnewpass1");
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
