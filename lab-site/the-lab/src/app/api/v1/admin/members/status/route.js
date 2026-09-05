// POST /api/v1/admin/members/status (AC-3) — admin-only membership status change (validated + audited).
// Body: { userID, status }. status ∈ member lifecycle allow-list. suspend = "suspended";
// reactivate = "active"/"probation".

import { auth } from "@/auth";
import { setMemberStatus, MemberValidationError, MemberNotFoundError } from "@/app/api/v1/admin/members/service";

export const runtime = "nodejs";

const json = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function POST(request) {
  const session = await auth();
  if (!session || session.user?.role !== "admin") return json({ error: "Unauthorized" }, 401);
  const actor = { userID: session.user?.userID, role: session.user?.role };

  const body = await request.json().catch(() => ({}));
  try {
    const result = await setMemberStatus({ userID: body.userID, status: body.status, actor });
    return json(result, 200);
  } catch (e) {
    if (e instanceof MemberValidationError) return json({ error: e.message }, 400);
    if (e instanceof MemberNotFoundError) return json({ error: e.message }, 404);
    console.error("admin member status change failed:", e?.message);
    return json({ error: "Status change failed" }, 500);
  }
}
