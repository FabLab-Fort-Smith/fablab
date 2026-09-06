// /api/v1/admin/catalog/items (AC-6) — admin CRUD for Square catalog ITEMs (products/services).
// GET list · POST create · PUT update · DELETE (?id= or body.id). Admin-gated, audited, bigint-safe.

import { auth } from "@/auth";
import { listItems, createItem, updateItem, deleteItem, CatalogValidationError, CatalogNotFoundError } from "@/app/api/v1/admin/catalog/service";
import { bigintReplacer } from "@/lib/square";

export const runtime = "nodejs";
const json = (b, s) => new Response(JSON.stringify(b, bigintReplacer), { status: s, headers: { "content-type": "application/json" } });

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user?.role !== "admin") return null;
  return { userID: session.user?.userID, role: session.user?.role };
}

const map = (e) => {
  if (e instanceof CatalogValidationError) return json({ error: e.message }, 400);
  if (e instanceof CatalogNotFoundError) return json({ error: e.message }, 404);
  console.error("admin catalog item op failed:", e?.errors?.[0]?.detail || e?.message);
  return json({ error: "Catalog operation failed" }, 500);
};

export async function GET() {
  if (!await requireAdmin()) return json({ error: "Unauthorized" }, 401);
  try { return json(await listItems(), 200); } catch (e) { return map(e); }
}

export async function POST(request) {
  const actor = await requireAdmin();
  if (!actor) return json({ error: "Unauthorized" }, 401);
  const b = await request.json().catch(() => ({}));
  try { return json(await createItem({ name: b.name, description: b.description, variations: b.variations, actor }), 201); }
  catch (e) { return map(e); }
}

export async function PUT(request) {
  const actor = await requireAdmin();
  if (!actor) return json({ error: "Unauthorized" }, 401);
  const b = await request.json().catch(() => ({}));
  try { return json(await updateItem({ id: b.id, name: b.name, description: b.description, variations: b.variations, actor }), 200); }
  catch (e) { return map(e); }
}

export async function DELETE(request) {
  const actor = await requireAdmin();
  if (!actor) return json({ error: "Unauthorized" }, 401);
  const { searchParams } = new URL(request.url);
  let id = searchParams.get("id");
  if (!id) { const b = await request.json().catch(() => ({})); id = b.id; }
  try { return json(await deleteItem({ id, actor }), 200); } catch (e) { return map(e); }
}
