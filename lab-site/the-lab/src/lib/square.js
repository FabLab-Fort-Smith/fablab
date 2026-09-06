// Square SDK adapter (seam). See docs/migrations/square-v44-migration.md (#117).
//
// Every Square SDK call in the app goes through this module. Each function
// returns the unwrapped response body (no `{ result }` envelope) so callers keep
// their existing field access (`.object`, `.objects`, `.subscriptions`, …).
//
// P2 — dual SDK behind SQUARE_SDK_VERSION (default "v39"):
//   - v39: `square@39` (CJS), imported at top level (safe under Jest's SWC transform).
//   - v44: `square@44` installed under the npm alias `square-v44` (ESM), loaded
//     **lazily** via dynamic import so it is only touched when SQUARE_SDK_VERSION=v44.
//     That keeps the ESM package out of the Jest graph entirely (default path is
//     v39), which is why no transformIgnorePatterns change is needed.
// Production rollback is a flag flip back to v39 — no redeploy. The v44 path must
// be validated against the Square sandbox + staging DAST before it is enabled.

import { Client } from "square";

const USE_V44 = (process.env.SQUARE_SDK_VERSION || "v39").toLowerCase() === "v44";

// ---- v39 client (default) ------------------------------------------------
const v39 = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT,
});

// ---- v44 client (lazy, alias `square-v44`) -------------------------------
let _v44Promise;
function v44() {
  if (!_v44Promise) {
    _v44Promise = import("square-v44").then(({ SquareClient, SquareEnvironment }) =>
      new SquareClient({
        token: process.env.SQUARE_ACCESS_TOKEN,
        environment:
          process.env.SQUARE_ENVIRONMENT === "production"
            ? SquareEnvironment.Production
            : SquareEnvironment.Sandbox,
      }),
    );
  }
  return _v44Promise;
}

// v44 API shapes (verified against the Square sandbox, 2026-05-30):
//   - `*.search` (POST) return the response **body directly** — `{ <items>, cursor }`,
//     or `{}` when empty — so callers' `.subscriptions || []` and cursor loops work
//     unchanged. Return the body as-is.
//   - `*.list` (GET) return a `Page` whose `.data` is the first-page array. We return
//     `.data` to match v39's single-call-with-limit behaviour (no list caller in this
//     app paginates; only `*.search` callers loop on cursor).
//   - `payments.list`/`cards.list`/`webhooks.subscriptions.list` reject omitted sort
//     enums (the SDK serializes them as ""), so we pass explicit sort values.
function firstPage(page) {
  return page?.data || [];
}

// ---- helpers -------------------------------------------------------------

// Pull a human-readable detail from a Square API error. Works for v39 ApiError
// and v44 SquareError — both expose `.errors[].detail`.
export function squareErrorDetail(err) {
  return err?.errors?.[0]?.detail || err?.message;
}

// JSON.stringify replacer for Square money amounts (bigint). Use at response
// boundaries instead of the old global BigInt.prototype.toJSON monkeypatch.
export function bigintReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

// ---- Catalog -------------------------------------------------------------

export async function getCatalogObject(objectId, includeRelatedObjects = false) {
  if (USE_V44) {
    const c = await v44();
    return c.catalog.object.get({ objectId, includeRelatedObjects });
  }
  const { result } = await v39.catalogApi.retrieveCatalogObject(objectId, includeRelatedObjects);
  return result; // { object, relatedObjects? }
}

export async function listCatalog(types, cursor) {
  if (USE_V44) {
    const c = await v44();
    return { objects: firstPage(await c.catalog.list({ types })) };
  }
  const { result } = await v39.catalogApi.listCatalog(cursor, types);
  return result; // { objects, cursor }
}

export async function upsertCatalogObject(body) {
  if (USE_V44) {
    const c = await v44();
    return c.catalog.object.upsert(body);
  }
  const { result } = await v39.catalogApi.upsertCatalogObject(body);
  return result; // { catalogObject, ... }
}

export async function deleteCatalogObject(objectId) {
  if (USE_V44) {
    const c = await v44();
    return c.catalog.object.delete({ objectId });
  }
  const { result } = await v39.catalogApi.deleteCatalogObject(objectId);
  return result;
}

export async function searchCatalogObjects(body) {
  if (USE_V44) {
    const c = await v44();
    return c.catalog.search(body); // body returned directly: { objects, cursor }
  }
  const { result } = await v39.catalogApi.searchCatalogObjects(body);
  return result; // { objects, cursor }
}

// ---- Subscriptions -------------------------------------------------------

