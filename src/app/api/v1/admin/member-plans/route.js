import { NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import { db } from "@/lib/database";
import squareClient from "@/lib/square";

async function requireAdmin() {
    const session = await auth();
    if (!session || session.user.role !== "admin") return null;
    return session;
}

// GET /api/v1/admin/member-plans?userID=...
// Returns all Square subscriptions for a member, enriched with plan/variation names.
export async function GET(request) {
    if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const userID = searchParams.get("userID");
    if (!userID) return NextResponse.json({ error: "userID required" }, { status: 400 });

    const usersCol = await db.dbUsers();
    const user = await usersCol.findOne({ userID });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const customerId = user.membership?.squareCustomerId || user.squareCustomerId || user.squareID;
    if (!customerId) return NextResponse.json({ subscriptions: [], customerId: null });

    // Fetch all subscriptions for this customer from Square
    let subs = [];
    try {
        const { result } = await squareClient.subscriptionsApi.searchSubscriptions({
            query: { filter: { customerIds: [customerId] } },
        });
        subs = result.subscriptions || [];
    } catch (err) {
        console.error("Square subscriptions fetch failed:", err?.message);
        return NextResponse.json({ error: "Failed to fetch from Square" }, { status: 502 });
    }

    // Enrich each subscription with plan/variation name from Square catalog
    const catalogCache = {};
    const enriched = await Promise.all(subs.map(async (s) => {
        let planName = null;
        let variationName = null;
        let price = null;

        try {
            const varId = s.planVariationId;
            if (varId) {
                if (!catalogCache[varId]) {
                    const { result: varR } = await squareClient.catalogApi.retrieveCatalogObject(varId);
                    catalogCache[varId] = varR.object;
                }
                const varObj = catalogCache[varId];
                variationName = varObj?.subscriptionPlanVariationData?.name || null;

                // Price from the first phase
                const phases = varObj?.subscriptionPlanVariationData?.phases || [];
                const firstPhase = phases[0];
                if (firstPhase?.pricing?.priceMoney?.amount) {
                    price = Number(firstPhase.pricing.priceMoney.amount) / 100;
                }

                const planId = varObj?.subscriptionPlanVariationData?.subscriptionPlanId;
                if (planId) {
                    if (!catalogCache[planId]) {
                        const { result: planR } = await squareClient.catalogApi.retrieveCatalogObject(planId);
                        catalogCache[planId] = planR.object;
                    }
                    planName = catalogCache[planId]?.subscriptionPlanData?.name || null;
                }
            }
        } catch { /* non-fatal — show sub without name */ }

        return {
            id: s.id,
            status: s.status,
            planName,
            variationName,
            price,
            startDate: s.startDate,
            canceledDate: s.canceledDate || null,
            chargedThroughDate: s.chargedThroughDate || null,
            pausedUntilDate: s.pausedUntilDate || null,
            planVariationId: s.planVariationId,
        };
    }));

    // Sort: ACTIVE/PENDING first, then by startDate desc
    const rank = { ACTIVE: 0, PENDING: 1, PAUSED: 2, PAST_DUE: 3, CANCELED: 4, DEACTIVATED: 5 };
    enriched.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || new Date(b.startDate || 0) - new Date(a.startDate || 0));

    return NextResponse.json({ subscriptions: enriched, customerId });
}
