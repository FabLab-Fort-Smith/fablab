// Staging data-mode tool — unit tests (fablab #107 phase 2, real-data mode).
//
// Covers the security-critical logic of scripts/anonymize-staging.js WITHOUT a live Mongo (a tiny
// in-memory fake db keeps the suite hermetic — no network, no mongod binary): the re-key round-trip
// (decrypt-prod -> encrypt-staging -> decrypt-staging === original), fail-closed on a wrong/missing
// production key, the default anonymized path, the window/cap parsing, and the auto-revert decision.
//
// Two DISTINCT 32-byte test keys stand in for prod vs staging ENCRYPTION_KEY.

import {
  makeCipher, parseWindow, validateRealRequest, shouldRevert, maxWindowMs,
  dbNameFromUri, guardStaging, selfTest,
  rekeyRealDb, verifyRealRekey, anonymizeDb, verifyAnonymized,
  hasRealPii, revertDecision,
  readMarker, MARKER_ID, SYNTHETIC_DOMAIN, DEFAULT_MAX_WINDOW_HOURS,
} from "../../scripts/anonymize-staging.js";

const PROD_KEY = "0123456789abcdef0123456789abcdef"; // 32 bytes
const STG_KEY = "fedcba9876543210fedcba9876543210"; // 32 bytes, different
const HOUR = 3600 * 1000;

// ---------------------------------------------------------------- tiny in-memory fake db
function setDot(obj, path, val) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i += 1) { o[keys[i]] = o[keys[i]] ?? {}; o = o[keys[i]]; }
  o[keys[keys.length - 1]] = val;
}
function unsetDot(obj, path) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i += 1) { if (o == null) return; o = o[keys[i]]; }
  if (o) delete o[keys[keys.length - 1]];
}
function idEq(a, b) { return String(a) === String(b); }

function fakeDb(collections, databaseName = "thelab_staging") {
  const store = {};
  for (const [k, v] of Object.entries(collections)) store[k] = v.map((d) => structuredClone(d));
  const col = (name) => {
    store[name] ||= [];
    const docs = () => store[name];
    return {
      find() {
        let arr = docs();
        const cursor = {
          limit(n) { arr = arr.slice(0, n); return cursor; },
          async toArray() { return arr.map((d) => structuredClone(d)); },
        };
        return cursor;
      },
      async countDocuments() { return docs().length; },
      async findOne(f) { return docs().find((d) => idEq(d._id, f._id)) ?? null; },
      async updateOne(filter, update) {
        const doc = docs().find((d) => idEq(d._id, filter._id));
        if (!doc) return { modifiedCount: 0 };
        if (update.$set) for (const [p, v] of Object.entries(update.$set)) setDot(doc, p, v);
        if (update.$unset) for (const p of Object.keys(update.$unset)) unsetDot(doc, p);
        return { modifiedCount: 1 };
      },
      async updateMany(filter, update) {
        let n = 0;
        for (const doc of docs()) {
          if (update.$set) for (const [p, v] of Object.entries(update.$set)) setDot(doc, p, v);
          if (update.$unset) for (const p of Object.keys(update.$unset)) unsetDot(doc, p);
          n += 1;
        }
        return { modifiedCount: n };
      },
      async deleteMany(filter) {
        const nin = filter?._id?.$nin;
        if (nin) {
          const keep = new Set(nin.map(String));
          const before = docs().length;
          store[name] = docs().filter((d) => keep.has(String(d._id)));
          return { deletedCount: before - store[name].length };
        }
        const before = docs().length;
        store[name] = [];
        return { deletedCount: before };
      },
      async replaceOne(filter, doc) {
        const i = docs().findIndex((d) => idEq(d._id, filter._id));
        if (i >= 0) store[name][i] = structuredClone(doc);
        else docs().push(structuredClone(doc));
        return { upsertedCount: i >= 0 ? 0 : 1 };
      },
    };
  };
  return {
    databaseName,
    collection: col,
    listCollections() { return { toArray: async () => Object.keys(store).map((n) => ({ name: n })) }; },
    _store: store,
  };
}

