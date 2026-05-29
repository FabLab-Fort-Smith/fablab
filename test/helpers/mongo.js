import { MongoMemoryServer } from "mongodb-memory-server";

let mongod = null;

/**
 * Start an ephemeral in-memory MongoDB and point the app's MONGODB_URI at it.
 * Import app modules that touch the DB *after* calling this so the singleton
 * connects to the memory server. Returns the connection URI.
 */
export async function startMemoryMongo() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;
  return uri;
}

/** Stop the in-memory MongoDB (call in afterAll). */
export async function stopMemoryMongo() {
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}
