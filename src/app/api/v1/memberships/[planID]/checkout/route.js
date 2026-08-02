import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createCustomer, getCatalogObject, searchCatalogObjects, createPaymentLink } from "@/lib/square";
import { variationPriceCents } from "@/lib/money";
import { db } from "@/lib/database";
import { v4 as uuidv4 } from "uuid";

export async function POST(request, context) {
  try {
    const { params } = context;
    const { planID } = await params;
    // `price` is deliberately NOT read from the body (#182). It used to be, and
    // `Math.round(price * 100)` sent the client's number to Square — so a signed-in member
    // could subscribe to any plan for a penny. The price now comes from the Square catalog.
    // `userID` is likewise no longer accepted from the body: it came from the caller, so a
    // subscription could be attributed to another member.
    // Currency is NOT taken from the client: `{currency:"JPY"}` would ship
    // `amount: 4500, currency: "JPY"` — 4500 yen for a $45 plan. We bill in USD.
    const { couponCode } = await request.json();
    const currency = "USD";

    // Identity from the session, never from input (§5).
    const session = await auth();
    if (!session?.user?.userID) {
      return NextResponse.json({ error: "Sign in to start a membership." }, { status: 401 });
    }
    const userID = session.user.userID;
    const sessionEmail = session.user.email || null;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || "";

    const usersCollection = await db.dbUsers();
    const user = await usersCollection.findOne({ userID });
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Ensure a Square customer record exists for this user
    let squareCustomerId = user.membership?.squareCustomerId || user.squareCustomerId || user.squareID;
    if (!squareCustomerId) {
      const result = await createCustomer({
        idempotencyKey: uuidv4(),
        givenName: user.firstName || "Unknown",
        familyName: user.lastName || "User",
        emailAddress: sessionEmail || undefined,
        referenceId: userID,
      });
      squareCustomerId = result.customer.id;
      await usersCollection.updateOne({ userID }, { $set: { "membership.squareCustomerId": squareCustomerId } });
    }

    // Fetch the variation to get BOTH its display label and — critically — its price.
    // This used to run only for the label, inside a try/catch that swallowed failure, while
    // the price came from the request body. That is the #182 defect: the catalog is the only
    // authority on what a plan costs, so pricing is now fatal if it can't be read, never
    // guessed and never taken from the client.
    let itemLabel = "Membership";
    let priceCents;
    try {
      const varResult = await getCatalogObject(planID);
      const variation = varResult.object;
      const variationName = variation?.subscriptionPlanVariationData?.name || "";
      const parentPlanId = variation?.subscriptionPlanVariationData?.subscriptionPlanId;
      if (parentPlanId) {
        const planResult = await getCatalogObject(parentPlanId);
        const planName = planResult.object?.subscriptionPlanData?.name || "";
        itemLabel = variationName ? `${planName} — ${variationName}` : planName || itemLabel;
      } else {
        itemLabel = variationName || itemLabel;
      }
      priceCents = variationPriceCents(variation);
    } catch (err) {
      console.error("❌ Checkout: could not load plan from Square catalog:", err?.message);
      return NextResponse.json({ error: "This plan is temporarily unavailable." }, { status: 502 });
    }

    if (priceCents == null) {
      // RELATIVE-priced variation, or a plan with no fixed amount: refuse rather than guess.
      return NextResponse.json({ error: "This plan cannot be checked out here." }, { status: 400 });
    }

    // Apply coupon discount if provided
    let discountLabel = "";
    if (couponCode) {
      const searchResult = await searchCatalogObjects({
        objectTypes: ["DISCOUNT"],
        query: { exactQuery: { attributeName: "name", attributeValue: couponCode.toUpperCase() } },
      });
      const discount = (searchResult.objects || [])[0];
      if (!discount) {
        return NextResponse.json({ error: `Coupon "${couponCode}" not found.` }, { status: 400 });
      }
      const dd = discount.discountData;
      if (dd.discountType === "FIXED_PERCENTAGE") {
        const pct = parseFloat(dd.percentage || "0") / 100;
        priceCents = Math.max(1, priceCents - Math.round(priceCents * pct));
        discountLabel = ` (${dd.percentage}% off)`;
      } else if (dd.discountType === "FIXED_AMOUNT" && dd.amountMoney) {
        priceCents = Math.max(1, priceCents - Number(dd.amountMoney.amount));
        discountLabel = ` ($${(Number(dd.amountMoney.amount) / 100).toFixed(2)} off)`;
      }
    }

    const itemName = `${itemLabel}${discountLabel}`;
    const redirectUrl = `${appUrl}/api/v1/memberships/confirm?userID=${userID}&planVariationId=${planID}`;

    const checkoutOptions = {
      redirectUrl,
      askForShippingAddress: false,
    };

    // For the standard (no coupon) path, attach subscriptionPlanId (variation ID)
    // so Square creates the subscription automatically at checkout.
    if (!couponCode) {
      checkoutOptions.subscriptionPlanId = planID;
    }

    const checkoutResult = await createPaymentLink({
      // Stable per (member, plan, coupon) so a double-click or retry returns the same link
      // instead of creating a second subscription attempt. A fresh uuid per request — as the
      // deleted /api/v1/payments did — defeats the point of an idempotency key.
      idempotencyKey: `sub:${userID}:${planID}:${couponCode ? couponCode.toUpperCase() : "none"}`,
      quickPay: {
        name: itemName,
        priceMoney: { amount: BigInt(priceCents), currency },
        locationId: process.env.SQUARE_LOCATION_ID,
      },
      prePopulatedData: sessionEmail ? { buyerEmail: sessionEmail } : undefined,
      checkoutOptions,
    });

    if (!checkoutResult.paymentLink?.url) {
      return NextResponse.json({ error: "Failed to create checkout link." }, { status: 500 });
    }
    return NextResponse.json({ url: checkoutResult.paymentLink.url }, { status: 200 });

  } catch (error) {
    // Square's message stays in the log; the client gets a generic error (§5).
    console.error("❌ Checkout error:", error?.errors?.[0]?.detail || error?.message);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
