// Square v44 sandbox validation harness (#117, P5).
//
// Exercises the v44 SDK calls that src/lib/square.js issues on its v44 path —
// reads + write round-trips (payment link, customer, catalog discount) — against
// the Square SANDBOX, with cleanup. Mirrors the adapter so a green run is strong
// evidence the v44 path works end-to-end before the SQUARE_SDK_VERSION flag flips.
//
// Run (never in CI — needs live sandbox creds, which are gitignored):
//   node --env-file=.env.local scripts/square-v44-sandbox-check.mjs
//
// Requires: SQUARE_ACCESS_TOKEN, SQUARE_ENVIRONMENT=sandbox, SQUARE_LOCATION_ID.

import { randomUUID } from "node:crypto";
import { SquareClient, SquareEnvironment } from "square-v44";

const { SQUARE_ACCESS_TOKEN, SQUARE_ENVIRONMENT, SQUARE_LOCATION_ID } = process.env;
if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
  console.error("✗ SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID are required (load .env.local with --env-file).");
  process.exit(2);
}
if (SQUARE_ENVIRONMENT === "production") {
  console.error("✗ Refusing to run validation against PRODUCTION. Use the sandbox.");
  process.exit(2);
}

const client = new SquareClient({
  token: SQUARE_ACCESS_TOKEN,
  environment: SquareEnvironment.Sandbox,
});

const firstPage = (page) => page?.data || [];
let passed = 0;
let failed = 0;
async function check(label, fn) {
  try {
    const detail = await fn();
    passed++;
    console.log(`✓ ${label}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${label} — ${e?.errors?.[0]?.detail || e?.message || e}`);
  }
}

console.log("=== Square v44 sandbox validation ===");

// ---- read paths (mirror adapter) ----
await check("listCatalog(SUBSCRIPTION_PLAN)", async () => {
  const objects = firstPage(await client.catalog.list({ types: "SUBSCRIPTION_PLAN" }));
  return `${objects.length} plan(s)`;
});
await check("searchSubscriptions", async () => {
  const r = await client.subscriptions.search({});
  return `${(r.subscriptions || []).length} sub(s)`;
});
await check("listPayments", async () => {
  const r = firstPage(await client.payments.list({ sortField: "CREATED_AT", sortOrder: "DESC", limit: 5 }));
  return `${r.length} payment(s)`;
});
await check("searchCustomers", async () => {
  const r = await client.customers.search({});
  return `${(r.customers || []).length} customer(s)`;
});
await check("listWebhookSubscriptions", async () => {
  const r = firstPage(await client.webhooks.subscriptions.list({ sortOrder: "ASC" }));
  return `${r.length} webhook sub(s)`;
});

// ---- write round-trips (create → read → clean up) ----
await check("createPaymentLink (checkout)", async () => {
  const r = await client.checkout.paymentLinks.create({
    idempotencyKey: randomUUID(),
    quickPay: {
      name: "v44 sandbox validation",
      priceMoney: { amount: 500n, currency: "USD" },
      locationId: SQUARE_LOCATION_ID,
    },
  });
  const id = r.paymentLink?.id;
  const ok = !!r.paymentLink?.url;
  // cleanup
  if (id) await client.checkout.paymentLinks.delete({ id }).catch(() => {});
  if (!ok) throw new Error("no paymentLink.url returned");
  return "link created + deleted";
});

await check("createCustomer → getCustomer → delete", async () => {
  const created = await client.customers.create({
    idempotencyKey: randomUUID(),
    givenName: "V44Check",
    familyName: "Sandbox",
    referenceId: `v44-check-${randomUUID().slice(0, 8)}`,
  });
  const id = created.customer?.id;
  if (!id) throw new Error("no customer.id");
  const got = await client.customers.get({ customerId: id });
  const ok = got.customer?.id === id;
  await client.customers.delete({ customerId: id }).catch(() => {});
  if (!ok) throw new Error("getCustomer mismatch");
  return "create/get/delete round-trip ok";
});

await check("upsertCatalogObject(DISCOUNT) → get → delete", async () => {
  const up = await client.catalog.object.upsert({
    idempotencyKey: randomUUID(),
    object: {
      type: "DISCOUNT",
      id: "#v44check",
      discountData: { name: `V44CHECK-${randomUUID().slice(0, 6)}`, discountType: "FIXED_AMOUNT", amountMoney: { amount: 100n, currency: "USD" } },
    },
  });
  const id = up.catalogObject?.id;
  if (!id) throw new Error("no catalogObject.id");
  const got = await client.catalog.object.get({ objectId: id });
  const ok = got.object?.id === id;
  await client.catalog.object.delete({ objectId: id }).catch(() => {});
  if (!ok) throw new Error("getCatalogObject mismatch");
  return "upsert/get/delete round-trip ok";
});

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
