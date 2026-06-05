// Log redaction helpers (CLAUDE.md §5 redaction / §9 audit). Never log raw identifiers or PII;
// when an identifier is useful for correlation, log a stable NON-REVERSIBLE pseudonym instead.
import crypto from "node:crypto";

/**
 * Redact an identifier for logs: a stable, non-reversible 8-hex-char pseudonym so log entries
 * can be correlated without exposing the real id/handle/PII. Same input → same token.
 * @param {unknown} value - e.g. a userID, Discord id, or handle
 * @returns {string} e.g. "id:3f9a2b7c" (or "id:none" when empty)
 */
export function maskId(value) {
  if (value === undefined || value === null || value === "") return "id:none";
  const digest = crypto.createHash("sha256").update(String(value)).digest("hex");
  return `id:${digest.slice(0, 8)}`;
}

export default { maskId };
