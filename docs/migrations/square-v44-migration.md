# Square SDK migration: v39 → v44 (issue #117, deferred from #70 / Dependabot #91)

**Status:** Planned, not started. `square@^39.1.1` stays pinned until this is executed and validated against a Square sandbox/staging environment.
**Working branch:** `remediation/square-v44`. **Tracking issue:** #117.
**Why deferred:** v40 was a full SDK overhaul. This is a ~90-call-site rewrite across 19 files touching **payment-critical** paths (checkout, subscriptions, webhooks). square 39 has **no open CVE** (it's currency, not security), and the payment behaviour **cannot be functionally verified locally** (no Square credentials) — per the secure-SDLC rules this is a payments change (§2, security-relevant) that requires SEC review + a threat-model note + **DAST against staging before merge** (§7/§8). A compile-only-verified payment rewrite must not ship unvalidated.

## Rollback checkpoint & safety net
- **Anchor:** tag **`checkpoint/pre-square-v44`** → `main@648a232` (the known-good state before any migration commit). All work on this branch is cut from that anchor.
- **Pre-merge rollback** (work-in-progress on the branch): `git reset --hard checkpoint/pre-square-v44`, or just abandon the branch — `main` is untouched until the squash-merge.
- **Post-merge rollback** (production regression after release): revert the single squash-merge commit (`git revert <sha>`) — one rollback unit — then redeploy; `square@39` and its call sites return intact. Because the cutover is gated behind `SQUARE_SDK_VERSION` (see "Parallel-adapter rollout"), the safest production rollback is to flip that flag back to `v39` without a code revert.
- **Per-phase checkpoints:** each phase below ends at a green `build`+`test` commit. Tag them `checkpoint/square-v44-p<N>` as you go so a mid-migration revert lands on a compiling state, never a half-converted tree.

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
7. **ESM packaging breaks Jest (discovered in Dependabot #91 CI).** square v44 ships ESM; under the SWC/`next/jest` transform, `node_modules` is not transformed by default, so importing it in tests throws `SyntaxError: Unexpected token 'export'` across the e2e payment/webhook suites. **This must be fixed in the same PR or the test gate goes red.** Options, in order of preference:
   - Add a `transformIgnorePatterns` exception so Jest transforms the SDK:
     ```js
     // jest.config.mjs — passed through next/jest
     transformIgnorePatterns: ['/node_modules/(?!(?:square|@square/web-sdk)/)', '^.+\\.module\\.(css|sass|scss)$'],
     ```
     (next/jest appends its own default; verify the merged value with `--showConfig` and keep the CSS-module pattern.)
   - If the transform path is brittle, prefer importing the SDK's **CJS** entry, or isolate all SDK calls behind `src/lib/square.js` and **mock that adapter** in tests (`jest.mock('@/lib/square')`) so no test imports the real ESM package. Mocking the adapter is the most robust and keeps payment SDK calls out of unit tests entirely.

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

## Parallel-adapter rollout (de-risks the all-or-nothing client swap)
The blunt approach — swap `new Client()` → `new SquareClient()` in `src/lib/square.js` and fix all ~90 call sites in one commit — leaves the tree non-compiling until the last edit and has no production kill-switch. Instead, route everything through the adapter and gate the cutover:

- `src/lib/square.js` exposes a **stable internal interface** (e.g. `getCatalogObject(id)`, `createPaymentLink(body)`, `searchSubscriptions(body)`) that call sites already use or are refactored to use first (a no-op refactor on v39, shippable on its own).
- The adapter picks the implementation by env flag `SQUARE_SDK_VERSION` (`v39` default | `v44`), so staging can run v44 while production stays v39, and **production rollback is a flag flip, not a redeploy**.
- Once sandbox + staging DAST pass on `v44`, delete the v39 branch of the adapter and the flag in a final cleanup commit.

This converts a 19-file atomic change into incremental, individually-green commits and gives the post-merge rollback path named in the checkpoint section.

## Phased execution (each phase ends green; tag `checkpoint/square-v44-p<N>`)
1. **P1 — Adapter seam (v39, no behaviour change).** Funnel all SDK access through `src/lib/square.js`/`squareWebhook.js`; refactor the 19 files to call the adapter, still on v39. `build`+`test` green. *Shippable alone.* → `checkpoint/square-v44-p1`
2. **P2 — Dual-SDK adapter.** Add the `v44` implementation behind `SQUARE_SDK_VERSION`; install `square@44`, apply the Jest/ESM fix (breaking change #7). Default stays `v39`. `build`+`test` green. → `checkpoint/square-v44-p2`
3. **P3 — Convert by domain group**, one commit each, exercised via the v44 adapter path: catalog/plans → subscriptions → payments/checkout → webhook. Apply cross-cutting changes #2–#6 (`.result` unwrap, object args, bigint money, pagination, `SquareError`). → `checkpoint/square-v44-p3`
4. **P4 — Sweep & gate.** `grep` for residual `Api.` / `.result` / `new Client(` / positional-ID calls; verify bigint serialization at every response boundary (admin transactions, donations stats). `build`+`test` green.
5. **P5 — Sandbox/staging validation** (see checklist) with `SQUARE_SDK_VERSION=v44`. **DAST against staging (§7/§8).**
6. **P6 — Cutover & cleanup.** Flip default to `v44`, remove the v39 adapter branch + flag, pin `square` to the exact tested version in the lockfile. SEC sign-off → squash-merge.

## Validation checklist (before merge)
- [ ] `next build` clean, `npm test` green (incl. webhook signature tests)
- [ ] No remaining `Api.` / `.result` / `Client(` references (`grep`)
- [ ] Money/bigint serialization verified in admin transactions + donations stats responses
- [ ] Sandbox: payment-link creation works
- [ ] Sandbox: subscription create / cancel works
- [ ] Sandbox: webhook signature verify + handler round-trip
- [ ] SEC sign-off (payments = security-relevant, §2)

## Threat model (security-relevant — payments, §2/§3)
- **Trust boundaries:** member → checkout/subscription endpoints; Square → our webhook endpoint; our server → Square API. The migration must not weaken any of these.
- **STRIDE focus:**
  - **Tampering/Spoofing (webhook):** signature verification (`src/lib/squareWebhook.js`, `crypto.timingSafeEqual`, fails closed if the key is unset) must remain byte-for-byte equivalent — it uses `crypto`, not the SDK, so the SDK swap should not touch it; **re-assert with the existing signature tests**.
  - **Info-disclosure:** Square customer IDs / payment tokens are Confidential — confirm v44 responses don't widen what we log or return (the bigint→Number conversion at the response boundary must not accidentally serialize raw SDK objects).
  - **Repudiation:** payment/webhook audit events (§9) must still fire on the v44 path.
- **Abuse cases to re-test:** forged webhook signature → rejected; unauthenticated checkout/subscription call → 401; tampered amount/plan id → rejected; replayed webhook → idempotent (SEC-17).

## Risk register
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Half-converted tree if done atomically | High | High | Parallel-adapter + per-phase green checkpoints |
| Payment behaviour can't be verified locally | Certain | High | Mandatory Square **sandbox** + **staging DAST** before merge; never merge on compile-only |
| Production regression after release | Medium | Critical | `SQUARE_SDK_VERSION` flag → flip to `v39` without redeploy; squash-revert as backstop |
| Jest ESM breakage hides real test failures | High | Medium | Fix transform / mock adapter (change #7) in P2; confirm suites actually run |
| bigint money serialization bug (silent) | Medium | High | Explicit `Number()`/`.toString()` at every response boundary; assert in admin/donations responses |
| Webhook signature path drift | Low | Critical | Keep `squareWebhook.js` SDK-free; signature tests must pass unchanged |

## Estimated effort
~90 call sites across 19 files + adapter + Jest fix + sandbox/staging validation + SEC review. Realistically **multi-day**, dominated by sandbox QA and DAST, not the code edits.
