// Plugin manifest + config-schema validation for the in-repo plugin platform.
//
// A manifest is INERT DATA describing a plugin: its identity, the sockets
// (extension points) it binds to, a declarative config schema, and the
// permissions its admin actions require. Manifests are validated + frozen at
// registry build time; they are never executed. See docs/architecture/plugin-platform.md.

/**
 * The catalog of sockets (extension points) a plugin may bind to. A manifest
 * that references a socket outside this catalog is rejected at build time.
 * @type {Readonly<Record<string,string>>}
 */
export const SOCKETS = Object.freeze({
  hooks: "hooks", // server-side domain events (see CORE_EVENTS in hooks.js)
  adminNav: "adminNav", // contributes a link to the admin dashboard
  adminSettings: "adminSettings", // renders a config form from configSchema
  apiRoutes: "apiRoutes", // documents the API prefix the plugin owns (in-repo shims)
  tasks: "tasks", // guarded internal cron routes (optional)
});

/**
 * Config-field types the platform understands (declarative — no functions/objects):
 *   number · string · boolean · string[] · text (multiline string) ·
 *   select (enum: one of `options`) · secret (write-only string — never serialized back).
 */
const CONFIG_TYPES = new Set(["number", "string", "boolean", "string[]", "text", "select", "secret"]);

const ID_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/; // kebab slug, 3-40 chars
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/**
 * Validate a plugin manifest and return a frozen copy. Throws on any problem so
 * a malformed plugin fails loudly at registry build (never silently half-loads).
 * @param {object} m - the raw manifest object
 * @returns {Readonly<object>} the validated, frozen manifest
 */
export function defineManifest(m) {
  const problems = collectManifestProblems(m);
  if (problems.length) {
    throw new Error(
      `Invalid plugin manifest${m && m.id ? ` "${m.id}"` : ""}: ${problems.join("; ")}`
    );
  }
  // Freeze the manifest and its nested socket/config descriptors so nothing can
  // mutate a plugin's declared contract at runtime.
  Object.freeze(m.sockets);
  Object.freeze(m.configSchema);
  for (const spec of Object.values(m.configSchema || {})) Object.freeze(spec);
  return Object.freeze(m);
}

/**
 * Collect every problem with a manifest (pure — safe to call in tests).
 * @param {object} m
 * @returns {string[]} human-readable problems (empty = valid)
 */
export function collectManifestProblems(m) {
  const problems = [];
  if (!m || typeof m !== "object") return ["manifest must be an object"];

  if (typeof m.id !== "string" || !ID_RE.test(m.id)) {
    problems.push("id must be a kebab-case slug (3-40 chars)");
  }
  if (typeof m.name !== "string" || !m.name.trim()) problems.push("name is required");
  if (typeof m.version !== "string" || !SEMVER_RE.test(m.version)) {
    problems.push("version must be semver (x.y.z)");
  }

  const sockets = m.sockets;
  if (sockets == null || typeof sockets !== "object") {
    problems.push("sockets must be an object");
  } else {
    for (const key of Object.keys(sockets)) {
      if (!SOCKETS[key]) problems.push(`unknown socket "${key}"`);
    }
    if (sockets.hooks !== undefined && !Array.isArray(sockets.hooks)) {
      problems.push("sockets.hooks must be an array of event names");
    }
    if (sockets.adminNav !== undefined) {
      const nav = sockets.adminNav;
      if (!nav || typeof nav !== "object" || typeof nav.path !== "string" || typeof nav.label !== "string") {
        problems.push("sockets.adminNav must be { label, path, ... }");
      } else if (!nav.path.startsWith("/dashboard/admin/")) {
        problems.push("sockets.adminNav.path must live under /dashboard/admin/");
      }
    }
  }

  problems.push(...collectConfigSchemaProblems(m.configSchema));

  if (m.requiredPermissions !== undefined) {
    if (!Array.isArray(m.requiredPermissions) || m.requiredPermissions.some((p) => typeof p !== "string")) {
      problems.push("requiredPermissions must be an array of permission strings");
    }
  }
  if (m.enabledByDefault !== undefined && typeof m.enabledByDefault !== "boolean") {
    problems.push("enabledByDefault must be a boolean");
  }
  // Addon-manager card metadata (AD-1) — optional, but must be strings when present.
  if (m.icon !== undefined && (typeof m.icon !== "string" || m.icon.length > 8)) {
    problems.push("icon must be a short string (≤ 8 chars, e.g. an emoji/glyph)");
  }
  if (m.category !== undefined && typeof m.category !== "string") {
    problems.push("category must be a string");
  }
  return problems;
}

/** @param {object} [schema] @returns {string[]} */
function collectConfigSchemaProblems(schema) {
  const problems = [];
  if (schema === undefined) return problems; // config is optional
  if (schema == null || typeof schema !== "object") return ["configSchema must be an object"];
  for (const [field, spec] of Object.entries(schema)) {
    if (!spec || typeof spec !== "object") {
      problems.push(`configSchema.${field} must be a descriptor object`);
      continue;
    }
    if (!CONFIG_TYPES.has(spec.type)) {
      problems.push(`configSchema.${field}.type must be one of ${[...CONFIG_TYPES].join("|")}`);
      continue;
    }
    if (spec.type === "select") {
      if (!Array.isArray(spec.options) || spec.options.length === 0 || spec.options.some((o) => typeof o !== "string")) {
        problems.push(`configSchema.${field}.options must be a non-empty array of strings (select)`);
      } else if (spec.default !== undefined && !spec.options.includes(spec.default)) {
        problems.push(`configSchema.${field}.default must be one of its options`);
      }
    }
    if (spec.type === "secret") {
      // Fail closed: a secret must never carry a hardcoded default (secret-in-code +
      // would serialize to the client via configSchema) or an options allow-list.
      if (spec.default !== undefined) {
        problems.push(`configSchema.${field}.default is not allowed on a secret field`);
      }
      if (spec.options !== undefined) {
        problems.push(`configSchema.${field}.options is not allowed on a secret field`);
      }
    }
  }
  return problems;
}

