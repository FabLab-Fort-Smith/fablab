import Bounty from "./class";
import BountyModel from "./model";
import UserModel from "../users/model";
import BadgeModel from "../badges/model";
import NotificationService from "../notifications/service";
import AuthService from "../../auth/[...nextauth]/service";
import { 
    sendBountyNotificationEmail, 
    sendBountyClaimedEmail, 
    sendBountySubmittedEmail, 
    sendBountyVerifiedEmail 
} from "../../../utils/email.util";
import DiscordService from "@/lib/discord";
import Constants from "@/lib/constants";
import { v4 as uuidv4 } from 'uuid';

export default class BountyService {
    static async createBounty(data) {
        // Calculate total stake: Base (50) + Additional
        const baseStake = 50;
        const additionalStake = Number(data.stakeValue) || 0;
        const totalStake = baseStake + additionalStake;

        // If additional stake is offered by a non-admin, deduct it from their account
        // Note: We need to fetch the user to check role and balance
        // For now, assuming the controller/frontend handles the role check or we trust the input?
        // Better to check here.
        
        if (additionalStake > 0) {
            const creator = await UserModel.getUserByID(data.creatorID);
            
            if (!creator) {
                throw new Error("Creator not found.");
            }

            if ((creator.stake || 0) < additionalStake) {
                throw new Error(`Insufficient stake. You have ${creator.stake || 0}, but tried to offer ${additionalStake} additional stake.`);
            }
            
            // Deduct stake
            await UserModel.updateUser(
                { userID: data.creatorID }, 
                { 
                    stake: (creator.stake || 0) - additionalStake,
                    $push: {
                        stakeHistory: {
                            amount: -additionalStake,
                            reason: `Bounty Creation Cost: ${data.title}`,
                            timestamp: new Date()
                        }
                    }
                }
            );
        }

        const bounty = new Bounty(
            data.title,
            data.description,
            data.creatorID,
            data.rewardType,
            data.rewardValue,
            totalStake, // Store the total value
            data.requirements,
            data.recurrence,
            data.startsAt,
            data.isInfinite,
            data.endsAt,
            data.imageUrl,
            data.badgeRewardID
        );
        
        const createdBounty = await BountyModel.createBounty(bounty);

        // Notify all active members (Awaiting to ensure execution in serverless env)
        try {
            console.log("🔔 Starting notification process for new bounty:", bounty.title);
            console.log("🔔 Creator ID:", data.creatorID);
            
            const activeMembers = await UserModel.getActiveMembers();
            console.log(`🔔 Found ${activeMembers.length} active members to notify.`);
            
            const notifications = [];
            
            for (const member of activeMembers) {
                // Don't notify the creator (Commented out for testing purposes)
                // if (member.userID === data.creatorID) {
                //     console.log(`🔔 Skipping notification for creator: ${member.userID}`);
                //     continue;
                // }

                // 1. In-app Notification
                notifications.push(NotificationService.create({
                    userID: member.userID,
                    type: 'info',
                    title: 'New Bounty Available',
                    message: `New bounty posted: ${bounty.title}`,
                    link: `/dashboard/bounties?highlight=${bounty.bountyID}`,
                    metadata: { bountyID: bounty.bountyID }
                }));

                // 2. Email Notification
                if (member.email) {
                    try {
                        const decryptedEmail = AuthService.decryptEmail(member.email);
                        if (decryptedEmail) {
                            console.log(`📧 Queuing email for ${decryptedEmail} (${member.firstName})`);
                            notifications.push(sendBountyNotificationEmail(decryptedEmail, member.firstName || 'Member', bounty));
                        } else {
                            console.warn(`⚠️ Could not decrypt email for user ${member.userID}`);
                        }
                    } catch (err) {
                        console.error(`❌ Error decrypting email for user ${member.userID}:`, err);
                    }
                } else {
                    console.warn(`⚠️ No email found for user ${member.userID}`);
                }
            }
            
            // 3. Discord Notification
            try {
                const BOUNTY_CHANNEL_ID = process.env.DISCORD_BOUNTY_CHANNEL_ID || '1351948796866854953';
                const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://the-lab.fablabfortsmith.org';
                const bountyUrl = `${baseUrl}/dashboard/bounties/${bounty.bountyID}`;
                
                // Fetch badge image if applicable
                let badgeImage = null;
                if (bounty.badgeRewardID) {
                    try {
                        const badge = await BadgeModel.getBadgeById(bounty.badgeRewardID);
                        if (badge && badge.imageUrl) {
                            badgeImage = badge.imageUrl;
                        }
                    } catch (e) {
                        console.error("Error fetching badge for Discord notification:", e);
                    }
                }

                const embed = {
                    title: `🆕 New Bounty: ${bounty.title}`,
                    description: bounty.description.length > 200 ? bounty.description.substring(0, 200) + '...' : bounty.description,
                    url: bountyUrl,
                    color: 0x4caf50, // Green
                    fields: [
                        { name: "Reward", value: `${bounty.rewardValue} ${bounty.rewardType}`, inline: true },
                        { name: "Stake", value: `${bounty.stakeValue} pts`, inline: true },
                        { name: "Type", value: bounty.isInfinite ? "Infinite (Multi-user)" : "Single Claim", inline: true }
                    ],
                    footer: { text: "FabLab Fort Smith • The Lab" },
                    timestamp: new Date().toISOString()
                };

                if (badgeImage) {
                    embed.thumbnail = { url: badgeImage };
                }
                
                // We don't await this to block the response, but we want to log if it fails
                DiscordService.sendChannelMessage(BOUNTY_CHANNEL_ID, {
                    embeds: [embed]
                }).then(() => console.log("✅ Discord notification sent."))
                  .catch(err => console.error("❌ Failed to send Discord notification:", err));

            } catch (discordErr) {
                console.error("❌ Error preparing Discord notification:", discordErr);
            }

            if (notifications.length === 0) {
                console.warn("⚠️ No notifications were queued. This usually means there are no OTHER active members besides the creator.");
            } else {
                await Promise.all(notifications);
                console.log(`✅ Successfully sent ${notifications.length} notifications.`);
            }
        } catch (error) {
            console.error("❌ Error sending new bounty notifications:", error);
        }

        return createdBounty;
    }

