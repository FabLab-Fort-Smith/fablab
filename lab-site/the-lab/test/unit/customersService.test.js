// AC-7 admin Square-customers service: search/detail/create/update + card disable, sanitized+audited.

jest.mock("@/lib/square", () => ({ __esModule: true,
  searchCustomers: jest.fn(), getCustomer: jest.fn(), createCustomer: jest.fn(), updateCustomer: jest.fn(),
  listCards: jest.fn(), disableCard: jest.fn(),
}));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import { searchCustomersAdmin, getCustomerAdmin, createCustomerAdmin, updateCustomerAdmin, disableCustomerCard, CustomerValidationError, CustomerNotFoundError } from "@/app/api/v1/admin/customers/service";
import * as sq from "@/lib/square";
import { auditLog } from "@/lib/audit";

const ADMIN = { userID: "admin-1", role: "admin" };
const cust = (o = {}) => ({ id: "cus_1", givenName: "Ada", familyName: "L", emailAddress: "ada@x.com", phoneNumber: "555", ...o });

beforeEach(() => {
  jest.clearAllMocks();
  sq.searchCustomers.mockResolvedValue({ customers: [cust()] });
  sq.getCustomer.mockResolvedValue({ customer: cust() });
  sq.createCustomer.mockResolvedValue({ customer: cust({ id: "cus_new" }) });
  sq.updateCustomer.mockResolvedValue({ customer: cust({ givenName: "Ada2" }) });
  sq.listCards.mockResolvedValue({ cards: [{ id: "card_1", cardBrand: "VISA", last4: "1111", expMonth: 12, expYear: 2030, enabled: true }] });
  sq.disableCard.mockResolvedValue({ card: { id: "card_1", enabled: false } });
});

test("search: fuzzy email filter, sanitized results; blank query rejected", async () => {
  const r = await searchCustomersAdmin({ query: " ada@x.com " });
  expect(sq.searchCustomers).toHaveBeenCalledWith(expect.objectContaining({ query: { filter: { emailAddress: { fuzzy: "ada@x.com" } } } }));
  expect(r.customers[0]).toMatchObject({ id: "cus_1", emailAddress: "ada@x.com" });
  await expect(searchCustomersAdmin({ query: "" })).rejects.toBeInstanceOf(CustomerValidationError);
});

test("detail: sanitized customer + cards (no PAN); not found → 404", async () => {
  sq.listCards.mockResolvedValueOnce({ cards: [{ id: "c1", cardBrand: "VISA", last4: "4242", pan: "4242424242424242", enabled: true }] });
  const r = await getCustomerAdmin("cus_1");
  expect(JSON.stringify(r)).not.toContain("4242424242424242");
  expect(r.cards[0]).toEqual({ id: "c1", brand: "VISA", last4: "4242", expMonth: null, expYear: null, enabled: true });
  sq.getCustomer.mockResolvedValueOnce({ customer: null });
  await expect(getCustomerAdmin("nope")).rejects.toBeInstanceOf(CustomerNotFoundError);
});

test("create: requires ≥1 field, allow-lists input, audits", async () => {
  await expect(createCustomerAdmin({ actor: ADMIN })).rejects.toThrow(/at least one/);
  await createCustomerAdmin({ givenName: "Ada", role: "admin", isAdmin: true, actor: ADMIN });
  const body = sq.createCustomer.mock.calls[0][0];
  expect(body).toEqual({ givenName: "Ada" }); // unknown fields (role/isAdmin) dropped
  expect(auditLog).toHaveBeenCalledWith("admin.square.customer.create", expect.objectContaining({ target: "cus_new", outcome: "success" }));
});

test("update: allow-listed fields only, requires customerId + a field, audits", async () => {
  await expect(updateCustomerAdmin({ actor: ADMIN })).rejects.toThrow(/customerId is required/);
  await expect(updateCustomerAdmin({ customerId: "cus_1", actor: ADMIN })).rejects.toThrow(/no editable fields/);
  await updateCustomerAdmin({ customerId: "cus_1", givenName: "Ada2", hacked: "x", actor: ADMIN });
  expect(sq.updateCustomer).toHaveBeenCalledWith("cus_1", { givenName: "Ada2" });
  expect(auditLog).toHaveBeenCalledWith("admin.square.customer.update", expect.objectContaining({ target: "cus_1", fields: ["givenName"], outcome: "success" }));
});

test("reads are audited (AC-8a): search + view emit audit with actor, no PII values", async () => {
  await searchCustomersAdmin({ query: "ada@x.com", actor: ADMIN });
  expect(auditLog).toHaveBeenCalledWith("admin.square.customer.search", expect.objectContaining({ actor: "admin-1", count: 1 }));
  await getCustomerAdmin("cus_1", ADMIN);
  const viewCall = auditLog.mock.calls.find(c => c[0] === "admin.square.customer.view");
  expect(viewCall[1]).toEqual(expect.objectContaining({ actor: "admin-1", target: "cus_1" }));
  expect(JSON.stringify(viewCall[1])).not.toContain("ada@x.com"); // no PII value in the audit
});

test("write validation (AC-8a): bad email / phone / over-long note → 400, no Square call", async () => {
  await expect(createCustomerAdmin({ emailAddress: "not-an-email", actor: ADMIN })).rejects.toThrow(/valid email/);
  await expect(createCustomerAdmin({ phoneNumber: "abc", actor: ADMIN })).rejects.toThrow(/valid phone/);
  await expect(updateCustomerAdmin({ customerId: "cus_1", note: "x".repeat(501), actor: ADMIN })).rejects.toThrow(/note is too long/);
  expect(sq.createCustomer).not.toHaveBeenCalled();
  expect(sq.updateCustomer).not.toHaveBeenCalled();
  // a valid email passes
  await createCustomerAdmin({ emailAddress: "ok@x.com", actor: ADMIN });
  expect(sq.createCustomer).toHaveBeenCalledWith({ emailAddress: "ok@x.com" });
});

test("card disable: ownership-guarded — foreign card rejected; owned card disabled + audited", async () => {
  await expect(disableCustomerCard({ customerId: "cus_1", cardId: "card_OTHER", actor: ADMIN })).rejects.toThrow(/does not belong/);
  expect(sq.disableCard).not.toHaveBeenCalled();
  await disableCustomerCard({ customerId: "cus_1", cardId: "card_1", actor: ADMIN });
  expect(sq.disableCard).toHaveBeenCalledWith("card_1");
  expect(auditLog).toHaveBeenCalledWith("admin.square.customer.card.disable", expect.objectContaining({ target: "cus_1", cardId: "card_1", outcome: "success" }));
});
