#!/usr/bin/env node
/**
 * Staging data-mode tool (fablab #107 phase 2, extended with a time-boxed real-data mode).
 *
 * THREE modes, one file (self-contained CommonJS so `docker cp` of this single file into the
 * staging container is enough, and so jest can transform + import it like the rest of the suite):
 *
 *   --yes                 DEFAULT / anonymize. Replace every member's personal data with
 *                         synthetic values encrypted under STAGING's own key, then verify
 *                         (fail closed). This is the ONLY safe steady state for staging.
 *
 *   --yes --real          RE-KEY / real-data mode (GATED — a human triggers it per validation
 *                         window). Instead of faking, DECRYPT each PII field with the PRODUCTION
 *                         ENCRYPTION_KEY and RE-ENCRYPT it under STAGING's ENCRYPTION_KEY, so the
 *                         real member email/phone stays usable but readable by staging. The prod
 *                         key + audit metadata arrive on STDIN as one JSON line (never argv, never
 *                         a file, never logged). Fails CLOSED: if the prod key is absent/wrong, or
 *                         a decrypt/verify fails, it ABORTS the real path and ANONYMIZES instead —
 *                         it never leaves staging half-real or holding undecryptable prod data.
 *
 *   --revert-if-expired   AUTO-REVERT safety net (no --yes needed; idempotent). Reads the
 *                         `_staging_data_mode` marker; if the real window has passed (or the marker
 *                         is missing/malformed/tampered), re-anonymizes staging and resets the
 *                         marker. No-ops when already anonymized or the window is still active.
 *                         Safe to run on a schedule so real PII cannot outlive its window even if
 *                         the operator forgets.
 *
 * WHY ANONYMIZE BY DEFAULT: copying production into staging is forbidden by CLAUDE.md §8 and
 * master §5 unless the personal data is irreversibly replaced. It is also broken without it —
 * production and staging use DIFFERENT ENCRYPTION_KEYs, so prod-encrypted emails cannot be
 * decrypted or matched by staging, and every email/login flow silently fails for copied users.
 *
 * RUN IT INSIDE THE STAGING CONTAINER, so it uses the same ENCRYPTION_KEY and the same
 * deterministic scheme as the app itself:
 *   docker exec <staging-container> node scripts/anonymize-staging.js --yes
 *
 * SAFETY (fail closed): refuses to run unless the target database name looks like staging, and
 * refuses outright if it looks like production. Every path that can produce real/undecryptable data
 * falls back to a full anonymize + verify; verification exits non-zero if ANY user email fails to
 * decrypt to a synthetic address (default) or fails to decrypt at all (real) — so a field this
 * script forgot cannot pass silently.
 *
 * Crypto note: the PII scheme is duplicated from AuthService.encryptEmail/encryptPhone
 * (src/app/api/auth/[...nextauth]/service.js) — deterministic AES-256-CBC, zero IV, key = raw
 * ENCRYPTION_KEY. It is duplicated (not imported) because that module pulls in the whole next-auth
 * graph and the `@/` alias, neither of which resolves in a plain node process. `makeCipher()` is
 * parameterized by key so the SAME scheme re-keys prod ciphertext into staging ciphertext, and the
 * self-test below asserts determinism + round-trip so a drift in either place is caught here.
 */
const crypto = require('node:crypto');
const { MongoClient } = require('mongodb');

const SYNTHETIC_DOMAIN = 'staging.invalid';
const MARKER_COLLECTION = '_staging_data_mode';
const MARKER_ID = 'current';
const DEFAULT_MAX_WINDOW_HOURS = 48;
const IV_LENGTH = 16;
const MAX_STDIN_BYTES = 64 * 1024; // bound the real-mode input channel (DoS)

/** Max real-data window in ms, capped by env STAGING_REAL_MAX_WINDOW_HOURS (default 48h). */
function maxWindowMs(env = process.env) {
  const h = Number(env.STAGING_REAL_MAX_WINDOW_HOURS);
  const hours = Number.isFinite(h) && h > 0 ? h : DEFAULT_MAX_WINDOW_HOURS;
  return hours * 3600 * 1000;
}

