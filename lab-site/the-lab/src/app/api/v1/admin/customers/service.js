// Admin Square-customers service (AC-7): search / view / create / edit Square customers and manage
// their saved cards (list + disable). Distinct from the member↔Square link (AC-5), which ties a lab
// member to a customer id — this operates on Square customer records directly.
//
// PCI SAQ-A: cards expose only brand/last4/exp — never PAN. Customer email/phone are shown to the
// admin (who already sees member PII). Card disable is ownership-checked against the customer.

import { searchCustomers, getCustomer, createCustomer, updateCustomer, listCards, disableCard } from "@/lib/square";
import { auditLog } from "@/lib/audit";

export class CustomerValidationError extends Error {
  constructor(message) { super(message); this.name = "CustomerValidationError"; this.status = 400; }
}
export class CustomerNotFoundError extends Error {
  constructor(message = "customer not found") { super(message); this.name = "CustomerNotFoundError"; this.status = 404; }
}

// Allow-listed customer view (no raw Square object).
function sanitizeCustomer(c) {
  return {
    id: c?.id || null,
    givenName: c?.givenName || null,
    familyName: c?.familyName || null,
    emailAddress: c?.emailAddress || null,
    phoneNumber: c?.phoneNumber || null,
    referenceId: c?.referenceId || null,
    note: c?.note || null,
    createdAt: c?.createdAt || null,
  };
}

function sanitizeCard(card) {
  return {
    id: card?.id || null,
    brand: card?.cardBrand || null,
    last4: card?.last4 || null,
    expMonth: card?.expMonth != null ? Number(card.expMonth) : null,
    expYear: card?.expYear != null ? Number(card.expYear) : null,
    enabled: card?.enabled !== false,
  };
}

// Editable customer fields (allow-list — nothing else is forwarded to Square).
const EDITABLE = ["givenName", "familyName", "emailAddress", "phoneNumber", "note"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9().\-\s]{7,20}$/;

function pickEditable(input) {
  const out = {};
  for (const k of EDITABLE) if (typeof input[k] === "string" && input[k].trim()) out[k] = input[k].trim();
  // Positive format/length validation → 400 (not a generic 500 from Square) (SEC #187 L-1).
  if (out.emailAddress && !EMAIL_RE.test(out.emailAddress)) throw new CustomerValidationError("emailAddress is not a valid email");
  if (out.phoneNumber && !PHONE_RE.test(out.phoneNumber)) throw new CustomerValidationError("phoneNumber is not a valid phone number");
  for (const k of ["givenName", "familyName"]) if (out[k] && out[k].length > 100) throw new CustomerValidationError(`${k} is too long (max 100)`);
  if (out.note && out.note.length > 500) throw new CustomerValidationError("note is too long (max 500)");
  return out;
}

/** Search customers by email (Square fuzzy match on email address). Read is audited (SEC #187 L-2). */
export async function searchCustomersAdmin({ query, actor } = {}) {
  if (typeof query !== "string" || !query.trim()) throw new CustomerValidationError("query is required");
  const res = await searchCustomers({ query: { filter: { emailAddress: { fuzzy: query.trim() } } }, limit: 50 });
  const customers = (res.customers || []).map(sanitizeCustomer);
  auditLog("admin.square.customer.search", { actor: actor?.userID || "admin", count: customers.length, outcome: "success" });
  return { customers };
}

/** Fetch one customer + their saved cards (sanitized). Read is audited (SEC #187 L-2). */
export async function getCustomerAdmin(customerId, actor) {
  if (typeof customerId !== "string" || !customerId.trim()) throw new CustomerValidationError("customerId is required");
  const customer = (await getCustomer(customerId))?.customer;
  if (!customer) throw new CustomerNotFoundError();
  const cardsRes = await listCards({ customerId });
  auditLog("admin.square.customer.view", { actor: actor?.userID || "admin", target: customerId, outcome: "success" });
  return { customer: sanitizeCustomer(customer), cards: (cardsRes.cards || []).map(sanitizeCard) };
}

/** Create a customer. Requires at least one of name / email / phone. */
export async function createCustomerAdmin({ givenName, familyName, emailAddress, phoneNumber, note, actor } = {}) {
  const body = pickEditable({ givenName, familyName, emailAddress, phoneNumber, note });
  if (!Object.keys(body).length) {
    throw new CustomerValidationError("provide at least one of: givenName, familyName, emailAddress, phoneNumber");
  }
  const res = await createCustomer(body);
  const customer = sanitizeCustomer(res.customer);
  auditLog("admin.square.customer.create", { actor: actor?.userID || "admin", target: customer.id, outcome: "success" });
  return customer;
}

/** Update a customer's allow-listed profile fields. */
export async function updateCustomerAdmin({ customerId, actor, ...fields } = {}) {
  if (typeof customerId !== "string" || !customerId.trim()) throw new CustomerValidationError("customerId is required");
  const body = pickEditable(fields);
  if (!Object.keys(body).length) throw new CustomerValidationError("no editable fields provided");
  const res = await updateCustomer(customerId, body);
  const customer = sanitizeCustomer(res.customer);
  auditLog("admin.square.customer.update", { actor: actor?.userID || "admin", target: customerId, fields: Object.keys(body), outcome: "success" });
  return customer;
}

/** Disable one of a customer's saved cards (ownership-verified). */
export async function disableCustomerCard({ customerId, cardId, actor } = {}) {
  if (typeof customerId !== "string" || !customerId.trim()) throw new CustomerValidationError("customerId is required");
  if (typeof cardId !== "string" || !cardId.trim()) throw new CustomerValidationError("cardId is required");
  const cardsRes = await listCards({ customerId });
  if (!(cardsRes.cards || []).some((c) => c.id === cardId)) {
    throw new CustomerValidationError("card does not belong to this customer");
  }
  await disableCard(cardId);
  auditLog("admin.square.customer.card.disable", { actor: actor?.userID || "admin", target: customerId, cardId, outcome: "success" });
  return { customerId, cardId, disabled: true };
}

const CustomersService = {
  searchCustomersAdmin, getCustomerAdmin, createCustomerAdmin, updateCustomerAdmin, disableCustomerCard,
  CustomerValidationError, CustomerNotFoundError,
};
export default CustomersService;
