import { NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import squareClient from "@/lib/square";
import { v4 as uuidv4 } from "uuid";

const catalogApi = squareClient.catalogApi;

// GET: List all subscription plans from Square Catalog
export async function GET() {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { result } = await catalogApi.listCatalog(undefined, "SUBSCRIPTION_PLAN");
    const plans = (result.objects || []).map((plan) => ({
      id: plan.id,
      version: Number(plan.version),
      name: plan.subscriptionPlanData?.name || "Unnamed Plan",
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

// PUT: Update an existing plan's name
export async function PUT(request) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId, name, version } = await request.json();
    if (!planId || !name) {
      return NextResponse.json({ error: "planId and name are required." }, { status: 400 });
    }

    // Fetch current plan to preserve existing variations
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

// DELETE: Archive a plan from the Square Catalog
export async function DELETE(request) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await request.json();
    if (!planId) {
      return NextResponse.json({ error: "planId is required." }, { status: 400 });
    }

    await catalogApi.deleteCatalogObject(planId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("❌ Error deleting plan:", error);
    return NextResponse.json({ error: "Failed to delete plan." }, { status: 500 });
  }
}
