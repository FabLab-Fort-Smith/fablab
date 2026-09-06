// AC-7 admin customers routes: GET (search/detail), POST create, PUT update, card disable.

jest.mock("@/auth", () => ({ __esModule: true, auth: jest.fn() }));
jest.mock("@/app/api/v1/admin/customers/service", () => {
  class CustomerValidationError extends Error { constructor(m) { super(m); this.name = "CustomerValidationError"; this.status = 400; } }
  class CustomerNotFoundError extends Error { constructor(m = "customer not found") { super(m); this.name = "CustomerNotFoundError"; this.status = 404; } }
  return { __esModule: true, searchCustomersAdmin: jest.fn(), getCustomerAdmin: jest.fn(), createCustomerAdmin: jest.fn(), updateCustomerAdmin: jest.fn(), disableCustomerCard: jest.fn(), CustomerValidationError, CustomerNotFoundError };
});

import { GET, POST, PUT } from "@/app/api/v1/admin/customers/route";
import { POST as CARD_DISABLE } from "@/app/api/v1/admin/customers/cards/disable/route";
import { auth } from "@/auth";
import { searchCustomersAdmin, getCustomerAdmin, createCustomerAdmin, updateCustomerAdmin, disableCustomerCard, CustomerValidationError, CustomerNotFoundError } from "@/app/api/v1/admin/customers/service";

const ADMIN = { user: { role: "admin", userID: "admin-1" } };
const get = (qs) => GET(new Request("http://l/customers" + qs));
const body = (fn, url, b) => fn(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }));

beforeEach(() => { jest.clearAllMocks(); auth.mockResolvedValue(ADMIN); });

test("non-admin → 401 on GET/POST/PUT/card-disable, service not called", async () => {
  auth.mockResolvedValue({ user: { role: "member" } });
  expect((await get("?q=a")).status).toBe(401);
  expect((await body(POST, "http://l/customers", { givenName: "A" })).status).toBe(401);
  expect((await PUT(new Request("http://l/customers", { method: "PUT", body: JSON.stringify({ customerId: "c" }) }))).status).toBe(401);
  expect((await body(CARD_DISABLE, "http://l/cd", { customerId: "c", cardId: "x" })).status).toBe(401);
  expect(searchCustomersAdmin).not.toHaveBeenCalled();
  expect(disableCustomerCard).not.toHaveBeenCalled();
});

test("GET: ?id → detail, ?q → search, neither → 400", async () => {
  getCustomerAdmin.mockResolvedValueOnce({ customer: { id: "cus_1" }, cards: [] });
  expect((await get("?id=cus_1")).status).toBe(200);
  expect(getCustomerAdmin).toHaveBeenCalledWith("cus_1");
  searchCustomersAdmin.mockResolvedValueOnce({ customers: [] });
  expect((await get("?q=ada@x.com")).status).toBe(200);
  expect((await get("")).status).toBe(400);
});

test("POST create → 201 delegates with actor; validation → 400", async () => {
  createCustomerAdmin.mockResolvedValueOnce({ id: "cus_new" });
  expect((await body(POST, "http://l/customers", { givenName: "Ada" })).status).toBe(201);
  expect(createCustomerAdmin).toHaveBeenCalledWith(expect.objectContaining({ givenName: "Ada", actor: { userID: "admin-1", role: "admin" } }));
  createCustomerAdmin.mockRejectedValueOnce(new CustomerValidationError("provide at least one"));
  expect((await body(POST, "http://l/customers", {})).status).toBe(400);
});

test("PUT update → 200; not found → 404; other → 500 generic", async () => {
  updateCustomerAdmin.mockResolvedValueOnce({ id: "cus_1" });
  const put = (b) => PUT(new Request("http://l/customers", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }));
  expect((await put({ customerId: "cus_1", givenName: "X" })).status).toBe(200);
  updateCustomerAdmin.mockRejectedValueOnce(new CustomerNotFoundError());
  expect((await put({ customerId: "nope" })).status).toBe(404);
  updateCustomerAdmin.mockRejectedValueOnce(new Error("square boom"));
  const res = await put({ customerId: "cus_1", givenName: "X" });
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "Customer operation failed" });
});

test("card disable → 200 delegates; validation → 400", async () => {
  disableCustomerCard.mockResolvedValueOnce({ disabled: true });
  expect((await body(CARD_DISABLE, "http://l/cd", { customerId: "cus_1", cardId: "card_1" })).status).toBe(200);
  disableCustomerCard.mockRejectedValueOnce(new CustomerValidationError("card does not belong to this customer"));
  expect((await body(CARD_DISABLE, "http://l/cd", { customerId: "cus_1", cardId: "x" })).status).toBe(400);
});
