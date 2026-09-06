// Thin shim: the door-access authorize endpoint only exists while the plugin is
// enabled (requirePluginEnabled fails closed → 404 when disabled/unknown). All logic
// — including the INTERNAL_API_SECRET check — lives in the controller.
// Called by the VPS socket-server on a card/QR scan.

import { requirePluginEnabled } from "@/lib/plugins/guard";
import Controller from "@/plugins/door-access-controller/controller";

export const runtime = "nodejs";

export async function POST(req) {
  const blocked = await requirePluginEnabled("door-access-controller");
  if (blocked) return blocked;
  return Controller.authorize(req);
}
