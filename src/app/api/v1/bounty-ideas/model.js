import { db } from "@/lib/database";

export default class BountyIdeaModel {
    static collectionName = "bounty_ideas";

    static async getCollection() {
        const database = await db.connect();
        return database.collection(this.collectionName);
    }

    static async createIdea(idea) {
        const collection = await this.getCollection();
        const result = await collection.insertOne(idea);
        return result.insertedId ? idea : null;
    }

    static async getAllIdeas(filter = {}, skip = 0, limit = 0) {
        const collection = await this.getCollection();
        let cursor = collection.find(filter).sort({ createdAt: -1 });
        
        if (skip > 0) cursor = cursor.skip(skip);
        if (limit > 0) cursor = cursor.limit(limit);
        
        return await cursor.toArray();
    }

    static async getIdeaById(ideaID) {
        const collection = await this.getCollection();
        return await collection.findOne({ ideaID });
    }

    static async updateIdea(ideaID, updateData) {
        const collection = await this.getCollection();
        const result = await collection.updateOne(
            { ideaID },
            { $set: { ...updateData, updatedAt: new Date() } }
        );
        return result.modifiedCount > 0;
    }

    static async deleteIdea(ideaID) {
        const collection = await this.getCollection();
        const result = await collection.deleteOne({ ideaID });
        return result.deletedCount > 0;
    }
}