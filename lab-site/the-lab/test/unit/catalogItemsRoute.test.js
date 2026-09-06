// AC-6 catalog items route: admin-gated CRUD, delegates to the service, maps 400/404/500, bigint-safe.

jest.mock("@/auth", () => ({ __esModule: true, auth: jest.fn() }));
jest.mock("@/app/api/v1/admin/catalog/service", () => {
  class CatalogValidationError extends Error { constructor(m) { super(m); this.name = "CatalogValidationError"; this.status = 400; } }
  class CatalogNotFoundError extends Error { constructor(m = "item not found") { super(m); this.name = "CatalogNotFoundError"; this.status = 404; } }
  return { __esModule: true, listItems: jest.fn(), createItem: jest.fn(), updateItem: jest.fn(), deleteItem: jest.fn(), CatalogValidationError, CatalogNotFoundError };
});
jest.mock("@/lib/square", () => ({ __esModule: true, bigintReplacer: (k, v) => (typeof v === "bigint" ? v.toString() : v) }));

import { GET, POST, PUT, DELETE } from "@/app/api/v1/admin/catalog/items/route";
import { auth } from "@/auth";
import { listItems, createItem, updateItem, deleteItem, CatalogValidationError, CatalogNotFoundError } from "@/app/api/v1/admin/catalog/service";

const ADMIN = { user: { role: "admin", userID: "admin-1" } };
const req = (method, url, body) => new Request(url, { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });

beforeEach(() => { jest.clearAllMocks(); auth.mockResolvedValue(ADMIN); });

test("non-admin → 401 on every method, service not called", async () => {
  auth.mockResolvedValue({ user: { role: "member" } });
  expect((await GET()).status).toBe(401);
  expect((await POST(req("POST", "http://l/i", { name: "x" }))).status).toBe(401);
  expect((await PUT(req("PUT", "http://l/i", { id: "1" }))).status).toBe(401);
  expect((await DELETE(req("DELETE", "http://l/i?id=1"))).status).toBe(401);
  expect(createItem).not.toHaveBeenCalled();
  expect(deleteItem).not.toHaveBeenCalled();
});

test("GET list → 200, bigint amount serialized as string", async () => {
  listItems.mockResolvedValueOnce({ items: [{ id: "i1", variations: [{ priceCents: 500n }] }] });
  const res = await GET();
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('"priceCents":"500"');
});

test("POST create → 201 delegates with actor; validation → 400", async () => {
  createItem.mockResolvedValueOnce({ id: "i_new" });
  const res = await POST(req("POST", "http://l/i", { name: "Gizmo", variations: [{ name: "s", priceCents: 100 }] }));
  expect(res.status).toBe(201);
  expect(createItem).toHaveBeenCalledWith(expect.objectContaining({ name: "Gizmo", actor: { userID: "admin-1", role: "admin" } }));
  createItem.mockRejectedValueOnce(new CatalogValidationError("name is required"));
  expect((await POST(req("POST", "http://l/i", {}))).status).toBe(400);
});

test("PUT update → 200; not found → 404; other → 500 generic", async () => {
  updateItem.mockResolvedValueOnce({ id: "i1" });
  expect((await PUT(req("PUT", "http://l/i", { id: "i1", name: "x", variations: [] }))).status).toBe(200);
  updateItem.mockRejectedValueOnce(new CatalogNotFoundError());
  expect((await PUT(req("PUT", "http://l/i", { id: "nope" }))).status).toBe(404);
  updateItem.mockRejectedValueOnce(new Error("square boom internal"));
  const res = await PUT(req("PUT", "http://l/i", { id: "i1" }));
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "Catalog operation failed" });
});

test("DELETE by ?id= → 200 delegates", async () => {
  deleteItem.mockResolvedValueOnce({ id: "i1", deleted: true });
  const res = await DELETE(req("DELETE", "http://l/i?id=i1"));
  expect(res.status).toBe(200);
  expect(deleteItem).toHaveBeenCalledWith({ id: "i1", actor: { userID: "admin-1", role: "admin" } });
});