/**
 * Build a deterministic AES-256-CBC (zero IV) cipher bound to a given key string. This MUST match
 * AuthService EXACTLY so the running app can read what we write. `.semgrep.yml` bans CBC/ECB in
 * favour of AES-256-GCM with a random IV, and it is right — but this scheme exists to write values
 * the app (which still stores emails this way; GCM redesign tracked as E5/SEC-23) can decrypt and
 * match on. Using GCM here would produce ciphertext the app cannot read. When the app moves to GCM,
 * this moves with it.
 *
 * @param {string} keyStr - the raw ENCRYPTION_KEY (32 bytes for AES-256).
 * @returns {{encrypt: (v:any)=>string, decrypt: (v:any)=>string|null, zeroize: ()=>void}}
 *   `decrypt` returns null when the ciphertext was not produced by THIS key (fail closed, not a throw).
 */
function makeCipher(keyStr) {
  const key = Buffer.from(String(keyStr));
  const iv = Buffer.alloc(IV_LENGTH, 0); // deterministic IV — required for equality lookups
  return {
    encrypt(value) {
      if (!value) return '';
      // nosemgrep: no-unauthenticated-cipher-mode
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      return cipher.update(String(value), 'utf8', 'hex') + cipher.final('hex');
    },
    decrypt(value) {
      if (!value) return '';
      try {
        // nosemgrep: no-unauthenticated-cipher-mode
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        return decipher.update(String(value), 'hex', 'utf8') + decipher.final('utf8');
      } catch {
        return null;
      }
    },
    // Wipe the key material from memory when we are done with it (esp. the transient prod key).
    zeroize() { key.fill(0); },
  };
}

/**
 * Validate a real-mode `--until` window against the cap. Rejects missing/unparseable timestamps,
 * anything in the past, and anything beyond the max window from now.
 * @param {string} untilStr @param {number} nowMs @param {number} maxMs
 * @returns {{ok:boolean, expiresAtMs?:number, error?:string}}
 */
function parseWindow(untilStr, nowMs, maxMs) {
  if (!untilStr || typeof untilStr !== 'string') return { ok: false, error: '--until is required' };
  const t = Date.parse(untilStr);
  if (Number.isNaN(t)) return { ok: false, error: `--until is not a valid ISO-8601 timestamp: ${untilStr}` };
  if (t <= nowMs) return { ok: false, error: '--until is in the past' };
  if (t > nowMs + maxMs) {
    return { ok: false, error: `--until exceeds the max window cap of ${maxMs / 3600000}h` };
  }
  return { ok: true, expiresAtMs: t };
}

/**
 * Validate a whole real-mode request: operator + reason are required for the audit trail, and the
 * window must pass parseWindow. Rejects control characters and over-long fields (audit hygiene).
 * @param {{operator?:string, reason?:string, until?:string}} req @param {number} nowMs @param {number} maxMs
 * @returns {{ok:boolean, expiresAtMs?:number, operator?:string, reason?:string, error?:string}}
 */
function validateRealRequest(req, nowMs, maxMs) {
  const operator = String((req && req.operator) || '').trim();
  const reason = String((req && req.reason) || '').trim();
  if (!operator) return { ok: false, error: '--operator is required for real-data mode (audit)' };
  if (operator.length > 64) return { ok: false, error: '--operator is too long (max 64 chars)' };
  if (!reason) return { ok: false, error: '--reason is required for real-data mode (audit)' };
  if (reason.length > 200) return { ok: false, error: '--reason is too long (max 200 chars)' };
  if (/[\u0000-\u001f]/.test(operator + reason)) {
    return { ok: false, error: 'control characters are not allowed in --operator/--reason' };
  }
  const w = parseWindow(req && req.until, nowMs, maxMs);
  if (!w.ok) return w;
  return { ok: true, expiresAtMs: w.expiresAtMs, operator, reason };
}

/**
 * Decide whether the auto-revert must re-anonymize. Fail-safe: anything that is not provably an
 * anonymized state OR a valid, unexpired, within-cap real window returns true (scrub).
 * @param {object|null} marker @param {number} nowMs @param {number} maxMs @returns {boolean}
 */