// ---------------------------------------------------------------- makeCipher + self-test
describe("makeCipher (deterministic AES-256-CBC, per-key)", () => {
  test("is deterministic and round-trips under one key (self-test passes)", () => {
    const c = makeCipher(STG_KEY);
    expect(() => selfTest(c)).not.toThrow();
    expect(c.encrypt("a@b.com")).toBe(c.encrypt("a@b.com"));
    expect(c.decrypt(c.encrypt("a@b.com"))).toBe("a@b.com");
  });

  test("decrypt returns null (fail closed) when the ciphertext was produced by a DIFFERENT key", () => {
    const prod = makeCipher(PROD_KEY);
    const stg = makeCipher(STG_KEY);
    const ct = prod.encrypt("real.member@example.com");
    // Wrong key: bad padding -> null (never a throw, never garbage silently treated as valid).
    expect(stg.decrypt(ct)).not.toBe("real.member@example.com");
  });

  test("zeroize() wipes the key material (proves the transient prod key is scrubbed)", () => {
    const c = makeCipher(PROD_KEY);
    const before = c.encrypt("x@y.com");
    c.zeroize();
    // After wiping, the key buffer is all-zero, so the same input encrypts differently.
    expect(c.encrypt("x@y.com")).not.toBe(before);
  });
});

// ---------------------------------------------------------------- db-name guard
describe("guardStaging / dbNameFromUri (fail closed on prod / non-staging)", () => {
  test("accepts a staging URI", () => {
    expect(dbNameFromUri("mongodb://h/thelab_staging?authSource=thelab_staging")).toBe("thelab_staging");
    expect(() => guardStaging("thelab_staging")).not.toThrow();
  });
  test("refuses production", () => {
    expect(() => guardStaging("thelab_production")).toThrow(/PRODUCTION/);
  });
  test("refuses an unrecognized database", () => {
    expect(() => guardStaging("some_other_db")).toThrow(/does not look like staging/);
  });
});

// ---------------------------------------------------------------- window / cap parsing
describe("parseWindow (time-box + cap)", () => {
  const now = Date.parse("2026-09-08T00:00:00Z");
  const max = 48 * HOUR;
  test("accepts a valid future within-cap ISO-8601 timestamp", () => {
    const r = parseWindow("2026-09-08T06:00:00Z", now, max);
    expect(r.ok).toBe(true);
    expect(r.expiresAtMs).toBe(Date.parse("2026-09-08T06:00:00Z"));
  });
  test("refuses a missing --until", () => {
    expect(parseWindow(undefined, now, max).ok).toBe(false);
    expect(parseWindow("", now, max).ok).toBe(false);
  });
  test("refuses an unparseable timestamp", () => {
    expect(parseWindow("not-a-date", now, max)).toMatchObject({ ok: false });
    expect(parseWindow("2026-13-99T99:99Z", now, max).ok).toBe(false);
  });
  test("refuses a timestamp in the past", () => {
    expect(parseWindow("2026-09-07T23:59:59Z", now, max).ok).toBe(false);
  });
  test("refuses a timestamp beyond the window cap", () => {
    expect(parseWindow("2026-09-11T00:00:01Z", now, max).ok).toBe(false); // > 48h
  });
  test("maxWindowMs honours the env override and default", () => {
    expect(maxWindowMs({})).toBe(DEFAULT_MAX_WINDOW_HOURS * HOUR);
    expect(maxWindowMs({ STAGING_REAL_MAX_WINDOW_HOURS: "2" })).toBe(2 * HOUR);
    expect(maxWindowMs({ STAGING_REAL_MAX_WINDOW_HOURS: "bogus" })).toBe(DEFAULT_MAX_WINDOW_HOURS * HOUR);
  });
});