    static async getBounty(bountyID) {
        const bounty = await BountyModel.getBountyById(bountyID);
        if (!bounty) return null;

        // Enrich with usernames
        const allUsers = await UserModel.getAllUsers();
        const userMap = {};
        allUsers.forEach(u => {
            userMap[u.userID] = {
                username: u.username || u.firstName || "Unknown",
                image: u.image
            };
        });

        return {
            ...bounty,
            assignedToUsername: userMap[bounty.assignedTo]?.username || bounty.assignedTo,
            creatorUsername: userMap[bounty.creatorID]?.username || bounty.creatorID,
            creatorImage: userMap[bounty.creatorID]?.image,
            claims: bounty.claims ? bounty.claims.map(c => ({
                ...c,
                username: userMap[c.userID]?.username || c.userID
            })) : []
        };
    }

    static async getAllBounties(query = {}, page = 1, limit = 10) {
        const filter = {
            ...(query.status ? { status: query.status } : {}),
            ...(query.creatorID ? { creatorID: query.creatorID } : {}),
            $or: [
                { startsAt: { $exists: false } },
                { startsAt: { $lte: new Date() } }
            ]
        };

        const skip = (page - 1) * limit;
        const bounties = await BountyModel.getAllBounties(filter, skip, limit);
        const total = await BountyModel.countBounties(filter);

        // Enrich with usernames
        const allUsers = await UserModel.getAllUsers();
        const userMap = {};
        allUsers.forEach(u => {
            userMap[u.userID] = {
                username: u.username || u.firstName || "Unknown",
                image: u.image
            };
        });

        const enrichedBounties = bounties.map(b => ({
            ...b,
            assignedToUsername: userMap[b.assignedTo]?.username || b.assignedTo,
            creatorUsername: userMap[b.creatorID]?.username || b.creatorID,
            creatorImage: userMap[b.creatorID]?.image,
            claims: b.claims ? b.claims.map(c => ({
                ...c,
                username: userMap[c.userID]?.username || c.userID
            })) : []
        }));

        return { bounties: enrichedBounties, total, page, totalPages: Math.ceil(total / limit) };
    }

