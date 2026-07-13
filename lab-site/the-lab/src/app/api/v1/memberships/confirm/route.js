import { NextResponse } from "next/server";
import { getPayment, getPaymentLink, getOrder, searchSubscriptions, listCards, createSubscription, getCatalogObject } from "@/lib/square";
import { v4 as uuidv4 } from "uuid";
import UserService from "@/app/api/v1/users/service";
import WalletService from "@/app/api/v1/wallet/service";
import Constants from "@/lib/constants";
import { db } from "@/lib/database";
import { CORE_EVENTS } from "@/lib/plugins/hooks";
import { emitEvent } from "@/lib/plugins/registry";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userID = searchParams.get("userID");
  const planVariationId = searchParams.get("planVariationId");
  const transactionId = searchParams.get("transactionId");
  // Square appends checkoutId on subscription plan checkout redirects
  const checkoutId = searchParams.get("checkoutId");

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
      const paymentResult = await getPayment(transactionId);
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

    // ── Path B: subscription plan checkout — resolve customerId from checkoutId ──
    // Square subscription checkout may not produce a transactionId immediately
    // (first charge can be deferred). Use checkoutId → payment link → order → customer.
    if (!transactionId && checkoutId) {
      try {
        const linkResult = await getPaymentLink(checkoutId);
        const orderId = linkResult.paymentLink?.orderId;
        if (orderId) {
          const orderResult = await getOrder(orderId);
          const order = orderResult.order;
          if (order?.customerId) customerId = order.customerId;
        }
      } catch { /* non-fatal — fall through to stored customerId */ }
    }

    // ── Find subscription in Square ────────────────────────────────────────────
    if (customerId) {
      try {
        const subResult = await searchSubscriptions({
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
        const cardsResult = await listCards({ customerId });
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
        const subResult = await createSubscription(subBody);
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
        const varR = await getCatalogObject(varId);
        const parentId = varR.object?.subscriptionPlanVariationData?.subscriptionPlanId;
        updateData["membership.variationName"] = varR.object?.subscriptionPlanVariationData?.name || "";
        if (parentId) {
          const planR = await getCatalogObject(parentId);
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
      // Notify the plugin platform of the activation (best-effort).
      await emitEvent(CORE_EVENTS.MEMBERSHIP_ACTIVATED, { userID, type: "co-op" }).catch(() => {});
    }

    console.log(`✅ Access granted for user ${userID} (sub: ${subscription?.id || "pending"})`);
    return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&success=subscribed`);
  } catch (error) {
    console.error("❌ Error confirming payment:", error);
    return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&error=confirm_failed`);
  }
}
