// Resolves the door-access-controller plugin's effective operational config
// (DB values merged over manifest defaults) from the platform registry, and is the
// home for the plugin's stable id + permission tokens.
//
// NOTE: this returns only the flat operational knobs. The structured access POLICY
// (rules, per-account overrides, door registry) is loaded from the addon's own model
// — see the design doc — and fed to the pure engine in policy.js.

import { ensurePluginsInit, getPlugin } from "@/lib/plugins/registry";
import { defaultConfig } from "@/lib/plugins/manifest.schema";
import manifest from "./plugin.manifest";

export const PLUGIN_ID = "door-access-controller";
export const PERM_ADMIN = "door-access-controller:admin";

/**
 * @returns {Promise<{requireGoodStanding:boolean, allowAdminBypass:boolean, defaultTimezone:string,
 *   offlineRefreshMinutes:number, offlineTtlMinutes:number}>}
 */
export async function resolveConfig() {
  await ensurePluginsInit();
  const entry = getPlugin(PLUGIN_ID);
  return { ...defaultConfig(manifest.configSchema), ...(entry?.config || {}) };
}
