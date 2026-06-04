// Single source of truth for required environment configuration.
// Fails fast at startup (production) so the app never runs with missing secrets
// or silent fallbacks (SEC-04/07/23). See docs/audit/06-security-standards.md §4.

/**
 * @typedef {Object} EnvSpec
 * @property {string} name
 * @property {(v: string) => (string|null)} [validate] - returns a problem message or null
 * @property {string} [description]
 */

/** Required vars. Extend this list as new secrets are introduced. @type {EnvSpec[]} */
export const REQUIRED_ENV = [
  { name: "MONGODB_URI", description: "MongoDB connection string" },
  { name: "AUTH_SECRET", description: "NextAuth session secret" },
  { name: "JWT_SECRET", description: "app JWT signing secret" },
  {
    name: "ENCRYPTION_KEY",
    description: "PII field-encryption key",
    validate: (v) => (Buffer.byteLength(v, "utf8") === 32 ? null : "must be exactly 32 bytes"),
  },
  { name: "INTERNAL_API_SECRET", description: "internal/IoT API bearer secret" },
  { name: "SQUARE_ACCESS_TOKEN", description: "Square API access token" },
  { name: "SQUARE_WEBHOOK_SIGNATURE_KEY", description: "Square webhook signing key" },
];

/**
 * Collect every env problem (missing or invalid). Pure — pass any env object.
 * @param {Record<string,string|undefined>} [env]
 * @param {EnvSpec[]} [required]
 * @returns {string[]} human-readable problems (empty array = all good)
 */
export function collectEnvErrors(env = process.env, required = REQUIRED_ENV) {
  const errors = [];
  for (const spec of required) {
    const value = env[spec.name];
    if (value === undefined || value === "") {
      errors.push(
        `${spec.name} is required but not set${spec.description ? ` (${spec.description})` : ""}`
      );
      continue;
    }
    if (spec.validate) {
      const problem = spec.validate(value);
      if (problem) errors.push(`${spec.name} ${problem}`);
    }
  }
  return errors;
}

/**
 * Validate the environment. Throws in strict mode (production) so the server
 * refuses to boot; otherwise warns. Never logs secret values.
 * @param {{ env?: Record<string,string|undefined>, strict?: boolean, logger?: { log?: Function, warn?: Function } }} [opts]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateEnv({
  env = process.env,
  strict = (env.NODE_ENV ?? process.env.NODE_ENV) === "production",
  logger = console,
} = {}) {
  const errors = collectEnvErrors(env);
  if (errors.length === 0) {
    logger.log?.("✅ Environment validation passed.");
    return { ok: true, errors };
  }
  const message =
    `Environment validation failed — ${errors.length} problem(s):\n  - ` + errors.join("\n  - ");
  if (strict) throw new Error(message);
  logger.warn?.(`⚠️ ${message}\n(Non-production: continuing — these MUST be set in production.)`);
  return { ok: false, errors };
}
