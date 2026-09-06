// POST /api/v1/admin/members/square/cards/disable (AC-5) — disable one of a member's saved cards.
// Body: { userID, cardId }. The card must belong to the member's linked customer (enforced in service).

import { auth } from "@/auth";
import { disableSavedCard, SquareMemberValidationError, MemberNotFoundError } from "@/app/api/v1/admin/members/square";

export const runtime = "nodejs";
const json = (b, s) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

export async function POST(request) {
  const session = await auth();
  if (!session || session.user?.role !== "admin") return json({ error: "Unauthorized" }, 401);
  const actor = { userID: session.user?.userID, role: session.user?.role };
  const body = await request.json().catch(() => ({}));
  try {
    return json(await disableSavedCard({ userID: body.userID, cardId: body.cardId, actor }), 200);
  } catch (e) {
    if (e instanceof SquareMemberValidationError) return json({ error: e.message }, 400);
    if (e instanceof MemberNotFoundError) return json({ error: e.message }, 404);
    console.error("admin member square card disable failed:", e?.message);
    return json({ error: "Card disable failed" }, 500);
  }
}
