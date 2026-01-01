import NotificationModel from './model';
import Notification from './class';
import UserModel from '../users/model';
import DiscordService from '@/lib/discord';

export default class NotificationService {
    static async create(data) {
        const { userID, type, title, message, link, metadata } = data;
        if (!userID || !title || !message) {
            throw new Error("Missing required fields");
        }
        
        const notification = new Notification(userID, type, title, message, link, metadata);
        const result = await NotificationModel.createNotification(notification);

        // Send Discord DM if user has connected account and has opted in
        try {
            const user = await UserModel.getUserByID(userID);
            // Check if user has discordId AND notificationPreferences.discord is explicitly true (default false)
            const shouldSendDiscord = user && user.discordId && (user.notificationPreferences?.discord === true);
            
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