function shouldRevert(marker, nowMs, maxMs) {
  if (!marker || typeof marker !== 'object') return true;        // unknown -> fail-safe scrub
  if (marker.mode === 'anonymized') return false;                // already safe
  if (marker.mode !== 'real') return true;                       // unknown mode -> scrub
  const started = Date.parse(marker.startedAt);
  const expires = Date.parse(marker.expiresAt);
  if (Number.isNaN(expires)) return true;                        // malformed expiry -> scrub
  if (nowMs >= expires) return true;                             // window has passed
  if (expires - nowMs > maxMs) return true;                      // claims more than the cap -> scrub
  if (!Number.isNaN(started) && expires - started > maxMs) return true; // stored span > cap -> scrub
  return false;                                                  // active, valid, within-cap window
}

/** Extract the database name from a mongodb URI (for the staging/prod guard). */
function dbNameFromUri(uri) {
  const m = /\/([^/?]+)(\?|$)/.exec(uri || '');
  return m ? decodeURIComponent(m[1]) : '';
}

/** Throw if the target db name looks like production or does not look like staging (fail closed). */
function guardStaging(dbName) {
  if (/prod/i.test(dbName)) {
    throw new Error(`target database "${dbName}" looks like PRODUCTION — refusing (this destroys data)`);
  }
  if (!/staging|thelab/i.test(dbName)) {
    throw new Error(`target database "${dbName}" does not look like staging — refusing`);
  }
}

// --- generic personal-data sweep helpers (unchanged logic; exported for tests) ----------------
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(?<!\d)(\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}(?!\d)/;
const HEX_CIPHERTEXT_RE = /^[0-9a-f]{32,}$/i;
const STRUCTURAL_FIELD = /(^|_)(id|uuid|slug)$|url$|image|^created|^updated|at$|date$|^type$|^status$|^icon$/i;
const FREE_TEXT_FIELD = /(description|message|notes?|bio|comment|text|body|summary|reason|issue|question|answer)/i;
const IDENTITY_ID_FIELD = /(discord|google|square)(id|_id|customerid|subscriptionid)?$/i;

/** Rewrite one value if it looks personal. See the long-form rationale in the runbook. */
function scrubValue(fieldName, value, seq, isPersonDoc) {
  if (typeof value !== 'string' || !value) return [false, value];
  if (HEX_CIPHERTEXT_RE.test(value)) return [false, value];
  const name = fieldName.toLowerCase();
  if (name.includes('email')) return [true, `person${seq}@${SYNTHETIC_DOMAIN}`];
  if (name.includes('phone')) return [true, `555010${String(seq).padStart(4, '0')}`];
  if (IDENTITY_ID_FIELD.test(name)) return [true, `90000000000000${String(seq).padStart(4, '0')}`];
  if (STRUCTURAL_FIELD.test(name)) return [false, value];
  if (isPersonDoc && (name === 'name' || name.endsWith('name'))) return [true, `Test Person ${seq}`];
  if (FREE_TEXT_FIELD.test(name) && (EMAIL_RE.test(value) || PHONE_RE.test(value))) {
    return [true, 'synthetic staging text'];
  }
  return [false, value];
}

/** True when a document carries contact details, i.e. it describes a PERSON. */
function looksLikePersonDoc(obj) {
  for (const [k, v] of Object.entries(obj)) {
    const n = k.toLowerCase();
    if (n.includes('email') || n.includes('phone')) return true;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && looksLikePersonDoc(v)) return true;
  }
  return false;
}

/** Build the $set for scrubbing one document, or null if nothing personal was found. */
function scrubDoc(doc, seq) {
  let changed = false;
  const set = {};
  const isPersonDoc = looksLikePersonDoc(doc);
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj)) {
      if (k === '_id') continue;
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) walk(v, path);
      else {
        const [c, nv] = scrubValue(k, v, seq, isPersonDoc);
        if (c && nv !== v) { set[path] = nv; changed = true; }
      }
    }
  };
  walk(doc, '');
  return changed ? set : null;
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

/** Assert the staging cipher is deterministic and round-trips before touching data. */
function selfTest(cipher) {
  const probe = 'probe@example.com';
  const a = cipher.encrypt(probe);
  const b = cipher.encrypt(probe);
  if (a !== b) throw new Error('encryption is not deterministic — email lookups would break');
  if (cipher.decrypt(a) !== probe) throw new Error('encrypt/decrypt round-trip failed — wrong key length?');
}

// ---------------------------------------------------------------- marker (audit / auto-revert)
/** Read the single `_staging_data_mode` marker doc (or null). */
async function readMarker(db) {
  return db.collection(MARKER_COLLECTION).findOne({ _id: MARKER_ID });
}

