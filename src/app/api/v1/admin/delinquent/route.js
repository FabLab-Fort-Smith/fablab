import { NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import { db } from "@/lib/database";
import squareClient from "@/lib/square";
import AuthService from "@/app/api/auth/[...nextauth]/service";

async function requireAdmin() {
    const session = await auth();
    if (!session || session.user.role !== "admin") return null;
    return session;
}

// GET /api/v1/admin/delinquent
// Returns co-op members whose Square subscription is lapsed.
// Queries Square directly — does not rely on stale DB fields.
// Delinquent = subscription CANCELED/DEACTIVATED/PAST_DUE, OR subscription is ACTIVE
// but chargedThroughDate is in the past (Square retrying failed payment).
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

    // Check Square in parallel (batch size 10 to avoid rate limits)
    const delinquent = [];
    const batchSize = 10;

    for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);

        await Promise.all(batch.map(async (member) => {
            try {
                const customerId = member.membership?.squareCustomerId || member.squareCustomerId || member.squareID;
                const { result } = await squareClient.subscriptionsApi.searchSubscriptions({
                    query: { filter: { customerIds: [customerId] } },
                });

                const subs = result.subscriptions || [];
                const today = new Date(); today.setHours(0, 0, 0, 0);
                console.log(`  ${member.userID} (${member.firstName} ${member.lastName}) — customerId: ${customerId} — ${subs.length} sub(s): ${subs.map(s => `${s.status}(thru:${s.chargedThroughDate || 'n/a'})`).join(', ') || 'none'}`);
                if (subs.length === 0) return; // never had a subscription — skip

                // Good standing: PENDING (future start) or PAUSED (intentionally paused), OR
                // ACTIVE with chargedThroughDate >= today (current billing cycle is paid).
                // ACTIVE with chargedThroughDate in the past = payment failing, Square retrying.
                const inGoodStanding = subs.some(s => {
                    if (s.status === "PENDING" || s.status === "PAUSED") return true;
                    if (s.status === "ACTIVE") {
                        if (!s.chargedThroughDate) return true; // no date info — assume ok
                        return new Date(s.chargedThroughDate) >= today;
                    }
                    return false; // CANCELED, DEACTIVATED, PAST_DUE
                });
                if (inGoodStanding) return;

                // Member is delinquent — pick the most recent subscription for details
                const latest = subs.sort((a, b) =>
                    new Date(b.startDate || 0) - new Date(a.startDate || 0)
                )[0];

                // Determine a useful display status
                const displayStatus = latest.status === "ACTIVE"
                    ? "PAST_DUE" // ACTIVE but chargedThroughDate lapsed = effectively past due
                    : latest.status;

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
