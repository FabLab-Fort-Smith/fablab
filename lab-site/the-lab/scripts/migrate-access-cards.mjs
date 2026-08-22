#!/usr/bin/env node
/**
 * One-off, idempotent backfill: copy existing plaintext card codes
 * (membership.accessKey.code on each user) into the door-access addon's encrypted card
 * store (doorAccessCards) so the addon can resolve real cards during parallel-run/cutover.
 *
 * Reads nothing but ciphertext into the new store — the plaintext code stays where it is
 * (the live check-access still uses it until cutover completes). Safe to re-run: a card
 * already present (matched by blind index) is skipped. NEVER logs a card code.
 *
 * Usage:
 *   node scripts/migrate-access-cards.mjs --dry-run     # report only, no writes
 *   node scripts/migrate-access-cards.mjs               # backfill
 *   node scripts/migrate-access-cards.mjs --limit 100   # cap for a staged run
 *
 * Env (required; no fallbacks — fail loud):
 *   MONGODB_URI, MONGODB_NAME, DOOR_CARD_ENC_KEY, DOOR_CARD_INDEX_KEY
 *
 * The crypto below is a faithful copy of src/plugins/door-access-controller/cardCrypto.js.
 * A pinned test vector (test/unit/doorAccessCardCrypto.test.js) locks the blind-index
 * algorithm so this copy cannot silently drift — if you change the derivation here, change
 * it there and update the vector.
 */
import crypto from "crypto";
import { MongoClient } from "mongodb";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`ERROR: ${name} is not set`);
    process.exit(1);
  }
  return v;
}

function keyBytes(secret) {
  return crypto.createHash("sha256").update(secret).digest(); // 32 bytes
}
function encryptCode(code, encSecret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBytes(encSecret), iv);
  const ct = Buffer.concat([cipher.update(String(code), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}
function blindIndex(code, idxSecret) {
  return crypto.createHmac("sha256", keyBytes(idxSecret)).update(String(code)).digest("hex");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? parseInt(process.argv[limitArg + 1], 10) || 0 : 0;

  const uri = requireEnv("MONGODB_URI");
  const dbName = requireEnv("MONGODB_NAME");
  const encSecret = requireEnv("DOOR_CARD_ENC_KEY");
  const idxSecret = requireEnv("DOOR_CARD_INDEX_KEY");

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const database = client.db(dbName);
    const users = database.collection("users");
    const cards = database.collection("doorAccessCards");
    try {
      await cards.createIndex({ bi: 1 }, { unique: true });
      await cards.createIndex({ userID: 1 });
    } catch {
      /* index may already exist */
    }

    const cursor = users.find(
      { "membership.accessKey.code": { $nin: [null, ""] } },
      { projection: { userID: 1, "membership.accessKey.code": 1 } }
    );

    let seen = 0;
    let enrolled = 0;
    let skipped = 0;
    let wouldEnroll = 0;
    let bad = 0;

    for await (const u of cursor) {
      if (limit && seen >= limit) break;
      seen += 1;
      const code = u?.membership?.accessKey?.code;
      const userID = u?.userID;
      if (!code || !userID) {
        bad += 1;
        continue;
      }
      const bi = blindIndex(String(code), idxSecret);
      const existing = await cards.findOne({ bi }, { projection: { _id: 1 } });
      if (existing) {
        skipped += 1;
        continue;
      }
      if (dryRun) {
        wouldEnroll += 1;
        continue;
      }
      const now = new Date().toISOString();
      await cards.updateOne(
        { bi },
        {
          $setOnInsert: {
            userID,
            codeEnc: encryptCode(String(code), encSecret),
            bi,
            credentialType: "nfc",
            status: "active",
            createdAt: now,
            updatedAt: now,
            migratedFrom: "membership.accessKey.code",
          },
        },
        { upsert: true }
      );
      enrolled += 1;
    }

    // Never prints a single card code — counts only.
    console.log(
      `[migrate-access-cards]${dryRun ? " DRY-RUN" : ""} seen=${seen} ` +
        `${dryRun ? `wouldEnroll=${wouldEnroll}` : `enrolled=${enrolled}`} skipped=${skipped} bad=${bad}`
    );
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error("migrate-access-cards failed:", e && e.message ? e.message : e);
  process.exit(1);
});
