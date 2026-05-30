import { NextResponse } from "next/server";
import { listCatalog, getCatalogObject, cancelSubscription } from "@/lib/square";
import { db } from "@/lib/database";
import UserService from "../users/service";
import { v4 as uuidv4 } from "uuid";

// 🟢 GET: Retrieve Membership Plans
export async function GET() {
  try {
    console.log("📢 [GET] Fetching membership plans...");
    const result = await listCatalog("SUBSCRIPTION_PLAN");

    if (!result.objects || !Array.isArray(result.objects) || result.objects.length === 0) {
      console.warn("⚠️ No membership plans found in Square.");
      return NextResponse.json({ error: "No membership plans found." }, { status: 404 });
    }

    console.log("🔹 Original Plans:", result.objects.length);

    // Extract plan data
    const plans = await Promise.all(result.objects.map(async (plan) => {
      const planId = String(plan.id);
      const planName = plan.subscriptionPlanData?.name || "Unnamed Plan";

      // Filter out inactive plan variations
      const activeVariations = plan.subscriptionPlanData?.subscriptionPlanVariations?.filter(
        (variant) => variant.presentAtAllLocations !== false
      ) || [];

      if (activeVariations.length === 0) {
        console.warn(`⚠️ No active variations found for plan: ${planName}`);
        return null; // Skip this plan if no active variations exist
      }

      // Process variations
      const variations = activeVariations.map(variant => {
        return {
          variationId: variant.id, // Plan Variation ID
          name: variant.subscriptionPlanVariationData?.name || "Unnamed Variation",
          cadence: variant.subscriptionPlanVariationData?.phases?.[0]?.cadence || "UNKNOWN",
        };
      });

      // Extract the eligible item ID for pricing
      const eligibleItemId = plan.subscriptionPlanData?.eligibleItemIds?.[0] || null;
      let price = 0;
      let currency = "USD";

      if (eligibleItemId) {
        try {
          // Fetch item price from Square Catalog
          const itemResult = await getCatalogObject(eligibleItemId);
          const itemData = itemResult.object?.itemData?.variations?.[0]?.itemVariationData?.priceMoney;

          if (itemData) {
            price = Number(itemData.amount) / 100; // Convert from cents
            currency = itemData.currency || "USD";
          }
        } catch (error) {
          console.warn(`⚠️ Could not retrieve price for item ID: ${eligibleItemId}`);
        }
      }

      return {
        id: planId,
        name: planName,
        price,
        currency,
        variations, // Includes all valid variations (monthly/annual)
      };
    }));

    // Remove null entries (i.e., plans with no active variations)
    const filteredPlans = plans.filter((plan) => plan !== null);

    console.log(`✅ Processed ${filteredPlans.length} Membership Plans:`, JSON.stringify(filteredPlans, null, 2));

    return NextResponse.json(filteredPlans, { status: 200 });
  } catch (error) {
    console.error("❌ [GET] Error fetching membership plans:", error);
    return NextResponse.json({ error: "Failed to load membership plans." }, { status: 500 });
  }
}

// 🔴 DELETE: Cancel User Membership
export async function DELETE(req) {
  console.log("📢 [DELETE] Processing membership cancellation...");
  try {
    const { userID } = await req.json();
    console.log(`🔍 [DELETE] User ID: ${userID}`);

    if (!userID) {
      console.warn("⚠️ [DELETE] Missing userID.");
      return NextResponse.json({ error: "Missing userID." }, { status: 400 });
    }

    const usersCollection = await db.dbUsers();
    const user = await usersCollection.findOne({ userID: userID });

    if (!user || !user.membership) {
      console.warn("⚠️ [DELETE] User has no active membership.");
      return NextResponse.json({ error: "User has no active membership." }, { status: 400 });
    }

    console.log("📤 [DELETE] Sending cancellation request to Square for:", user.membership.id);

    const result = await cancelSubscription(user.membership.id);

    if (!result) {
      console.error("❌ [DELETE] Failed to cancel subscription.");
      return NextResponse.json({ error: "Failed to cancel subscription." }, { status: 500 });
    }

    console.log("✅ [DELETE] Subscription canceled successfully.");

    await usersCollection.updateOne({ userID: userID }, { $unset: { membership: "" } });

    return NextResponse.json({ message: "Membership canceled." }, { status: 200 });
  } catch (error) {
    console.error("❌ [DELETE] Error canceling membership:", error);
    return NextResponse.json({ error: "Failed to cancel membership." }, { status: 500 });
  }
}

// 🔵 PUT: Manage Locker Add-On
export async function PUT(req) {
  console.log("📢 [PUT] Processing locker update...");
  try {
    const { userID, action } = await req.json();
    console.log(`🔍 [PUT] User ID: ${userID}, Action: ${action}`);

    if (!userID || !["add", "remove"].includes(action)) {
      console.warn("⚠️ [PUT] Invalid request.");
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const usersCollection = await db.dbUsers();
    const user = await usersCollection.findOne({ userID: userID });

    if (!user) {
      console.warn("⚠️ [PUT] User not found.");
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    console.log(`📤 [PUT] Updating locker status for user ${userID}: ${action}`);

    await usersCollection.updateOne(
      { userID: userID },
      { $set: { locker: action === "add" } }
    );

    console.log(`✅ [PUT] Locker ${action === "add" ? "added" : "removed"} successfully.`);

    return NextResponse.json({
      message: `Locker ${action === "add" ? "added" : "removed"} successfully.`,
      locker: action === "add",
    }, { status: 200 });

  } catch (error) {
    console.error("❌ [PUT] Error updating locker:", error);
    return NextResponse.json({ error: "Failed to update locker." }, { status: 500 });
  }
}
