// GET /api/v1/admin/square/payment/[paymentId] (AC-2) — admin-only payment detail (read).
//
// Admin authorization enforced here; sanitization/allow-listing lives in the payments service.
// PCI SAQ-A: no card data beyond brand/last4/exp. Access is audited (actor + paymentId, no PII/card).
// Square amounts are bigint under v44, so the response is serialized with bigintReplacer.

import { auth } from "@/auth";
import { paymentDetail, PaymentNotFoundError } from "@/app/api/v1/square/payments/service";
import { squareErrorDetail, bigintReplacer } from "@/lib/square";
import { auditLog } from "@/lib/audit";

export const runtime = "nodejs";

const json = (body, status) =>
  new Response(JSON.stringify(body, bigintReplacer), { status, headers: { "content-type": "application/json" } });

export async function GET(_request, { params }) {
  const session = await auth();
  if (!session || session.user?.role !== "admin") {
    return json({ error: "Unauthorized" }, 401);
  }
  const actor = session.user?.userID || session.user?.email || "admin";
  const { paymentId } = await params;

  try {
    const detail = await paymentDetail(paymentId);
    auditLog("admin.square.payment.view", { actor, paymentId: detail.id, outcome: "ok" });
    return json(detail, 200);
  } catch (e) {
    if (e instanceof PaymentNotFoundError) {
      return json({ error: e.message }, e.status);
    }
    console.error("admin payment detail failed:", squareErrorDetail(e) || e?.message);
    return json({ error: "Failed to load payment" }, 500);
  }
}
