// Thin shim: gate on the plugin being enabled, then delegate. Admin authz is
// enforced in the service (assertPermission). No business logic here.
import { requirePluginEnabled } from "@/lib/plugins/guard";
import Controller from "@/plugins/member-email/controller";

export const runtime = "nodejs";

export async function GET() {
  const blocked = await requirePluginEnabled("member-email");
  if (blocked) return blocked;
  return Controller.adminList();
}

export async function POST(req) {
  const blocked = await requirePluginEnabled("member-email");
  if (blocked) return blocked;
  return Controller.adminAction(req);
}
