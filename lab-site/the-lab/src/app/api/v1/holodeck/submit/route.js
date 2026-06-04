import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validateFlag, getMissionTotal } from '../flags';
import { db } from '@/lib/database';
import BadgeModel from '../../badges/model';
import DiscordService from '@/lib/discord';

// Season 2 mission → badge ID (badge records live in the DB, not constants)
const S2_MISSION_BADGES = {
    's2-mission-01': 'boot_agent',
    's2-mission-02': 'noise_filter',
    's2-mission-03': 'fragment_hunter',
    's2-mission-04': 'code_surgeon',
    's2-mission-05': 'signal_breaker',
    's2-mission-06': 'ghost_hunter',
    's2-mission-07': 'pattern_analyst',
    's2-mission-08': 'regex_operative',
    's2-mission-09': 'automation_engineer',
    's2-mission-10': 'vector_slayer',
};

const S2_COMPLETION_BADGE = 'syndicate_buster';
const S2_MISSION_IDS = Object.keys(S2_MISSION_BADGES);

export async function POST(req) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { missionID, flag } = await req.json();
        if (!missionID || !flag) {
            return NextResponse.json({ error: 'missionID and flag are required' }, { status: 400 });
        }

        const canonicalFlag = validateFlag(missionID, flag);
        if (!canonicalFlag) {
            return NextResponse.json({ correct: false, message: 'Incorrect flag. Keep trying.' });
        }

        const userID = session.user.userID;
        const database = await db.connect();
        const col = database.collection('holodeck_completions');

        // Upsert this specific flag (idempotent)
        await col.updateOne(
            { userID, missionID, flagValue: canonicalFlag },
            { $setOnInsert: { userID, missionID, flagValue: canonicalFlag, foundAt: new Date() } },
            { upsert: true }
        );

        const total = getMissionTotal(missionID);
        const found = await col.countDocuments({ userID, missionID });
        const missionComplete = found >= total;

        // ── Award badge on S2 mission completion ──
        let badgeAwarded = null;
        let stakeAwarded = 0;

        if (missionComplete && S2_MISSION_BADGES[missionID]) {
            const badgeId = S2_MISSION_BADGES[missionID];
            const badge = await BadgeModel.getBadgeById(badgeId);

            if (badge) {
                const dbUsers = await db.dbUsers();
                const user = await dbUsers.findOne({ userID });

                if (!user?.badges?.includes(badgeId)) {
                    stakeAwarded = badge.stakeReward || 0;

                    const updateOps = { $addToSet: { badges: badgeId } };
                    if (stakeAwarded > 0) {
                        updateOps.$inc = { stake: stakeAwarded };
                        updateOps.$push = {
                            stakeHistory: {
                                amount: stakeAwarded,
                                reason: `S2 mission complete: ${missionID}`,
                                timestamp: new Date(),
                            },
                        };
                    }
                    await dbUsers.updateOne({ userID }, updateOps);
                    badgeAwarded = { name: badge.name, icon: badge.icon || '' };

                    // Discord notification
                    try {
                        await DiscordService.sendHackTheLabNotification({
                            embeds: [{
                                title: '🏅 Badge Earned — Season 2',
                                description: `**${user.username || userID}** earned **${badge.name}**!`,
                                color: 0x00FFFF,
                                fields: [
                                    { name: 'Badge', value: `${badge.icon || ''} ${badge.description}`, inline: true },
                                    { name: 'Reward', value: `${stakeAwarded} Stake`, inline: true },
                                ],
                                footer: { text: 'The Lab Holodeck — Season 2' },
                                timestamp: new Date().toISOString(),
                            }],
                        });
                    } catch (err) {
                        console.error('Discord badge notification failed:', err);
                    }

                    // Check for Syndicate Buster (all 10 S2 missions done)
                    const completedS2 = await col.distinct('missionID', {
                        userID,
                        missionID: { $in: S2_MISSION_IDS },
                    });
                    const allS2Done = S2_MISSION_IDS.every(id => completedS2.includes(id));

                    if (allS2Done) {
                        const busterBadge = await BadgeModel.getBadgeById(S2_COMPLETION_BADGE);
                        if (busterBadge) {
                            const freshUser = await dbUsers.findOne({ userID });
                            if (!freshUser?.badges?.includes(S2_COMPLETION_BADGE)) {
                                const busterStake = busterBadge.stakeReward || 0;
                                await dbUsers.updateOne({ userID }, {
                                    $addToSet: { badges: S2_COMPLETION_BADGE },
                                    $inc: { stake: busterStake },
                                    $push: {
                                        stakeHistory: {
                                            amount: busterStake,
                                            reason: 'Season 2 complete: Syndicate Buster',
                                            timestamp: new Date(),
                                        },
                                    },
                                });

                                try {
                                    await DiscordService.sendHackTheLabNotification({
                                        embeds: [{
                                            title: '🛡️ SEASON 2 COMPLETE',
                                            description: `**${user.username || userID}** completed all 10 Season 2 missions and earned **${busterBadge.name}**!`,
                                            color: 0x00FFFF,
                                            fields: [
                                                { name: 'Badge', value: `${busterBadge.icon || ''} ${busterBadge.description}`, inline: true },
                                                { name: 'Reward', value: `${busterStake} Stake`, inline: true },
                                            ],
                                            footer: { text: 'The Lab Holodeck — Season 2' },
                                            timestamp: new Date().toISOString(),
                                        }],
                                    });
                                } catch (err) {
                                    console.error('Discord Syndicate Buster notification failed:', err);
                                }
                            }
                        }
                    }
                }
            }
        }

        return NextResponse.json({
            correct: true,
            flagValue: canonicalFlag,
            found,
            total,
            missionComplete,
            badgeAwarded,
            stakeAwarded,
            message: missionComplete
                ? `All ${total} flags found! Mission complete.`
                : `Flag accepted! ${found}/${total} flags found.`,
        });
    } catch (error) {
        console.error('Holodeck submit error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