/**
 * Build the default config object from a config schema.
 * @param {object} [schema]
 * @returns {Record<string, any>}
 */
export function defaultConfig(schema = {}) {
  const out = {};
  for (const [field, spec] of Object.entries(schema)) {
    if (spec.type === "secret") continue; // never seed a secret value
    if (spec.default !== undefined) out[field] = clone(spec.default);
    else if (spec.type === "string[]") out[field] = [];
  }
  return out;
}

/**
 * Coerce + validate a config patch against a schema. Returns the sanitized,
 * fully-defaulted config or a list of problems. Never trusts arbitrary keys:
 * fields outside the schema are dropped; `immutable` fields keep their default;
 * `$`-prefixed keys are rejected (Mongo-operator injection defense).
 * @param {object} schema
 * @param {object} patch - client-supplied partial config
 * @param {object} [current] - the currently-persisted config (for immutables)
 * @returns {{ ok: boolean, errors: string[], value: Record<string,any> }}
 */
export function validateConfig(schema = {}, patch = {}, current = {}) {
  const errors = [];
  const value = { ...defaultConfig(schema), ...sanitize(current, schema) };

  if (patch && typeof patch === "object") {
    for (const [field, raw] of Object.entries(patch)) {
      if (field.startsWith("$") || field === "_id") continue; // injection guard
      const spec = schema[field];
      if (!spec) continue; // unknown field: silently drop (not an error)
      if (spec.immutable) continue; // cannot be changed via the API
      const coerced = coerce(spec, raw, field, errors);
      if (coerced !== undefined) value[field] = coerced;
    }
  }
  return { ok: errors.length === 0, errors, value };
}

/** Keep only schema-known, non-$ keys from a stored config. */
function sanitize(cfg = {}, schema = {}) {
  const out = {};
  for (const [k, v] of Object.entries(cfg || {})) {
    if (k.startsWith("$") || k === "_id") continue;
    if (schema[k]) out[k] = v;
  }
  return out;
}

/** Coerce+validate a single field; push a message + return undefined on failure. */
function coerce(spec, raw, field, errors) {
  switch (spec.type) {
    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) return void errors.push(`${field} must be a number`);
      if (spec.min !== undefined && n < spec.min) return void errors.push(`${field} must be >= ${spec.min}`);
      if (spec.max !== undefined && n > spec.max) return void errors.push(`${field} must be <= ${spec.max}`);
      return n;
    }
    case "boolean":
      if (typeof raw !== "boolean") return void errors.push(`${field} must be a boolean`);
      return raw;
    case "string":
      if (typeof raw !== "string") return void errors.push(`${field} must be a string`);
      if (spec.max !== undefined && raw.length > spec.max) return void errors.push(`${field} must be ≤ ${spec.max} chars`);
      return raw;
    case "text": // multiline string; same validation as string (UI hint only)
      if (typeof raw !== "string") return void errors.push(`${field} must be a string`);
      if (spec.max !== undefined && raw.length > spec.max) return void errors.push(`${field} must be ≤ ${spec.max} chars`);
      return raw;
    case "select":
      if (typeof raw !== "string") return void errors.push(`${field} must be a string`);
      if (!Array.isArray(spec.options) || !spec.options.includes(raw)) {
        return void errors.push(`${field} must be one of: ${(spec.options || []).join(", ")}`);
      }
      return raw;
    case "secret": {
      // Write-only. A blank/omitted value LEAVES the stored secret unchanged (never clears it here);
      // a non-empty string replaces it.
      if (raw === "" || raw === undefined || raw === null) return undefined;
      if (typeof raw !== "string") return void errors.push(`${field} must be a string`);
      if (spec.max !== undefined && raw.length > spec.max) return void errors.push(`${field} must be ≤ ${spec.max} chars`);
      return raw;
    }
    case "string[]":
      if (!Array.isArray(raw) || raw.some((s) => typeof s !== "string")) {
        return void errors.push(`${field} must be an array of strings`);
      }
      return raw.slice();
    default:
      return void errors.push(`${field} has an unsupported type`);
  }
}

function clone(v) {
  return Array.isArray(v) ? v.slice() : v;
}

/**
 * Redact a config object for sending to the client: `secret`-typed fields are NEVER serialized with
 * their value. Returns the config with secret values removed, plus a `secretsSet` map so the config
 * popup can show "set / unset" and let an admin replace (blank = keep). (AD-1 — secrets write-only.)
 * @param {object} schema
 * @param {object} config
 * @returns {{ config: Record<string,any>, secretsSet: Record<string,boolean> }}
 */
export function redactConfig(schema = {}, config = {}) {
  const out = {};
  const secretsSet = {};
  for (const [k, v] of Object.entries(config || {})) {
    if (k.startsWith("$") || k === "_id") continue;
    if (schema[k]?.type === "secret") continue; // never emit the value
    out[k] = v;
  }
  for (const [field, spec] of Object.entries(schema)) {
    if (spec.type === "secret") secretsSet[field] = typeof config?.[field] === "string" && config[field].length > 0;
  }
  return { config: out, secretsSet };
}
