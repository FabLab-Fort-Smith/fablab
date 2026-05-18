import { NextResponse } from "next/server";
import { auth } from "../../../../../../../auth";
import squareClient from "@/lib/square";
import { db } from "@/lib/database";
import SubscriptionService from "@/app/api/v1/square/subscriptions/service";

// GET: List recent Square payments with linked user info
export async function GET(request) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const beginTime = searchParams.get("beginTime") || undefined;
    const endTime = searchParams.get("endTime") || undefined;

    const { result } = await squareClient.paymentsApi.listPayments(
      beginTime,   // beginTime
      endTime,     // endTime
      undefined,   // sortOrder
      undefined,   // cursor
      undefined,   // locationId
      undefined,   // total
      undefined,   // last4
      undefined,   // cardBrand
      100          // limit
    );

    const payments = result.payments || [];

    const usersCollection = await db.dbUsers();
    const customerIds = [...new Set(payments.map((p) => p.customerId).filter(Boolean))];

    // Cross-reference: which customerIds have a subscription in Square?
    // Square's payment object has no direct subscriptionId — we detect it by checking
    // whether the customer has any subscription record at all.
    const subscriberCustomerIds = new Set();
    if (customerIds.length) {
      try {
        const { result: subResult } = await squareClient.subscriptionsApi.searchSubscriptions({
          query: { filter: { customerIds } },
          limit: 200,
        });
        for (const s of (subResult.subscriptions || []))
          if (s.customerId) subscriberCustomerIds.add(s.customerId);
      } catch { /* non-fatal */ }
    }

    // Build a lookup of squareCustomerId → user
    const linkedUsers = await usersCollection
      .find({
        $or: [
          { "membership.squareCustomerId": { $in: customerIds } },
          { squareCustomerId: { $in: customerIds } },
          { squareID: { $in: customerIds } },
        ],
      })
      .toArray();

    const customerMap = {};
    for (const u of linkedUsers) {
      const id = u.membership?.squareCustomerId || u.squareCustomerId || u.squareID;
      if (id) customerMap[id] = { userID: u.userID, firstName: u.firstName, lastName: u.lastName, email: u.email };
    }

    const enriched = payments.map((p) => ({
      id: p.id,
      amount: p.amountMoney ? Number(p.amountMoney.amount) / 100 : null,
      currency: p.amountMoney?.currency || "USD",
      status: p.status,
      createdAt: p.createdAt,
      customerId: p.customerId,
      isSubscription: p.customerId ? subscriberCustomerIds.has(p.customerId) : false,
      note: p.note || null,
      linkedUser: p.customerId ? customerMap[p.customerId] || null : null,
    }));

    return NextResponse.json(enriched, { status: 200 });
  } catch (error) {
    console.error("❌ Error fetching Square transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transactions." }, { status: 500 });
  }
}

// POST: Manually link a Square customer to a Lab user and sync subscription
export async function POST(request) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userID, squareCustomerId, grantAccess } = await request.json();
    if (!userID || !squareCustomerId) {
      return NextResponse.json({ error: "userID and squareCustomerId are required." }, { status: 400 });
    }

    const usersCollection = await db.dbUsers();
    const user = await usersCollection.findOne({ userID });
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Save the customer ID (normalise to membership.squareCustomerId)
    await usersCollection.updateOne(
      { userID },
      { $set: { "membership.squareCustomerId": squareCustomerId } }
    );

    // Attempt to sync subscription — non-fatal (customer may have no active subscription yet)
    let subscriptionFound = false;
    let subscriptionStatus = null;
    try {
      const syncResult = await SubscriptionService.syncSubscription(squareCustomerId, userID);
      subscriptionFound = !!syncResult;
      if (subscriptionFound) {
        // Re-fetch to get the current membership status
        const updated = await usersCollection.findOne({ userID });
        subscriptionStatus = updated?.membership?.subscriptionStatus || null;
      }
    } catch (syncErr) {
      console.warn("⚠️ Subscription sync skipped:", syncErr?.message || syncErr);
    }

    // If admin explicitly grants access (no subscription in Square, paid via invoice etc.)
    if (grantAccess) {
      await usersCollection.updateOne(
        { userID },
        { $set: {
          "membership.subscriptionStatus": "ACTIVE",
          "membership.type": "co-op",
          "membership.manuallyGranted": true,
          "membership.manualGrantDate": new Date().toISOString(),
        }}
      );
      subscriptionFound = true;
      subscriptionStatus = "ACTIVE";
    }

    return NextResponse.json({ success: true, subscriptionFound, subscriptionStatus }, { status: 200 });
  } catch (error) {
    console.error("❌ Error linking Square customer:", error);
    return NextResponse.json({ error: "Failed to link customer." }, { status: 500 });
  }
}
