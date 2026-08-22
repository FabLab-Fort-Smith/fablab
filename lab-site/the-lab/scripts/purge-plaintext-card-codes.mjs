#!/usr/bin/env node
/**
 * FINAL retire step: remove the plaintext card codes from users.membership.accessKey.code once
 * they live safely in the addon's encrypted store (doorAccessCards). SAFE: a user's code is only
 * purged if a matching card (by blind index) already exists in the addon store — otherwise it is
 * SKIPPED (never orphan a credential). Idempotent, resumable, DRY-RUN by default.
 *
 * Run this ONLY after: cutover proven (authoritative), the backfill has run
 * (scripts/migrate-access-cards.mjs), and new pairings are enrolling (register-card).
 *
 * Usage:
 *   node scripts/purge-plaintext-card-codes.mjs             # dry-run (report only)
 *   node scripts/purge-plaintext-card-codes.mjs --apply     # actually null the codes
 *   node scripts/purge-plaintext-card-codes.mjs --apply --limit 100
 *
 * Env (required; no fallbacks): MONGODB_URI, MONGODB_NAME, DOOR_CARD_INDEX_KEY.
 * The blind-index derivation is a faithful copy of cardCrypto.js (pinned by a test vector).
 * NEVER logs a card code.
 */
import crypto from "crypto";
import { MongoClient } from "mongodb";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) { console.error(`ERROR: ${name} is not set`); process.exit(1); }
  return v;
}
function blindIndex(code, idxSecret) {
  return crypto.createHmac("sha256", crypto.createHash("sha256").update(idxSecret).digest()).update(String(code)).digest("hex");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const limArg = process.argv.indexOf("--limit");
  const limit = limArg > -1 ? parseInt(process.argv[limArg + 1], 10) || 0 : 0;

  const uri = requireEnv("MONGODB_URI");
  const dbName = requireEnv("MONGODB_NAME");
  const idxSecret = requireEnv("DOOR_CARD_INDEX_KEY");

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const database = client.db(dbName);
    const users = database.collection("users");
    const cards = database.collection("doorAccessCards");

    const cursor = users.find(
      { "membership.accessKey.code": { $nin: [null, ""] } },
      { projection: { userID: 1, "membership.accessKey.code": 1 } }
    );

    let seen = 0, purged = 0, wouldPurge = 0, skippedNoCard = 0, bad = 0;
    for await (const u of cursor) {
      if (limit && seen >= limit) break;
      seen += 1;
      const code = u?.membership?.accessKey?.code;
      const userID = u?.userID;
      if (!code || !userID) { bad += 1; continue; }

      // Safety: only purge if the encrypted store already holds this card.
      const bi = blindIndex(String(code), idxSecret);
      const present = await cards.findOne({ bi }, { projection: { _id: 1 } });
      if (!present) { skippedNoCard += 1; continue; } // never orphan a credential

      if (!apply) { wouldPurge += 1; continue; }
      await users.updateOne(
        { userID },
        {
          $set: { "membership.accessKey.pairedAt": new Date().toISOString() },
          $unset: { "membership.accessKey.code": "" },
        }
      );
      purged += 1;
    }

    console.log(
      `[purge-plaintext-card-codes]${apply ? "" : " DRY-RUN"} seen=${seen} ` +
        `${apply ? `purged=${purged}` : `wouldPurge=${wouldPurge}`} skippedNoCard=${skippedNoCard} bad=${bad}`
    );
    if (skippedNoCard > 0) console.warn(`WARNING: ${skippedNoCard} user(s) had a code with NO matching addon card — run migrate-access-cards.mjs first; not purged.`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error("purge-plaintext-card-codes failed:", e && e.message ? e.message : e);
  process.exit(1);
});
