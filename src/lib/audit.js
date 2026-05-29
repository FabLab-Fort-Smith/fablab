// Structured security audit logging (CLAUDE.md §9, 06 §6).
// Records WHO did WHAT to WHICH resource, WHEN, and the OUTCOME — as a single
// JSON line for log aggregation. NEVER logs secrets, tokens, passwords, or
// decrypted PII; sensitive-looking fields are redacted defensively.

const SENSITIVE_KEY = /(password|secret|token|authorization|cookie|apikey|api_key|key)/i;

function redact(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : v;
  }
  return out;
}

/**
 * Build a structured audit event. `now` is injectable for deterministic tests.
 * @param {string} event - dotted event name, e.g. "access.unlock"
 * @param {{actor?:any, target?:any, outcome?:string, source?:any}} [fields]
 * @param {Date} [now]
 */
export function buildAuditEvent(event, fields = {}, now = new Date()) {
  const { actor, target, outcome = "success", source, ...rest } = fields;
  return {
    type: "audit",
    event,
    outcome,
    actor: actor ?? null,
    target: target ?? null,
    source: source ?? null,
    at: now.toISOString(),
    ...redact(rest),
  };
}

/**
 * Emit an audit event. Defaults to console.log (captured by log aggregation);
 * a sink can be injected for tests.
 * @returns the emitted record
 */
export function auditLog(event, fields = {}, { sink = console.log } = {}) {
  const record = buildAuditEvent(event, fields);
  sink(JSON.stringify(record));
  return record;
}

export default { auditLog, buildAuditEvent };
