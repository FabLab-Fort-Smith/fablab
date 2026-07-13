import { NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import {
  getSubscription, searchSubscriptions, cancelSubscription, pauseSubscription, resumeSubscription,
  getCatalogObject, getCustomer, searchCustomers,
} from "@/lib/square";
import { db } from "@/lib/database";
import UserService from "@/app/api/v1/users/service";
import { CORE_EVENTS } from "@/lib/plugins/hooks";
import { emitEvent } from "@/lib/plugins/registry";

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
        const result = await getSubscription(subId);
        const sub = result.subscription;
        if (!sub) return NextResponse.json(null);

        // Resolve plan + variation name
        let planName = user.membership?.planName || "";
        let variationName = user.membership?.variationName || "";
        let priceCents = null;
        let cadence = null;

        if (sub.planVariationId) {
            try {
                const varR = await getCatalogObject(sub.planVariationId);
                variationName = varR.object?.subscriptionPlanVariationData?.name || variationName;
                cadence = varR.object?.subscriptionPlanVariationData?.phases?.[0]?.cadence || null;
                const priceMoney = varR.object?.subscriptionPlanVariationData?.phases?.[0]?.recurringPriceMoney;
                if (priceMoney) priceCents = Number(priceMoney.amount);
                const parentId = varR.object?.subscriptionPlanVariationData?.subscriptionPlanId;
                if (parentId && !planName) {
                    const planR = await getCatalogObject(parentId);
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

// POST /api/v1/memberships/subscription — sync subscription from Square by squareCustomerId
export async function POST(req) {
    const { userID } = await req.json();
    if (!userID) return NextResponse.json({ error: "userID required." }, { status: 400 });
    if (!await getAuthedUser(userID)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const usersCol = await db.dbUsers();
    const user = await usersCol.findOne({ userID });

    // Collect all customer IDs to search — the subscription checkout may have
    // created a new Square customer instead of reusing the one we stored.
    const customerIds = new Set();
    if (user?.membership?.squareCustomerId) customerIds.add(user.membership.squareCustomerId);
    if (user?.squareCustomerId) customerIds.add(user.squareCustomerId);

    // Also search Square customers by this user's email — Square may have created
    // a new customer during subscription plan checkout. We only use this to find
    // Square customer IDs, never to update a different user record.
    if (user?.email) {
        try {
            // email is stored hashed — decode or search directly in Square by plain email
            // We store the plaintext email in the session but not in DB. Use Square's
            // customer search with the stored squareCustomerId's email as fallback.
            // Try fetching the stored customer's profile to get their email, then search.
            if (user.membership?.squareCustomerId || user.squareCustomerId) {
                const knownId = user.membership?.squareCustomerId || user.squareCustomerId;
                try {
                    const custR = await getCustomer(knownId);
                    const knownEmail = custR.customer?.emailAddress;
                    if (knownEmail) {
                        const searchR = await searchCustomers({
                            query: { filter: { emailAddress: { exact: knownEmail } } },
                        });
                        for (const c of (searchR.customers || [])) customerIds.add(c.id);
                    }
                } catch { /* non-fatal */ }
            }
        } catch { /* non-fatal */ }
    }

    if (customerIds.size === 0) return NextResponse.json({ error: "No Square customer ID on record." }, { status: 400 });

    try {
        const result = await searchSubscriptions({
            query: { filter: { customerIds: Array.from(customerIds) } },
        });
        const subs = result.subscriptions || [];
        const sub = subs.find(s => s.status === "ACTIVE") || subs[0] || null;
        if (!sub) return NextResponse.json({ error: "No Square subscription found for your account." }, { status: 404 });

        const updateData = {
            "membership.squareSubscriptionId": sub.id,
            "membership.squareCustomerId": sub.customerId,
            "membership.subscriptionStatus": sub.status,
            "membership.status": sub.status === "ACTIVE" ? "active" : "suspended",
            "membership.type": sub.status === "ACTIVE" ? "co-op" : undefined,
            "membership.accessKey.issued": sub.status === "ACTIVE",
        };

        if (sub.planVariationId) {
            try {
                const varR = await getCatalogObject(sub.planVariationId);
                updateData["membership.variationName"] = varR.object?.subscriptionPlanVariationData?.name || "";
                const parentId = varR.object?.subscriptionPlanVariationData?.subscriptionPlanId;
                if (parentId) {
                    const planR = await getCatalogObject(parentId);
                    updateData["membership.planName"] = planR.object?.subscriptionPlanData?.name || "";
                }
            } catch { /* non-fatal */ }
        }

        await UserService.updateUser(userID, updateData);
        if (sub.status !== "ACTIVE") {
            await emitEvent(CORE_EVENTS.MEMBERSHIP_SUSPENDED, { userID }).catch(() => {});
        }
        return NextResponse.json({ success: true, subscriptionId: sub.id, status: sub.status });
    } catch (err) {
        return NextResponse.json({ error: err?.errors?.[0]?.detail || "Sync failed." }, { status: 500 });
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
            await cancelSubscription(subId);
            await UserService.updateUser(userID, {
                "membership.subscriptionStatus": "CANCELED",
                "membership.status": "suspended",
                "membership.accessKey.issued": false,
            });
            await emitEvent(CORE_EVENTS.MEMBERSHIP_SUSPENDED, { userID }).catch(() => {});
            return NextResponse.json({ success: true, action: "canceled" });
        }

        if (action === "pause") {
            const result = await getSubscription(subId);
            const chargedThrough = result.subscription?.chargedThroughDate;
            await pauseSubscription(subId, {
                pauseEffectiveDate: chargedThrough || new Date().toISOString().split("T")[0],
            });
            return NextResponse.json({ success: true, action: "paused" });
        }

        if (action === "resume") {
            await resumeSubscription(subId, {});
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
