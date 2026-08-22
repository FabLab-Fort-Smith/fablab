// Thin shim: rebuild + push the signed offline allowlist. Exists only while the plugin is
// enabled (requirePluginEnabled fails closed → 404). Guarded by INTERNAL_API_SECRET in the
// controller. Intended to be called on a timer (every config.offlineRefreshMinutes).

import { requirePluginEnabled } from "@/lib/plugins/guard";
import Controller from "@/plugins/door-access-controller/controller";

export const runtime = "nodejs";

export async function POST(req) {
  const blocked = await requirePluginEnabled("door-access-controller");
  if (blocked) return blocked;
  return Controller.refreshAllowlist(req);
}
