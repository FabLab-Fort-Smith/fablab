// GET /api/v1/admin/members/square/cards?userID=… (AC-5) — a member's saved cards (sanitized).
// PCI SAQ-A: brand/last4/exp only, never PAN.

import { auth } from "@/auth";
import { listSavedCards, SquareMemberValidationError, MemberNotFoundError } from "@/app/api/v1/admin/members/square";

export const runtime = "nodejs";
const json = (b, s) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

export async function GET(request) {
  const session = await auth();
  if (!session || session.user?.role !== "admin") return json({ error: "Unauthorized" }, 401);
  const actor = { userID: session.user?.userID, role: session.user?.role };
  const { searchParams } = new URL(request.url);
  const userID = searchParams.get("userID");
  if (!userID) return json({ error: "userID is required" }, 400);
  try {
    return json(await listSavedCards({ userID, actor }), 200);
  } catch (e) {
    if (e instanceof SquareMemberValidationError) return json({ error: e.message }, 400);
    if (e instanceof MemberNotFoundError) return json({ error: e.message }, 404);
    console.error("admin member square cards failed:", e?.message);
    return json({ error: "Failed to load cards" }, 500);
  }
}
