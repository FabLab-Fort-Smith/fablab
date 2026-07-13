// Admin plugin-management HTTP edge. The /api/* surface is NOT behind
// middleware, so every handler authenticates here and passes the actor to the
// service, which enforces admin authorization. Mirrors the users controller
// idiom (401 anon, 403 non-admin) and never leaks internal error detail.

import { auth } from "@/auth";
import PluginService from "@/lib/plugins/service";

const json = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const unauthorized = () => json({ error: "Unauthorized" }, 401);

/** Build the actor context the service expects from a session. */
const toActor = (session) => ({
  userID: session?.user?.userID ?? null,
  role: session?.user?.role ?? null,
});

/** Map a tagged service error to a safe HTTP response (generic message). */
function errorResponse(err) {
  const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
  if (status === 500) console.error("PluginController error:", err);
  const message = status === 500 ? "An unexpected error occurred." : err.message;
  return json({ error: message }, status);
}

export default class PluginController {
  /** GET — list installed plugins + state (admin only). */
  static list = async () => {
    try {
      const session = await auth();
      if (!session?.user?.userID) return unauthorized();
      const plugins = await PluginService.listPlugins(toActor(session));
      return json({ plugins }, 200);
    } catch (err) {
      return errorResponse(err);
    }
  };

  /** PATCH { pluginId, enabled } — enable/disable a plugin (admin only). */
  static setEnabled = async (req) => {
    try {
      const session = await auth();
      if (!session?.user?.userID) return unauthorized();
      const { pluginId, enabled } = await req.json();
      if (typeof enabled !== "boolean") return json({ error: "enabled (boolean) required" }, 400);
      const result = await PluginService.setEnabled(pluginId, enabled, toActor(session));
      return json({ ok: true, ...result }, 200);
    } catch (err) {
      return errorResponse(err);
    }
  };

  /** PUT { pluginId, config } — update a plugin's config (admin only). */
  static setConfig = async (req) => {
    try {
      const session = await auth();
      if (!session?.user?.userID) return unauthorized();
      const { pluginId, config } = await req.json();
      const result = await PluginService.setConfig(pluginId, config ?? {}, toActor(session));
      return json({ ok: true, ...result }, 200);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
