// AC-6 coupons route: PUT (update) added + audit on create/update/delete; admin-gated.

jest.mock("@/auth", () => ({ __esModule: true, auth: jest.fn() }));
jest.mock("@/lib/square", () => ({ __esModule: true, listCatalog: jest.fn(), upsertCatalogObject: jest.fn(), deleteCatalogObject: jest.fn(), getCatalogObject: jest.fn() }));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));
jest.mock("uuid", () => ({ __esModule: true, v4: () => "idem-test" }));

import { POST, PUT, DELETE } from "@/app/api/v1/admin/coupons/route";
import { auth } from "@/auth";
import * as sq from "@/lib/square";
import { auditLog } from "@/lib/audit";

const ADMIN = { user: { role: "admin", userID: "admin-1" } };
const req = (method, body) => new Request("http://l/coupons", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => { jest.clearAllMocks(); auth.mockResolvedValue(ADMIN); });

test("non-admin → 403 on POST/PUT/DELETE", async () => {
  auth.mockResolvedValue({ user: { role: "member" } });
  expect((await POST(req("POST", { name: "X", discountType: "FIXED_PERCENTAGE", percentage: 10 }))).status).toBe(403);
  expect((await PUT(req("PUT", { id: "d1" }))).status).toBe(403);
  expect((await DELETE(req("DELETE", { id: "d1" }))).status).toBe(403);
  expect(sq.upsertCatalogObject).not.toHaveBeenCalled();
});

test("POST create → 201 + audit", async () => {
  sq.upsertCatalogObject.mockResolvedValueOnce({ catalogObject: { id: "d1", discountData: { name: "SAVE10", discountType: "FIXED_PERCENTAGE", percentage: "10" } } });
  const res = await POST(req("POST", { name: "save10", discountType: "FIXED_PERCENTAGE", percentage: 10 }));
  expect(res.status).toBe(201);
  expect(auditLog).toHaveBeenCalledWith("admin.catalog.coupon.create", expect.objectContaining({ target: "d1", outcome: "success" }));
});

test("PUT update: uses catalog version, upserts, audits; 404 when not a discount", async () => {
  sq.getCatalogObject.mockResolvedValueOnce({ object: { type: "DISCOUNT", id: "d1", version: 7, discountData: { name: "SAVE10", discountType: "FIXED_PERCENTAGE", percentage: "10" } } });
  sq.upsertCatalogObject.mockResolvedValueOnce({ catalogObject: { id: "d1", discountData: { name: "SAVE20", discountType: "FIXED_PERCENTAGE", percentage: "20" } } });
  const res = await PUT(req("PUT", { id: "d1", percentage: 20 }));
  expect(res.status).toBe(200);
  expect(sq.upsertCatalogObject.mock.calls[0][0].object.version).toBe(7);
  expect(auditLog).toHaveBeenCalledWith("admin.catalog.coupon.update", expect.objectContaining({ target: "d1", outcome: "success" }));

  sq.getCatalogObject.mockResolvedValueOnce({ object: { type: "ITEM", id: "x" } });
  expect((await PUT(req("PUT", { id: "x", percentage: 5 }))).status).toBe(404);
});

test("PUT: missing id → 400", async () => {
  expect((await PUT(req("PUT", { percentage: 5 }))).status).toBe(400);
});

test("validation (SEC #186 F-1): rejects out-of-range percentage / non-positive amount, no upsert", async () => {
  // POST: percentage > 100, negative amount, float amount
  expect((await POST(req("POST", { name: "X", discountType: "FIXED_PERCENTAGE", percentage: 150 }))).status).toBe(400);
  expect((await POST(req("POST", { name: "X", discountType: "FIXED_AMOUNT", amountCents: -5 }))).status).toBe(400);
  expect((await POST(req("POST", { name: "X", discountType: "FIXED_AMOUNT", amountCents: 10.5 }))).status).toBe(400);
  // PUT: bad percentage on an existing discount
  sq.getCatalogObject.mockResolvedValueOnce({ object: { type: "DISCOUNT", id: "d1", version: 1, discountData: { discountType: "FIXED_PERCENTAGE", percentage: "10" } } });
  expect((await PUT(req("PUT", { id: "d1", percentage: 0 }))).status).toBe(400);
  expect(sq.upsertCatalogObject).not.toHaveBeenCalled();
});

test("DELETE → audit", async () => {
  sq.deleteCatalogObject.mockResolvedValueOnce({});
  const res = await DELETE(req("DELETE", { id: "d1" }));
  expect(res.status).toBe(200);
  expect(auditLog).toHaveBeenCalledWith("admin.catalog.coupon.delete", expect.objectContaining({ target: "d1", outcome: "success" }));
});
