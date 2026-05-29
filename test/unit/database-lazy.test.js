// Build-safety regression: the MongoClient must be created lazily in connect(),
// not at module load — otherwise `next build` (no runtime env) throws
// "Cannot read properties of undefined (reading 'startsWith')" while Mongo
// parses an undefined MONGODB_URI.
describe("db module is import-safe without env (build-safe)", () => {
  const prev = process.env.MONGODB_URI;
  afterEach(() => {
    if (prev === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = prev;
  });

  test("REGRESSION: importing @/lib/database does not require MONGODB_URI at load", async () => {
    delete process.env.MONGODB_URI;
    jest.resetModules();
    await expect(import("@/lib/database")).resolves.toBeDefined();
  });

  test("connect() fails clearly when MONGODB_URI is unset (fail fast at runtime)", async () => {
    delete process.env.MONGODB_URI;
    jest.resetModules();
    const { db } = await import("@/lib/database");
    await expect(db.connect()).rejects.toThrow();
  });
});
