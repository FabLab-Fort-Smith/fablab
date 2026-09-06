// POST /api/v1/admin/members/role (AC-3) — admin-only member role change (validated + audited).
// Body: { userID, role }. role ∈ {user, admin}. Self role-change is blocked in the service.

import { auth } from "@/auth";
import { changeRole, MemberValidationError, MemberNotFoundError } from "@/app/api/v1/admin/members/service";

export const runtime = "nodejs";

const json = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function POST(request) {
  const session = await auth();
  if (!session || session.user?.role !== "admin") return json({ error: "Unauthorized" }, 401);
  const actor = { userID: session.user?.userID, role: session.user?.role };

  const body = await request.json().catch(() => ({}));
  try {
    const result = await changeRole({ userID: body.userID, role: body.role, actor });
    return json(result, 200);
  } catch (e) {
    if (e instanceof MemberValidationError) return json({ error: e.message }, 400);
    if (e instanceof MemberNotFoundError) return json({ error: e.message }, 404);
    console.error("admin member role change failed:", e?.message);
    return json({ error: "Role change failed" }, 500);
  }
}
