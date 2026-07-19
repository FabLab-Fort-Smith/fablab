// Route guard: a plugin's HTTP surface only exists while it is enabled. A thin
// `route.js` shim under src/app/api/v1/plugins/<id>/ calls this FIRST; when the
// plugin is disabled (or unknown) it returns a 404 Response so the surface truly
// disappears. Reads the DB (durable source of truth) so the gate is correct
// across server instances, and fails CLOSED on error.

import { getPlugin } from "./registry";
import PluginStateModel from "./model";

const notFound = () =>
  new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });

/**
 * @param {string} pluginId
 * @returns {Promise<Response|null>} a 404 Response to return, or null to proceed
 */
export async function requirePluginEnabled(pluginId) {
  const entry = getPlugin(pluginId);
  if (!entry) return notFound();
  let enabled = false;
  try {
    const st = await PluginStateModel.getState(pluginId);
    enabled = st ? st.enabled : !!entry.manifest.enabledByDefault;
  } catch {
    enabled = false; // fail closed when state can't be read
  }
  return enabled ? null : notFound();
}
