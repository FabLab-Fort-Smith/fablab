import { NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import squareClient from "@/lib/square";
import { db } from "@/lib/database";
import { v4 as uuidv4 } from "uuid";

const catalogApi = squareClient.catalogApi;

async function getHiddenPlanIds() {
  const col = await db.dbPlans();
  const doc = await col.findOne({ _id: "hidden_plans" });
  return new Set(doc?.ids || []);
}

async function setHiddenPlanId(planId) {
  const col = await db.dbPlans();
  await col.updateOne(
    { _id: "hidden_plans" },
    { $addToSet: { ids: planId } },
    { upsert: true }
  );
}

async function unsetHiddenPlanId(planId) {
  const col = await db.dbPlans();
  await col.updateOne({ _id: "hidden_plans" }, { $pull: { ids: planId } });
}

// GET: List all subscription plans from Square Catalog
export async function GET() {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [{ result }, hidden] = await Promise.all([
      catalogApi.listCatalog(undefined, "SUBSCRIPTION_PLAN"),
      getHiddenPlanIds(),
    ]);

    const plans = (result.objects || []).map((plan) => ({
      id: plan.id,
      version: Number(plan.version),
      name: plan.subscriptionPlanData?.name || "Unnamed Plan",
      hidden: hidden.has(plan.id),
      variations: (plan.subscriptionPlanData?.subscriptionPlanVariations || []).map((v) => ({
        id: v.id,
        name: v.subscriptionPlanVariationData?.name || "",
        cadence: v.subscriptionPlanVariationData?.phases?.[0]?.cadence || "UNKNOWN",
        priceCents: Number(v.subscriptionPlanVariationData?.phases?.[0]?.pricing?.priceMoney?.amount ?? 0),
      })),
    }));

    return NextResponse.json(plans, { status: 200 });
  } catch (error) {
    console.error("❌ Error fetching plans:", error);
    return NextResponse.json({ error: "Failed to fetch plans." }, { status: 500 });
  }
}

// POST: Create a new subscription plan in Square Catalog
export async function POST(request) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, monthlyPriceCents, annualPriceCents } = await request.json();
    if (!name || !monthlyPriceCents) {
      return NextResponse.json({ error: "name and monthlyPriceCents are required." }, { status: 400 });
    }

    const variations = [
      {
        type: "SUBSCRIPTION_PLAN_VARIATION",
        id: `#monthly-${uuidv4()}`,
        presentAtAllLocations: true,
        subscriptionPlanVariationData: {
          name: "Monthly",
          phases: [
            {
              cadence: "MONTHLY",
              pricing: { type: "STATIC", priceMoney: { amount: BigInt(monthlyPriceCents), currency: "USD" } },
            },
          ],
        },
      },
    ];

    if (annualPriceCents) {
      variations.push({
        type: "SUBSCRIPTION_PLAN_VARIATION",
        id: `#annual-${uuidv4()}`,
        presentAtAllLocations: true,
        subscriptionPlanVariationData: {
          name: "Annual",
          phases: [
            {
              cadence: "ANNUAL",
              pricing: { type: "STATIC", priceMoney: { amount: BigInt(annualPriceCents), currency: "USD" } },
            },
          ],
        },
      });
    }

    const { result } = await catalogApi.upsertCatalogObject({
      idempotencyKey: uuidv4(),
      object: {
        type: "SUBSCRIPTION_PLAN",
        id: `#plan-${uuidv4()}`,
        presentAtAllLocations: true,
        subscriptionPlanData: {
          name,
          subscriptionPlanVariations: variations,
        },
      },
    });

    return NextResponse.json({ success: true, planId: result.catalogObject?.id }, { status: 201 });
  } catch (error) {
    console.error("❌ Error creating plan:", error);
    return NextResponse.json({ error: "Failed to create plan." }, { status: 500 });
  }
}

// PUT: Update an existing plan's name, or restore a locally-hidden plan
export async function PUT(request) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId, name, version, restore } = await request.json();
    if (!planId) {
      return NextResponse.json({ error: "planId is required." }, { status: 400 });
    }

    if (restore) {
      await unsetHiddenPlanId(planId);
      return NextResponse.json({ success: true, restored: true }, { status: 200 });
    }

    if (!name) {
      return NextResponse.json({ error: "name is required." }, { status: 400 });
    }

    const { result: current } = await catalogApi.retrieveCatalogObject(planId);
    const existing = current.object;
    if (!existing) {
      return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    }

    const { result } = await catalogApi.upsertCatalogObject({
      idempotencyKey: uuidv4(),
      object: {
        ...existing,
        version: version || existing.version,
        subscriptionPlanData: {
          ...existing.subscriptionPlanData,
          name,
        },
      },
    });

    return NextResponse.json({ success: true, planId: result.catalogObject?.id }, { status: 200 });
  } catch (error) {
    console.error("❌ Error updating plan:", error);
    return NextResponse.json({ error: "Failed to update plan." }, { status: 500 });
  }
}

// DELETE: Cancel subscribers (optional) then delete from Square
export async function DELETE(request) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId, cancelSubscriptions } = await request.json();
    if (!planId) {
      return NextResponse.json({ error: "planId is required." }, { status: 400 });
    }

    // If requested, cancel all active subscriptions for this plan's variations
    let cancelledCount = 0;
    if (cancelSubscriptions) {
      // Retrieve the plan to get its variation IDs
      const { result: planResult } = await catalogApi.retrieveCatalogObject(planId, true);
      const variationIds = (planResult.object?.subscriptionPlanData?.subscriptionPlanVariations || [])
        .map(v => v.id)
        .filter(Boolean);

      if (variationIds.length) {
        // Search for active/paused subscriptions tied to these variations
        const { result: subResult } = await squareClient.subscriptionsApi.searchSubscriptions({
          query: {
            filter: {
              planVariationIds: variationIds,
              statuses: ["ACTIVE", "PAUSED"],
            },
          },
        });

        const subscriptions = subResult.subscriptions || [];
        await Promise.allSettled(
          subscriptions.map(s =>
            squareClient.subscriptionsApi.cancelSubscription(s.id)
              .then(() => { cancelledCount++; })
              .catch(err => console.warn(`⚠️ Could not cancel subscription ${s.id}:`, err?.message))
          )
        );
        console.log(`✅ Cancelled ${cancelledCount}/${subscriptions.length} subscriptions for plan ${planId}`);
      }
    }

    // Now delete the catalog object
    try {
      const { result } = await catalogApi.deleteCatalogObject(planId);
      if (result.errors?.length) {
        throw Object.assign(new Error(result.errors[0]?.detail), { errors: result.errors });
      }
      await unsetHiddenPlanId(planId);
      return NextResponse.json({ success: true, deleted: true, cancelledCount }, { status: 200 });
    } catch (squareErr) {
      // Still blocked — hide locally as fallback
      const reason = squareErr?.errors?.[0]?.detail || squareErr?.message || "Square rejected the delete.";
      console.warn("⚠️ Square blocked delete after cancellations, hiding locally:", reason);
      await setHiddenPlanId(planId);
      return NextResponse.json({
        success: true,
        hidden: true,
        cancelledCount,
        note: "Subscriptions cancelled but Square still blocked the plan delete. Plan hidden from member selection.",
      }, { status: 200 });
    }
  } catch (error) {
    console.error("❌ Error archiving plan:", error);
    return NextResponse.json({ error: "Failed to archive plan." }, { status: 500 });
  }
}
