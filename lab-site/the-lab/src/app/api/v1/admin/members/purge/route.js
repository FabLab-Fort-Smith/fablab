// POST /api/v1/admin/members/purge (AC-4) — GDPR erasure. IRREVERSIBLE.
// Body: { userID, confirm }. `confirm` must equal `userID` (typed confirmation) to guard against
// accidental purge. Cascade-scrubs related collections then hard-deletes the member.

import { auth } from "@/auth";
import { purgeMember, LifecycleValidationError, MemberNotFoundError } from "@/app/api/v1/admin/members/lifecycle";

export const runtime = "nodejs";

const json = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function POST(request) {
  const session = await auth();
  if (!session || session.user?.role !== "admin") return json({ error: "Unauthorized" }, 401);
  const actor = { userID: session.user?.userID, role: session.user?.role };

  const body = await request.json().catch(() => ({}));
  const userID = typeof body.userID === "string" ? body.userID : null;
  if (!userID) return json({ error: "userID is required" }, 400);
  if (body.confirm !== userID) {
    return json({ error: "confirmation required: `confirm` must equal `userID`" }, 400);
  }

  try {
    return json(await purgeMember({ userID, actor }), 200);
  } catch (e) {
    if (e instanceof LifecycleValidationError) return json({ error: e.message }, 400);
    if (e instanceof MemberNotFoundError) return json({ error: e.message }, 404);
    console.error("admin member purge failed:", e?.message);
    return json({ error: "Purge failed" }, 500);
  }
}
