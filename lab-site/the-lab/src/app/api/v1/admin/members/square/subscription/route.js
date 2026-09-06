// POST /api/v1/admin/members/square/subscription (AC-5) — admin subscription lifecycle for a member.
// Body: { userID, subscriptionId, action, planVariationId? }. action ∈ {cancel,pause,resume,swap}.
// The subscription must belong to the member's linked Square customer (enforced in the service).

import { auth } from "@/auth";
import { subscriptionAction, SquareMemberValidationError, MemberNotFoundError } from "@/app/api/v1/admin/members/square";
import { bigintReplacer } from "@/lib/square";

export const runtime = "nodejs";
const json = (b, s) => new Response(JSON.stringify(b, bigintReplacer), { status: s, headers: { "content-type": "application/json" } });

export async function POST(request) {
  const session = await auth();
  if (!session || session.user?.role !== "admin") return json({ error: "Unauthorized" }, 401);
  const actor = { userID: session.user?.userID, role: session.user?.role };
  const body = await request.json().catch(() => ({}));
  try {
    const result = await subscriptionAction({
      userID: body.userID, subscriptionId: body.subscriptionId, action: body.action,
      planVariationId: body.planVariationId, actor,
    });
    return json(result, 200);
  } catch (e) {
    if (e instanceof SquareMemberValidationError) return json({ error: e.message }, 400);
    if (e instanceof MemberNotFoundError) return json({ error: e.message }, 404);
    console.error("admin member square subscription failed:", e?.message);
    return json({ error: "Subscription action failed" }, 500);
  }
}
