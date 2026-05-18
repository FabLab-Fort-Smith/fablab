import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import squareClient from "@/lib/square";
import UserService from "@/app/api/v1/users/service";
import WalletService from "@/app/api/v1/wallet/service";
import Constants from "@/lib/constants";
import { db } from "@/lib/database";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userID = searchParams.get("userID");
  const transactionId = searchParams.get("transactionId");

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

    // 2. Find the subscription for this customer
    let subscription = null;
    try {
      const { result: subResult } = await squareClient.subscriptionsApi.searchSubscriptions({
        query: { filter: { customerIds: [customerId] } },
      });
      const subs = subResult.subscriptions || [];
      subscription = subs.find((s) => s.status === "ACTIVE") || subs[0] || null;
    } catch (subErr) {
      console.warn("⚠️ Could not fetch subscription after payment:", subErr);
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
