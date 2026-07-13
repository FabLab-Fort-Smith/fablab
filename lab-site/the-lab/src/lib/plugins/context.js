// The PluginContext handed to a plugin's register(ctx). It is the ONLY surface a
// plugin uses to bind to the platform — plugins never import the hook bus or
// audit sink directly, so the platform fully mediates their reach (least
// authority; no cross-feature model access).

import { onHook } from "./hooks";
import { auditLog } from "@/lib/audit";

/**
 * Build the context for a plugin.
 * @param {string} pluginId
 * @param {{ config?: object }} [state]
 * @returns {{
 *   pluginId: string,
 *   config: object,
 *   on: (event: string, handler: (payload:object)=>any) => void,
 *   audit: (event: string, fields?: object) => void,
 * }}
 */
export function makeContext(pluginId, { config = {} } = {}) {
  return {
    pluginId,
    // Frozen snapshot so a plugin can't mutate shared config state in place.
    config: Object.freeze({ ...config }),
    on(event, handler) {
      onHook(event, pluginId, handler);
    },
    audit(event, fields = {}) {
      auditLog(event, { ...fields, actor: fields.actor ?? { pluginId } });
    },
  };
}
