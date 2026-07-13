// Resolves the member-email plugin's effective config (DB values merged over
// manifest defaults) from the platform registry. Also the home for the plugin's
// stable id + permission tokens.

import { ensurePluginsInit, getPlugin } from "@/lib/plugins/registry";
import { defaultConfig } from "@/lib/plugins/manifest.schema";
import manifest from "./plugin.manifest";

export const PLUGIN_ID = "member-email";
export const PERM_ADMIN = "member-email:admin";

/** @returns {Promise<{maxMailboxesPerMember:number, minAccountCredit:number, additionalReserved:string[]}>} */
export async function resolveConfig() {
  await ensurePluginsInit();
  const entry = getPlugin(PLUGIN_ID);
  return { ...defaultConfig(manifest.configSchema), ...(entry?.config || {}) };
}