export async function searchSubscriptions(body) {
  if (USE_V44) {
    const c = await v44();
    return c.subscriptions.search(body); // body returned directly: { subscriptions, cursor }
  }
  const { result } = await v39.subscriptionsApi.searchSubscriptions(body);
  return result; // { subscriptions, cursor }
}

export async function getSubscription(subscriptionId) {
  if (USE_V44) {
    const c = await v44();
    return c.subscriptions.get({ subscriptionId });
  }
  const { result } = await v39.subscriptionsApi.retrieveSubscription(subscriptionId);
  return result; // { subscription }
}

export async function createSubscription(body) {
  if (USE_V44) {
    const c = await v44();
    return c.subscriptions.create(body);
  }
  const { result } = await v39.subscriptionsApi.createSubscription(body);
  return result; // { subscription }
}

export async function cancelSubscription(subscriptionId) {
  if (USE_V44) {
    const c = await v44();
    return c.subscriptions.cancel({ subscriptionId });
  }
  const { result } = await v39.subscriptionsApi.cancelSubscription(subscriptionId);
  return result; // { subscription }
}

export async function pauseSubscription(subscriptionId, body = {}) {
  if (USE_V44) {
    const c = await v44();
    return c.subscriptions.pause({ subscriptionId, ...body });
  }
  const { result } = await v39.subscriptionsApi.pauseSubscription(subscriptionId, body);
  return result;
}

export async function resumeSubscription(subscriptionId, body = {}) {
  if (USE_V44) {
    const c = await v44();
    return c.subscriptions.resume({ subscriptionId, ...body });
  }
  const { result } = await v39.subscriptionsApi.resumeSubscription(subscriptionId, body);
  return result;
}

export async function swapPlan(subscriptionId, body) {
  if (USE_V44) {
    const c = await v44();
    return c.subscriptions.swapPlan({ subscriptionId, ...body });
  }
  const { result } = await v39.subscriptionsApi.swapPlan(subscriptionId, body);
  return result; // { subscription, actions }
}

// ---- Payments ------------------------------------------------------------

export async function listPayments({ beginTime, endTime, limit } = {}) {
  if (USE_V44) {
    const c = await v44();
    const page = await c.payments.list({ beginTime, endTime, limit, sortField: "CREATED_AT", sortOrder: "DESC" });
    return { payments: firstPage(page) };
  }
  const { result } = await v39.paymentsApi.listPayments(
    beginTime,
    endTime,
    undefined, // sortOrder
    undefined, // cursor
    undefined, // locationId
    undefined, // total
    undefined, // last4
    undefined, // cardBrand
    limit,
  );
  return result; // { payments, cursor }
}

export async function createPayment(body) {
  if (USE_V44) {
    const c = await v44();
    return c.payments.create(body);
  }
  const { result } = await v39.paymentsApi.createPayment(body);
  return result; // { payment }
}

export async function getPayment(paymentId) {
  if (USE_V44) {
    const c = await v44();
    return c.payments.get({ paymentId });
  }
  const { result } = await v39.paymentsApi.getPayment(paymentId);
  return result; // { payment }
}

// ---- Refunds -------------------------------------------------------------
// AC-1: refund a captured payment (admin). `body` = { idempotencyKey, paymentId,
// amountMoney:{amount,currency}, reason? }. amountMoney.amount is minor units
// (bigint under v44, number under v39) — serialize responses with bigintReplacer.

export async function refundPayment(body) {
  if (USE_V44) {
    const c = await v44();
    // v44 requires bigint minor-units on input (matching its bigint output). Callers build amount as a
    // JS number; coerce here so a v44 cutover doesn't throw (SEC #180 F-2).
    const b = body?.amountMoney?.amount != null
      ? { ...body, amountMoney: { ...body.amountMoney, amount: BigInt(body.amountMoney.amount) } }
      : body;
    return c.refunds.refundPayment(b);
  }
  const { result } = await v39.refundsApi.refundPayment(body);
  return result; // { refund }
}

export async function getRefund(refundId) {
  if (USE_V44) {
    const c = await v44();
    return c.refunds.get({ refundId });
  }
  const { result } = await v39.refundsApi.getPaymentRefund(refundId);
  return result; // { refund }
}

export async function listRefunds({ beginTime, endTime, limit } = {}) {
  if (USE_V44) {
    const c = await v44();
    return { refunds: firstPage(await c.refunds.list({ beginTime, endTime, limit, sortOrder: "DESC" })) };
  }
  const { result } = await v39.refundsApi.listPaymentRefunds(
    beginTime,
    endTime,
    undefined, // sortOrder
    undefined, // cursor
    undefined, // locationId
    undefined, // status
    undefined, // sourceType
    limit,
  );
  return result; // { refunds, cursor }
}

