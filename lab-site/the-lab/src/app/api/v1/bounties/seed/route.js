import { NextResponse } from 'next/server';
import BountyModel from '../model';
import BountyService from '../service';
import Constants from '@/lib/constants';
import { guardOperationalEndpoint } from '@/lib/adminGuard';

export async function POST(request) {
    try {
        // SEC-18: seeds bounties — admin-only (was login-only, any user).
        const blocked = await guardOperationalEndpoint();
        if (blocked) return blocked;

        const seedBounties = [
            {
                title: "Showcase Pioneer",
                description: "Post your first project to the Community Showcase. Share what you're working on!",
                creatorID: "system",
                rewardType: "custom",
                rewardValue: "Badge + 10 Stake",
                stakeValue: 10,
                requirements: ["Post a project in the Showcase tab"],
                recurrence: "none",
                isInfinite: true,
                badgeRewardID: Constants.BADGES.SHOWCASE_PIONEER.id
            },
            {
                title: "Community Voice",
                description: "Leave 3 constructive comments on other members' projects. Engage with the community!",
                creatorID: "system",
                rewardType: "custom",
                rewardValue: "Badge + 5 Stake",
                stakeValue: 5,
                requirements: ["Comment on 3 different projects"],
                recurrence: "none",
                isInfinite: true,
                badgeRewardID: Constants.BADGES.COMMUNITY_VOICE.id
            },
            {
                title: "Script Kiddie",
                description: "Find the first flag in the terminal game (Mission 1). Start your hacking journey.",
                creatorID: "system",
                rewardType: "custom",
                rewardValue: "Badge + 10 Stake",
                stakeValue: 10,
                requirements: ["Complete Mission 1 in the Terminal"],
                recurrence: "none",
                isInfinite: true,
                badgeRewardID: Constants.BADGES.SCRIPT_KIDDIE.id
            },
            {
                title: "System Admin",
                description: "Complete Mission 10: System Hardening. Secure the mainframe.",
                creatorID: "system",
                rewardType: "custom",
                rewardValue: "Badge + 250 Stake",
                stakeValue: 250,
                requirements: ["Complete Mission 10 in the Terminal"],
                recurrence: "none",
                isInfinite: true,
                badgeRewardID: Constants.BADGES.SYSTEM_ADMIN.id
            },
            {
                title: "Easter Egg Hunter",
                description: "Find the hidden developer secret in the terminal. Can you find the ghost in the machine?",
                creatorID: "system",
                rewardType: "custom",
                rewardValue: "Badge + 500 Stake",
                stakeValue: 500,
                requirements: ["Find the 'crittercodes' secret"],
                recurrence: "none",
                isInfinite: true,
                badgeRewardID: Constants.BADGES.EASTER_EGG_HUNTER.id
            }
        ];

        let createdCount = 0;
        let errors = [];

        for (const bountyData of seedBounties) {
            try {
                // Check if exists by title
                const existing = await BountyModel.getAllBounties({ title: bountyData.title });
                if (existing.length === 0) {
                    await BountyService.createBounty(bountyData);
                    createdCount++;
                }
            } catch (err) {
                errors.push(`Failed to create ${bountyData.title}: ${err.message}`);
            }
        }

        return NextResponse.json({ 
            message: `Seeding complete. Created ${createdCount} bounties.`,
            errors 
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
