// Bug-board -> GitHub Issues mirror (server-only adapter/seam). Issue #137.
//
// When an admin VERIFIES a bug on the in-app bug board, we ALSO open a GitHub
// issue in the tracker repo so engineering sees it in one place. The in-app
// board stays the source of truth; the GitHub issue is an additive mirror.
//
// Security posture (CLAUDE.md §5, @rules/std-owasp-llm.md LLM02 / @rules/std-cwe.md):
//   - SERVER-ONLY. The token is read fail-closed at call time from injected env
//     (no `|| 'literal'` fallback, no import-time crash during `next build`).
//     It is NEVER sent to the client, NEVER logged, NEVER put in an error/body.
//   - The GitHub API host is a FIXED constant — never user-controlled
//     (SSRF-safe by construction). The only variable path segment is the repo
//     slug, which is validated against a strict `owner/name` allowlist pattern.
//   - ALL user-supplied bug content (title, description) is treated as untrusted
//     and neutralized before it reaches the issue: @mentions/#refs can't ping or
//     autolink, HTML/markdown can't render (the description is fenced in a code
//     block sized larger than any backtick run it contains), length is capped,
//     and control characters are stripped. See `sanitizeGithubText`.
//
// The host repo/label are non-secret config (GITHUB_BUGBOARD_REPO / _LABEL);
// only GITHUB_BUGBOARD_TOKEN is a secret.

const API_BASE = "https://api.github.com"; // FIXED host — never built from input
const API_VERSION = "2022-11-28";
const TIMEOUT_MS = 10_000;
const ZWSP = "\u200B"; // zero-width space: breaks an autolink token without changing visible text

const DEFAULT_LABEL = "bug-board";

// Caps keep the issue bounded and GitHub-friendly (title max ~256 on GitHub).
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 4000;

