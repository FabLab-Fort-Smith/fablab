// POST /api/v1/admin/members/unlink (AC-4) — admin unlink of an OAuth provider (validated + audited).
// Body: { userID, provider }. provider ∈ {google, discord}. Refuses to remove the last sign-in method.

import { auth } from "@/auth";
import { unlinkProvider, LifecycleValidationError, MemberNotFoundError } from "@/app/api/v1/admin/members/lifecycle";

export const runtime = "nodejs";

const json = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function POST(request) {
  const session = await auth();
  if (!session || session.user?.role !== "admin") return json({ error: "Unauthorized" }, 401);
  const actor = { userID: session.user?.userID, role: session.user?.role };

  const body = await request.json().catch(() => ({}));
  try {
    return json(await unlinkProvider({ userID: body.userID, provider: body.provider, actor }), 200);
  } catch (e) {
    if (e instanceof LifecycleValidationError) return json({ error: e.message }, 400);
    if (e instanceof MemberNotFoundError) return json({ error: e.message }, 404);
    console.error("admin member unlink failed:", e?.message);
    return json({ error: "Unlink failed" }, 500);
  }
}
