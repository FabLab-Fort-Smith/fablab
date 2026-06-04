import NotificationModel from './model';
import Notification from './class';
import UserModel from '../users/model';
import DiscordService from '@/lib/discord';
import AuthService from '../../auth/[...nextauth]/service';
import { stripMongoOperators } from '@/lib/mongoSanitize';
import { 
    sendBountyNotificationEmail, 
    sendBountyClaimedEmail, 
    sendBountySubmittedEmail, 
    sendBountyVerifiedEmail,
    sendNudgeEmail,
    sendVolunteerHoursApprovedEmail,
    sendProfileCompletionEmail
} from '@/app/utils/email.util';

export default class NotificationService {
    static async create(data) {
        // SEC-19: strip any $-prefixed (Mongo operator) keys so a crafted body
        // (incl. nested metadata) can't inject operators into the stored doc.
        const { userID, type, title, message, link, metadata, emailType, emailData } = stripMongoOperators(data || {});
        if (!userID || !title || !message) {
            throw new Error("Missing required fields");
        }
        
        const notification = new Notification(userID, type, title, message, link, metadata);
        const result = await NotificationModel.createNotification(notification);

        // Fetch user for both Discord and Email checks
        let user;
        try {
            user = await UserModel.getUserByID(userID);
        } catch (error) {
            console.error("Failed to fetch user for notification:", error);
            return result; // Can't proceed without user
        }

        if (!user) return result;

        // 1. Send Discord DM if user has connected account and has opted in
        try {
            // Check if user has discordId AND notificationPreferences.discord is explicitly true (default false)
            const shouldSendDiscord = user.discordId && (user.notificationPreferences?.discord === true);
            
            if (shouldSendDiscord) {
                let discordContent = `**${title}**\n${message}`;
                // Ensure link is absolute if provided
                if (link) {
                    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://fablabfortsmith.org';
                    const fullLink = link.startsWith('http') ? link : `${baseUrl}${link.startsWith('/') ? '' : '/'}${link}`;
                    discordContent += `\n${fullLink}`;
                }
                
                await DiscordService.sendDirectMessage(user.discordId, discordContent);
            }
        } catch (error) {
            console.error("Failed to send Discord notification:", error);
            // Don't fail the request if Discord fails
        }

        // 2. Send Email if user has email and has opted in
        try {
            // Check if user has email AND notificationPreferences.email is explicitly true (default false)
            const shouldSendEmail = user.email && (user.notificationPreferences?.email === true);

            if (shouldSendEmail && emailType) {
                const decryptedEmail = AuthService.decryptEmail(user.email);
                
                if (decryptedEmail) {
                    switch (emailType) {
                        case 'bounty_new':
                            await sendBountyNotificationEmail(decryptedEmail, user.firstName || 'Member', emailData.bounty);
                            break;
                        case 'bounty_claimed':
                            await sendBountyClaimedEmail(decryptedEmail, emailData.creatorName, emailData.bounty, emailData.claimerName);
                            break;
                        case 'bounty_submitted':
                            await sendBountySubmittedEmail(decryptedEmail, emailData.creatorName, emailData.bounty, emailData.submitterName);
                            break;
                        case 'bounty_verified':
                            await sendBountyVerifiedEmail(decryptedEmail, user.firstName || 'Member', emailData.bounty);
                            break;
                        case 'nudge':
                            await sendNudgeEmail(decryptedEmail, user.firstName || 'Member', title, message, link, emailData.actionText);
                            break;
                        case 'volunteer_approved':
                            await sendVolunteerHoursApprovedEmail(decryptedEmail, user.firstName || 'Member', emailData.hours, emailData.description);
                            break;
                        case 'profile_completion':
                             await sendProfileCompletionEmail(decryptedEmail, user.firstName || 'Member', userID);
                            break;
                        default:
                            console.warn("Unknown email type:", emailType);
                    }
                    console.log(`📧 Email notification (${emailType}) sent to ${decryptedEmail}`);
                }
            }
        } catch (error) {
            console.error("Failed to send Email notification:", error);
        }

        return result;
    }

    static async getUserNotifications(userID) {
        return await NotificationModel.getNotificationsByUser(userID);
    }

    static async markRead(notificationID, userID) {
        return await NotificationModel.markAsRead(notificationID, userID);
    }

    static async markAllRead(userID) {
        return await NotificationModel.markAllAsRead(userID);
    }
}