/** owner/name — GitHub slug chars only; blocks path traversal / injected segments. */
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Typed error so callers can distinguish mirror failures from domain errors. */
export class BugboardMirrorError extends Error {
  /**
   * @param {string} code - short machine code (config|repo|upstream|response|network)
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code || "bug-board mirror error");
    this.name = "BugboardMirrorError";
    this.code = code || "error";
  }
}

function token() {
  const t = process.env.GITHUB_BUGBOARD_TOKEN;
  if (!t) throw new BugboardMirrorError("config", "GITHUB_BUGBOARD_TOKEN is not set");
  return t;
}

/** The configured tracker repo ("owner/name"), validated. */
export function repository() {
  const r = (process.env.GITHUB_BUGBOARD_REPO || "").trim();
  if (!r) throw new BugboardMirrorError("config", "GITHUB_BUGBOARD_REPO is not set");
  if (!REPO_RE.test(r)) throw new BugboardMirrorError("repo", "GITHUB_BUGBOARD_REPO must be 'owner/name'");
  return r;
}

/** The label applied to mirrored issues (non-secret config). */
export function label() {
  const l = (process.env.GITHUB_BUGBOARD_LABEL || DEFAULT_LABEL).trim();
  return l || DEFAULT_LABEL;
}

/**
 * Is the mirror configured to run? False when the token is absent (dev/local),
 * so the board works unchanged and the mirror is simply skipped.
 * @returns {boolean}
 */
export function bugboardMirrorReady() {
  return Boolean(process.env.GITHUB_BUGBOARD_TOKEN);
}

/**
 * Neutralize GitHub-flavored control in untrusted text so bug content can never
 * ping users, autolink issues, inject HTML, or break markdown. Deterministic.
 * Used for the title (plain) and, before fencing, the description.
 * @param {unknown} input
 * @param {number} [maxLength]
 * @returns {string}
 */
export function sanitizeGithubText(input, maxLength = DESCRIPTION_MAX) {
  let s = typeof input === "string" ? input : String(input ?? "");
  // Strip control chars (keep \t and \n for the fenced description; drop \r).
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  // Cap length (bounded — DoS / oversized-issue guard). Reserve room for the ellipsis.
  if (s.length > maxLength) s = s.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
  // Break @mentions and #refs by inserting a zero-width space after the sigil —
  // the visible text is unchanged but GitHub no longer autolinks/pings.
  s = s.replace(/([@#])(?=[A-Za-z0-9_/-])/g, `$1${ZWSP}`);
  // Escape HTML angle brackets so raw HTML can never render.
  s = s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return s;
}

/** Single-line, capped, mention-safe title. */
function buildTitle(bug) {
  const raw = sanitizeGithubText(bug?.title, TITLE_MAX)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return raw || "Bug report";
}

/**
 * Choose a code-fence delimiter longer than the longest backtick run in the
 * content so untrusted text can't break out of the fence (nested-fence rule).
 */
function fenceFor(content) {
  let max = 0;
  const runs = content.match(/`+/g);
  if (runs) for (const r of runs) max = Math.max(max, r.length);
  return "`".repeat(Math.max(3, max + 1));
}

/**
 * Build the issue body: a fenced (thus fully inert) copy of the untrusted
 * description, plus trusted, non-user metadata (submitter USERNAME, a backlink
 * to the bug board, and the internal bugID). No email / PII is included — the
 * bug record has none and we never fetch it.
 */
function buildBody(bug) {
  const description = sanitizeGithubText(bug?.description, DESCRIPTION_MAX);
  const fence = fenceFor(description);
  // Username is attribution only; still sanitize it (defense in depth) so a
  // crafted username can't ping either.
  const username = sanitizeGithubText(bug?.submitterUsername, 80)
    .replace(/[\r\n]+/g, " ")
    .trim() || "unknown";
  const bugID = String(bug?.bugID ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || "").replace(/\/+$/, "");
  const boardUrl = `${base}/dashboard/resources/bugs`;

  return [
    "> Mirrored from the FabLab bug board on admin verification. The in-app board is the source of truth.",
    "",
    "**Reported by:** " + username,
    "**Bug board:** " + boardUrl,
    "**Internal ID:** " + (bugID || "(none)"),
    "",
    "**Description**",
    fence + "text",
    description,
    fence,
    "",
  ].join("\n");
}

/**
 * Create the GitHub issue for a verified bug. Caller must ensure the mirror is
 * ready and the bug isn't already mirrored (idempotency lives in the service).
 * Throws BugboardMirrorError on any failure; the caller treats it as best-effort.
 *
 * @param {{ bugID?: string, title?: string, description?: string, submitterUsername?: string }} bug
 * @param {{ fetchImpl?: typeof fetch }} [opts] - fetch injectable for tests (no real network)
 * @returns {Promise<{ number: number, url: string }>}
 */
export async function createBugIssue(bug, { fetchImpl = fetch } = {}) {
  const tok = token();
  const repo = repository();
  const url = `${API_BASE}/repos/${repo}/issues`;
  const payload = { title: buildTitle(bug), body: buildBody(bug), labels: [label()] };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tok}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        "Content-Type": "application/json",
        "User-Agent": "the-lab-bugboard-mirror",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      // Never follow a redirect on an authenticated request (defense-in-depth: the Bearer
      // token must only ever reach the fixed api.github.com host) — topic-api-consumption.
      redirect: "error",
    });
    // Never surface the response body verbatim (keep failures shape-only).
    if (!res.ok) throw new BugboardMirrorError("upstream", `GitHub API responded ${res.status}`);
    const data = await res.json().catch(() => ({}));
    const number = data?.number;
    const issueUrl = data?.html_url;
    if (typeof number !== "number" || !issueUrl) {
      throw new BugboardMirrorError("response", "GitHub API returned no issue number");
    }
    return { number, url: String(issueUrl) };
  } catch (err) {
    if (err instanceof BugboardMirrorError) throw err;
    if (err?.name === "AbortError") throw new BugboardMirrorError("network", "GitHub request timed out");
    throw new BugboardMirrorError("network", "GitHub request failed");
  } finally {
    clearTimeout(timer);
  }
}

const bugboardGithub = {
  bugboardMirrorReady,
  createBugIssue,
  sanitizeGithubText,
  repository,
  label,
  BugboardMirrorError,
};

export default bugboardGithub;
