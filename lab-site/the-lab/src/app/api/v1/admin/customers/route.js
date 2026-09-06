// /api/v1/admin/customers (AC-7) — admin Square-customer search / detail / create / edit.
// GET ?q=<email>  → search;  GET ?id=<customerId>  → detail + saved cards.
// POST create · PUT update. Admin-gated, audited.

import { auth } from "@/auth";
import {
  searchCustomersAdmin, getCustomerAdmin, createCustomerAdmin, updateCustomerAdmin,
  CustomerValidationError, CustomerNotFoundError,
} from "@/app/api/v1/admin/customers/service";

export const runtime = "nodejs";
const json = (b, s) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user?.role !== "admin") return null;
  return { userID: session.user?.userID, role: session.user?.role };
}

const map = (e) => {
  if (e instanceof CustomerValidationError) return json({ error: e.message }, 400);
  if (e instanceof CustomerNotFoundError) return json({ error: e.message }, 404);
  console.error("admin customers op failed:", e?.errors?.[0]?.detail || e?.message);
  return json({ error: "Customer operation failed" }, 500);
};

export async function GET(request) {
  const actor = await requireAdmin();
  if (!actor) return json({ error: "Unauthorized" }, 401);
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const q = searchParams.get("q");
  try {
    if (id) return json(await getCustomerAdmin(id, actor), 200);
    if (q) return json(await searchCustomersAdmin({ query: q, actor }), 200);
    return json({ error: "q or id is required" }, 400);
  } catch (e) { return map(e); }
}

export async function POST(request) {
  const actor = await requireAdmin();
  if (!actor) return json({ error: "Unauthorized" }, 401);
  const b = await request.json().catch(() => ({}));
  try { return json(await createCustomerAdmin({ ...b, actor }), 201); } catch (e) { return map(e); }
}

export async function PUT(request) {
  const actor = await requireAdmin();
  if (!actor) return json({ error: "Unauthorized" }, 401);
  const b = await request.json().catch(() => ({}));
  try { return json(await updateCustomerAdmin({ ...b, actor }), 200); } catch (e) { return map(e); }
}
