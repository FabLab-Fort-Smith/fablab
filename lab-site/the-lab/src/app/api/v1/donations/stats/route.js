import { NextResponse } from 'next/server';
import { searchOrders } from '@/lib/square';
import { db } from '@/lib/database';

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

const MONTHLY_GOAL_CENTS = 70000; // $700

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

export async function GET() {
    const [donationsCents, expenses] = await Promise.all([
        getDonationsTotalCents(),
        getMemberExpenses(),
    ]);

    const totalExpenseCents = expenses.reduce((s, e) => s + e.totalCents, 0);

    return NextResponse.json({
        goalCents: MONTHLY_GOAL_CENTS,
        donationsCents,
        expenses,
        totalExpenseCents,
        // Net = donations minus lab costs covered (or owed) by membership tiers
        netCents: donationsCents - totalExpenseCents,
        month: startOfCurrentMonth().toISOString(),
    });
}
