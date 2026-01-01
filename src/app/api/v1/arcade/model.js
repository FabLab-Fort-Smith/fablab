import { db } from "@/lib/database";
import { ObjectId } from "mongodb";

export default class ArcadeModel {
    static sessionsCollection = "arcade_sessions";
    static jackpotCollection = "arcade_jackpot";

    static async getSessionsCollection() {
        const database = await db.connect();
        return database.collection(this.sessionsCollection);
    }

    static async getJackpotCollection() {
        const database = await db.connect();
        return database.collection(this.jackpotCollection);
    }

    // --- Sessions ---

    static async createSession(sessionData) {
        const collection = await this.getSessionsCollection();
        const result = await collection.insertOne(sessionData);
        return result.insertedId ? { ...sessionData, _id: result.insertedId } : null;
    }

    static async getSessionById(sessionID) {
        const collection = await this.getSessionsCollection();
        return await collection.findOne({ _id: new ObjectId(sessionID) });
    }

    static async updateSession(sessionID, updateData) {
        const collection = await this.getSessionsCollection();
        const result = await collection.updateOne(
            { _id: new ObjectId(sessionID) },
            { $set: updateData }
        );
        return result.modifiedCount > 0;
    }

    static async getTopScores(game, limit = 10, startDate = null) {
        const collection = await this.getSessionsCollection();
        const query = { 
            game, 
            status: 'completed' 
        };

        if (startDate) {
            query.startedAt = { $gte: startDate };
        }

        return await collection.find(query)
        .sort({ score: -1 })
        .limit(limit)
        .toArray();
    }

    // --- Jackpot ---

    static async getCurrentJackpot() {
        const collection = await this.getJackpotCollection();
        // We assume a single document for the current week/period or a singleton
        // For simplicity, let's use a singleton ID 'current_jackpot' or query by status 'open'
        return await collection.findOne({ status: 'open' });
    }

    static async createJackpot(jackpotData) {
        const collection = await this.getJackpotCollection();
        const result = await collection.insertOne(jackpotData);
        return result.insertedId ? jackpotData : null;
    }

    static async addToJackpot(jackpotID, amount) {
        const collection = await this.getJackpotCollection();
        const result = await collection.updateOne(
            { _id: jackpotID },
            { $inc: { currentAmount: amount } }
        );
        return result.modifiedCount > 0;
    }

    static async fundJackpot(jackpotID, amount) {
        const collection = await this.getJackpotCollection();
        const result = await collection.updateOne(
            { _id: jackpotID },
            { $inc: { fundedAmount: amount } }
        );
        return result.modifiedCount > 0;
    }

    static async updateJackpot(jackpotID, updateData) {
        const collection = await this.getJackpotCollection();
        const result = await collection.updateOne(
            { _id: jackpotID },
            { $set: updateData }
        );
        return result.modifiedCount > 0;
    }
}
