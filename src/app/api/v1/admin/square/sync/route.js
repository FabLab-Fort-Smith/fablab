import { NextResponse } from "next/server";
import { auth } from "../../../../../../../auth";
import { db } from "@/lib/database";
import SubscriptionService from "@/app/api/v1/square/subscriptions/service";

export async function POST() {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const usersCollection = await db.dbUsers();
    // Exclude waived members — their access is granted regardless of Square status
    const members = await usersCollection
      .find({
        "membership.squareCustomerId": { $exists: true, $ne: null },
        "membership.isWaived": { $ne: true },
      })
      .toArray();

    let synced = 0;
    let granted = 0;
    let revoked = 0;
    const errors = [];

    for (const member of members) {
      try {
        const squareCustomerId = member.membership.squareCustomerId;
        const updated = await SubscriptionService.syncSubscription(squareCustomerId, member.userID);

        if (updated) {
          synced++;
          const wasIssued = member.membership?.accessKey?.issued;
          const isActive = updated.membership?.subscriptionStatus === "ACTIVE";

          if (isActive && !wasIssued) granted++;
          if (!isActive && wasIssued) revoked++;
        }
      } catch (err) {
        console.error(`⚠️ Sync failed for ${member.userID}:`, err.message);
        errors.push({ userID: member.userID, error: err.message });
      }
    }

    return NextResponse.json({ synced, granted, revoked, errors }, { status: 200 });
  } catch (error) {
    console.error("❌ Square sync error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