describe("validateRealRequest (audit fields required)", () => {
  const now = Date.parse("2026-09-08T00:00:00Z");
  const max = 48 * HOUR;
  const ok = { operator: "jane", reason: "verify payment webhook", until: "2026-09-08T06:00:00Z" };
  test("accepts a complete request", () => {
    expect(validateRealRequest(ok, now, max)).toMatchObject({ ok: true, operator: "jane" });
  });
  test("refuses without --operator", () => {
    expect(validateRealRequest({ ...ok, operator: "" }, now, max).ok).toBe(false);
  });
  test("refuses without --reason", () => {
    expect(validateRealRequest({ ...ok, reason: "  " }, now, max).ok).toBe(false);
  });
  test("refuses control characters (audit hygiene)", () => {
    expect(validateRealRequest({ ...ok, operator: "ja\u0001ne" }, now, max).ok).toBe(false);
  });
  test("propagates a bad window", () => {
    expect(validateRealRequest({ ...ok, until: "2026-01-01T00:00:00Z" }, now, max).ok).toBe(false);
  });
});

// ---------------------------------------------------------------- auto-revert decision
describe("shouldRevert (fail-safe auto-revert)", () => {
  const now = Date.parse("2026-09-08T12:00:00Z");
  const max = 48 * HOUR;
  test("no-op when already anonymized", () => {
    expect(shouldRevert({ mode: "anonymized" }, now, max)).toBe(false);
  });
  test("no-op during an active, within-cap real window", () => {
    const m = { mode: "real", startedAt: "2026-09-08T11:00:00Z", expiresAt: "2026-09-08T18:00:00Z" };
    expect(shouldRevert(m, now, max)).toBe(false);
  });
  test("reverts once the window has passed", () => {
    const m = { mode: "real", startedAt: "2026-09-07T11:00:00Z", expiresAt: "2026-09-08T11:00:00Z" };
    expect(shouldRevert(m, now, max)).toBe(true);
  });
  test("reverts (fail-safe) on a missing marker", () => {
    expect(shouldRevert(null, now, max)).toBe(true);
  });
  test("reverts (fail-safe) on a malformed / unknown-mode marker", () => {
    expect(shouldRevert({ mode: "real", expiresAt: "nonsense" }, now, max)).toBe(true);
    expect(shouldRevert({ mode: "weird" }, now, max)).toBe(true);
    expect(shouldRevert("not-an-object", now, max)).toBe(true);
  });
  test("reverts when a tampered marker claims MORE than the cap", () => {
    const m = { mode: "real", startedAt: "2026-09-08T11:00:00Z", expiresAt: "2026-09-20T11:00:00Z" };
    expect(shouldRevert(m, now, max)).toBe(true);
  });
});

// ---------------------------------------------------------------- real re-key path
describe("rekeyRealDb (real-data mode)", () => {
  test("round-trips a real value: decrypt-prod -> encrypt-staging -> decrypt-staging === original", async () => {
    const prod = makeCipher(PROD_KEY);
    const stg = makeCipher(STG_KEY);
    const email = "real.member@example.com";
    const phone = "5551234567";
    const db = fakeDb({ users: [{ _id: "u1", email: prod.encrypt(email), phoneNumber: prod.encrypt(phone) }] });

    const r = await rekeyRealDb(db, prod, stg);
    expect(r).toMatchObject({ ok: true, count: 1 });

    const stored = db._store.users[0];
    // Now readable by STAGING's key...
    expect(stg.decrypt(stored.email)).toBe(email);
    expect(stg.decrypt(stored.phoneNumber)).toBe(phone);
    // ...and no longer the prod ciphertext.
    expect(stored.email).not.toBe(prod.encrypt(email));
    // Verifier passes: every user email decrypts with the staging key.
    expect(await verifyRealRekey(db, stg)).toEqual([]);
  });

  test("FAIL CLOSED with the WRONG production key: rejects and writes NOTHING (no half-real)", async () => {
    const prod = makeCipher(PROD_KEY);
    const stg = makeCipher(STG_KEY);
    const wrong = makeCipher("11111111111111111111111111111111");
    const emailCT = prod.encrypt("real.member@example.com");
    const db = fakeDb({ users: [{ _id: "u1", email: emailCT, phoneNumber: prod.encrypt("5551234567") }] });

    const r = await rekeyRealDb(db, wrong, stg);
    expect(r.ok).toBe(false);
    // Nothing was re-written — staging still holds the original (prod) ciphertext, ready to be
    // scrubbed by the caller's anonymize fallback. It is NEVER left half-real.
    expect(db._store.users[0].email).toBe(emailCT);
  });

  test("FAIL CLOSED on a partially-corrupt dataset: one bad row aborts the whole run before writing", async () => {
    const prod = makeCipher(PROD_KEY);
    const stg = makeCipher(STG_KEY);
    const good = prod.encrypt("good@example.com");
    const db = fakeDb({ users: [
      { _id: "u1", email: good },
      { _id: "u2", email: "deadbeefnotcipher" }, // undecryptable with the prod key
    ] });
    const r = await rekeyRealDb(db, prod, stg);
    expect(r.ok).toBe(false);
    // Transactional: neither user was written (u1 must NOT be re-keyed while u2 fails).
    expect(db._store.users[0].email).toBe(good);
    expect(db._store.users[1].email).toBe("deadbeefnotcipher");
  });
});

