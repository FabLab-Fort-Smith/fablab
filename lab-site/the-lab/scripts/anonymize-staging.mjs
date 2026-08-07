#!/usr/bin/env node
/**
 * Anonymize a staging database that was refreshed from production (fablab #107 phase 2).
 *
 * WHY THIS EXISTS: copying production into staging is forbidden by CLAUDE.md §8 and master §5
 * unless the personal data is irreversibly replaced. It is also broken without this step —
 * production and staging use DIFFERENT ENCRYPTION_KEYs, so prod-encrypted emails cannot be
 * decrypted or matched by staging, and every email/login flow silently fails for copied users.
 * This replaces personal data with synthetic values encrypted under STAGING's own key.
 *
 * RUN IT INSIDE THE STAGING CONTAINER, so it uses the same ENCRYPTION_KEY and the same
 * deterministic scheme as the app itself:
 *   docker exec <staging-container> node scripts/anonymize-staging.mjs --yes
 *
 * SAFETY (fail closed): refuses to run unless the target database name looks like staging, and
 * refuses outright if it looks like production. It also verifies its own work at the end and exits
 * non-zero if ANY user email fails to decrypt to a synthetic address — so a field this script
 * forgot cannot pass silently.
 *
 * Crypto note: the scheme is duplicated from AuthService.encryptEmail/encryptPhone
 * (src/app/api/auth/[...nextauth]/service.js) — deterministic AES-256-CBC, zero IV, key = raw
 * ENCRYPTION_KEY. It is duplicated rather than imported because that module pulls in the whole
 * next-auth graph and the `@/` path alias, neither of which resolves in a plain node process. The
 * self-test below asserts determinism + round-trip so a drift in either place is caught here.
 */
import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';

const SYNTHETIC_DOMAIN = 'staging.invalid';
const IV_LENGTH = 16;

