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
