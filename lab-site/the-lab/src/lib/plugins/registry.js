// The plugin registry: boot-time discovery + the in-memory source of truth for
// which plugins exist, their manifests, and (per server instance) their wired
// state. Plugins are discovered from a STATIC import list (src/plugins/index.js)
// — never a filesystem/network scan — which is what makes this "WordPress-like"
// without ever loading arbitrary code. The DB (model.js) is the durable source
// of truth for enabled/config; this registry mirrors it and wires hook handlers.

import { PLUGINS } from "@/plugins";
import { defineManifest, defaultConfig } from "./manifest.schema";
import { makeContext } from "./context";
import { offPlugin, emitHook } from "./hooks";
import { getState, listStates } from "./model";
import { auditLog } from "@/lib/audit";

/** pluginId -> { manifest, module, enabled, config, wired } */
const registry = new Map();
let built = false;
let initPromise = null;

/**
 * Validate every installed plugin's manifest and record it. Pure/sync and safe
 * to run at import; does NOT touch the DB or run plugin code.
 */
export function buildRegistry() {
  if (built) return;
  registry.clear();
  for (const mod of PLUGINS) {
    const manifest = defineManifest(mod.manifest); // throws on a bad manifest
    if (registry.has(manifest.id)) {
      throw new Error(`Duplicate plugin id "${manifest.id}"`);
    }
    registry.set(manifest.id, {
      manifest,
      module: mod,
      enabled: false,
      config: defaultConfig(manifest.configSchema),
      wired: false,
    });
  }
  built = true;
}

/** Wire an enabled plugin on THIS instance: register hooks + onEnable. Idempotent. */
async function wire(entry) {
  if (entry.wired) return;
  const ctx = makeContext(entry.manifest.id, { config: entry.config });
  try {
    if (typeof entry.module.register === "function") entry.module.register(ctx);
    if (typeof entry.module.onEnable === "function") await entry.module.onEnable(ctx);
    entry.wired = true;
  } catch (err) {
    auditLog("plugin.wire.failed", {
      actor: { pluginId: entry.manifest.id },
      outcome: "error",
      reason: err?.message || "wire error",
    });
  }
}

/** Unwire a plugin on THIS instance: drop hook subscriptions + onDisable. */
async function unwire(entry) {
  offPlugin(entry.manifest.id);
  entry.wired = false;
  try {
    const ctx = makeContext(entry.manifest.id, { config: entry.config });
    if (typeof entry.module.onDisable === "function") await entry.module.onDisable(ctx);
  } catch (err) {
    auditLog("plugin.unwire.failed", {
      actor: { pluginId: entry.manifest.id },
      outcome: "error",
      reason: err?.message || "unwire error",
    });
  }
}

/**
 * Initialize the platform: build the registry, hydrate enabled/config from the
 * DB, and wire the enabled plugins. Idempotent + concurrency-safe (memoized) so
 * both boot (instrumentation) and cold-start API routes can await it.
 */
export function initPlugins() {
  if (!initPromise) {
    initPromise = (async () => {
      buildRegistry();
      let states = {};
      try {
        states = await listStates();
      } catch (err) {
        // If the DB is unreachable at boot, fall back to manifest defaults
        // (fail safe: plugins default disabled) rather than crashing the app.
        auditLog("plugin.init.state_unavailable", { outcome: "error", reason: err?.message });
      }
      for (const entry of registry.values()) {
        const st = states[entry.manifest.id];
        entry.enabled = st ? st.enabled : !!entry.manifest.enabledByDefault;
        entry.config = { ...defaultConfig(entry.manifest.configSchema), ...(st?.config || {}) };
        if (entry.enabled) await wire(entry);
      }
    })();
  }
  return initPromise;
}

/** Await one-time platform init. */
export async function ensurePluginsInit() {
  await initPlugins();
}

/**
 * Reflect a runtime enable on this instance (the service persists to the DB
 * first, then calls this). Re-reads the plugin's config from the DB.
 * @param {string} pluginId
 */
export async function applyEnable(pluginId) {
  await ensurePluginsInit();
  const entry = registry.get(pluginId);
  if (!entry) return;
  const st = await getState(pluginId);
  entry.config = { ...defaultConfig(entry.manifest.configSchema), ...(st?.config || {}) };
  entry.enabled = true;
  await wire(entry);
}

/** Reflect a runtime disable on this instance. @param {string} pluginId */
export async function applyDisable(pluginId) {
  await ensurePluginsInit();
  const entry = registry.get(pluginId);
  if (!entry) return;
  entry.enabled = false;
  await unwire(entry);
}

/** Reflect a runtime config change (re-reads config, re-wires if needed). */
export async function applyConfig(pluginId) {
  await ensurePluginsInit();
  const entry = registry.get(pluginId);
  if (!entry) return;
  const st = await getState(pluginId);
  entry.config = { ...defaultConfig(entry.manifest.configSchema), ...(st?.config || {}) };
  try {
    if (typeof entry.module.onConfigChange === "function") {
      await entry.module.onConfigChange(makeContext(pluginId, { config: entry.config }), entry.config);
    }
  } catch (err) {
    auditLog("plugin.config.apply_failed", { actor: { pluginId }, outcome: "error", reason: err?.message });
  }
}

/** @param {string} pluginId @returns {object|undefined} the registry entry */
export function getPlugin(pluginId) {
  buildRegistry();
  return registry.get(pluginId);
}

/** @returns {Array<{manifest:object, enabled:boolean, config:object}>} */
export function listPlugins() {
  buildRegistry();
  return [...registry.values()].map((e) => ({ manifest: e.manifest, enabled: e.enabled, config: e.config }));
}

/** In-memory enabled check for this instance (may lag the DB by one request). */
export function isEnabled(pluginId) {
  buildRegistry();
  return !!registry.get(pluginId)?.enabled;
}

/**
 * Reconcile this instance's wiring against the DB (the durable source of truth):
 * wire any plugin that is enabled-in-DB but not yet wired here, unwire any that
 * was disabled elsewhere. Cheap DB read; called before emitting an event so a
 * plugin enabled on a *different* instance still receives hooks here.
 */
export async function reconcile() {
  await ensurePluginsInit();
  let states;
  try {
    states = await listStates();
  } catch {
    return; // fail safe: keep current wiring if the DB is momentarily unreachable
  }
  for (const entry of registry.values()) {
    const st = states[entry.manifest.id];
    const enabled = st ? st.enabled : !!entry.manifest.enabledByDefault;
    if (enabled && !entry.wired) {
      entry.config = { ...defaultConfig(entry.manifest.configSchema), ...(st?.config || {}) };
      entry.enabled = true;
      await wire(entry);
    } else if (!enabled && entry.wired) {
      entry.enabled = false;
      await unwire(entry);
    }
  }
}

/**
 * Emit a core domain event to enabled plugins, reconciling wiring first so the
 * event reaches subscribers even if this instance booted with the plugin
 * disabled (fixes the cross-instance hook gap). Best-effort — never throws into
 * the caller's transaction.
 * @param {string} event @param {object} [payload]
 */
export async function emitEvent(event, payload = {}) {
  try {
    await reconcile();
  } catch {
    /* reconciliation failure must not block the core path */
  }
  return emitHook(event, payload);
}

/** Test helper: reset the whole registry. */
export function _resetRegistry() {
  registry.clear();
  built = false;
  initPromise = null;
}
