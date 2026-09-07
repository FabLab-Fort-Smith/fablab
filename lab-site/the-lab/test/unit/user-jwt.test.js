// Exercises the JWT_SECRET fallback removal (SEC-07): tokens are signed/verified
// using the env-provided secret, and the configured path still round-trips.
const ORIGINAL = process.env.JWT_SECRET;

afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL;
});

test("User signs and verifies a token with JWT_SECRET from env", async () => {
  process.env.JWT_SECRET = "test-jwt-secret";
  jest.resetModules();
  const { default: User } = await import("@/app/api/v1/users/class");

  const user = new User("Ada", "Lovelace", "ada", "ada@example.com", "pw", "", "user", "verified");
  expect(typeof user.verificationToken).toBe("string");

  const decoded = User.verifyToken(user.verificationToken);
  expect(decoded).toBeTruthy();
  expect(decoded.email).toBe("ada@example.com");
  expect(decoded.userID).toBe(user.userID);
});

// Issue #130: the dead "Show Email Address" privacy toggle was removed. A member's
// email is never exposed to other members (the public projection strips it), so the
// setting had no consumer and misleadingly defaulted email to non-private. The
// privacy defaults must no longer carry a `showEmail` key.
test("User privacy defaults omit the removed showEmail toggle (issue #130)", async () => {
  process.env.JWT_SECRET = "test-jwt-secret";
  jest.resetModules();
  const { default: User } = await import("@/app/api/v1/users/class");

  const user = new User("Ada", "Lovelace", "ada", "ada@example.com", "pw", "", "user", "verified");
  expect(user.privacy).not.toHaveProperty("showEmail");
  expect(user.privacy).toEqual({ showDiscord: true, showPhone: false });
});
