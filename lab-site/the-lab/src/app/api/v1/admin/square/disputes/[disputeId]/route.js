// GET /api/v1/admin/square/disputes/[disputeId] (AC-2) — admin-only dispute detail (read).
//
// Read-only; evidence surfaced as ids only (never fetched). Access is audited (actor + disputeId).
// Square amounts are bigint under v44 → serialize with bigintReplacer.

import { auth } from "@/auth";
import { disputeDetail, DisputeNotFoundError } from "@/app/api/v1/square/disputes/service";
import { squareErrorDetail, bigintReplacer } from "@/lib/square";
import { auditLog } from "@/lib/audit";

export const runtime = "nodejs";

const json = (body, status) =>
  new Response(JSON.stringify(body, bigintReplacer), { status, headers: { "content-type": "application/json" } });

export async function GET(_request, { params }) {
  const session = await auth();
  if (!session || session.user?.role !== "admin") {
    return json({ error: "Unauthorized" }, 401);
  }
  const actor = session.user?.userID || session.user?.email || "admin";
  const { disputeId } = await params;

  try {
    const detail = await disputeDetail(disputeId);
    auditLog("admin.square.dispute.view", { actor, disputeId: detail.id, outcome: "ok" });
    return json(detail, 200);
  } catch (e) {
    if (e instanceof DisputeNotFoundError) {
      return json({ error: e.message }, e.status);
    }
    console.error("admin dispute detail failed:", squareErrorDetail(e) || e?.message);
    return json({ error: "Failed to load dispute" }, 500);
  }
}
