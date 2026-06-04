import { db } from "@/lib/database";

export default class BadgeModel {
    static collectionName = "badges";

    static async getCollection() {
        const database = await db.connect();
        return database.collection(this.collectionName);
    }

    static async createBadge(badge) {
        const collection = await this.getCollection();
        // Ensure unique ID/slug
        const existing = await collection.findOne({ id: badge.id });
        if (existing) {
            throw new Error(`Badge with ID ${badge.id} already exists.`);
        }
        const result = await collection.insertOne({
            ...badge,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return result.insertedId ? badge : null;
    }

    static async getAllBadges(filter = {}) {
        const collection = await this.getCollection();
        return await collection.find(filter).toArray();
    }

    static async getBadgeById(id) {
        const collection = await this.getCollection();
        return await collection.findOne({ id });
    }

    static async updateBadge(id, updateData) {
        const collection = await this.getCollection();
        const result = await collection.updateOne(
            { id },
            { $set: { ...updateData, updatedAt: new Date() } }
        );
        return result.modifiedCount > 0;
    }

    static async deleteBadge(id) {
        const collection = await this.getCollection();
        const result = await collection.deleteOne({ id });
        return result.deletedCount > 0;
    }
}
