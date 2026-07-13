// PurelyMail API adapter (seam). Every PurelyMail call in the app goes through
// this module — mirrors src/lib/square.js. The mailbox provider is PurelyMail:
//   base https://purelymail.com/api/v0/*, POST-only, header `Purelymail-Api-Token`,
//   envelope { type:"success", result } | { type:"error", code, message }.
//
// Security posture:
//   - The host is a FIXED constant — never user-controlled (SSRF-safe by
//     construction; the only inputs are a validated local part + the env domain).
//   - Secrets are read fail-closed at call time (no `|| 'literal'`, no import-time
//     crash during `next build`). Missing token/domain => thrown PurelyMailError.
//   - The token, mailbox passwords, and recovery emails are NEVER logged.
//   - createMailbox generates a random password we immediately discard: PurelyMail
//     owns the credential; the member sets their own via the welcome/reset flow.

import crypto from "crypto";

const BASE = "https://purelymail.com/api/v0"; // fixed host — do not build from input
const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3; // exponential backoff on network/5xx only

/** Typed error so callers can distinguish PurelyMail failures from ours. */
export class PurelyMailError extends Error {
  constructor(code, message) {
    super(message || code || "PurelyMail error");
    this.name = "PurelyMailError";
    this.code = code || "error";
  }
}

function token() {
  const t = process.env.PURELYMAIL_API_TOKEN;
  if (!t) throw new PurelyMailError("config", "PURELYMAIL_API_TOKEN is not set");
  return t;
}

/** The single managed mail domain (e.g. "fablabfortsmith.org"). */
export function mailDomain() {
  const d = process.env.PURELYMAIL_DOMAIN;
  if (!d) throw new PurelyMailError("config", "PURELYMAIL_DOMAIN is not set");
  return d;
}

/** Build the full address for a validated local part. */
export function fullAddress(localPart) {
  return `${localPart}@${mailDomain()}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * POST an operation to PurelyMail and return its unwrapped `result`. Retries on
 * transient network/5xx failures with exponential backoff + jitter; never
 * retries an application-level `type:error` (that's deterministic).
 * @param {string} op - operation name, e.g. "createUser"
 * @param {object} body
 * @param {{ fetchImpl?: typeof fetch }} [opts] - fetch injectable for tests
 * @returns {Promise<object>} the `result` object
 */
export async function call(op, body, { fetchImpl = fetch } = {}) {
  const url = `${BASE}/${op}`;
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Purelymail-Api-Token": token(),
        },
        body: JSON.stringify(body || {}),
        signal: controller.signal,
      });
      clearTimeout(timer);

      // Retry server errors; do not retry client errors.
      if (res.status >= 500) {
        lastErr = new PurelyMailError("upstream", `PurelyMail ${res.status}`);
        if (attempt < MAX_RETRIES) {
          await sleep(backoff(attempt));
          continue;
        }
        throw lastErr;
      }

      const data = await res.json().catch(() => ({}));
      if (data && data.type === "error") {
        throw new PurelyMailError(data.code || "error", data.message || "PurelyMail error");
      }
      if (!res.ok) {
        throw new PurelyMailError("http", `PurelyMail HTTP ${res.status}`);
      }
      return data?.result ?? {};
    } catch (err) {
      clearTimeout(timer);
      // Application errors are terminal; only network/abort/5xx are retried.
      if (err instanceof PurelyMailError && err.code !== "upstream") throw err;
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await sleep(backoff(attempt));
        continue;
      }
      throw err instanceof PurelyMailError ? err : new PurelyMailError("network", "PurelyMail request failed");
    }
  }
  throw lastErr || new PurelyMailError("network", "PurelyMail request failed");
}

function backoff(attempt) {
  const base = 200 * 2 ** attempt;
  return base + Math.floor(Math.random() * 100); // jitter
}

/** Cryptographically strong throwaway password (never returned/stored/logged). */
function randomPassword() {
  return crypto.randomBytes(24).toString("base64url");
}

// ---- Mailbox operations --------------------------------------------------

/**
 * Create a mailbox. We set a random password and enable PurelyMail's reset flow
 * with the member's personal email as recovery + a welcome email — so the member
 * sets their own password directly in PurelyMail. The password is discarded here.
 * @param {{ localPart: string, recoveryEmail?: string }} args
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
export async function createMailbox({ localPart, recoveryEmail }, opts) {
  return call(
    "createUser",
    {
      userName: localPart,
      domainName: mailDomain(),
      password: randomPassword(),
      enablePasswordReset: true,
      enableSearchIndexing: true,
      sendWelcomeEmail: true,
      ...(recoveryEmail ? { recoveryEmail, recoveryEmailDescription: "Personal recovery" } : {}),
    },
    opts
  );
}

/** Get a mailbox's settings (throws PurelyMailError if it does not exist). */
export async function getMailbox(localPart, opts) {
  return call("getUser", { userName: fullAddress(localPart) }, opts);
}

/** Whether a mailbox exists. Any lookup error is treated as "not available". */
export async function mailboxExists(localPart, opts) {
  try {
    await getMailbox(localPart, opts);
    return true;
  } catch (err) {
    if (err instanceof PurelyMailError && err.code === "config") throw err;
    return false;
  }
}

/** Modify a mailbox (rename / new password / flags). @param {object} changes */
export async function modifyMailbox(localPart, changes = {}, opts) {
  return call("modifyUser", { userName: fullAddress(localPart), ...changes }, opts);
}

/**
 * Suspend a mailbox. PurelyMail has no native suspend, so we lock login out of
 * the member's control: rotate to a random password, disable reset, and require
 * 2FA. Reversible by an admin reset. Mail is retained.
 */
export async function suspendMailbox(localPart, opts) {
  return modifyMailbox(
    localPart,
    { newPassword: randomPassword(), enablePasswordReset: false, requireTwoFactorAuthentication: true },
    opts
  );
}

/** Re-enable PurelyMail's self-service password reset for a mailbox. */
export async function resetMailbox(localPart, opts) {
  return modifyMailbox(localPart, { enablePasswordReset: true, requireTwoFactorAuthentication: false }, opts);
}

/** Delete a mailbox. */
export async function deleteMailbox(localPart, opts) {
  return call("deleteUser", { userName: fullAddress(localPart) }, opts);
}

/** List all mailboxes on the account (full addresses). @returns {Promise<string[]>} */
export async function listMailboxes(opts) {
  const result = await call("listUser", {}, opts);
  return Array.isArray(result?.users) ? result.users : [];
}

/** Current account credit (USD, as reported by PurelyMail). @returns {Promise<number>} */
export async function checkCredit(opts) {
  const result = await call("checkAccountCredit", {}, opts);
  const n = Number(result?.credit);
  return Number.isFinite(n) ? n : 0;
}

/** Human-readable detail from a PurelyMail error (mirror squareErrorDetail). */
export function purelyMailErrorDetail(err) {
  return err?.message || err?.code || "PurelyMail error";
}

/**
 * Whether the PurelyMail integration is configured (token + domain present).
 * Used to gate enabling / using the member-email plugin with a clear message,
 * WITHOUT making these secrets a hard boot requirement for the whole app.
 * @returns {boolean}
 */
export function purelymailReady() {
  return !!process.env.PURELYMAIL_API_TOKEN && !!process.env.PURELYMAIL_DOMAIN;
}
