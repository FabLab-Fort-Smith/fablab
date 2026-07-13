// Local-part validation + reserved-name blocklist for member mailboxes. Pure
// (no I/O) so it is trivially unit-tested. The blocklist protects role/system
// addresses (RFC 2142 + org-sensitive names) from being claimed by members.

/** Names that must never be claimable. Lowercase. */
export const RESERVED = new Set([
  // RFC 2142 / infrastructure
  "postmaster", "hostmaster", "webmaster", "abuse", "noc", "security",
  "mailer-daemon", "mail", "www", "ftp", "root", "daemon",
  // Role / system
  "admin", "administrator", "admin1", "sysadmin", "support", "help", "helpdesk",
  "info", "contact", "noreply", "no-reply", "donotreply", "notifications",
  "billing", "payments", "accounts", "sales", "marketing", "hr", "legal",
  // Org-sensitive
  "fablab", "board", "staff", "team", "office", "director", "president",
  "treasurer", "secretary", "ceo", "test", "example",
]);

// Lowercase; starts+ends alphanumeric; 3-32 chars; letters/digits/dot/dash/underscore;
// no consecutive separators.
const FORMAT_RE = /^[a-z0-9](?:[a-z0-9]|[._-](?![._-])){1,30}[a-z0-9]$/;

/**
 * Validate a proposed mailbox local part.
 * @param {string} input
 * @param {string[]} [extraReserved] - additional reserved names (from config)
 * @returns {{ ok: boolean, localPart?: string, reason?: string }}
 */
export function validateLocalPart(input, extraReserved = []) {
  if (typeof input !== "string") return { ok: false, reason: "invalid" };
  const local = input.trim().toLowerCase();
  if (!local) return { ok: false, reason: "required" };
  if (local.length < 3 || local.length > 32) return { ok: false, reason: "length" };
  if (!FORMAT_RE.test(local)) return { ok: false, reason: "format" };
  if (isReserved(local, extraReserved)) return { ok: false, reason: "reserved" };
  return { ok: true, localPart: local };
}

/**
 * @param {string} local - already lowercased local part
 * @param {string[]} [extraReserved]
 * @returns {boolean}
 */
export function isReserved(local, extraReserved = []) {
  if (RESERVED.has(local)) return true;
  return (extraReserved || []).some((r) => String(r).trim().toLowerCase() === local);
}
