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
// Returns co-op members whose Square subscription is not ACTIVE.
// Queries Square directly — does not rely on stale DB fields.
export async function GET() {
    if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const usersCol = await db.dbUsers();

    // Pull every non-waived member that has a Square customer ID on record.
    // Customer ID may live at membership.squareCustomerId OR top-level squareID (legacy field).
    const candidates = await usersCol.find({
        $or: [
            { "membership.squareCustomerId": { $exists: true, $ne: null } },
            { squareID: { $exists: true, $ne: null } },
        ],
        "membership.isWaived": { $ne: true },
    }).toArray();

    if (candidates.length === 0) return NextResponse.json([]);

    // Check Square in parallel (batch size 10 to avoid rate limits)
    const delinquent = [];
    const batchSize = 10;

    for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);

        await Promise.all(batch.map(async (member) => {
            try {
                const customerId = member.membership?.squareCustomerId || member.squareID;
                const { result } = await squareClient.subscriptionsApi.searchSubscriptions({
                    query: { filter: { customerIds: [customerId] } },
                });

                const subs = result.subscriptions || [];
                if (subs.length === 0) return; // never had a subscription — skip

                // ACTIVE = paying, PENDING = future start date (just converted), PAUSED = intentionally paused
                // All three are considered good standing.
                const IN_GOOD_STANDING = ["ACTIVE", "PENDING", "PAUSED"];
                const inGoodStanding = subs.some(s => IN_GOOD_STANDING.includes(s.status));
                if (inGoodStanding) return;

                // All subscriptions lapsed — this member is delinquent
                const latest = subs.sort((a, b) =>
                    new Date(b.startDate || 0) - new Date(a.startDate || 0)
                )[0];

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
                        subscriptionStatus: latest.status,
                        squareCustomerId: customerId,
                        squareSubscriptionId: member.membership?.squareSubscriptionId || latest.id,
                        lastPaymentDate: member.membership?.lastPaymentDate,
                        accessKey: member.membership?.accessKey,
                    },
                    squareSubscription: {
                        id: latest.id,
                        status: latest.status,
                        startDate: latest.startDate,
                        canceledDate: latest.canceledDate,
                        chargedThroughDate: latest.chargedThroughDate,
                    },
                });
            } catch {
                // Square API error for this member — skip silently
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
