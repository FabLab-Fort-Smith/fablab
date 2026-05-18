import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import BadgeModel from '../../badges/model';

const S2_BADGES = [
    { id: 'boot_agent',          name: 'Boot Agent',           icon: '🔄', description: "Survived VECTOR's opening move and read the environment.",              stakeReward: 15,   type: 'system' },
    { id: 'noise_filter',        name: 'Noise Filter',         icon: '📡', description: 'Cut through 50,000 Syndicate log entries to find the signal.',           stakeReward: 25,   type: 'system' },
    { id: 'fragment_hunter',     name: 'Fragment Hunter',      icon: '🧩', description: 'Recovered shredded evidence from 100 fragments using loops and find.',    stakeReward: 25,   type: 'system' },
    { id: 'code_surgeon',        name: 'Code Surgeon',         icon: '🩺', description: 'Repaired three bash scripts sabotaged by VECTOR.',                       stakeReward: 50,   type: 'system' },
    { id: 'signal_breaker',      name: 'Signal Breaker',       icon: '📻', description: 'Decoded triple-encoded Syndicate transmissions.',                        stakeReward: 50,   type: 'system' },
    { id: 'ghost_hunter',        name: 'Ghost Hunter',         icon: '👁️', description: "Exposed VECTOR's hidden persistence layer through /proc.",               stakeReward: 75,   type: 'system' },
    { id: 'pattern_analyst',     name: 'Pattern Analyst',      icon: '🔍', description: 'Identified VECTOR as a fully autonomous system through data analysis.',   stakeReward: 75,   type: 'system' },
    { id: 'regex_operative',     name: 'Regex Operative',      icon: '🔐', description: 'Cracked Syndicate pattern encoding with advanced regex.',                 stakeReward: 100,  type: 'system' },
    { id: 'automation_engineer', name: 'Automation Engineer',  icon: '⚙️', description: "Built The Lab's professional-grade investigation toolkit.",               stakeReward: 150,  type: 'system' },
    { id: 'vector_slayer',       name: 'VECTOR Slayer',        icon: '🏆', description: 'Executed Operation Shutdown. VECTOR neutralized. The Lab stands.',        stakeReward: 500,  type: 'system' },
    { id: 'syndicate_buster',    name: 'Syndicate Buster',     icon: '🛡️', description: 'Completed all 10 Season 2 missions. The Syndicate falls.',               stakeReward: 1000, type: 'system' },
];

export async function POST() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let created = 0;
        let skipped = 0;
        const errors = [];

        for (const badge of S2_BADGES) {
            try {
                const existing = await BadgeModel.getBadgeById(badge.id);
                if (existing) {
                    skipped++;
                } else {
                    await BadgeModel.createBadge({ ...badge, imageUrl: null });
                    created++;
                }
            } catch (err) {
                errors.push(`${badge.id}: ${err.message}`);
            }
        }

        return NextResponse.json({
            message: `Season 2 badge seed complete. Created: ${created}, Skipped: ${skipped}.`,
            created,
            skipped,
            errors,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
