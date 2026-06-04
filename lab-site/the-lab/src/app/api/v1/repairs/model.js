import { db } from '@/lib/database';
import { v4 as uuidv4 } from 'uuid';

const getCollection = async () => {
    const instance = await db.connect();
    return instance.collection('repairs');
};

export default class RepairModel {
    static async createRepair(data) {
        const repairs = await getCollection();
        const doc = { ...data, repairID: `repair-${uuidv4()}`, status: 'pending', createdAt: new Date() };
        await repairs.insertOne(doc);
        return doc;
    }

    static async getAllRepairs(filter = {}, skip = 0, limit = 50) {
        const repairs = await getCollection();
        return repairs.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
    }

    static async updateRepair(repairID, update) {
        const repairs = await getCollection();
        const result = await repairs.findOneAndUpdate(
            { repairID },
            { $set: { ...update, updatedAt: new Date() } },
            { returnDocument: 'after' }
        );
        return result;
    }

    static async countRepairs(filter = {}) {
        const repairs = await getCollection();
        return repairs.countDocuments(filter);
    }
}
