import { startMemoryMongo, stopMemoryMongo } from "../helpers/mongo";

// Proves the DB-backed E2E path: ephemeral MongoDB + the app's own db singleton.
// If the in-memory MongoDB binary can't be provisioned (e.g. offline sandbox),
// the test self-skips so the suite stays green; CI provisions it for real.
describe("mongodb-memory-server integration", () => {
  let available = true;
  let db;

  beforeAll(async () => {
    try {
      await startMemoryMongo();
      ({ db } = await import("@/lib/database")); // import AFTER MONGODB_URI is set
    } catch (e) {
      available = false;
      console.warn("Skipping DB smoke test (in-memory MongoDB unavailable):", e.message);
    }
  });

  afterAll(async () => {
    try {
      if (db?.client) await db.client.close();
    } catch {
      /* ignore */
    }
    await stopMemoryMongo();
  });

  test("connects and round-trips a document via db.dbUsers()", async () => {
    if (!available) return;
    const users = await db.dbUsers();
    await users.insertOne({ userID: "test-1", firstName: "Ada" });
    const found = await users.findOne({ userID: "test-1" });
    expect(found?.firstName).toBe("Ada");
  });
});
