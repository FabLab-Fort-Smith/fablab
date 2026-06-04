
import { db } from "@/lib/database";
import { ObjectId } from "mongodb";

export default class AnnouncementModel {
    /**
     * Create a new announcement
     * @param {Object} announcement - The announcement object
     * @returns {Object} - The created announcement
     */
    static create = async (announcement) => {
        try {
            const collection = await db.dbAnnouncements();
            const result = await collection.insertOne(announcement);
            if (!result.insertedId) {
                throw new Error("Failed to insert announcement");
            }
            return { ...announcement, _id: result.insertedId };
        } catch (error) {
            console.error("Error creating announcement:", error);
            throw error;
        }
    }

    /**
     * Get all announcements
     * @param {Object} query - Filter query
     * @param {Object} options - Sort/Limit options
     * @returns {Array} - List of announcements
     */
    static getAll = async (query = {}, options = {}) => {
        try {
            const collection = await db.dbAnnouncements();
            return await collection.find(query, options).sort({ createdAt: -1 }).toArray();
        } catch (error) {
            console.error("Error fetching announcements:", error);
            throw error;
        }
    }

    /**
     * Get active announcements
     * @returns {Array} - List of active announcements
     */
    static getActive = async () => {
        try {
            const collection = await db.dbAnnouncements();
            const now = new Date();
            return await collection.find({
                isActive: true,
                $or: [
                    { expiresAt: null },
                    { expiresAt: { $gt: now } }
                ]
            }).sort({ createdAt: -1 }).toArray();
        } catch (error) {
            console.error("Error fetching active announcements:", error);
            throw error;
        }
    }

    /**
     * Get announcement by ID
     * @param {string} id - Announcement ID
     * @returns {Object|null}
     */
    static getById = async (id) => {
        try {
            const collection = await db.dbAnnouncements();
            return await collection.findOne({ _id: new ObjectId(id) });
        } catch (error) {
            console.error("Error fetching announcement by ID:", error);
            throw error;
        }
    }

    /**
     * Update announcement
     * @param {string} id - Announcement ID
     * @param {Object} updates - Fields to update
     * @returns {Object|null}
     */
    static update = async (id, updates) => {
        try {
            const collection = await db.dbAnnouncements();
            const result = await collection.findOneAndUpdate(
                { _id: new ObjectId(id) },
                { $set: { ...updates, updatedAt: new Date() } },
                { returnDocument: 'after' }
            );
            return result;
        } catch (error) {
            console.error("Error updating announcement:", error);
            throw error;
        }
    }

    /**
     * Delete announcement
     * @param {string} id - Announcement ID
     * @returns {boolean}
     */
    static delete = async (id) => {
        try {
            const collection = await db.dbAnnouncements();
            const result = await collection.deleteOne({ _id: new ObjectId(id) });
            return result.deletedCount > 0;
        } catch (error) {
            console.error("Error deleting announcement:", error);
            throw error;
        }
    }
}
