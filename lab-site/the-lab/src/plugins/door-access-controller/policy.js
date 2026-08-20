// Door-access POLICY engine — PURE. No I/O, no DB, no clock reads, no network.
//
// The core app resolves identity + membership FACTS and passes them in; this
// module only applies door policy (role x time-window x door x account). It never
// re-derives good-standing from source data — it trusts the facts it is handed.
// `now` is injected so every decision is deterministic and unit-testable.
//
// This same function backs all three entry points (NFC scan, QR, app-triggered)
// and the offline allowlist builder, so the paths cannot disagree.

/** Stable machine reason codes (audited; never leak PII). */
export const REASON = {
  ADMIN_BYPASS: "admin-bypass",
  ACCOUNT_BLOCKED: "account-blocked",
  NOT_GOOD_STANDING: "not-in-good-standing",
  NO_RULE: "no-matching-rule",
  CREDENTIAL_NOT_ALLOWED: "credential-not-allowed",
  NO_WINDOW: "no-matching-window",
  RULE_MATCH: "rule-match",
};

/**
 * @typedef {Object} Facts   Resolved by the CORE and presented per request — never re-derived here.
 * @property {string} userID
 * @property {string} role                 "admin" | "staff" | "member" | "community" | ...
 * @property {string} membershipStatus     "active" | "probation" | "founder" | "suspended" | ...
 * @property {string} subscriptionStatus   "ACTIVE" | "PENDING" | "CANCELED" | ...
 * @property {boolean} isWaived            dues waived (counts as an active subscription)
 * @property {boolean} isCommunity        community-type member (no door access unless waived/override)
 *
 * @typedef {Object} Door
 * @property {string} doorId
 * @property {string} [timezone]           IANA tz for window evaluation (else policy.defaultTimezone)
 *
 * @typedef {Object} Window
 * @property {number[]} days               0=Sun .. 6=Sat (gate applies to the window's START day)
 * @property {string} start                "HH:MM" local
 * @property {string} end                  "HH:MM" local; end <= start means the window runs overnight
 *
 * @typedef {Object} Rule
 * @property {string} id
 * @property {string[]} roles              roles this rule grants (["*"] = any role)
 * @property {string[]} doors              door ids (["*"] = any door)
 * @property {Window[]} [windows]          allowed times (absent/empty = 24/7)
 * @property {string[]} [credentialTypes]  restrict to some of ["nfc","qr","app"] (absent = any)
 *
 * @typedef {Object} Policy
 * @property {Rule[]} rules
 * @property {Record<string,"allow"|"deny">} [accountOverrides]  per-user; "deny" (ban) always wins,
 *                                          "allow" waives ONLY the good-standing gate (rules still apply).
 * @property {boolean} requireGoodStanding
 * @property {boolean} allowAdminBypass
 * @property {string} defaultTimezone      IANA tz
 *
 * @typedef {Object} Decision
 * @property {boolean} granted
 * @property {string} reason               a REASON code
 * @property {string} [ruleId]
 */

const GOOD_STATUS = new Set(["active", "probation", "founder"]);
const GOOD_SUB = new Set(["ACTIVE", "PENDING"]);

/**
 * Good standing, derived ONLY from the facts the core presented. Community members
 * have no access unless their dues are waived. Mirrors the current good-standing
 * rules in access/unlock + internal/check-access, but as pure logic.
 * @param {Facts} facts
 * @returns {boolean}
 */
export function isGoodStanding(facts) {
  if (facts.isCommunity && !facts.isWaived) return false;
  const statusOk = GOOD_STATUS.has(String(facts.membershipStatus || "").toLowerCase());
  const subOk = facts.isWaived || GOOD_SUB.has(String(facts.subscriptionStatus || "").toUpperCase());
  return statusOk && subOk;
}

/**
 * Local weekday + minutes-of-day for `now` in `tz`, via Intl (no tz library).
 * @param {Date} now
 * @param {string} tz  IANA timezone
 * @returns {{ day: number, minutes: number }}
 */
export function localParts(now, tz) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[parts.weekday];
  // "24" can appear for midnight in some environments; normalize to 0.
  const minutes = (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10);
  return { day, minutes };
}

function hhmmToMin(s) {
  const [h, m] = String(s).split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
}

/**
 * Is `now` inside `win` (in `tz`)? Handles overnight windows where end <= start —
 * the day list gates the window's START day, and the spillover past midnight is
 * credited to the previous day's window.
 * @param {Date} now
 * @param {string} tz
 * @param {Window} win
 * @returns {boolean}
 */
