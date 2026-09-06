// POST /api/v1/admin/members/square/unlink (AC-5) — clear a member's Square customer id (audited).
// Body: { userID }.

import { auth } from "@/auth";
import { unlinkCustomer, SquareMemberValidationError, MemberNotFoundError } from "@/app/api/v1/admin/members/square";

export const runtime = "nodejs";
const json = (b, s) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

export async function POST(request) {
  const session = await auth();
  if (!session || session.user?.role !== "admin") return json({ error: "Unauthorized" }, 401);
  const actor = { userID: session.user?.userID, role: session.user?.role };
  const body = await request.json().catch(() => ({}));
  try {
    return json(await unlinkCustomer({ userID: body.userID, actor }), 200);
  } catch (e) {
    if (e instanceof SquareMemberValidationError) return json({ error: e.message }, 400);
    if (e instanceof MemberNotFoundError) return json({ error: e.message }, 404);
    console.error("admin member square unlink failed:", e?.message);
    return json({ error: "Unlink failed" }, 500);
  }
}
