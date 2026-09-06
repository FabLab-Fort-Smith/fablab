// POST /api/v1/admin/square/refund (AC-1) — admin-only Square refund.
//
// Admin authorization is enforced here (session role); the refund logic + amount validation live in the
// refunds service. PCI SAQ-A: operates only by paymentId, never card data. Every attempt is audited
// (actor + paymentId + amount + outcome — no card/PII). Square amounts are bigint under v44, so the
// response is serialized with bigintReplacer.

import { auth } from "@/auth";
import { refund, RefundValidationError } from "@/app/api/v1/square/refunds/service";
import { squareErrorDetail, bigintReplacer } from "@/lib/square";
import { auditLog } from "@/lib/audit";

export const runtime = "nodejs";

const json = (body, status) =>
  new Response(JSON.stringify(body, bigintReplacer), { status, headers: { "content-type": "application/json" } });

export async function POST(request) {
  const session = await auth();
  if (!session || session.user?.role !== "admin") {
    return json({ error: "Unauthorized" }, 401);
  }
  const actor = session.user?.userID || session.user?.email || "admin";

  const body = await request.json().catch(() => ({}));
  const paymentId = typeof body.paymentId === "string" ? body.paymentId : null;
  const amountCents = body.amountCents; // optional; service validates (undefined => full refund)
  const reason = typeof body.reason === "string" ? body.reason : undefined;
  if (!paymentId) return json({ error: "paymentId is required" }, 400);

  try {
    const r = await refund({ paymentId, amountCents, reason });
    auditLog("admin.square.refund", {
      actor: { userID: actor }, paymentId,
      refundId: r?.id ?? null, amount: r?.amountMoney?.amount != null ? String(r.amountMoney.amount) : null,
      status: r?.status ?? null, outcome: "refunded",
    });
    return json({ refund: r }, 200);
  } catch (e) {
    if (e instanceof RefundValidationError) {
      auditLog("admin.square.refund", { actor: { userID: actor }, paymentId, outcome: "rejected", reason: e.message });
      return json({ error: e.message }, 400);
    }
    // Square API error or unexpected — audit + a safe message (no internals leaked).
    auditLog("admin.square.refund", { actor: { userID: actor }, paymentId, outcome: "error" });
    console.error("[admin.square.refund] error:", squareErrorDetail(e) || (e && e.message) || e);
    return json({ error: "Refund failed" }, 500);
  }
}