    static async getBountyById(bountyID) {
        return await BountyModel.getBountyById(bountyID);
    }

    static async assignBounty(bountyID, userID) {
        const bounty = await BountyModel.getBountyById(bountyID);
        if (!bounty) throw new Error("Bounty not found");

        // Infinite Bounty Logic
        if (bounty.isInfinite) {
            if (bounty.endsAt && new Date() > new Date(bounty.endsAt)) {
                throw new Error("This infinite bounty has expired.");
            }
            
            // Check if user already has an active claim
            const existingClaim = (bounty.claims || []).find(c => c.userID === userID && c.status === 'active');
            if (existingClaim) {
                throw new Error("You already have an active claim on this bounty.");
            }

            // Add new claim
            const newClaim = {
                claimID: uuidv4(),
                userID: userID,
                claimedAt: new Date(),
                status: 'active'
            };

            await BountyModel.updateBounty(bountyID, {
                claims: [...(bounty.claims || []), newClaim]
            });
        } else {
            // Standard Bounty Logic
            if (bounty.status !== 'open') throw new Error("Bounty is not open");

            await BountyModel.updateBounty(bountyID, {
                status: 'assigned',
                assignedTo: userID,
                assignedAt: new Date()
            });
        }

        // Fetch users for notifications
        const assignee = await UserModel.getUserByQuery({ userID: userID });
        const creator = bounty.creatorID ? await UserModel.getUserByQuery({ userID: bounty.creatorID }) : null;

        // 1. Notify Assignee (In-App)
        await NotificationService.create({
            userID: userID,
            type: 'success',
            title: 'Bounty Claimed',
            message: `You have successfully claimed the bounty: ${bounty.title}`,
            link: `/dashboard/bounties?highlight=${bountyID}`,
            metadata: { bountyID }
        });

        // 2. Notify Creator (In-App & Email)
        if (creator && creator.userID !== userID) {
            // In-App
            await NotificationService.create({
                userID: creator.userID,
                type: 'info',
                title: 'Bounty Claimed',
                message: `${assignee ? assignee.firstName : 'A user'} has claimed your bounty: ${bounty.title}`,
                link: `/dashboard/bounties?highlight=${bountyID}`,
                metadata: { bountyID, claimerID: userID }
            });

            // Email
            if (creator.email) {
                try {
                    const decryptedEmail = AuthService.decryptEmail(creator.email);
                    if (decryptedEmail) {
                        await sendBountyClaimedEmail(
                            decryptedEmail, 
                            creator.firstName || 'Member', 
                            bounty, 
                            assignee ? `${assignee.firstName} ${assignee.lastName}` : 'A member'
                        );
                    }
                } catch (err) {
                    console.error(`❌ Error sending bounty claimed email to creator ${creator.userID}:`, err);
                }
            }
        }

        return result;
    }