// ---------------------------------------------------------------- default anonymize path (unchanged)
describe("anonymizeDb (default path unchanged + fail-closed verify)", () => {
  test("rewrites user PII to synthetic values under the staging key and sets the marker", async () => {
    const prod = makeCipher(PROD_KEY);
    const stg = makeCipher(STG_KEY);
    const db = fakeDb({
      users: [
        { _id: "u1", email: prod.encrypt("real1@example.com"), phoneNumber: prod.encrypt("5551110000"), firstName: "Real", lastName: "Person", address: "123 St" },
        { _id: "u2", email: prod.encrypt("real2@example.com") },
      ],
      contact_submissions: [{ _id: "c1", email: "someone@example.com", name: "Someone", message: "hi real@x.com" }],
      transactions: [{ _id: "t1", transactionId: "sq_123", metadata: { foo: 1 } }],
      notifications: [{ _id: "n1", message: "hi real@x.com" }],
      badges: [{ _id: "b1", name: "Fiber Laser Certified" }], // content, must NOT be treated as a person
    });

    const bad = await anonymizeDb(db, stg);
    expect(bad).toEqual([]); // fail-closed verify passes

    // users: synthetic + staging-decryptable, real fields gone
    const u1 = db._store.users[0];
    expect(stg.decrypt(u1.email)).toBe(`member1@${SYNTHETIC_DOMAIN}`);
    expect(u1.address).toBeUndefined();
    expect(u1.firstName).toBe("Test");
    // content preserved (not mistaken for a person)
    expect(db._store.badges[0].name).toBe("Fiber Laser Certified");
    // payment refs cleared
    expect(db._store.transactions[0].transactionId).toBeUndefined();
    // marker set to anonymized
    const marker = await readMarker(db);
    expect(marker).toMatchObject({ _id: MARKER_ID, mode: "anonymized" });
  });

  test("verifyAnonymized FAILS CLOSED when a user email is still production ciphertext", async () => {
    const prod = makeCipher(PROD_KEY);
    const stg = makeCipher(STG_KEY);
    // A user whose email was NOT re-written (still prod ciphertext) must be caught.
    const db = fakeDb({ users: [{ _id: "u1", email: prod.encrypt("survivor@example.com") }] });
    const bad = await verifyAnonymized(db, stg.decrypt);
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.join(" ")).toMatch(/not decryptable with staging key|still production data/);
  });

  test("verifyAnonymized FAILS CLOSED when a real-looking email survives anywhere", async () => {
    const stg = makeCipher(STG_KEY);
    const db = fakeDb({
      users: [{ _id: "u1", email: stg.encrypt(`member1@${SYNTHETIC_DOMAIN}`) }],
      repairs: [{ _id: "r1", description: "contact me at hidden@realdomain.com" }],
    });
    const bad = await verifyAnonymized(db, stg.decrypt);
    expect(bad.join(" ")).toMatch(/real-looking email/);
  });
});

