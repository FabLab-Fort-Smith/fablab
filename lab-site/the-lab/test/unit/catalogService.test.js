// AC-6 catalog-item service: list/create/update/delete Square ITEMs with priced variations.

jest.mock("uuid", () => ({ __esModule: true, v4: () => "idem-test" }));
jest.mock("@/lib/square", () => ({ __esModule: true,
  searchCatalogObjects: jest.fn(), getCatalogObject: jest.fn(), upsertCatalogObject: jest.fn(), deleteCatalogObject: jest.fn(),
}));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import { listItems, createItem, updateItem, deleteItem, CatalogValidationError, CatalogNotFoundError } from "@/app/api/v1/admin/catalog/service";
import * as sq from "@/lib/square";
import { auditLog } from "@/lib/audit";

const ADMIN = { userID: "admin-1", role: "admin" };
const itemObj = (over = {}) => ({ type: "ITEM", id: "item_1", version: 5, itemData: { name: "Widget", description: "d", variations: [
  { type: "ITEM_VARIATION", id: "var_1", version: 3, itemVariationData: { name: "Small", pricingType: "FIXED_PRICING", priceMoney: { amount: 500, currency: "USD" } } },
], ...over } });

beforeEach(() => {
  jest.clearAllMocks();
  sq.upsertCatalogObject.mockImplementation(async ({ object }) => ({ catalogObject: { ...itemObj(), id: object.id === "#item" ? "item_new" : object.id } }));
  sq.deleteCatalogObject.mockResolvedValue({});
});

test("list: returns sanitized items, bigint price coerced, no raw passthrough", async () => {
  sq.searchCatalogObjects.mockResolvedValueOnce({ objects: [itemObj({ variations: [
    { id: "v1", version: 1, itemVariationData: { name: "Big", priceMoney: { amount: 999n, currency: "USD" }, sku: "SECRET-SKU" } },
  ] })] });
  const r = await listItems();
  expect(r.items[0]).toMatchObject({ id: "item_1", name: "Widget", variations: [{ id: "v1", name: "Big", priceCents: 999, currency: "USD" }] });
  expect(r.items[0].variations[0]).not.toHaveProperty("sku");
});

test("create: builds ITEM + FIXED_PRICING variations, upserts, audits", async () => {
  await createItem({ name: " Gizmo ", description: " x ", variations: [{ name: "Std", priceCents: 1200 }], actor: ADMIN });
  const body = sq.upsertCatalogObject.mock.calls[0][0];
  expect(body.object.type).toBe("ITEM");
  expect(body.object.itemData.name).toBe("Gizmo");
  expect(body.object.itemData.variations[0].itemVariationData).toMatchObject({ name: "Std", pricingType: "FIXED_PRICING" });
  expect(body.object.itemData.variations[0].itemVariationData.priceMoney.amount).toBe(BigInt(1200));
  expect(auditLog).toHaveBeenCalledWith("admin.catalog.item.create", expect.objectContaining({ outcome: "success" }));
});

test("create: validation — missing name / no variations / bad price rejected, no upsert", async () => {
  await expect(createItem({ name: "", variations: [{ name: "a", priceCents: 1 }], actor: ADMIN })).rejects.toBeInstanceOf(CatalogValidationError);
  await expect(createItem({ name: "x", variations: [], actor: ADMIN })).rejects.toThrow(/at least one variation/);
  await expect(createItem({ name: "x", variations: [{ name: "a", priceCents: -1 }], actor: ADMIN })).rejects.toThrow(/non-negative integer/);
  await expect(createItem({ name: "x", variations: [{ name: "a", priceCents: 1.5 }], actor: ADMIN })).rejects.toThrow(/non-negative integer/);
  expect(sq.upsertCatalogObject).not.toHaveBeenCalled();
});

test("update: carries item + variation version (optimistic concurrency), preserves kept ids, new var gets temp id", async () => {
  sq.getCatalogObject.mockResolvedValueOnce({ object: itemObj() });
  await updateItem({ id: "item_1", name: "Widget2", variations: [
    { id: "var_1", name: "Small", priceCents: 600 },   // existing → keep id + version
    { name: "Large", priceCents: 900 },                 // new → temp id
  ], actor: ADMIN });
  const body = sq.upsertCatalogObject.mock.calls[0][0];
  expect(body.object.id).toBe("item_1");
  expect(body.object.version).toBe(5);
  expect(body.object.itemData.variations[0]).toMatchObject({ id: "var_1", version: 3 });
  expect(body.object.itemData.variations[1].id).toMatch(/^#var-/);
  expect(auditLog).toHaveBeenCalledWith("admin.catalog.item.update", expect.objectContaining({ target: "item_1", outcome: "success" }));
});

test("update: unknown / non-ITEM object → CatalogNotFoundError, no upsert", async () => {
  sq.getCatalogObject.mockResolvedValueOnce({ object: null });
  await expect(updateItem({ id: "nope", name: "x", variations: [{ name: "a", priceCents: 1 }], actor: ADMIN })).rejects.toBeInstanceOf(CatalogNotFoundError);
  sq.getCatalogObject.mockResolvedValueOnce({ object: { type: "DISCOUNT", id: "d1" } });
  await expect(updateItem({ id: "d1", name: "x", variations: [{ name: "a", priceCents: 1 }], actor: ADMIN })).rejects.toBeInstanceOf(CatalogNotFoundError);
  expect(sq.upsertCatalogObject).not.toHaveBeenCalled();
});

test("delete: type-guarded — deletes an ITEM + audits; blank id rejected", async () => {
  sq.getCatalogObject.mockResolvedValueOnce({ object: itemObj() });
  await deleteItem({ id: "item_1", actor: ADMIN });
  expect(sq.deleteCatalogObject).toHaveBeenCalledWith("item_1");
  expect(auditLog).toHaveBeenCalledWith("admin.catalog.item.delete", expect.objectContaining({ target: "item_1", outcome: "success" }));
  await expect(deleteItem({ id: "", actor: ADMIN })).rejects.toBeInstanceOf(CatalogValidationError);
});

test("delete: refuses to delete a non-ITEM (cross-type guard, SEC #186 F-2)", async () => {
  sq.getCatalogObject.mockResolvedValueOnce({ object: { type: "DISCOUNT", id: "d1" } });
  await expect(deleteItem({ id: "d1", actor: ADMIN })).rejects.toBeInstanceOf(CatalogNotFoundError);
  expect(sq.deleteCatalogObject).not.toHaveBeenCalled();
});
