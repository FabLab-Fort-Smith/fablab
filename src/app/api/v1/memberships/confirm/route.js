import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import squareClient from "@/lib/square";
import { v4 as uuidv4 } from "uuid";
import UserService from "@/app/api/v1/users/service";
import WalletService from "@/app/api/v1/wallet/service";
import Constants from "@/lib/constants";
import { db } from "@/lib/database";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userID = searchParams.get("userID");
  const transactionId = searchParams.get("transactionId");
  const planVariationId = searchParams.get("planVariationId");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || "";

  if (!userID) {
    return NextResponse.redirect(`${appUrl}/dashboard?error=missing_user`);
  }

  if (!transactionId) {
    // Square may not always pass transactionId — redirect to dashboard, webhook will handle it
    return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&pending=true`);
  }

  try {
    // 1. Verify the payment with Square
    const { result: paymentResult } = await squareClient.paymentsApi.getPayment(transactionId);
    const payment = paymentResult.payment;

    if (payment?.status !== "COMPLETED") {
      console.warn(`⚠️ Payment ${transactionId} is not COMPLETED (status: ${payment?.status})`);
      return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&error=payment_incomplete`);
    }

    const customerId = payment.customerId;
    if (!customerId) {
      console.error("❌ No customerId on completed payment:", transactionId);
      return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&error=no_customer`);
    }

    // 2. Create the subscription in Square using the card saved during checkout.
    //    If no card is on file yet, fall back to invoice billing (Square emails the member).
    let subscription = null;
    if (planVariationId) {
      try {
        // Look for a card on file for this customer (Square saves it after checkout)
        const { result: cardsResult } = await squareClient.cardsApi.listCards(
          undefined, customerId
        );
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
        // Non-fatal — membership access is still granted below; webhook will sync status
        console.warn("⚠️ Could not create subscription after payment:", subErr?.errors?.[0]?.detail || subErr?.message);
      }
    } else {
      // No planVariationId — look for an existing subscription (legacy path)
      try {
        const { result: subResult } = await squareClient.subscriptionsApi.searchSubscriptions({
          query: { filter: { customerIds: [customerId] } },
        });
        const subs = subResult.subscriptions || [];
        subscription = subs.find((s) => s.status === "ACTIVE") || subs[0] || null;
      } catch (subErr) {
        console.warn("⚠️ Could not fetch subscription after payment:", subErr);
      }
    }

    // 3. Fetch current user to check for reward eligibility
    const usersCollection = await db.dbUsers();
    const currentUser = await usersCollection.findOne({ userID });
    const wasAlreadyActive = currentUser?.membership?.subscriptionStatus === "ACTIVE";

    // 4. Update user record with payment + access data
    const updateData = {
      "membership.squareCustomerId": customerId,
      "membership.status": "active",
      "membership.type": "co-op",
      "membership.subscriptionStatus": "ACTIVE",
      "membership.lastPaymentDate": new Date().toISOString(),
      "membership.accessKey.issued": true,
    };

    if (subscription) {
      updateData["membership.squareSubscriptionId"] = subscription.id;
    }

    await UserService.updateUser(userID, updateData);

    // 5. Award SUBSCRIBE stake if this is a new subscription
    if (!wasAlreadyActive) {
      await WalletService.addStake(
        userID,
        Constants.ONBOARDING_REWARDS.SUBSCRIBE,
        "Subscription Reward",
        "onboarding_reward_subscribe"
      ).catch((err) => console.error("Failed to award subscribe stake:", err));
    }

    console.log(`✅ Payment confirmed and access granted for user ${userID}`);
    return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&success=subscribed`);
  } catch (error) {
    console.error("❌ Error confirming payment:", error);
    return NextResponse.redirect(`${appUrl}/dashboard?tab=membership&error=confirm_failed`);
  }
}
