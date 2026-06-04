import { db } from "@/lib/database";

export default class NotificationModel {
    static createNotification = async (notification) => {
        try {
            const dbNotifications = await db.dbNotifications();
            const result = await dbNotifications.insertOne(notification);
            if (!result.insertedId) {
                throw new Error("Failed to insert notification.");
            }
            return notification;
        } catch (error) {
            console.error("Error creating notification:", error);
            throw error;
        }
    }

    static getNotificationsByUser = async (userID, limit = 20) => {
        try {
            const dbNotifications = await db.dbNotifications();
            return await dbNotifications.find({ userID })
                .sort({ createdAt: -1 })
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error("Error fetching notifications:", error);
            throw error;
        }
    }

    static markAsRead = async (notificationID, userID) => {
        try {
            const dbNotifications = await db.dbNotifications();
            const result = await dbNotifications.updateOne(
                { notificationID, userID },
                { $set: { read: true } }
            );
            return result.modifiedCount > 0;
        } catch (error) {
            console.error("Error marking notification as read:", error);
            throw error;
        }
    }

    static markAllAsRead = async (userID) => {
        try {
            const dbNotifications = await db.dbNotifications();
            const result = await dbNotifications.updateMany(
                { userID, read: false },
                { $set: { read: true } }
            );
            return result.modifiedCount;
        } catch (error) {
            console.error("Error marking all notifications as read:", error);
            throw error;
        }
    }
}
