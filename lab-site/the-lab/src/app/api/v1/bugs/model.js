import { db } from "@/lib/database";

export default class BugModel {
    static collectionName = "bugs";

    static async getCollection() {
        const database = await db.connect();
        return database.collection(this.collectionName);
    }

    static async createBug(bug) {
        const collection = await this.getCollection();
        const result = await collection.insertOne(bug);
        return result.insertedId ? bug : null;
    }

    static async getAllBugs(filter = {}, skip = 0, limit = 0) {
        const collection = await this.getCollection();
        let cursor = collection.find(filter).sort({ createdAt: -1 });
        
        if (skip > 0) cursor = cursor.skip(skip);
        if (limit > 0) cursor = cursor.limit(limit);
        
        return await cursor.toArray();
    }

    static async getBugById(bugID) {
        const collection = await this.getCollection();
        return await collection.findOne({ bugID });
    }

    static async updateBug(bugID, updateData) {
        const collection = await this.getCollection();
        const result = await collection.updateOne(
            { bugID },
            { $set: { ...updateData, updatedAt: new Date() } }
        );
        return result.modifiedCount > 0;
    }
}
