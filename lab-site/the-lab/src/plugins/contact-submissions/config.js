// Resolves the contact-submissions plugin's effective config (DB values merged
// over manifest defaults) from the platform registry, plus the plugin's stable id
// and permission token. Reading through the registry at call time (not a wire-time
// snapshot) means a hook handler always sees the CURRENT config after an admin edit.

import { ensurePluginsInit, getPlugin } from "@/lib/plugins/registry";
import { defaultConfig } from "@/lib/plugins/manifest.schema";
import manifest from "./plugin.manifest";

/** Stable plugin id (matches the manifest). */
export const PLUGIN_ID = "contact-submissions";

/** Permission token gating this addon's admin actions. */
export const PERM_ADMIN = "contact-submissions:admin";

/**
 * Resolve the live effective config: manifest defaults overlaid with the
 * persisted, hydrated config from the registry.
 * @returns {Promise<{forwardTo:string, subjectPrefix:string, includeMessage:("full"|"summary"|"none")}>}
 */
export async function resolveConfig() {
  await ensurePluginsInit();
  const entry = getPlugin(PLUGIN_ID);
  return { ...defaultConfig(manifest.configSchema), ...(entry?.config || {}) };
}