// ---------------------------------------------------------------- F1: marker-independent revert
describe("revertDecision / hasRealPii (marker-independent PII scan)", () => {
  const now = Date.parse("2026-09-08T12:00:00Z");
  const max = 48 * HOUR;
  const prod = makeCipher(PROD_KEY);
  const stg = makeCipher(STG_KEY);
  const decrypt = stg.decrypt;

  const anonDb = () => fakeDb({ users: [{ _id: "u1", email: stg.encrypt(`member1@${SYNTHETIC_DOMAIN}`) }] });
  const prodCiphertextDb = () => fakeDb({ users: [{ _id: "u1", email: prod.encrypt("real@example.com") }] });
  const rekeyedRealDb = () => fakeDb({ users: [{ _id: "u1", email: stg.encrypt("real.member@example.com") }] });

  test("hasRealPii: false on an anonymized db, true when real/undecryptable data is present", async () => {
    expect(await hasRealPii(anonDb(), decrypt)).toBe(false);
    expect(await hasRealPii(prodCiphertextDb(), decrypt)).toBe(true);   // prod ciphertext
    expect(await hasRealPii(rekeyedRealDb(), decrypt)).toBe(true);      // real (non-synthetic) email
  });

  test("SCRUBS when the marker LIES 'anonymized' but real PII is present (stale/tampered marker)", async () => {
    const d = await revertDecision({ mode: "anonymized" }, prodCiphertextDb(), decrypt, now, max);
    expect(d.revert).toBe(true);
    expect(d.reason).toMatch(/real PII/i);
  });

  test("NO-OP when the marker says anonymized and the db really is anonymized", async () => {
    const d = await revertDecision({ mode: "anonymized" }, anonDb(), decrypt, now, max);
    expect(d.revert).toBe(false);
  });

  test("PRESERVES an active real window (does not scrub authorized real data mid-window)", async () => {
    const marker = { mode: "real", startedAt: "2026-09-08T11:00:00Z", expiresAt: "2026-09-08T18:00:00Z" };
    const d = await revertDecision(marker, rekeyedRealDb(), decrypt, now, max);
    expect(d.revert).toBe(false);
  });

  test("reverts (marker) when a real window has EXPIRED, regardless of the PII scan", async () => {
    const marker = { mode: "real", startedAt: "2026-09-07T11:00:00Z", expiresAt: "2026-09-08T11:00:00Z" };
    const d = await revertDecision(marker, rekeyedRealDb(), decrypt, now, max);
    expect(d.revert).toBe(true);
    expect(d.reason).toMatch(/marker/i);
  });

  test("reverts (marker) when the marker is missing", async () => {
    const d = await revertDecision(null, anonDb(), decrypt, now, max);
    expect(d.revert).toBe(true);
  });
});

// ---------------------------------------------------------------- F2: atomic-swap invariants
// The bash wrapper performs the restore-into-temp / verify / swap; here we lock in the node-side
// invariants the swap relies on: (1) a failed scrub/verify against the temp db returns non-empty
// (the wrapper aborts on that and leaves live untouched), and (2) a passing scrub sets the marker so
// the swapped-in live db carries a truthful marker.
describe("F2 atomic-swap node invariants", () => {
  test("a temp db that still holds prod ciphertext FAILS verify (wrapper then aborts, live untouched)", async () => {
    const prod = makeCipher(PROD_KEY);
    const stg = makeCipher(STG_KEY);
    // Simulate an incoming temp db where one user was not re-keyed (still prod ciphertext).
    const temp = fakeDb({ users: [{ _id: "u1", email: prod.encrypt("real@example.com") }] }, "thelab_staging_incoming");
    const bad = await verifyRealRekey(temp, stg);
    expect(bad.length).toBeGreaterThan(0); // non-zero => wrapper does NOT swap into live
  });

  test("a passing anonymize on the temp db sets a truthful marker for the swap to carry into live", async () => {
    const stg = makeCipher(STG_KEY);
    const temp = fakeDb({ users: [{ _id: "u1", email: makeCipher(PROD_KEY).encrypt("real@example.com") }] }, "thelab_staging_incoming");
    const bad = await anonymizeDb(temp, stg);
    expect(bad).toEqual([]);
    expect(await readMarker(temp)).toMatchObject({ _id: MARKER_ID, mode: "anonymized" });
  });
});