    static async submitBounty(bountyID, userID, submissionData) {
        const bounty = await BountyModel.getBountyById(bountyID);
        if (!bounty) throw new Error("Bounty not found");
        
        let result;

        if (bounty.isInfinite) {
            // Find active claim
            const claims = bounty.claims || [];
            const claimIndex = claims.findIndex(c => c.userID === userID && c.status === 'active');
            
            if (claimIndex === -1) {
                throw new Error("You don't have an active claim on this bounty.");
            }

            // Update claim
            claims[claimIndex].status = 'submitted';
            claims[claimIndex].submission = { ...submissionData, date: new Date() };

            result = await BountyModel.updateBounty(bountyID, { claims });
        } else {
            // Standard Logic
            if (bounty.status === 'assigned' && bounty.assignedTo !== userID) {
                throw new Error("This bounty is assigned to someone else.");
            }

            result = await BountyModel.updateBounty(bountyID, {
                status: 'completed', // Pending verification
                submissions: [...(bounty.submissions || []), { userID, ...submissionData, date: new Date() }]
            });
        }

        // Notify Creator
        if (bounty.creatorID && bounty.creatorID !== userID) {
            // Fetch users
            const submitter = await UserModel.getUserByQuery({ userID: userID });
            const creator = await UserModel.getUserByQuery({ userID: bounty.creatorID });

            // In-App
            await NotificationService.create({
                userID: bounty.creatorID,
                type: 'info',
                title: 'Bounty Submitted',
                message: `Work has been submitted for your bounty: ${bounty.title}`,
                link: `/dashboard/bounties?highlight=${bountyID}`,
                metadata: { bountyID, submitterID: userID }
            });

            // Email
            if (creator && creator.email) {
                try {
                    const decryptedEmail = AuthService.decryptEmail(creator.email);
                    if (decryptedEmail) {
                        await sendBountySubmittedEmail(
                            decryptedEmail,
                            creator.firstName || 'Member',
                            bounty,
                            submitter ? `${submitter.firstName} ${submitter.lastName}` : 'A member'
                        );
                    }
                } catch (err) {
                    console.error(`❌ Error sending bounty submitted email to creator ${creator.userID}:`, err);
                }
            }
        }

        return result;
    }