/**
 * Upsert the marker. No member PII and no keys are stored — only the audit metadata the human
 * supplied (operator/reason) plus the window timestamps and mode.
 * @param {import('mongodb').Db} db @param {object} fields
 */
async function writeMarker(db, fields) {
  await db.collection(MARKER_COLLECTION).replaceOne(
    { _id: MARKER_ID },
    { _id: MARKER_ID, ...fields, updatedAt: new Date().toISOString() },
    { upsert: true },
  );
}

// ---------------------------------------------------------------- anonymize (default / fallback)
/**
 * Anonymize every collection in `db`, encrypting synthetic PII under the staging cipher, then set
 * the marker to `anonymized`. Returns the list of verification failures (empty === clean).
 * @param {import('mongodb').Db} db @param {{encrypt:Function, decrypt:Function}} stagingCipher
 * @returns {Promise<string[]>}
 */
async function anonymizeDb(db, stagingCipher) {
  const { encrypt, decrypt } = stagingCipher;
  console.log(`  target database: ${db.databaseName}`);

  // users (encrypted email/phone) -> synthetic, one shared verified test credential.
  const users = db.collection('users');
  const all = await users.find({}, { projection: { _id: 1, userID: 1 } }).toArray();
  let n = 0;
  for (const u of all) {
    n += 1;
    await users.updateOne({ _id: u._id }, {
      $set: {
        email: encrypt(`member${n}@${SYNTHETIC_DOMAIN}`),
        phoneNumber: encrypt(`555010${String(n).padStart(4, '0')}`),
        firstName: 'Test',
        lastName: `Member${n}`,
        username: `member${n}`,
        // bcrypt hash of 'staging-only-password', generated with the app's bcryptjs and VERIFIED.
        password: '$2b$10$FBRfiu8R3x5mDN6AU5sQeuDHmhf12tsQMRq5WNF0WYlFgzRRmva5S',
      },
      $unset: {
        address: '', bio: '', interests: '', questions: '', socials: '', knownMembers: '',
        image: '', discordHandle: '', discordId: '', googleId: '', squareID: '',
        verificationToken: '',
        'membership.squareCustomerId': '', 'membership.squareSubscriptionId': '',
        'membership.notes': '', 'membership.accessKey.code': '',
      },
    });
  }
  console.log(`  users anonymized: ${n} (emails member1..${n}@${SYNTHETIC_DOMAIN}, one shared test credential)`);

  // contact_submissions
  const contact = db.collection('contact_submissions');
  const contactCount = await contact.countDocuments();
  if (contactCount) {
    let i = 0;
    for (const c of await contact.find({}, { projection: { _id: 1 } }).toArray()) {
      i += 1;
      await contact.updateOne({ _id: c._id }, {
        $set: { email: `contact${i}@${SYNTHETIC_DOMAIN}`, name: `Contact ${i}`, message: 'synthetic staging message' },
      });
    }
    console.log(`  contact_submissions scrubbed: ${i}`);
  }

  // payment identifiers are not ours to hold in a test environment (PCI scope)
  const tx = await db.collection('transactions').updateMany({}, { $unset: { transactionId: '', metadata: '' } });
  console.log(`  transactions payment refs cleared: ${tx.modifiedCount}`);

  // notifications: keep a small sample, scrub bodies
  const notif = db.collection('notifications');
  const keep = await notif.find({}, { projection: { _id: 1 } }).limit(25).toArray();
  const del = await notif.deleteMany({ _id: { $nin: keep.map((k) => k._id) } });
  await notif.updateMany({}, { $set: { message: 'synthetic staging notification' } });
  console.log(`  notifications truncated: kept ${keep.length}, deleted ${del.deletedCount}`);

  // generic sweep over EVERY other collection
  let sweptDocs = 0; const sweptCollections = [];
  for (const c of await db.listCollections().toArray()) {
    if (c.name === 'users' || c.name === MARKER_COLLECTION) continue;
    const col = db.collection(c.name);
    let i = 0, touched = 0;
    for (const doc of await col.find({}).toArray()) {
      i += 1;
      const set = scrubDoc(doc, i);
      if (set) { await col.updateOne({ _id: doc._id }, { $set: set }); touched += 1; }
    }
    if (touched) { sweptCollections.push(`${c.name}(${touched})`); sweptDocs += touched; }
  }
  console.log(`  generic sweep rewrote ${sweptDocs} document(s): ${sweptCollections.join(', ') || 'none'}`);

  // Record the anonymized state so the auto-revert no-ops until a new real window is opened.
  await writeMarker(db, { mode: 'anonymized', anonymizedAt: new Date().toISOString() });

  return verifyAnonymized(db, decrypt);
}

