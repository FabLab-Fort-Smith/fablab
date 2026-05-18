import { NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import squareClient from "@/lib/square";
import { db } from "@/lib/database";
import UserService from "@/app/api/v1/users/service";

async function getAuthedUser(userID) {
    const session = await auth();
    if (!session) return null;
    if (session.user.userID !== userID && session.user.role !== "admin") return null;
    return session;
}

// GET /api/v1/memberships/subscription?userID=xxx
// Returns live subscription details from Square
export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const userID = searchParams.get("userID");
    if (!userID) return NextResponse.json({ error: "userID required." }, { status: 400 });
    if (!await getAuthedUser(userID)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const usersCol = await db.dbUsers();
    const user = await usersCol.findOne({ userID });
    const subId = user?.membership?.squareSubscriptionId;
    if (!subId) return NextResponse.json(null);

    try {
        const { result } = await squareClient.subscriptionsApi.retrieveSubscription(subId);
        const sub = result.subscription;
        if (!sub) return NextResponse.json(null);

        // Resolve plan + variation name
        let planName = user.membership?.planName || "";
        let variationName = user.membership?.variationName || "";
        let priceCents = null;
        let cadence = null;

        if (sub.planVariationId) {
            try {
                const { result: varR } = await squareClient.catalogApi.retrieveCatalogObject(sub.planVariationId);
                variationName = varR.object?.subscriptionPlanVariationData?.name || variationName;
                cadence = varR.object?.subscriptionPlanVariationData?.phases?.[0]?.cadence || null;
                const priceMoney = varR.object?.subscriptionPlanVariationData?.phases?.[0]?.recurringPriceMoney;
                if (priceMoney) priceCents = Number(priceMoney.amount);
                const parentId = varR.object?.subscriptionPlanVariationData?.subscriptionPlanId;
                if (parentId && !planName) {
                    const { result: planR } = await squareClient.catalogApi.retrieveCatalogObject(parentId);
                    planName = planR.object?.subscriptionPlanData?.name || "";
                }
            } catch { /* non-fatal */ }
        }

        return NextResponse.json({
            id: sub.id,
            status: sub.status,
            planName,
            variationName,
            cadence,
            priceCents,
            startDate: sub.startDate,
            chargedThroughDate: sub.chargedThroughDate,
            canceledDate: sub.canceledDate,
            pausedUntilDate: sub.pausedUntilDate,
        });
    } catch (err) {
        return NextResponse.json({ error: err?.errors?.[0]?.detail || "Failed to fetch subscription." }, { status: 500 });
    }
}

// PATCH /api/v1/memberships/subscription
// body: { userID, action: "cancel" | "pause" | "resume" }
export async function PATCH(req) {
    const { userID, action } = await req.json();
    if (!userID || !action) return NextResponse.json({ error: "userID and action required." }, { status: 400 });
    if (!await getAuthedUser(userID)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const usersCol = await db.dbUsers();
    const user = await usersCol.findOne({ userID });
    const subId = user?.membership?.squareSubscriptionId;
    if (!subId) return NextResponse.json({ error: "No active subscription found." }, { status: 400 });

    try {
        if (action === "cancel") {
            await squareClient.subscriptionsApi.cancelSubscription(subId);
            await UserService.updateUser(userID, {
                "membership.subscriptionStatus": "CANCELED",
                "membership.status": "suspended",
                "membership.accessKey.issued": false,
            });
            return NextResponse.json({ success: true, action: "canceled" });
        }

        if (action === "pause") {
            const { result } = await squareClient.subscriptionsApi.retrieveSubscription(subId);
            const chargedThrough = result.subscription?.chargedThroughDate;
            await squareClient.subscriptionsApi.pauseSubscription(subId, {
                pauseEffectiveDate: chargedThrough || new Date().toISOString().split("T")[0],
            });
            return NextResponse.json({ success: true, action: "paused" });
        }

        if (action === "resume") {
            await squareClient.subscriptionsApi.resumeSubscription(subId, {});
            await UserService.updateUser(userID, {
                "membership.subscriptionStatus": "ACTIVE",
                "membership.status": "active",
                "membership.accessKey.issued": true,
            });
            return NextResponse.json({ success: true, action: "resumed" });
        }

        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    } catch (err) {
        return NextResponse.json({ error: err?.errors?.[0]?.detail || "Action failed." }, { status: 500 });
    }
}
