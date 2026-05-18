import { NextResponse } from "next/server";
import squareClient from "@/lib/square";
import { v4 as uuidv4 } from "uuid";
import UserService from "@/app/api/v1/users/service";
import WalletService from "@/app/api/v1/wallet/service";
import Constants from "@/lib/constants";
import { db } from "@/lib/database";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userID = searchParams.get("userID");
  const planVariationId = searchParams.get("planVariationId");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || "";

  if (!userID) {
    return NextResponse.redirect(`${appUrl}/dashboard?error=missing_user`);
  }

  // Square passes transactionId as a query param after payment
  const transactionId = searchParams.get("transactionId");
  if (!transactionId) {
    return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&pending=true`);
  }

  try {
    // 1. Verify the payment with Square
    const { result: paymentResult } = await squareClient.paymentsApi.getPayment(transactionId);
    const payment = paymentResult.payment;

    if (payment?.status !== "COMPLETED") {
      console.warn(`⚠️ Payment ${transactionId} not COMPLETED (status: ${payment?.status})`);
      return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&error=payment_incomplete`);
    }

    const customerId = payment.customerId;
    if (!customerId) {
      console.error("❌ No customerId on completed payment:", transactionId);
      return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&error=no_customer`);
    }

    // 2. Find or create subscription.
    //    For native subscription plan checkout, Square already created it.
    //    For the coupon/CUSTOM_AMOUNT path, we need to create it here.
    let subscription = null;

    // Always search first — Square may have auto-created it
    try {
      const { result: subResult } = await squareClient.subscriptionsApi.searchSubscriptions({
        query: { filter: { customerIds: [customerId] } },
      });
      const subs = subResult.subscriptions || [];
      subscription = subs.find(s => s.status === "ACTIVE") || subs[0] || null;
    } catch (err) {
      console.warn("⚠️ Could not search subscriptions:", err?.errors?.[0]?.detail || err?.message);
    }

    // If not found and we have a planVariationId, create the subscription now
    // (coupon / CUSTOM_AMOUNT path — card was saved during checkout)
    if (!subscription && planVariationId) {
      try {
        const { result: cardsResult } = await squareClient.cardsApi.listCards(undefined, customerId);
        const card = (cardsResult.cards || []).find(c => c.enabled !== false);
        const today = new Date().toISOString().split("T")[0];
        const subBody = {
          idempotencyKey: uuidv4(),
          locationId: process.env.SQUARE_LOCATION_ID,
          planVariationId,
          customerId,
          startDate: today,
        };
        if (card) subBody.cardId = card.id;
        const { result: subResult } = await squareClient.subscriptionsApi.createSubscription(subBody);
        subscription = subResult.subscription || null;
        console.log(`✅ Subscription created: ${subscription?.id} (card: ${card?.id || "invoice"})`);
      } catch (subErr) {
        console.warn("⚠️ Could not create subscription:", subErr?.errors?.[0]?.detail || subErr?.message);
      }
    }

    // 3. Check if user was already active (for reward deduplication)
    const usersCollection = await db.dbUsers();
    const currentUser = await usersCollection.findOne({ userID });
    const wasAlreadyActive = currentUser?.membership?.subscriptionStatus === "ACTIVE";

    // 4. Update user record
    const updateData = {
      "membership.squareCustomerId": customerId,
      "membership.status": "active",
      "membership.type": "co-op",
      "membership.subscriptionStatus": "ACTIVE",
      "membership.lastPaymentDate": new Date().toISOString(),
      "membership.accessKey.issued": true,
    };
    if (subscription?.id) {
      updateData["membership.squareSubscriptionId"] = subscription.id;
    }
    // Resolve plan + variation name from the subscription
    const varId = subscription?.planVariationId || planVariationId;
    if (varId) {
      try {
        const { result: varR } = await squareClient.catalogApi.retrieveCatalogObject(varId);
        const parentId = varR.object?.subscriptionPlanVariationData?.subscriptionPlanId;
        updateData["membership.variationName"] = varR.object?.subscriptionPlanVariationData?.name || "";
        if (parentId) {
          const { result: planR } = await squareClient.catalogApi.retrieveCatalogObject(parentId);
          updateData["membership.planName"] = planR.object?.subscriptionPlanData?.name || "";
        }
      } catch { /* non-fatal */ }
    }
    await UserService.updateUser(userID, updateData);

    // 5. Award SUBSCRIBE stake for new subscriptions
    if (!wasAlreadyActive) {
      await WalletService.addStake(
        userID,
        Constants.ONBOARDING_REWARDS.SUBSCRIBE,
        "Subscription Reward",
        "onboarding_reward_subscribe"
      ).catch(err => console.error("Failed to award subscribe stake:", err));
    }

    console.log(`✅ Payment confirmed and access granted for user ${userID}`);
    return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&success=subscribed`);
  } catch (error) {
    console.error("❌ Error confirming payment:", error);
    return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&error=confirm_failed`);
  }
}