/**
 * Verify the anonymized invariant: every user email decrypts with the staging key to a synthetic
 * address, and no document anywhere still contains a real-looking email. Returns failures.
 * @param {import('mongodb').Db} db @param {(v:any)=>string|null} decrypt @returns {Promise<string[]>}
 */
async function verifyAnonymized(db, decrypt) {
  const bad = [];
  const users = db.collection('users');
  for (const u of await users.find({}, { projection: { _id: 1, email: 1, phoneNumber: 1 } }).toArray()) {
    const plain = decrypt(u.email);
    if (plain === null) bad.push(`${u._id}: email not decryptable with staging key (still production data)`);
    else if (!plain.endsWith(`@${SYNTHETIC_DOMAIN}`)) bad.push(`${u._id}: email is not synthetic (${plain.slice(0, 4)}…)`);
  }
  const REAL_EMAIL = /[a-z0-9._%+-]+@(?!staging\.invalid)[a-z0-9.-]+\.[a-z]{2,}/i;
  for (const c of await db.listCollections().toArray()) {
    if (c.name === MARKER_COLLECTION) continue; // audit metadata: operator may legitimately be an email
    let hits = 0;
    for (const doc of await db.collection(c.name).find({}).toArray()) {
      if (REAL_EMAIL.test(JSON.stringify(doc))) hits += 1;
    }
    if (hits) bad.push(`${c.name}: ${hits} document(s) still contain a real-looking email address`);
  }
  return bad;
}

// ---------------------------------------------------------------- real-data re-key mode
/**
 * Re-key member PII from production ciphertext to staging ciphertext, transactionally.
 *
 * Phase A decrypts EVERY user's email/phone with the prod key IN MEMORY; if ANY fails to decrypt or
 * does not look like real PII, the whole run is rejected (return {ok:false}) so nothing is written
 * half-real. Only when all decrypt cleanly does Phase B write them back re-encrypted under staging's
 * key. firstName/lastName/username/password and all other collections are left as real (that is the
 * point of real mode); door-card codes and addon secrets are NOT re-keyed (different keys, out of
 * scope) and remain unreadable in staging — never a plaintext leak.
 *
 * @param {import('mongodb').Db} db
 * @param {{decrypt:(v:any)=>string|null}} prodCipher
 * @param {{encrypt:(v:any)=>string}} stagingCipher
 * @returns {Promise<{ok:boolean, count?:number, error?:string}>}
 */
async function rekeyRealDb(db, prodCipher, stagingCipher) {
  const users = db.collection('users');
  const all = await users.find({}, { projection: { _id: 1, email: 1, phoneNumber: 1 } }).toArray();

  // Phase A — decrypt all with the prod key; validate before writing anything.
  const decoded = [];
  let sampled = 0, plausible = 0;
  for (const u of all) {
    let email = '';
    if (u.email) {
      email = prodCipher.decrypt(u.email);
      sampled += 1;
      if (email === null) return { ok: false, error: `user ${u._id}: email did not decrypt with the production key (wrong key or corrupt data)` };
      if (email.includes('@')) plausible += 1;
    }
    let phone = '';
    if (u.phoneNumber) {
      phone = prodCipher.decrypt(u.phoneNumber);
      if (phone === null) return { ok: false, error: `user ${u._id}: phone did not decrypt with the production key` };
    }
    decoded.push({ _id: u._id, email, phone });
  }
  // If there was ciphertext to read but none of it looked like an email, the prod key is wrong.
  if (sampled > 0 && plausible === 0) {
    return { ok: false, error: 'no user email decrypted to a plausible address with the production key — wrong key' };
  }

  // Phase B — write re-encrypted under the staging key.
  let count = 0;
  for (const d of decoded) {
    const $set = {};
    if (d.email) $set.email = stagingCipher.encrypt(d.email);
    if (d.phone) $set.phoneNumber = stagingCipher.encrypt(d.phone);
    if (Object.keys($set).length) { await users.updateOne({ _id: d._id }, { $set }); count += 1; }
  }
  return { ok: true, count };
}

