// Plugin lifecycle service — the business logic + authorization for listing,
// enabling/disabling, and configuring plugins. Admin-only; every mutation is
// audited. Persists to the DB (model.js) THEN reflects the change on this
// instance (registry). The DB is the durable source of truth.

import { isAdmin } from "@/app/api/v1/users/access";
import { validateConfig, defaultConfig } from "./manifest.schema";
import * as registry from "./registry";
import PluginStateModel from "./model";
import { auditLog } from "@/lib/audit";

function forbidden() {
  const e = new Error("Forbidden");
  e.status = 403;
  return e;
}
function notFound(id) {
  const e = new Error(`Unknown plugin "${id}"`);
  e.status = 404;
  return e;
}
function badRequest(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

/** Reject anything that isn't a known plugin id (also blocks injection). */
function resolveEntry(pluginId) {
  if (typeof pluginId !== "string" || !pluginId) throw badRequest("pluginId required");
  const entry = registry.getPlugin(pluginId);
  if (!entry) throw notFound(pluginId);
  return entry;
}

/**
 * List all installed plugins with their fresh persisted state (admin only).
 * @param {{userID?:string, role?:string}} actor
 * @returns {Promise<Array<{id,name,version,description,sockets,configSchema,requiredPermissions,enabled,config}>>}
 */
export async function listPlugins(actor) {
  if (!isAdmin(actor)) throw forbidden();
  await registry.ensurePluginsInit();
  const states = await PluginStateModel.listStates();
  return registry.listPlugins().map(({ manifest }) => {
    const st = states[manifest.id];
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      sockets: manifest.sockets,
      configSchema: manifest.configSchema || {},
      requiredPermissions: manifest.requiredPermissions || [],
      enabled: st ? st.enabled : !!manifest.enabledByDefault,
      config: { ...defaultConfig(manifest.configSchema), ...(st?.config || {}) },
    };
  });
}

/**
 * Enable or disable a plugin (admin only).
 * @param {string} pluginId
 * @param {boolean} enabled
 * @param {{userID?:string, role?:string}} actor
 */
export async function setEnabled(pluginId, enabled, actor) {
  if (!isAdmin(actor)) throw forbidden();
  const entry = resolveEntry(pluginId);
  const next = !!enabled;
  await PluginStateModel.setEnabled(entry.manifest.id, next, actor?.userID ?? null);
  if (next) await registry.applyEnable(entry.manifest.id);
  else await registry.applyDisable(entry.manifest.id);
  auditLog(next ? "plugin.enabled" : "plugin.disabled", {
    actor: { userID: actor?.userID ?? null, role: actor?.role ?? null },
    target: entry.manifest.id,
  });
  return { id: entry.manifest.id, enabled: next };
}

/**
 * Update a plugin's config (admin only). Validates against the plugin's
 * configSchema; unknown/immutable/`$`-keys are dropped/rejected.
 * @param {string} pluginId
 * @param {object} patch
 * @param {{userID?:string, role?:string}} actor
 */
export async function setConfig(pluginId, patch, actor) {
  if (!isAdmin(actor)) throw forbidden();
  const entry = resolveEntry(pluginId);
  const current = (await PluginStateModel.getState(entry.manifest.id))?.config || {};
  const { ok, errors, value } = validateConfig(entry.manifest.configSchema || {}, patch, current);
  if (!ok) throw badRequest(`Invalid config: ${errors.join("; ")}`);
  await PluginStateModel.setConfig(entry.manifest.id, value, actor?.userID ?? null);
  await registry.applyConfig(entry.manifest.id);
  auditLog("plugin.config.updated", {
    actor: { userID: actor?.userID ?? null, role: actor?.role ?? null },
    target: entry.manifest.id,
  });
  return { id: entry.manifest.id, config: value };
}

export default { listPlugins, setEnabled, setConfig };
