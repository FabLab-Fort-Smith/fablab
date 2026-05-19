import { NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
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

    // Get plaintext email from session — DB email may be hashed
    const session = await auth();
    const sessionEmail = session?.user?.email || null;

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
        emailAddress: sessionEmail || undefined,
        referenceId: userID,
      });
      squareCustomerId = result.customer.id;
      await usersCollection.updateOne({ userID }, { $set: { "membership.squareCustomerId": squareCustomerId } });
    }

    // Fetch variation + parent plan name to build a display label
    let itemLabel = "Membership";
    try {
      const { result: varResult } = await squareClient.catalogApi.retrieveCatalogObject(planID);
      const variation = varResult.object;
      const variationName = variation?.subscriptionPlanVariationData?.name || "";
      const parentPlanId = variation?.subscriptionPlanVariationData?.subscriptionPlanId;
      if (parentPlanId) {
        const { result: planResult } = await squareClient.catalogApi.retrieveCatalogObject(parentPlanId);
        const planName = planResult.object?.subscriptionPlanData?.name || "";
        itemLabel = variationName ? `${planName} — ${variationName}` : planName || itemLabel;
      } else {
        itemLabel = variationName || itemLabel;
      }
    } catch { /* non-fatal */ }

    let priceCents = Math.round(price * 100);
    if (priceCents <= 0) {
      return NextResponse.json({ error: "Invalid price." }, { status: 400 });
    }

    // Apply coupon discount if provided
    let discountLabel = "";
    if (couponCode) {
      const { result: searchResult } = await squareClient.catalogApi.searchCatalogObjects({
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

    const { result: checkoutResult } = await checkoutApi.createPaymentLink({
      idempotencyKey: uuidv4(),
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
    const msg = error?.errors?.[0]?.detail || error?.message || "Failed to create checkout link.";
    console.error("❌ Checkout error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
