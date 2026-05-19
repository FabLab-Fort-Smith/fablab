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
  const transactionId = searchParams.get("transactionId");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || "";

  if (!userID) {
    return NextResponse.redirect(`${appUrl}/dashboard?error=missing_user`);
  }

  try {
    const usersCollection = await db.dbUsers();
    const currentUser = await usersCollection.findOne({ userID });
    const wasAlreadyActive = currentUser?.membership?.subscriptionStatus === "ACTIVE";

    let customerId = currentUser?.membership?.squareCustomerId || currentUser?.squareCustomerId;
    let subscription = null;

    // ── Path A: transactionId present — verify payment then find subscription ──
    if (transactionId) {
      const { result: paymentResult } = await squareClient.paymentsApi.getPayment(transactionId);
      const payment = paymentResult.payment;

      if (payment?.status !== "COMPLETED") {
        console.warn(`⚠️ Payment ${transactionId} not COMPLETED (status: ${payment?.status})`);
        return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&error=payment_incomplete`);
      }

      customerId = payment.customerId || customerId;
      if (!customerId) {
        console.error("❌ No customerId on payment:", transactionId);
        return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&error=no_customer`);
      }
    }

    // ── Find subscription in Square ────────────────────────────────────────────
    if (customerId) {
      try {
        const { result: subResult } = await squareClient.subscriptionsApi.searchSubscriptions({
          query: { filter: { customerIds: [customerId] } },
        });
        const subs = subResult.subscriptions || [];
        subscription = subs.find(s => s.status === "ACTIVE") || subs[0] || null;
      } catch (err) {
        console.warn("⚠️ Could not search subscriptions:", err?.errors?.[0]?.detail || err?.message);
      }
    }

    // ── Coupon / CUSTOM_AMOUNT path: create subscription using saved card ──────
    if (!subscription && planVariationId && customerId) {
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
        console.log(`✅ Subscription created: ${subscription?.id}`);
      } catch (subErr) {
        console.warn("⚠️ Could not create subscription:", subErr?.errors?.[0]?.detail || subErr?.message);
      }
    }

    // ── If still no transactionId and no subscription found, go pending ────────
    if (!transactionId && !subscription) {
      console.warn(`⚠️ No transactionId and no subscription found for user ${userID} — redirecting pending`);
      return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&pending=true`);
    }

    // ── Update user record ─────────────────────────────────────────────────────
    const updateData = {
      "membership.status": "active",
      "membership.type": "co-op",
      "membership.subscriptionStatus": "ACTIVE",
      "membership.lastPaymentDate": new Date().toISOString(),
      "membership.accessKey.issued": true,
    };
    if (customerId) updateData["membership.squareCustomerId"] = customerId;
    if (subscription?.id) updateData["membership.squareSubscriptionId"] = subscription.id;

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

    if (!wasAlreadyActive) {
      await WalletService.addStake(
        userID,
        Constants.ONBOARDING_REWARDS.SUBSCRIBE,
        "Subscription Reward",
        "onboarding_reward_subscribe"
      ).catch(err => console.error("Failed to award subscribe stake:", err));
    }

    console.log(`✅ Access granted for user ${userID} (sub: ${subscription?.id || "pending"})`);
    return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&success=subscribed`);
  } catch (error) {
    console.error("❌ Error confirming payment:", error);
    return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&error=confirm_failed`);
  }
}