/**
 * Verify the real re-key invariant: every user email now decrypts with STAGING's key (i.e. no prod
 * ciphertext survives). Real addresses are expected here, so the "no real email" scan does NOT apply.
 * @param {import('mongodb').Db} db @param {{decrypt:(v:any)=>string|null}} stagingCipher @returns {Promise<string[]>}
 */
async function verifyRealRekey(db, stagingCipher) {
  const bad = [];
  for (const u of await db.collection('users').find({}, { projection: { _id: 1, email: 1 } }).toArray()) {
    if (!u.email) continue;
    if (stagingCipher.decrypt(u.email) === null) {
      bad.push(`${u._id}: email still not decryptable with staging key (prod ciphertext survived the re-key)`);
    }
  }
  return bad;
}

// ---------------------------------------------------------------- marker-independent revert (F1)
/**
 * Marker-independent real-PII scan over the LIVE db: reuses the anonymized-invariant verifier, so it
 * returns true if any user email is prod ciphertext / non-synthetic OR any document holds a
 * real-looking email. Idempotent: on a genuinely anonymized db it returns false.
 * @param {import('mongodb').Db} db @param {(v:any)=>string|null} decrypt @returns {Promise<boolean>}
 */
async function hasRealPii(db, decrypt) {
  return (await verifyAnonymized(db, decrypt)).length > 0;
}

/**
 * Decide whether the auto-revert must scrub. Defense in depth: do NOT trust the marker alone.
 *  1. Marker says expired/missing/malformed/tampered/over-cap -> revert (shouldRevert).
 *  2. Marker claims anonymized (or is otherwise not an active real window) but real PII is actually
 *     present -> revert anyway (a stale/tampered "anonymized" marker over real data is caught).
 * A VALID, active real window (mode:'real', unexpired, within cap) is preserved — its real PII is
 * authorized and expected, so scrubbing it would be a self-inflicted DoS on the feature.
 * @param {object|null} marker @param {import('mongodb').Db} db @param {(v:any)=>string|null} decrypt
 * @param {number} nowMs @param {number} maxMs
 * @returns {Promise<{revert:boolean, reason?:string}>}
 */
async function revertDecision(marker, db, decrypt, nowMs, maxMs) {
  if (shouldRevert(marker, nowMs, maxMs)) return { revert: true, reason: 'marker expired/missing/invalid' };
  // Reaches here only when the marker is anonymized OR a valid active real window. Preserve the
  // active window; otherwise scrub if real PII is present despite the marker.
  if (!(marker && marker.mode === 'real')) {
    if (await hasRealPii(db, decrypt)) return { revert: true, reason: 'real PII found despite an anonymized marker' };
  }
  return { revert: false };
}

