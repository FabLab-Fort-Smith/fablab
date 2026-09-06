// POST /api/v1/admin/members/square/link (AC-5) — set a member's Square customer id (validated+audited).
// Body: { userID, squareCustomerId }.

import { auth } from "@/auth";
import { linkCustomer, SquareMemberValidationError, MemberNotFoundError } from "@/app/api/v1/admin/members/square";

export const runtime = "nodejs";
const json = (b, s) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

export async function POST(request) {
  const session = await auth();
  if (!session || session.user?.role !== "admin") return json({ error: "Unauthorized" }, 401);
  const actor = { userID: session.user?.userID, role: session.user?.role };
  const body = await request.json().catch(() => ({}));
  try {
    return json(await linkCustomer({ userID: body.userID, squareCustomerId: body.squareCustomerId, actor }), 200);
  } catch (e) {
    if (e instanceof SquareMemberValidationError) return json({ error: e.message }, 400);
    if (e instanceof MemberNotFoundError) return json({ error: e.message }, 404);
    console.error("admin member square link failed:", e?.message);
    return json({ error: "Link failed" }, 500);
  }
}