export function inWindow(now, tz, win) {
  const { day, minutes } = localParts(now, tz);
  const start = hhmmToMin(win.start);
  const end = hhmmToMin(win.end);
  if (end > start) {
    return win.days.includes(day) && minutes >= start && minutes < end;
  }
  // overnight (e.g. 22:00 -> 06:00)
  const prevDay = (day + 6) % 7;
  const afterStartToday = win.days.includes(day) && minutes >= start;
  const beforeEndSpillover = win.days.includes(prevDay) && minutes < end;
  return afterStartToday || beforeEndSpillover;
}

const matchesRole = (rule, role) => rule.roles.includes("*") || rule.roles.includes(role);
const matchesDoor = (rule, doorId) => rule.doors.includes("*") || rule.doors.includes(doorId);
const matchesCred = (rule, cred) =>
  !rule.credentialTypes || rule.credentialTypes.length === 0 || rule.credentialTypes.includes(cred);
const matchesTime = (rule, now, tz) =>
  !rule.windows || rule.windows.length === 0 || rule.windows.some((w) => inWindow(now, tz, w));

/**
 * Decide allow/deny. DENY BY DEFAULT. Order is deliberate and security-first:
 *   1. account "deny" (ban)         — wins over everything, even admin
 *   2. admin bypass                 — if enabled
 *   3. good-standing gate           — from facts; skipped only by an account "allow"
 *   4. a rule granting role@door    — none => no-matching-rule
 *   5. credential-type permitted    — else credential-not-allowed
 *   6. time window                  — in-window => grant, else no-matching-window
 *
 * @param {{ facts: Facts, door: Door, credentialType: ("nfc"|"qr"|"app"), now: Date, policy: Policy }} input
 * @returns {Decision}
 */
export function decide({ facts, door, credentialType, now, policy }) {
  const overrides = policy.accountOverrides || {};
  const tz = (door && door.timezone) || policy.defaultTimezone || "UTC";

  if (overrides[facts.userID] === "deny") {
    return { granted: false, reason: REASON.ACCOUNT_BLOCKED };
  }
  if (policy.allowAdminBypass && facts.role === "admin") {
    return { granted: true, reason: REASON.ADMIN_BYPASS };
  }
  const overrideAllow = overrides[facts.userID] === "allow";
  if (policy.requireGoodStanding && !overrideAllow && !isGoodStanding(facts)) {
    return { granted: false, reason: REASON.NOT_GOOD_STANDING };
  }

  const roleDoorRules = policy.rules.filter((r) => matchesRole(r, facts.role) && matchesDoor(r, door.doorId));
  if (roleDoorRules.length === 0) {
    return { granted: false, reason: REASON.NO_RULE };
  }
  if (!roleDoorRules.some((r) => matchesCred(r, credentialType))) {
    return { granted: false, reason: REASON.CREDENTIAL_NOT_ALLOWED };
  }
  const match = roleDoorRules.find((r) => matchesCred(r, credentialType) && matchesTime(r, now, tz));
  return match
    ? { granted: true, reason: REASON.RULE_MATCH, ruleId: match.id }
    : { granted: false, reason: REASON.NO_WINDOW };
}

/**
 * Time-independent PROJECTION of a member's access, for the offline allowlist snapshot: which
 * doors they may enter and the windows for each — everything `decide()` checks EXCEPT `now`.
 * The device applies the window check offline. Empty `windows` for a door means 24/7.
 *
 * @param {Facts} facts
 * @param {Door[]} doors           the door registry
 * @param {Policy} policy
 * @param {("nfc"|"qr")} [credentialType="nfc"]  physical credential the snapshot is for
 * @returns {Array<{doorId:string, windows:Window[]}>}  empty ⇒ no access
 */
export function allowedDoorsForFacts(facts, doors, policy, credentialType = "nfc") {
  const overrides = policy.accountOverrides || {};
  if (overrides[facts.userID] === "deny") return [];

  const isAdmin = policy.allowAdminBypass && facts.role === "admin";
  if (!isAdmin) {
    const overrideAllow = overrides[facts.userID] === "allow";
    if (policy.requireGoodStanding && !overrideAllow && !isGoodStanding(facts)) return [];
  }

  const out = [];
  for (const door of doors) {
    if (isAdmin) {
      out.push({ doorId: door.doorId, windows: [] }); // admin: every door, 24/7
      continue;
    }
    const rules = policy.rules.filter(
      (r) => matchesRole(r, facts.role) && matchesDoor(r, door.doorId) && matchesCred(r, credentialType)
    );
    if (rules.length === 0) continue;
    // If any matching rule is 24/7 (no windows), the door is 24/7; else union the windows.
    const anyOpen = rules.some((r) => !r.windows || r.windows.length === 0);
    const windows = anyOpen ? [] : rules.flatMap((r) => r.windows);
    out.push({ doorId: door.doorId, windows });
  }
  return out;
}
