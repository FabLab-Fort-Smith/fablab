// POST /api/v1/admin/members/reset-password (AC-4) — admin-initiated password reset for a member.
// Sends the member the standard self-service reset email (token-based). Body: { userID }.

import { auth } from "@/auth";
import { forcePasswordReset, LifecycleValidationError, MemberNotFoundError } from "@/app/api/v1/admin/members/lifecycle";

export const runtime = "nodejs";

const json = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function POST(request) {
  const session = await auth();
  if (!session || session.user?.role !== "admin") return json({ error: "Unauthorized" }, 401);
  const actor = { userID: session.user?.userID, role: session.user?.role };

  const body = await request.json().catch(() => ({}));
  try {
    return json(await forcePasswordReset({ userID: body.userID, actor }), 200);
  } catch (e) {
    if (e instanceof LifecycleValidationError) return json({ error: e.message }, 400);
    if (e instanceof MemberNotFoundError) return json({ error: e.message }, 404);
    // Log only the error message (never the member's credentials/PII).
    console.error("admin member force-reset route failed:", e?.message);
    return json({ error: "Password reset failed" }, 500);
  }
}