const uri = process.env.MONGODB_URI;
const key = process.env.ENCRYPTION_KEY;
if (!uri) fail('MONGODB_URI is not set');
if (!key) fail('ENCRYPTION_KEY is not set (must run inside the staging container)');
if (!process.argv.includes('--yes')) {
  fail('refusing to run without --yes (this rewrites every user record in the target database)');
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

/**
 * Deterministic AES-256-CBC with a zero IV — must match AuthService EXACTLY.
 *
 * `.semgrep.yml` bans CBC/ECB in favour of AES-256-GCM with a random IV, and it is right. But this
 * script's whole purpose is to write values the RUNNING APP can decrypt and match on, and the app
 * still stores emails with this scheme (AuthService.encryptEmail — grandfathered, GCM redesign
 * tracked as E5/SEC-23). Using GCM here would produce ciphertext the app cannot read, i.e. exactly
 * the broken state this script exists to fix. When the app moves to GCM, this moves with it.
 */
// nosemgrep: no-unauthenticated-cipher-mode
function encrypt(value) {
  if (!value) return '';
  const iv = Buffer.alloc(IV_LENGTH, 0);
  // nosemgrep: no-unauthenticated-cipher-mode
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
  return cipher.update(String(value), 'utf8', 'hex') + cipher.final('hex');
}

/** Returns null when the ciphertext was not produced by THIS key (i.e. still production data). */
function decrypt(value) {
  if (!value) return '';
  try {
    const iv = Buffer.alloc(IV_LENGTH, 0);
    // nosemgrep: no-unauthenticated-cipher-mode
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
    return decipher.update(String(value), 'hex', 'utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

// --- self-test: prove the scheme is deterministic and round-trips before touching data ---
{
  const probe = 'probe@example.com';
  const a = encrypt(probe);
  const b = encrypt(probe);
  if (a !== b) fail('encryption is not deterministic — email lookups would break');
  if (decrypt(a) !== probe) fail('encrypt/decrypt round-trip failed — wrong key length?');
}

const dbNameFromUri = (() => {
  const m = /\/([^/?]+)(\?|$)/.exec(uri);
  return m ? decodeURIComponent(m[1]) : '';
})();

if (/prod/i.test(dbNameFromUri)) {
  fail(`target database "${dbNameFromUri}" looks like PRODUCTION — refusing (this destroys data)`);
}
if (!/staging|thelab/i.test(dbNameFromUri)) {
  fail(`target database "${dbNameFromUri}" does not look like staging — refusing`);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db();
console.log(`  target database: ${db.databaseName}`);

// ---------------------------------------------------------------- users
const users = db.collection('users');
const all = await users.find({}, { projection: { _id: 1, userID: 1 } }).toArray();
let n = 0;
for (const u of all) {
  n += 1;
  const email = `member${n}@${SYNTHETIC_DOMAIN}`;
  await users.updateOne({ _id: u._id }, {
    $set: {
      email: encrypt(email),
      phoneNumber: encrypt(`555010${String(n).padStart(4, '0')}`),
      firstName: 'Test',
      lastName: `Member${n}`,
      username: `member${n}`,
      // bcrypt hash of the password below, generated with the app's own bcryptjs and VERIFIED.
      // To regenerate: hash the credential below with the app's own bcryptjs at cost 10 and print
      // the result (the semgrep no-sensitive-logging rule matches comments too, so no snippet here).
      // (An earlier version of this script shipped a hand-written hash string that verified against
      // NOTHING, so every staging account was unloggable — always verify a hash, never invent one.)
      password: '$2b$10$FBRfiu8R3x5mDN6AU5sQeuDHmhf12tsQMRq5WNF0WYlFgzRRmva5S',   // password is: staging-only-password
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

// ------------------------------------------------- other collections holding personal data
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

// Payment identifiers are not ours to hold in a test environment (PCI scope — @rules/std-pci.md).
const tx = await db.collection('transactions').updateMany({}, {
  $unset: { transactionId: '', metadata: '' },
});
console.log(`  transactions payment refs cleared: ${tx.modifiedCount}`);

// Notification bodies quote member names/emails; keep a small sample so the UI has something.
const notif = db.collection('notifications');
const keep = await notif.find({}, { projection: { _id: 1 } }).limit(25).toArray();
const del = await notif.deleteMany({ _id: { $nin: keep.map((k) => k._id) } });
await notif.updateMany({}, { $set: { message: 'synthetic staging notification' } });
console.log(`  notifications truncated: kept ${keep.length}, deleted ${del.deletedCount}`);

// ------------------------------------------------- generic sweep over EVERY collection
// Enumerating collections was not enough: the first run passed users/contact/transactions and was
// then caught by the verifier on `repairs` (a member repair request with email, name, phone and a
// free-text description) and `bugs`. So instead of trusting a list, walk every document in every
// collection and rewrite anything that LOOKS like personal data. New collections are covered
// automatically — which is the property that matters, since the app keeps growing.
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// Phone-ish ONLY in free-text: 10-15 digits with optional separators. A loose "digits and
// punctuation" pattern matched URLs, ISO dates and UUIDs on an earlier attempt and replaced them
// with placeholder text — destroying badge imageUrls, a bounty endsAt and a portfolio UUID.
const PHONE_RE = /(?<!\d)(\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}(?!\d)/;
const HEX_CIPHERTEXT_RE = /^[0-9a-f]{32,}$/i;   // already-encrypted values (handled above)

// Fields that must NEVER be rewritten: identifiers, URLs and timestamps are structural, not
// personal, and mangling them breaks the app in ways that look like unrelated bugs.
const STRUCTURAL_FIELD = /(^|_)(id|uuid|slug)$|url$|image|^created|^updated|at$|date$|^type$|^status$|^icon$/i;
// Only these fields get the "contains contact details" treatment.
const FREE_TEXT_FIELD = /(description|message|notes?|bio|comment|text|body|summary|reason|issue|question|answer)/i;
// Third-party identity handles are personal data even though they are numeric.
const IDENTITY_ID_FIELD = /(discord|google|square)(id|_id|customerid|subscriptionid)?$/i;

/**
 * Rewrite one value if it looks personal.
 *
 * `isPersonDoc` gates the name rule. A blanket "rewrite any *name field" pass destroyed real
 * CONTENT on an earlier attempt — badge names ("Fiber Laser Certified") and plan names
 * ("Basic (Monthly)") became "Test Person N", making staging useless for the features that read
 * them. A `name` is only personal when the SAME document also carries contact details.
 */
function scrubValue(fieldName, value, seq, isPersonDoc) {
  if (typeof value !== 'string' || !value) return [false, value];
  if (HEX_CIPHERTEXT_RE.test(value)) return [false, value];   // encrypted: the users pass owns it
  const name = fieldName.toLowerCase();

  if (name.includes('email')) return [true, `person${seq}@${SYNTHETIC_DOMAIN}`];
  if (name.includes('phone')) return [true, `555010${String(seq).padStart(4, '0')}`];
  // A real Discord/Google id links a row to a real human, so replace it — but with a plausible
  // synthetic id, not prose, so code that parses it still works.
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
        if (c && nv !== v) { set[path] = nv; changed = true; }   // no-op writes are not "changes"
      }
    }
  };
  walk(doc, '');
  return changed ? set : null;
}

let sweptDocs = 0; const sweptCollections = [];
for (const c of await db.listCollections().toArray()) {
  if (c.name === 'users') continue;              // handled above (encrypted fields)
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

// ---------------------------------------------------------------- verify (fail closed)
// The invariant that matters: EVERY user email must decrypt with STAGING's key to a synthetic
// address. A row still holding production ciphertext fails to decrypt and is caught here, which
// also catches any field this script forgot to rewrite.
const bad = [];
for (const u of await users.find({}, { projection: { _id: 1, email: 1, phoneNumber: 1 } }).toArray()) {
  const plain = decrypt(u.email);
  if (plain === null) bad.push(`${u._id}: email not decryptable with staging key (still production data)`);
  else if (!plain.endsWith(`@${SYNTHETIC_DOMAIN}`)) bad.push(`${u._id}: email is not synthetic (${plain.slice(0, 4)}…)`);
}
// Whole-document scan: serialize each doc and look for a real-looking email ANYWHERE, so a field
// nobody thought of still fails the run. This is what caught `repairs` and `bugs` the first time.
const REAL_EMAIL = /[a-z0-9._%+-]+@(?!staging\.invalid)[a-z0-9.-]+\.[a-z]{2,}/i;
for (const c of await db.listCollections().toArray()) {
  let hits = 0;
  for (const doc of await db.collection(c.name).find({}).toArray()) {
    if (REAL_EMAIL.test(JSON.stringify(doc))) hits += 1;
  }
  if (hits) bad.push(`${c.name}: ${hits} document(s) still contain a real-looking email address`);
}

await client.close();

if (bad.length) {
  console.error('\nANONYMIZATION VERIFICATION FAILED — treat this database as production data:');
  for (const b of bad) console.error(`  - ${b}`);
  process.exit(1);
}
console.log('  ✓ verified: every user email decrypts with the staging key to a synthetic address');
console.log('  ✓ verified: no plaintext real-looking email addresses remain');
