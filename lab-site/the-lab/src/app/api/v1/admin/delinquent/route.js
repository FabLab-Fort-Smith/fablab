import { NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import { db } from "@/lib/database";
import { listPayments, searchSubscriptions } from "@/lib/square";
import AuthService from "@/app/api/auth/[...nextauth]/service";

async function requireAdmin() {
    const session = await auth();
    if (!session || session.user.role !== "admin") return null;
    return session;
}

// GET /api/v1/admin/delinquent
// Returns co-op members whose Square subscription payment is failing.
// Strategy:
//   1. Pre-fetch recent payments to find customers whose latest payment FAILED.
//   2. For each subscription member, flag as delinquent if:
//      - subscription status is CANCELED / DEACTIVATED / PAST_DUE, OR
//      - subscription is ACTIVE but the customer's most recent payment failed.
// Note: chargedThroughDate is set by Square at period start before payment is attempted,
// so it is NOT a reliable indicator of payment success.
export async function GET() {
    if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const usersCol = await db.dbUsers();

    // Pull every non-waived member that has a Square customer ID on record.
    // Customer ID may live at three different field locations depending on when the account was created.
    const candidates = await usersCol.find({
        $or: [
            { "membership.squareCustomerId": { $exists: true, $ne: null } },
            { squareCustomerId: { $exists: true, $ne: null } },
            { squareID: { $exists: true, $ne: null } },
        ],
        "membership.isWaived": { $ne: true },
    }).toArray();

    console.log(`🔍 Delinquent scan: ${candidates.length} candidates found`);
    if (candidates.length === 0) return NextResponse.json([]);

    // Pre-fetch recent payments (60 days) to detect failed billing attempts.
    // Square keeps subscription ACTIVE during retry windows — we must check payment history.
    const failedPayerIds = new Set();
    try {
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const pmtResult = await listPayments({ beginTime: sixtyDaysAgo.toISOString(), limit: 200 });
        const payments = pmtResult.payments || [];

        // For each customer, keep only their most recent payment
        const latestByCustomer = {};
        for (const p of payments) {
            if (!p.customerId) continue;
            if (!latestByCustomer[p.customerId] ||
                new Date(p.createdAt) > new Date(latestByCustomer[p.customerId].createdAt)) {
                latestByCustomer[p.customerId] = p;
            }
        }
        for (const [cid, p] of Object.entries(latestByCustomer)) {
            if (p.status === "FAILED") failedPayerIds.add(cid);
        }
        console.log(`💳 Recent payments scanned — ${failedPayerIds.size} customer(s) with latest payment FAILED`);
    } catch (err) {
        console.error("⚠️ Could not fetch recent payments for delinquency check:", err?.message);
    }

    // Check Square subscriptions in parallel (batch size 10 to avoid rate limits)
    const delinquent = [];
    const batchSize = 10;

    for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);

        await Promise.all(batch.map(async (member) => {
            try {
                const customerId = member.membership?.squareCustomerId || member.squareCustomerId || member.squareID;
                const result = await searchSubscriptions({
                    query: { filter: { customerIds: [customerId] } },
                });

                const subs = result.subscriptions || [];
                console.log(`  ${member.userID} (${member.firstName} ${member.lastName}) — ${subs.length} sub(s): ${subs.map(s => s.status).join(', ') || 'none'} | latestPaymentFailed: ${failedPayerIds.has(customerId)}`);
                if (subs.length === 0) return; // never had a subscription — skip

                // Good standing checks:
                //   PENDING = future start date (just enrolled, payment not yet due)
                //   PAUSED  = intentionally paused
                //   ACTIVE  = OK unless their most recent payment just failed (Square retrying)
                const inGoodStanding = subs.some(s => {
                    if (s.status === "PENDING" || s.status === "PAUSED") return true;
                    if (s.status === "ACTIVE") return !failedPayerIds.has(customerId);
                    return false; // CANCELED, DEACTIVATED, PAST_DUE
                });
                if (inGoodStanding) return;

                // Member is delinquent — pick the most recent subscription for details
                const latest = subs.sort((a, b) =>
                    new Date(b.startDate || 0) - new Date(a.startDate || 0)
                )[0];

                // Show PAST_DUE for ACTIVE subs whose payment is failing (more meaningful than ACTIVE)
                const displayStatus = latest.status === "ACTIVE" ? "PAST_DUE" : latest.status;

                delinquent.push({
                    userID: member.userID,
                    firstName: member.firstName,
                    lastName: member.lastName,
                    email: member.email ? (() => { try { return AuthService.decryptEmail(member.email); } catch { return member.email; } })() : null,
                    phoneNumber: member.phoneNumber ? (() => { try { return AuthService.decryptPhone(member.phoneNumber); } catch { return member.phoneNumber; } })() : null,
                    discordHandle: member.discordHandle || null,
                    role: member.role,
                    membership: {
                        status: member.membership?.status,
                        subscriptionStatus: displayStatus,
                        squareCustomerId: customerId,
                        squareSubscriptionId: member.membership?.squareSubscriptionId || latest.id,
                        lastPaymentDate: member.membership?.lastPaymentDate,
                        accessKey: member.membership?.accessKey,
                    },
                    squareSubscription: {
                        id: latest.id,
                        status: displayStatus,
                        squareStatus: latest.status, // actual Square status for reference
                        startDate: latest.startDate,
                        canceledDate: latest.canceledDate,
                        chargedThroughDate: latest.chargedThroughDate,
                    },
                });
            } catch (err) {
                console.error(`⚠️ Delinquent check failed for ${member.userID}:`, err?.message || err);
            }
        }));
    }

    // Sort: PAST_DUE first, then CANCELED, then DEACTIVATED
    const rank = { PAST_DUE: 0, CANCELED: 1, DEACTIVATED: 2 };
    delinquent.sort((a, b) =>
        (rank[a.squareSubscription.status] ?? 9) - (rank[b.squareSubscription.status] ?? 9)
    );

    return NextResponse.json(delinquent);
}
