import { NextResponse } from "next/server";
import squareClient from "@/lib/square";
import { db } from "@/lib/database";
import { v4 as uuidv4 } from "uuid";

const customersApi = squareClient.customersApi;
const checkoutApi = squareClient.checkoutApi;

export async function POST(request, context) {
  try {
    const { params } = context;
    const { planID } = await params;
    const { userID, price, currency } = await request.json();

    if (!userID || price == null || !currency) {
      return NextResponse.json({ error: "Missing required parameters." }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || "";

    const usersCollection = await db.dbUsers();
    const user = await usersCollection.findOne({ userID });
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Ensure a Square customer record exists for this user
    let squareCustomerId = user.membership?.squareCustomerId || user.squareCustomerId || user.squareID;
    if (!squareCustomerId) {
      const { result } = await customersApi.createCustomer({
        idempotencyKey: uuidv4(),
        givenName: user.firstName || "Unknown",
        familyName: user.lastName || "User",
        referenceId: userID,
      });
      squareCustomerId = result.customer.id;
      await usersCollection.updateOne({ userID }, { $set: { "membership.squareCustomerId": squareCustomerId } });
    }

    // Square's order line items only accept CATALOG_ITEM_VARIATION objects (not
    // SUBSCRIPTION_PLAN_VARIATION), so we use CUSTOM_AMOUNT to collect the first
    // payment. The confirm endpoint creates the actual subscription in Square after
    // the payment completes and a card is on file.
    const priceCents = Math.round(price * 100);
    if (priceCents <= 0) {
      return NextResponse.json({ error: "Invalid price — cannot create a $0 checkout." }, { status: 400 });
    }

    // Fetch plan variation name for the line item label
    let variationName = "Membership";
    try {
      const { result: catResult } = await squareClient.catalogApi.retrieveCatalogObject(planID);
      variationName = catResult.object?.subscriptionPlanVariationData?.name || variationName;
    } catch { /* non-fatal */ }

    const { result: checkoutResult } = await checkoutApi.createPaymentLink({
      idempotencyKey: uuidv4(),
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        customerId: squareCustomerId,
        lineItems: [{
          quantity: "1",
          name: variationName,
          itemType: "CUSTOM_AMOUNT",
          basePriceMoney: { amount: BigInt(priceCents), currency },
        }],
      },
      checkoutOptions: {
        // Pass planVariationId so the confirm endpoint can create the subscription
        redirectUrl: `${appUrl}/api/v1/memberships/confirm?userID=${userID}&planVariationId=${planID}`,
        askForShippingAddress: false,
      },
    });

    if (!checkoutResult.paymentLink?.url) {
      return NextResponse.json({ error: "Failed to create checkout link." }, { status: 500 });
    }

    return NextResponse.json({ url: checkoutResult.paymentLink.url }, { status: 200 });
  } catch (error) {
    const msg = error?.errors?.[0]?.detail || error?.message || "Failed to create checkout link.";
    console.error("❌ Checkout error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