    static async verifyBounty(bountyID, verifierID, claimUserID = null) {
        const bounty = await BountyModel.getBountyById(bountyID);
        if (!bounty) throw new Error("Bounty not found");

        let assigneeID = null;

        if (bounty.isInfinite) {
            if (!claimUserID) throw new Error("Claim User ID is required for infinite bounties.");
            
            const claims = bounty.claims || [];
            const claimIndex = claims.findIndex(c => c.userID === claimUserID && c.status === 'submitted');
            
            if (claimIndex === -1) throw new Error("No submitted claim found for this user.");

            // Update claim
            claims[claimIndex].status = 'verified';
            claims[claimIndex].verifiedAt = new Date();
            claims[claimIndex].verifiedBy = verifierID;

            await BountyModel.updateBounty(bountyID, { claims });
            assigneeID = claimUserID;
        } else {
            if (bounty.status !== 'completed') throw new Error("Bounty is not pending verification");

            // 1. Update Bounty Status
            await BountyModel.updateBounty(bountyID, {
                status: 'verified',
                completedAt: new Date()
            });
            
            assigneeID = bounty.assignedTo || (bounty.submissions.length > 0 ? bounty.submissions[0].userID : null);
        }
        
        if (assigneeID) {
            const user = await UserModel.getUserByQuery({ userID: assigneeID });
            if (user) {
                const updates = {
                    stake: (user.stake || 0) + (bounty.stakeValue || 0),
                    $push: {
                        stakeHistory: {
                            amount: bounty.stakeValue || 0,
                            reason: `Bounty Completed: ${bounty.title}`,
                            timestamp: new Date()
                        }
                    }
                };

                // If reward is volunteer hours, log them
                if (bounty.rewardType === 'hours') {
                    const newLog = {
                        id: uuidv4(),
                        date: new Date().toISOString(),
                        hours: Number(bounty.rewardValue),
                        description: `Bounty Completed: ${bounty.title}`,
                        status: 'approved',
                        verifiedBy: verifierID
                    };
                    updates.membership = {
                        ...user.membership,
                        volunteerLog: [newLog, ...(user.membership.volunteerLog || [])]
                    };

                    // Check for Volunteer Star Badge (10+ Hours)
                    const totalHours = (updates.membership.volunteerLog || []).reduce((acc, log) => acc + (Number(log.hours) || 0), 0);
                    if (totalHours >= 10 && !user.badges?.includes(Constants.BADGES.VOLUNTEER_STAR.id)) {
                        updates.badges = [...(user.badges || []), Constants.BADGES.VOLUNTEER_STAR.id];
                        
                        // Fetch badge details from DB
                        let badgeName = Constants.BADGES.VOLUNTEER_STAR.name;
                        try {
                            const badge = await BadgeModel.getBadgeById(Constants.BADGES.VOLUNTEER_STAR.id);
                            if (badge) badgeName = badge.name;
                        } catch (e) { console.error("Error fetching badge details", e); }

                        // Notify about badge
                        await NotificationService.create({
                            userID: assigneeID,
                            type: 'success',
                            title: 'New Badge Earned!',
                            message: `You earned the "${badgeName}" badge for logging 10+ volunteer hours!`,
                            link: `/dashboard/${assigneeID}/profile`,
                            metadata: { badgeID: Constants.BADGES.VOLUNTEER_STAR.id }
                        });
                    }
                }

                // Check for Bounty Hunter Badge (5+ Bounties)
                // We need to count verified bounties for this user. 
                // Since we don't have a direct count in user object, we might need to query bounties or just increment a counter if we had one.
                // For now, let's query the bounties where assignedTo == userID AND status == verified
                // OR claims where userID == userID AND status == verified
                
                // This query might be expensive, so maybe we just check if they have 4 and this is the 5th?
                // Let's do a quick count query.
                const completedBountiesCount = await BountyModel.countUserCompletedBounties(assigneeID);
                // Add 1 for the current one (since it might not be in the count yet depending on when we updated status)
                // Actually we updated status above.
                
                if ((completedBountiesCount + 1) >= 5 && !user.badges?.includes(Constants.BADGES.BOUNTY_HUNTER.id)) {
                     updates.badges = [...(updates.badges || user.badges || []), Constants.BADGES.BOUNTY_HUNTER.id];
                     
                     // Fetch badge details from DB
                     let badgeName = Constants.BADGES.BOUNTY_HUNTER.name;
                     try {
                         const badge = await BadgeModel.getBadgeById(Constants.BADGES.BOUNTY_HUNTER.id);
                         if (badge) badgeName = badge.name;
                     } catch (e) { console.error("Error fetching badge details", e); }

                     // Notify about badge
                        await NotificationService.create({
                            userID: assigneeID,
                            type: 'success',
                            title: 'New Badge Earned!',
                            message: `You earned the "${badgeName}" badge for completing 5+ bounties!`,
                            link: `/dashboard/${assigneeID}/profile`,
                            metadata: { badgeID: Constants.BADGES.BOUNTY_HUNTER.id }
                        });
                }

                // Check for specific Bounty Badge Reward
                if (bounty.badgeRewardID) {
                    const badge = await BadgeModel.getBadgeById(bounty.badgeRewardID);
                    // Check if user already has it or if we already added it in updates
                    const currentBadges = updates.badges || user.badges || [];
                    if (badge && !currentBadges.includes(bounty.badgeRewardID)) {
                        updates.badges = [...currentBadges, bounty.badgeRewardID];
                        
                        // Notify about badge
                        await NotificationService.create({
                            userID: assigneeID,
                            type: 'success',
                            title: 'New Badge Earned!',
                            message: `You earned the "${badge.name}" badge for completing this bounty!`,
                            link: `/dashboard/${assigneeID}/profile`,
                            metadata: { badgeID: bounty.badgeRewardID }
                        });
                    }
                }

                await UserModel.updateUser({ userID: assigneeID }, updates);

                // Notify Assignee
                await NotificationService.create({
                    userID: assigneeID,
                    type: 'success',
                    title: 'Bounty Verified!',
                    message: `Your work on "${bounty.title}" has been verified. You received ${bounty.stakeValue} Stake and ${bounty.rewardValue} ${bounty.rewardType === 'hours' ? 'Hours' : ''}.`,
                    link: `/dashboard/bounties?highlight=${bountyID}`,
                    metadata: { bountyID }
                });

                // Email Assignee
                if (user.email) {
                    try {
                        const decryptedEmail = AuthService.decryptEmail(user.email);
                        if (decryptedEmail) {
                            await sendBountyVerifiedEmail(
                                decryptedEmail,
                                user.firstName || 'Member',
                                bounty
                            );
                        }
                    } catch (err) {
                        console.error(`❌ Error sending bounty verified email to assignee ${assigneeID}:`, err);
                    }
                }
            }
        }

        // Spawn next recurring bounty if applicable
        if (bounty.recurrence && bounty.recurrence !== 'none') {
            await this.spawnNextRecurringBounty(bounty);
        }

        return true;
    }

