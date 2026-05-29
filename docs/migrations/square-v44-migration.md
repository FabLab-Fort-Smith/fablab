# Square SDK migration: v39 → v44 (deferred from #70)

**Status:** Planned, not started. `square@^39.1.1` stays pinned until this is executed and validated against a Square sandbox/staging environment.
**Why deferred:** v40 was a full SDK overhaul. This is a ~90-call-site rewrite across 19 files touching **payment-critical** paths (checkout, subscriptions, webhooks). square 39 has **no open CVE** (it's currency, not security), and the payment behaviour **cannot be functionally verified locally** (no Square credentials) — per the secure-SDLC rules this is a payments change (§2, security-relevant) that requires SEC review + a threat-model note + **DAST against staging before merge** (§7/§8). A compile-only-verified payment rewrite must not ship unvalidated.

## Delivery rules for this work item
- One feature branch + PR (`remediation/square-v44` or `fix/deps-square-44`); squash-merge.
- **Do not merge until validated against the Square sandbox** (real checkout link creation, a sandbox subscription create/cancel, and a webhook round-trip). Treat as security-relevant → SEC approval.
- Pin `square` to the exact tested version in the lockfile.
- Keep `next build` + `npm test` green; the webhook signature tests (`test/e2e/square-webhook.test.js`, `test/unit/squareSignature.test.js`) must still pass (those use `crypto`, not the SDK, but verify the webhook route still wires correctly).

## Scope — 19 files touch the Square SDK
Client/import: `src/lib/square.js`, `src/lib/squareWebhook.js`, `src/app/actions/actions.js`
Catalog/plans: `src/app/api/v1/admin/coupons/route.js`, `admin/plans/route.js`, `admin/member-plans/route.js`, `api/v1/plans/model.js`
Payments/txns: `admin/square/transactions/route.js`, `admin/delinquent/route.js`, `api/v1/payments/route.js`, `api/v1/donations/checkout/route.js`, `api/v1/donations/stats/route.js`
Memberships/subscriptions: `api/v1/memberships/route.js`, `memberships/[planID]/checkout/route.js`, `memberships/confirm/route.js`, `memberships/subscription/route.js`, `api/v1/sponsorship/checkout/route.js`, `api/v1/square/subscriptions/service.js`
Webhook: `api/v1/square/webhooks/payment/route.js`

## Cross-cutting breaking changes (apply everywhere)
1. **Client:** `import { Client, Environment } from "square"` → `import { SquareClient, SquareEnvironment } from "square"`.
   `new Client({ accessToken, environment })` → `new SquareClient({ token: process.env.SQUARE_ACCESS_TOKEN, environment: SquareEnvironment.Production | .Sandbox })`.
   Update `src/lib/square.js` and the inline `new Client(...)` in `src/app/actions/actions.js`.
2. **No `{ result }` wrapper:** the response **is** the body. `const { result } = await api.x(); result.objects` → `const res = await client.x(); res.objects`.
3. **Object args, not positional:** every method takes one request object. IDs become named fields (`{ objectId }`, `{ subscriptionId }`, `{ customerId }`, `{ paymentId }`, `{ orderId }`).
4. **Money is `bigint`:** `amountMoney.amount` is a `bigint` in v44 — fix arithmetic and JSON serialization (`JSON.stringify` throws on bigint; convert with `Number()`/`.toString()` at the response boundary).
5. **Pagination:** v44 `list`/`search` return auto-paging iterables (`for await (const item of res)`), not `{ result, cursor }`. Audit every list/search loop (payments.list, catalog.list, subscriptions.search) for cursor handling.
6. **Errors:** `ApiError` → `SquareError` (still exposes `.errors`, plus `.statusCode`/`.body`). The existing `err?.errors?.[0]?.detail` pattern still works; switch any `instanceof ApiError` checks to `SquareError`.

## Method mapping (verified against square@44.1.0)
| v39 | v44 | count |
|---|---|---|
| `catalogApi.retrieveCatalogObject(id)` | `catalog.object.get({ objectId: id })` | 17 |
| `catalogApi.upsertCatalogObject(body)` | `catalog.object.upsert(body)` | 4 |
| `catalogApi.deleteCatalogObject(id)` | `catalog.object.delete({ objectId: id })` | 2 |
| `catalogApi.listCatalog(cursor, types)` | `catalog.list({ types })` (auto-pages) | 4 |
| `catalogApi.searchCatalogObjects(body)` | `catalog.search(body)` | 1 |
| `paymentsApi.listPayments(...)` | `payments.list({ ... })` (auto-pages) | 2 |
| `paymentsApi.createPayment(body)` | `payments.create(body)` | 2 |
| `paymentsApi.getPayment(id)` | `payments.get({ paymentId: id })` | 1 |
| `subscriptionsApi.searchSubscriptions(body)` | `subscriptions.search(body)` | 8 |
| `subscriptionsApi.createSubscription(body)` | `subscriptions.create(body)` | 3 |
| `subscriptionsApi.retrieveSubscription(id)` | `subscriptions.get({ subscriptionId: id })` | 4 |
| `subscriptionsApi.cancelSubscription(id)` | `subscriptions.cancel({ subscriptionId: id })` | 5 |
| `subscriptionsApi.pauseSubscription(id, body)` | `subscriptions.pause({ subscriptionId: id, ...body })` | 3 |
| `subscriptionsApi.resumeSubscription(id, body)` | `subscriptions.resume({ subscriptionId: id, ...body })` | 2 |
| `subscriptionsApi.swapPlan(id, body)` | `subscriptions.swapPlan({ subscriptionId: id, ...body })` | 1 |
| `customersApi.retrieveCustomer(id)` | `customers.get({ customerId: id })` | 3 |
| `customersApi.createCustomer(body)` | `customers.create(body)` | 1 |
| `customersApi.searchCustomers(body)` | `customers.search(body)` | 1 |
| `cardsApi.listCards(cursor, customerId)` | `cards.list({ customerId })` (auto-pages) | 2 |
| `ordersApi.retrieveOrder(id)` | `orders.get({ orderId: id })` | 3 |
| `ordersApi.searchOrders(body)` | `orders.search(body)` | 1 |
| `checkoutApi.createPaymentLink(body)` | `checkout.paymentLinks.create(body)` | 3 |
| `checkoutApi.retrievePaymentLink(id)` | `checkout.paymentLinks.get({ id })` | 1 |

(Confirmed v44 namespaces: `catalog.object.*`, `catalog.{list,search}`, `payments.*`, `subscriptions.*`, `customers.*`, `cards.*`, `orders.*`, `checkout.paymentLinks.*`.)

## Suggested execution order
1. `src/lib/square.js` + `actions.js` (client) — breaks all call sites simultaneously (all-or-nothing).
2. Catalog/plans group, then subscriptions group, then payments/checkout group — one coherent commit each within the single PR.
3. Sweep for `.result`, positional IDs, bigint money, and pagination loops.
4. `npm run build` (compile gate) + `npm test` (signature tests).
5. **Sandbox QA:** create a payment link, create+cancel a subscription, replay a webhook; confirm responses parse.

## Validation checklist (before merge)
- [ ] `next build` clean, `npm test` green (incl. webhook signature tests)
- [ ] No remaining `Api.` / `.result` / `Client(` references (`grep`)
- [ ] Money/bigint serialization verified in admin transactions + donations stats responses
- [ ] Sandbox: payment-link creation works
- [ ] Sandbox: subscription create / cancel works
- [ ] Sandbox: webhook signature verify + handler round-trip
- [ ] SEC sign-off (payments = security-relevant, §2)