// ---- Disputes (read) -----------------------------------------------------
// AC-2: admin read-only view of chargebacks/disputes. Amounts are bigint under
// v44 — serialize responses with bigintReplacer.

export async function listDisputes({ cursor, states } = {}) {
  if (USE_V44) {
    const c = await v44();
    return { disputes: firstPage(await c.disputes.list({ cursor, states })) };
  }
  const { result } = await v39.disputesApi.listDisputes(cursor, states, undefined /* locationId */);
  return result; // { disputes, cursor }
}

export async function getDispute(disputeId) {
  if (USE_V44) {
    const c = await v44();
    return c.disputes.get({ disputeId });
  }
  const { result } = await v39.disputesApi.retrieveDispute(disputeId);
  return result; // { dispute }
}

// ---- Customers -----------------------------------------------------------

export async function createCustomer(body) {
  if (USE_V44) {
    const c = await v44();
    return c.customers.create(body);
  }
  const { result } = await v39.customersApi.createCustomer(body);
  return result; // { customer }
}

export async function getCustomer(customerId) {
  if (USE_V44) {
    const c = await v44();
    return c.customers.get({ customerId });
  }
  const { result } = await v39.customersApi.retrieveCustomer(customerId);
  return result; // { customer }
}

export async function searchCustomers(body) {
  if (USE_V44) {
    const c = await v44();
    return c.customers.search(body); // body returned directly: { customers, cursor }
  }
  const { result } = await v39.customersApi.searchCustomers(body);
  return result; // { customers, cursor }
}

// AC-7: update a customer's profile fields.
export async function updateCustomer(customerId, body) {
  if (USE_V44) {
    const c = await v44();
    return c.customers.update({ customerId, ...body });
  }
  const { result } = await v39.customersApi.updateCustomer(customerId, body);
  return result; // { customer }
}

// ---- Cards ---------------------------------------------------------------

export async function listCards({ customerId, cursor } = {}) {
  if (USE_V44) {
    const c = await v44();
    return { cards: firstPage(await c.cards.list({ customerId, cursor, sortOrder: "DESC" })) };
  }
  const { result } = await v39.cardsApi.listCards(cursor, customerId);
  return result; // { cards, cursor }
}

// AC-5: disable (deactivate) a card on file. Square has no hard card delete — disable is the erase.
export async function disableCard(cardId) {
  if (USE_V44) {
    const c = await v44();
    return c.cards.disable({ cardId });
  }
  const { result } = await v39.cardsApi.disableCard(cardId);
  return result; // { card }
}

// ---- Orders --------------------------------------------------------------

export async function getOrder(orderId) {
  if (USE_V44) {
    const c = await v44();
    return c.orders.get({ orderId });
  }
  const { result } = await v39.ordersApi.retrieveOrder(orderId);
  return result; // { order }
}

export async function searchOrders(body) {
  if (USE_V44) {
    const c = await v44();
    return c.orders.search(body); // body returned directly: { orders, cursor }
  }
  const { result } = await v39.ordersApi.searchOrders(body);
  return result; // { orders, cursor }
}

// ---- Checkout ------------------------------------------------------------

export async function createPaymentLink(body) {
  if (USE_V44) {
    const c = await v44();
    return c.checkout.paymentLinks.create(body);
  }
  const { result } = await v39.checkoutApi.createPaymentLink(body);
  return result; // { paymentLink, relatedResources? }
}

export async function getPaymentLink(id) {
  if (USE_V44) {
    const c = await v44();
    return c.checkout.paymentLinks.get({ id });
  }
  const { result } = await v39.checkoutApi.retrievePaymentLink(id);
  return result; // { paymentLink }
}

// ---- Webhook subscriptions ----------------------------------------------
// v44 moves these to `webhooks.subscriptions.*` (no top-level webhookSubscriptionsApi).

export async function listWebhookSubscriptions() {
  if (USE_V44) {
    const c = await v44();
    return { subscriptions: firstPage(await c.webhooks.subscriptions.list({ sortOrder: "ASC" })) };
  }
  const { result } = await v39.webhookSubscriptionsApi.listWebhookSubscriptions();
  return result; // { subscriptions, cursor }
}

export async function createWebhookSubscription(body) {
  if (USE_V44) {
    const c = await v44();
    return c.webhooks.subscriptions.create(body);
  }
  const { result } = await v39.webhookSubscriptionsApi.createWebhookSubscription(body);
  return result; // { subscription }
}
