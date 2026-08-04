import { NextResponse } from 'next/server';
import { searchOrders } from '@/lib/square';
import { db } from '@/lib/database';
import { auth } from '@/auth';
import { getDuesRevenue } from '../dues';
import { getGoalCents, setGoalCents } from '../goal';

export const dynamic = 'force-dynamic';

// ── Expense rules ─────────────────────────────────────────────────────────────
// Per-member monthly out-of-pocket costs for certain plan tiers.
// Match against membership.planName (case-insensitive).
const EXPENSE_RULES = [
    // HackerRat / LabRat basic tiers → $8/member/month
    {
        patterns: ['hackerrat plus', 'hackerrat', 'labrat plus', 'labrat'],
        // IMPORTANT: list more-specific patterns first so they don't get shadowed
        centsPerMember: 800,
        label: 'basic tier',
    },
    // HackerRat Premium tiers → $40/member/month
    {
        patterns: ['hackerrat premium plus', 'hackerrat premium', 'coderat premium plus', 'coderat premium'],
        centsPerMember: 4000,
        label: 'premium tier',
    },
];

// Goal is now admin-editable and read from config (see ./goal). The old hardcoded $700 is
// its fallback there.

// ── helpers ───────────────────────────────────────────────────────────────────

function startOfCurrentMonth() {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0));
}

/**
 * Sum donations this month by querying Square orders with line items
 * whose names contain "donation" (case-insensitive).
 */
async function getDonationsTotalCents() {
    try {
        const start = startOfCurrentMonth();
        const now = new Date();

        const result = await searchOrders({
            locationIds: [process.env.SQUARE_LOCATION_ID],
            query: {
                filter: {
                    dateTimeFilter: {
                        createdAt: {
                            startAt: start.toISOString(),
                            endAt: now.toISOString(),
                        },
                    },
                    stateFilter: { states: ['COMPLETED'] },
                },
            },
            limit: 500,
        });

        const orders = result.orders || [];
        let totalCents = 0;

        for (const order of orders) {
            const hasDonationItem = (order.lineItems || []).some(item =>
                (item.name || '').toLowerCase().includes('donation')
            );
            if (hasDonationItem) {
                totalCents += Number(order.totalMoney?.amount ?? 0);
            }
        }

        return totalCents;
    } catch (err) {
        console.error('Donation stats: Square orders query failed', err.message);
        return 0;
    }
}

/**
 * Count active members per expense rule by matching membership.planName.
 * Returns an array of { label, centsPerMember, count, totalCents }.
 */
async function getMemberExpenses() {
    try {
        const users = await db.dbUsers();
        const results = [];

        for (const rule of EXPENSE_RULES) {
            // Build a regex that matches any of the plan name patterns
            const regexStr = rule.patterns.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
            const regex = new RegExp(`^(${regexStr})$`, 'i');

            const count = await users.countDocuments({
                'membership.planName': { $regex: regex },
                'membership.subscriptionStatus': { $in: ['ACTIVE', 'PENDING'] },
            });

            results.push({
                label: rule.label,
                centsPerMember: rule.centsPerMember,
                count,
                totalCents: count * rule.centsPerMember,
            });
        }

        return results;
    } catch (err) {
        console.error('Donation stats: expense query failed', err.message);
        return [];
    }
}

// ── GET /api/v1/donations/stats ───────────────────────────────────────────────
//
// PUBLIC. The board kiosk fetches this unauthenticated, so the base response carries only
// aggregate, non-sensitive figures: the goal, dues + donations, and the combined total.
// The detailed breakdown (per-tier dues, lab expenses, net, member counts) reveals the
// org's income structure and is returned ONLY to an admin session.

export async function GET() {
    const session = await auth().catch(() => null);
    const isAdmin = session?.user?.role === 'admin';

    const [donationsCents, dues, goalCents, expenses] = await Promise.all([
        getDonationsTotalCents(),
        getDuesRevenue().catch((e) => {
            console.error('Funding stats: dues query failed', e?.message);
            return { duesCents: 0, activeCount: 0, byTier: [], unmatchedCount: 0 };
        }),
        getGoalCents(),
        isAdmin ? getMemberExpenses() : Promise.resolve(null),
    ]);

    const totalCents = dues.duesCents + donationsCents;

    // Public-safe aggregate — what the kiosk meter needs and nothing more.
    const body = {
        goalCents,
        duesCents: dues.duesCents,
        donationsCents,
        totalCents,
        pct: goalCents > 0 ? totalCents / goalCents : 0,
        month: startOfCurrentMonth().toISOString(),
    };

    // Admin-only detail.
    if (isAdmin) {
        const totalExpenseCents = expenses.reduce((s, e) => s + e.totalCents, 0);
        body.detail = {
            activeMemberCount: dues.activeCount,
            duesByTier: dues.byTier,
            duesUnmatchedCount: dues.unmatchedCount,
            expenses,
            totalExpenseCents,
            netCents: totalCents - totalExpenseCents,
        };
    }

    return NextResponse.json(body);
}

// ── PUT /api/v1/donations/stats ───────────────────────────────────────────────
// Admin-only: set the monthly funding goal (dollars in the body).

export async function PUT(request) {
    const session = await auth().catch(() => null);
    if (!session?.user?.userID) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let goalDollars;
    try {
        ({ goalDollars } = await request.json());
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const cents = Math.round(Number(goalDollars) * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0) {
        return NextResponse.json({ error: 'Goal must be a positive dollar amount.' }, { status: 400 });
    }

    try {
        const goalCents = await setGoalCents(cents);
        return NextResponse.json({ goalCents });
    } catch (e) {
        console.error('Funding goal update failed', e?.message);
        return NextResponse.json({ error: 'Could not update the goal.' }, { status: 500 });
    }
}
