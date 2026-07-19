// Thin shim: gate on the plugin being enabled, then delegate. No business logic.
import { requirePluginEnabled } from "@/lib/plugins/guard";
import Controller from "@/plugins/member-email/controller";

export const runtime = "nodejs";

export async function GET(req) {
  const blocked = await requirePluginEnabled("member-email");
  if (blocked) return blocked;
  return Controller.availability(req);
}
