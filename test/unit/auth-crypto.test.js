// Exercises the ENCRYPTION_KEY fallback removal (SEC-23): with a configured
// 32-byte key the email encrypt/decrypt path still round-trips. (The deeper
// AES-256-GCM + blind-index redesign is tracked separately under Epic E5.)
const ORIGINAL = process.env.ENCRYPTION_KEY;

afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = ORIGINAL;
});

test("AuthService encrypt/decrypt round-trips with a configured 32-byte key", async () => {
  process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"; // exactly 32 bytes
  jest.resetModules();
  const { default: AuthService } = await import("@/app/api/auth/[...nextauth]/service");

  const enc = AuthService.encryptEmail("member@example.com");
  expect(enc).not.toBe("member@example.com"); // actually encrypted
  expect(AuthService.decryptEmail(enc)).toBe("member@example.com");
});
