// GET /api/v1/admin/members/export?userID=… (AC-4) — GDPR right-of-access data export.
// Returns a JSON document of everything held about the member (PII decrypted, credentials omitted),
// as a downloadable attachment. Audited.

import { auth } from "@/auth";
import { exportMember, LifecycleValidationError, MemberNotFoundError } from "@/app/api/v1/admin/members/lifecycle";

export const runtime = "nodejs";

const json = (body, status, extraHeaders = {}) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json", ...extraHeaders } });

export async function GET(request) {
  const session = await auth();
  if (!session || session.user?.role !== "admin") return json({ error: "Unauthorized" }, 401);
  const actor = { userID: session.user?.userID, role: session.user?.role };

  const { searchParams } = new URL(request.url);
  const userID = searchParams.get("userID");
  if (!userID) return json({ error: "userID is required" }, 400);

  try {
    const data = await exportMember({ userID, actor });
    return json(
      { ...data, exportedAt: new Date().toISOString() },
      200,
      { "content-disposition": `attachment; filename="member-export-${userID}.json"` },
    );
  } catch (e) {
    if (e instanceof LifecycleValidationError) return json({ error: e.message }, 400);
    if (e instanceof MemberNotFoundError) return json({ error: e.message }, 404);
    console.error("admin member export failed:", e?.message);
    return json({ error: "Export failed" }, 500);
  }
}