    static async spawnNextRecurringBounty(originalBounty) {
        let nextDate = new Date();
        
        if (originalBounty.recurrence === 'daily') {
            nextDate.setDate(nextDate.getDate() + 1);
            nextDate.setHours(0, 0, 0, 0);
        } else if (originalBounty.recurrence === 'weekly') {
            nextDate.setDate(nextDate.getDate() + 7);
            nextDate.setHours(0, 0, 0, 0);
        } else if (originalBounty.recurrence === 'monthly') {
            nextDate.setMonth(nextDate.getMonth() + 1);
            nextDate.setDate(1); 
            nextDate.setHours(0, 0, 0, 0);
        }

        const newBountyData = {
            title: originalBounty.title,
            description: originalBounty.description,
            creatorID: originalBounty.creatorID,
            rewardType: originalBounty.rewardType,
            rewardValue: originalBounty.rewardValue,
            stakeValue: Math.max(0, (originalBounty.stakeValue || 0) - 3), // Pass only additional stake
            requirements: originalBounty.requirements,
            recurrence: originalBounty.recurrence,
            startsAt: nextDate
        };

        await this.createBounty(newBountyData);
    }

    static async cancelBounty(bountyID, userID) {
        const bounty = await BountyModel.getBountyById(bountyID);
        if (!bounty) throw new Error("Bounty not found");
        
        // Check if user is creator OR admin
        const user = await UserModel.getUserByQuery({ userID });
        const isAdmin = user?.role === 'admin';
        
        if (bounty.creatorID !== userID && !isAdmin) {
            throw new Error("Only the creator or an admin can cancel this bounty");
        }

        return await BountyModel.updateBounty(bountyID, { status: 'cancelled' });
    }

    static async editBounty(bountyID, userID, updateData) {
        const bounty = await BountyModel.getBountyById(bountyID);
        if (!bounty) throw new Error("Bounty not found");

        // Check permissions
        const user = await UserModel.getUserByQuery({ userID });
        const isAdmin = user?.role === 'admin';

        if (bounty.creatorID !== userID && !isAdmin) {
            throw new Error("Only the creator or an admin can edit this bounty");
        }

        // Prevent editing if already completed/verified
        if (['completed', 'verified'].includes(bounty.status)) {
            throw new Error("Cannot edit a completed bounty");
        }

        return await BountyModel.updateBounty(bountyID, updateData);
    }

