// GET /api/v1/admin/square/disputes (AC-2) — admin-only list of Square disputes (read).
//
// Optional query: ?cursor=<paging> &state=<CSV of Square dispute states>. Shaping lives in the
// disputes service. Square amounts are bigint under v44 → serialize with bigintReplacer.

import { auth } from "@/auth";
import { listDisputes } from "@/app/api/v1/square/disputes/service";
import { squareErrorDetail, bigintReplacer } from "@/lib/square";
import { auditLog } from "@/lib/audit";

export const runtime = "nodejs";

const json = (body, status) =>
  new Response(JSON.stringify(body, bigintReplacer), { status, headers: { "content-type": "application/json" } });

export async function GET(request) {
  const session = await auth();
  if (!session || session.user?.role !== "admin") {
    return json({ error: "Unauthorized" }, 401);
  }
  const actor = session.user?.userID || session.user?.email || "admin";

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor") || undefined;
  const states = searchParams.get("state") || undefined;

  try {
    const result = await listDisputes({ cursor, states });
    auditLog("admin.square.disputes.list", { actor, count: result.disputes.length, outcome: "ok" });
    return json(result, 200);
  } catch (e) {
    console.error("admin disputes list failed:", squareErrorDetail(e) || e?.message);
    return json({ error: "Failed to load disputes" }, 500);
  }
}
