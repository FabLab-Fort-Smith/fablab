// POST /api/v1/admin/customers/cards/disable (AC-7) — disable a customer's saved card.
// Body: { customerId, cardId }. The card must belong to the customer (enforced in the service).

import { auth } from "@/auth";
import { disableCustomerCard, CustomerValidationError, CustomerNotFoundError } from "@/app/api/v1/admin/customers/service";

export const runtime = "nodejs";
const json = (b, s) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

export async function POST(request) {
  const session = await auth();
  if (!session || session.user?.role !== "admin") return json({ error: "Unauthorized" }, 401);
  const actor = { userID: session.user?.userID, role: session.user?.role };
  const b = await request.json().catch(() => ({}));
  try {
    return json(await disableCustomerCard({ customerId: b.customerId, cardId: b.cardId, actor }), 200);
  } catch (e) {
    if (e instanceof CustomerValidationError) return json({ error: e.message }, 400);
    if (e instanceof CustomerNotFoundError) return json({ error: e.message }, 404);
    console.error("admin customer card disable failed:", e?.errors?.[0]?.detail || e?.message);
    return json({ error: "Card disable failed" }, 500);
  }
}