    static async clawbackBounty(bountyID, userID, claimUserID = null) {
        const bounty = await BountyModel.getBountyById(bountyID);
        if (!bounty) throw new Error("Bounty not found");

        // Check permissions
        const user = await UserModel.getUserByQuery({ userID });
        const isAdmin = user?.role === 'admin';

        if (bounty.creatorID !== userID && !isAdmin) {
            throw new Error("Only the creator or an admin can clawback this bounty");
        }

        if (bounty.isInfinite) {
            if (!claimUserID) throw new Error("Claim User ID is required to clawback an infinite bounty claim.");
            
            const claims = bounty.claims || [];
            const newClaims = claims.filter(c => c.userID !== claimUserID);
            
            if (newClaims.length === claims.length) {
                throw new Error("Claim not found for this user.");
            }

            return await BountyModel.updateBounty(bountyID, { claims: newClaims });
        } else {
            if (bounty.status !== 'assigned') {
                throw new Error("Bounty is not currently assigned");
            }

            return await BountyModel.updateBounty(bountyID, {
                status: 'open',
                assignedTo: null,
                assignedAt: null
            });
        }
    }

    static async toggleLike(bountyID, userID) {
        const bounty = await BountyModel.getBountyById(bountyID);
        if (!bounty) throw new Error("Bounty not found");

        if (bounty.likes && bounty.likes.includes(userID)) {
            await BountyModel.unlikeBounty(bountyID, userID);
            return { liked: false };
        } else {
            await BountyModel.likeBounty(bountyID, userID);

            // Notify creator
            if (bounty.creatorID !== userID) {
                try {
                    const liker = await UserModel.getUserByQuery({ userID });
                    const likerName = liker ? `${liker.firstName} ${liker.lastName}` : "Someone";

                    await NotificationService.create({
                        userID: bounty.creatorID,
                        type: 'info',
                        title: 'New Like',
                        message: `${likerName} liked your bounty "${bounty.title}"`,
                        link: `/dashboard/bounties?highlight=${bountyID}`,
                        metadata: { bountyID: bountyID, type: 'bounty_like' }
                    });
                } catch (error) {
                    console.error("Failed to send like notification:", error);
                }
            }

            return { liked: true };
        }
    }

    static async addComment(bountyID, userID, text) {
        const user = await UserModel.getUserByQuery({ userID });
        if (!user) throw new Error("User not found");

        const comment = {
            id: uuidv4(),
            userID,
            text,
            createdAt: new Date(),
            user: {
                firstName: user.firstName,
                lastName: user.lastName,
                image: user.image
            }
        };

        await BountyModel.addComment(bountyID, comment);

        // Notify creator
        try {
            const bounty = await BountyModel.getBountyById(bountyID);
            if (bounty && bounty.creatorID !== userID) {
                await NotificationService.create({
                    userID: bounty.creatorID,
                    type: 'info',
                    title: 'New Comment',
                    message: `${user.firstName} ${user.lastName} commented on your bounty "${bounty.title}"`,
                    link: `/dashboard/bounties?highlight=${bountyID}`,
                    metadata: { bountyID: bountyID, type: 'bounty_comment' }
                });
            }
        } catch (error) {
            console.error("Failed to send comment notification:", error);
        }

        return comment;
    }

    static async shareBounty(bountyID, senderID, recipientID) {
        const bounty = await BountyModel.getBountyById(bountyID);
        if (!bounty) throw new Error("Bounty not found");

        const sender = await UserModel.getUserByQuery({ userID: senderID });
        const recipient = await UserModel.getUserByQuery({ userID: recipientID });

        if (!sender || !recipient) throw new Error("User not found");

        // 1. Send In-App Notification
        await NotificationService.create({
            userID: recipientID,
            type: 'info',
            title: 'Bounty Shared',
            message: `${sender.firstName} shared a bounty with you: ${bounty.title}`,
            link: `/dashboard/bounties?highlight=${bountyID}`,
            metadata: { bountyID, senderID }
        });

        // 2. Send Discord DM (if recipient has linked Discord)
        if (recipient.discordId) {
            const message = `👋 **${sender.firstName}** thought you'd be interested in this bounty!\n\n**${bounty.title}**\n${bounty.description}\n\nCheck it out here: ${process.env.NEXT_PUBLIC_URL}/dashboard/bounties?highlight=${bountyID}`;
            await DiscordService.sendDirectMessage(recipient.discordId, message);
        }

        return { success: true };
    }
}
