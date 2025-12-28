import { NextResponse } from 'next/server';
import { db } from '@/lib/database';
import Constants from '@/lib/constants';
import DiscordService from '@/lib/discord';
import BadgeModel from '../../badges/model';

const FLAGS = {
    "flag{curiosity_killed_the_cat_but_satisfaction_brought_it_back}": {
        stake: 50,
        badge: Constants.BADGES.WHITE_HAT
    },
    "flag{welcome_to_the_lab}": {
        stake: 10,
        badge: Constants.BADGES.SCRIPT_KIDDIE
    },
    "flag{hack_the_planet}": {
        stake: 100,
        badge: Constants.BADGES.ELITE_HACKER,
        roleID: Constants.CREATOR_ROLE_MAPPING['Hacker']
    },
    "flag{protocol_override_initiated}": {
        stake: 250,
        badge: Constants.BADGES.SYSTEM_ADMIN
    },
    "flag{ache_building_legacy}": {
        stake: 25,
        badge: Constants.BADGES.HISTORIAN
    },
    "flag{shell_on_the_border_forever}": {
        stake: 25,
        badge: Constants.BADGES.PHREAKER
    },
    "flag{admin_access_granted}": {
        stake: 50,
        badge: Constants.BADGES.INSIDER
    },
    "flag{system_restoration_imminent}": {
        stake: 100,
        badge: Constants.BADGES.RECOVERY_SPECIALIST
    },
    "flag{internal_network_mapped}": {
        stake: 50,
        badge: Constants.BADGES.NETWORK_ENGINEER
    },
    "flag{follow_the_money_trail}": {
        stake: 75,
        badge: Constants.BADGES.FORENSIC_ACCOUNTANT
    },
    "flag{api_backdoor_discovered}": {
        stake: 75,
        badge: Constants.BADGES.WEB_EXPLOITER
    },
    "flag{logic_bomb_defused}": {
        stake: 100,
        badge: Constants.BADGES.BOMB_SQUAD
    },
    "flag{c2_server_identified}": {
        stake: 150,
        badge: Constants.BADGES.REVERSE_ENGINEER
    },
    "flag{system_hardened_ghost_busted}": {
        stake: 300,
        badge: Constants.BADGES.GHOST_BUSTER
    },
    "flag{devs_are_watching}": {
        stake: 500,
        badge: Constants.BADGES.EASTER_EGG_HUNTER
    }
};

export async function POST(request) {
    try {
        const body = await request.json();
        const userID = body.userID;
        // Trim the flag to avoid whitespace issues
        const flag = body.flag ? body.flag.trim() : null;

        if (!flag || !userID) {
            return NextResponse.json({ error: "Missing flag or userID" }, { status: 400 });
        }

        const flagData = FLAGS[flag];

        if (!flagData) {
            return NextResponse.json({ error: "Invalid flag" }, { status: 400 });
        }

        const dbUsers = await db.dbUsers();
        const user = await dbUsers.findOne({ userID: userID });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        if (user.capturedFlags && user.capturedFlags.includes(flag)) {
            return NextResponse.json({ error: "Flag already captured" }, { status: 400 });
        }

        const updateOps = {
            $push: { 
                capturedFlags: flag,
                stakeHistory: {
                    amount: flagData.stake,
                    reason: `Captured flag: ${flag}`,
                    timestamp: new Date()
                }
            },
            $inc: { stake: flagData.stake }
        };

        // Add Badge if applicable
        let badgeDetails = null;
        if (flagData.badge) {
            if (!updateOps.$addToSet) updateOps.$addToSet = {};
            updateOps.$addToSet.badges = flagData.badge.id;
            
            // Fetch from DB
            try {
                badgeDetails = await BadgeModel.getBadgeById(flagData.badge.id);
            } catch (err) {
                console.error("Failed to fetch badge details:", err);
            }
        }

        // Update user
        await dbUsers.updateOne(
            { userID: userID },
            updateOps
        );

        // --- Discord Notifications & Mission Checks ---
        let roleMessage = "";
        try {
            const username = user.username || "Unknown User";
            
            // 1. Notify for Badge
            if (flagData.badge) {
                const badgeName = badgeDetails ? badgeDetails.name : flagData.badge.name;
                const badgeIcon = badgeDetails ? (badgeDetails.icon || '🏅') : flagData.badge.icon;
                const badgeDesc = badgeDetails ? badgeDetails.description : flagData.badge.description;
                const badgeImage = badgeDetails ? badgeDetails.imageUrl : null;

                const embed = {
                    title: "🏅 Badge Earned!",
                    description: `**${username}** has earned the **${badgeName}** badge!`,
                    color: 0xFFD700, // Gold
                    fields: [
                        { name: "Badge", value: `${badgeIcon} ${badgeDesc}`, inline: true },
                        { name: "Reward", value: `${flagData.stake} Stake`, inline: true }
                    ],
                    footer: { text: "The Lab Terminal" },
                    timestamp: new Date().toISOString()
                };

                if (badgeImage) {
                    embed.thumbnail = { url: badgeImage };
                }

                await DiscordService.sendHackTheLabNotification({
                    embeds: [embed]
                });
            }

            // 2. Check for Mission Completion
            // Get updated list of captured flags
            const updatedUser = await dbUsers.findOne({ userID: userID });
            const userFlags = updatedUser.capturedFlags || [];

            // Find which mission this flag belongs to
            let completedMission = null;
            if (Constants.MISSIONS) {
                for (const [level, mission] of Object.entries(Constants.MISSIONS)) {
                    if (mission.flags && mission.flags.includes(flag)) {
                        // Check if all flags for this mission are captured
                        const allCaptured = mission.flags.every(f => userFlags.includes(f));
                        if (allCaptured) {
                            completedMission = { level, ...mission };
                        }
                        break;
                    }
                }
            }

            if (completedMission) {
                await DiscordService.sendHackTheLabNotification({
                    embeds: [{
                        title: "🚀 Mission Complete!",
                        description: `**${username}** has completed **Mission ${completedMission.level}: ${completedMission.name}**!`,
                        color: 0x00FF00, // Green
                        footer: { text: "The Lab Terminal" },
                        timestamp: new Date().toISOString()
                    }]
                });
            }

            // 3. Award Discord Role if applicable
            if (flagData.roleID && user.discordId) {
                await DiscordService.addRole(user.discordId, flagData.roleID);
                roleMessage = " & Discord Role Awarded!";
            }

        } catch (err) {
            console.error("Failed to process notifications:", err);
        }

        return NextResponse.json({ 
            message: `Flag captured!${roleMessage}`, 
            reward: flagData.stake,
            badge: flagData.badge ? flagData.badge.name : null,
            totalStake: (user.stake || 0) + flagData.stake
        });

    } catch (error) {
        console.error("Error submitting flag:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
