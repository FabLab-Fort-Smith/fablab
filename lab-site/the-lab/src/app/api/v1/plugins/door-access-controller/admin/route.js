// Thin shim: exists only while the plugin is enabled (requirePluginEnabled → 404 when off).
// Admin authz is enforced in the service (assertPermission); no business logic here.

import { requirePluginEnabled } from "@/lib/plugins/guard";
import Controller from "@/plugins/door-access-controller/controller";

export const runtime = "nodejs";

export async function GET() {
  const blocked = await requirePluginEnabled("door-access-controller");
  if (blocked) return blocked;
  return Controller.adminOverview();
}

export async function POST(req) {
  const blocked = await requirePluginEnabled("door-access-controller");
  if (blocked) return blocked;
  return Controller.adminAction(req);
}
