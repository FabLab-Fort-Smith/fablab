import { db } from "@/lib/database";
import { ObjectId } from "mongodb";

export default class PortfolioModel {
    static collectionName = "portfolio";

    static async getCollection() {
        const database = await db.connect();
        return database.collection(this.collectionName);
    }

    static getQuery(id) {
        if (typeof id === 'string' && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id)) {
             return { $or: [{ id }, { _id: new ObjectId(id) }] };
        }
        return { id };
    }

    static async createItem(item) {
        const collection = await this.getCollection();
        const result = await collection.insertOne(item);
        return result.insertedId ? item : null;
    }

    static async getAllItems(filter = {}, limit = 20, skip = 0, sort = 'latest') {
        const collection = await this.getCollection();
        
        let sortStage = { $sort: { createdAt: -1 } };
        
        if (sort === 'trending') {
            sortStage = { 
                $sort: { 
                    likesCount: -1, 
                    createdAt: -1 
                } 
            };
        }

        const pipeline = [
            { $match: filter },
            {
                $addFields: {
                    likesCount: { $size: { $ifNull: ["$likes", []] } }
                }
            },
            sortStage,
            { $skip: skip },
            { $limit: limit },
            {
                $lookup: {
                    from: "users",
                    localField: "userID",
                    foreignField: "userID",
                    as: "user"
                }
            },
            { $unwind: "$user" },
            {
                $project: {
                    id: { $ifNull: ["$id", { $toString: "$_id" }] },
                    userID: 1,
                    title: 1,
                    description: 1,
                    imageUrls: 1,
                    createdAt: 1,
                    likes: 1,
                    "user.firstName": 1,
                    "user.lastName": 1,
                    "user.username": 1,
                    "user.image": 1,
                    comments: 1
                }
            }
        ];
        return await collection.aggregate(pipeline).toArray();
    }

    static async getItemById(id) {
        const collection = await this.getCollection();
        return await collection.findOne(this.getQuery(id));
    }

    static async addComment(id, comment) {
        const collection = await this.getCollection();
        return await collection.updateOne(
            this.getQuery(id),
            { $push: { comments: comment } }
        );
    }

    static async likeItem(id, userID) {
        const collection = await this.getCollection();
        // Add userID to likes array if not already present
        return await collection.updateOne(
            this.getQuery(id),
            { $addToSet: { likes: userID } }
        );
    }

    static async unlikeItem(id, userID) {
        const collection = await this.getCollection();
        // Remove userID from likes array
        return await collection.updateOne(
            this.getQuery(id),
            { $pull: { likes: userID } }
        );
    }
}
