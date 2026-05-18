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
    const { userID, price, currency = "USD", couponCode } = await request.json();

    if (!userID || price == null) {
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
        emailAddress: user.email,
        referenceId: userID,
      });
      squareCustomerId = result.customer.id;
      await usersCollection.updateOne({ userID }, { $set: { "membership.squareCustomerId": squareCustomerId } });
    }

    const redirectUrl = `${appUrl}/api/v1/memberships/confirm?userID=${userID}&planVariationId=${planID}`;

    // ── Coupon path: calculate discount, use CUSTOM_AMOUNT checkout ──────────
    if (couponCode) {
      let priceCents = Math.round(price * 100);
      if (priceCents <= 0) {
        return NextResponse.json({ error: "Invalid price." }, { status: 400 });
      }

      // Validate coupon against Square catalog discounts
      const { result: searchResult } = await squareClient.catalogApi.searchCatalogObjects({
        objectTypes: ["DISCOUNT"],
        query: { exactQuery: { attributeName: "name", attributeValue: couponCode.toUpperCase() } },
      });
      const discount = (searchResult.objects || [])[0];
      if (!discount) {
        return NextResponse.json({ error: `Coupon "${couponCode}" not found.` }, { status: 400 });
      }
      const dd = discount.discountData;
      let discountLabel = "";
      if (dd.discountType === "FIXED_PERCENTAGE") {
        const pct = parseFloat(dd.percentage || "0") / 100;
        priceCents = Math.max(1, priceCents - Math.round(priceCents * pct));
        discountLabel = ` (${dd.percentage}% off)`;
      } else if (dd.discountType === "FIXED_AMOUNT" && dd.amountMoney) {
        priceCents = Math.max(1, priceCents - Number(dd.amountMoney.amount));
        discountLabel = ` ($${(Number(dd.amountMoney.amount) / 100).toFixed(2)} off)`;
      }

      let variationName = "Membership";
      try {
        const { result: varResult } = await squareClient.catalogApi.retrieveCatalogObject(planID);
        variationName = varResult.object?.subscriptionPlanVariationData?.name || variationName;
      } catch { /* non-fatal */ }

      const { result: checkoutResult } = await checkoutApi.createPaymentLink({
        idempotencyKey: uuidv4(),
        description: `${variationName}${discountLabel}`,
        order: {
          locationId: process.env.SQUARE_LOCATION_ID,
          customerId: squareCustomerId,
          lineItems: [{
            quantity: "1",
            itemType: "CUSTOM_AMOUNT",
            basePriceMoney: { amount: BigInt(priceCents), currency },
            note: `${variationName}${discountLabel}`,
          }],
        },
        checkoutOptions: {
          redirectUrl,
          askForShippingAddress: false,
        },
      });

      if (!checkoutResult.paymentLink?.url) {
        return NextResponse.json({ error: "Failed to create checkout link." }, { status: 500 });
      }
      return NextResponse.json({ url: checkoutResult.paymentLink.url }, { status: 200 });
    }

    // ── Standard path: native subscription plan checkout ─────────────────────
    // Retrieve the variation to get its parent subscription plan ID
    let parentPlanId = null;
    try {
      const { result: varResult } = await squareClient.catalogApi.retrieveCatalogObject(planID);
      parentPlanId = varResult.object?.subscriptionPlanVariationData?.subscriptionPlanId || null;
    } catch { /* fall through */ }

    if (!parentPlanId) {
      return NextResponse.json({ error: "Could not resolve subscription plan." }, { status: 500 });
    }

    const { result: checkoutResult } = await checkoutApi.createPaymentLink({
      idempotencyKey: uuidv4(),
      prePopulatedData: {
        buyerEmail: user.email || undefined,
      },
      checkoutOptions: {
        subscriptionPlanId: parentPlanId,
        redirectUrl,
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