// ---------------------------------------------------------------- stdin (input channel)
/** Read up to MAX_STDIN_BYTES from stdin and JSON.parse it, or return null if empty/invalid/TTY. */
async function readStdinJson() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    total += chunk.length;
    if (total > MAX_STDIN_BYTES) return null; // bounded (DoS)
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ---------------------------------------------------------------- entrypoint
async function main() {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(f);

  const stagingKey = process.env.ENCRYPTION_KEY;
  if (!stagingKey) fail('ENCRYPTION_KEY is not set (must run inside the staging container)');
  const stagingCipher = makeCipher(stagingKey);
  try { selfTest(stagingCipher); } catch (e) { fail(e.message); }

  const nowMs = Date.now();
  const maxMs = maxWindowMs();

  // The stdin control channel carries the target mongoUri (F2 atomic swap: the INCOMING db) and, in
  // real mode, the prod key + audit metadata — off argv (invisible in `ps`), off disk, off logs.
  // --revert-if-expired runs unattended from cron against the container's OWN live db, so no stdin.
  const input = has('--revert-if-expired') ? null : await readStdinJson();

  const uri = (input && input.mongoUri) || process.env.MONGODB_URI;
  if (!uri) fail('no target MONGODB_URI (from stdin.mongoUri or env)');
  try { guardStaging(dbNameFromUri(uri)); } catch (e) { fail(e.message); }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  /** Print verification results, close, and exit fail-closed. */
  const finish = async (bad) => {
    await client.close();
    if (bad.length) {
      console.error('\nVERIFICATION FAILED — treat this database as production data:');
      for (const b of bad) console.error(`  - ${b}`);
      process.exit(1);
    }
    console.log('  ✓ verified: this database holds no undecryptable / real-looking production data');
    process.exit(0);
  };

  // --- auto-revert safety net (marker + marker-independent PII scan) -----------------------
  if (has('--revert-if-expired')) {
    const marker = await readMarker(db);
    const decision = await revertDecision(marker, db, stagingCipher.decrypt, nowMs, maxMs);
    if (!decision.revert) {
      const state = marker && marker.mode === 'real' ? `real window active until ${marker.expiresAt}` : 'already anonymized, no real PII found';
      console.log(`  auto-revert: no-op (${state})`);
      await client.close();
      process.exit(0);
    }
    console.log(`  auto-revert: re-anonymizing staging (${decision.reason})`);
    return finish(await anonymizeDb(db, stagingCipher));
  }

  // --- real-data (re-key) mode ------------------------------------------------------------
  if (has('--real')) {
    if (!has('--yes')) {
      console.error('REAL-DATA MODE REJECTED: --real requires --yes — falling back to ANONYMIZED');
      return finish(await anonymizeDb(db, stagingCipher));
    }
    const v = input ? validateRealRequest(input, nowMs, maxMs) : { ok: false, error: 'no real-mode input on stdin' };
    if (!v.ok || !(input && input.prodKey)) {
      console.error(`REAL-DATA MODE REJECTED: ${v.error || 'production key missing from stdin'} — falling back to ANONYMIZED`);
      return finish(await anonymizeDb(db, stagingCipher));
    }

    const prodCipher = makeCipher(input.prodKey);
    // Drop the plaintext key string reference ASAP (the Buffer copy inside makeCipher is zeroized below).
    input.prodKey = null;

    let result;
    try {
      result = await rekeyRealDb(db, prodCipher, stagingCipher);
    } finally {
      prodCipher.zeroize(); // wipe the transient production key from memory
    }

    if (!result.ok) {
      console.error(`REAL-DATA RE-KEY FAILED: ${result.error}`);
      console.error('  scrubbing to ANONYMIZED (fail closed — never leave staging half-real)');
      return finish(await anonymizeDb(db, stagingCipher));
    }

    const bad = await verifyRealRekey(db, stagingCipher);
    if (bad.length) {
      console.error('REAL-DATA VERIFY FAILED — scrubbing to ANONYMIZED (fail closed):');
      for (const b of bad) console.error(`  - ${b}`);
      return finish(await anonymizeDb(db, stagingCipher));
    }

    await writeMarker(db, {
      mode: 'real',
      operator: v.operator,
      reason: v.reason,
      startedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(v.expiresAtMs).toISOString(),
    });
    console.log(`  REAL-DATA MODE ACTIVE (${result.count} member record(s) re-keyed to staging)`);
    console.log(`  operator: ${v.operator}   expires: ${new Date(v.expiresAtMs).toISOString()}`);
    console.log('  auto-revert re-anonymizes staging once the window passes.');
    await client.close();
    process.exit(0);
  }

  // --- default: anonymize -----------------------------------------------------------------
  if (!has('--yes')) {
    await client.close();
    fail('refusing to run without --yes (this rewrites every user record in the target database)');
  }
  return finish(await anonymizeDb(db, stagingCipher));
}

module.exports = {
  SYNTHETIC_DOMAIN,
  MARKER_COLLECTION,
  MARKER_ID,
  DEFAULT_MAX_WINDOW_HOURS,
  maxWindowMs,
  makeCipher,
  parseWindow,
  validateRealRequest,
  shouldRevert,
  dbNameFromUri,
  guardStaging,
  selfTest,
  scrubValue,
  looksLikePersonDoc,
  scrubDoc,
  readMarker,
  writeMarker,
  anonymizeDb,
  verifyAnonymized,
  rekeyRealDb,
  verifyRealRekey,
  hasRealPii,
  revertDecision,
  readStdinJson,
};

// Only run when executed directly (node script.js), never when require()'d by a test.
if (require.main === module) {
  main().catch((e) => fail((e && e.message) || String(e)));
}
