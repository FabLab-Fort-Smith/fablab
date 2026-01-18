import { db } from "@/lib/database";

export default class BountyModel {
    static collectionName = "bounties";

    static async getCollection() {
        const database = await db.connect();
        return database.collection(this.collectionName);
    }

    static async createBounty(bounty) {
        const collection = await this.getCollection();
        const result = await collection.insertOne(bounty);
        return result.insertedId ? bounty : null;
    }

    static async getAllBounties(filter = {}, skip = 0, limit = 0) {
        const collection = await this.getCollection();
        let cursor = collection.find(filter).sort({ createdAt: -1 });
        
        if (skip > 0) cursor = cursor.skip(skip);
        if (limit > 0) cursor = cursor.limit(limit);
        
        return await cursor.toArray();
    }

    static async countBounties(filter = {}) {
        const collection = await this.getCollection();
        return await collection.countDocuments(filter);
    }

    static async getBountyById(bountyID) {
        const collection = await this.getCollection();
        return await collection.findOne({ bountyID });
    }

    static async updateBounty(bountyID, updateData) {
        const collection = await this.getCollection();
        const result = await collection.updateOne(
            { bountyID },
            { $set: { ...updateData, updatedAt: new Date() } }
        );
        return result.modifiedCount > 0;
    }

    static async deleteBounty(bountyID) {
        const collection = await this.getCollection();
        const result = await collection.deleteOne({ bountyID });
        return result.deletedCount > 0;
    }

    static async updateUserReferences(oldUserID, newUserID) {
        const collection = await this.getCollection();
        
        // 1. Update Creator
        await collection.updateMany({ creatorID: oldUserID }, { $set: { creatorID: newUserID } });
        
        // 2. Update AssignedTo
        await collection.updateMany({ assignedTo: oldUserID }, { $set: { assignedTo: newUserID } });
        
        // 3. Update Claims (Array of objects)
        await collection.updateMany(
            { "claims.userID": oldUserID },
            { $set: { "claims.$[elem].userID": newUserID } },
            { arrayFilters: [{ "elem.userID": oldUserID }] }
        );
        
        // 4. Update Submissions (Array of objects)
        await collection.updateMany(
            { "submissions.userID": oldUserID },
            { $set: { "submissions.$[elem].userID": newUserID } },
            { arrayFilters: [{ "elem.userID": oldUserID }] }
        );
    }

    static async countUserCompletedBounties(userID) {
        const collection = await this.getCollection();
        // Count bounties where user is assigned and status is verified
        // OR bounties where user has a verified claim (for infinite bounties)
        const count = await collection.countDocuments({
            $or: [
                { assignedTo: userID, status: 'verified' },
                { "claims": { $elemMatch: { userID: userID, status: 'verified' } } }
            ]
        });
        return count;
    }

    static async getTopBountyHunters(limit = 10) {
        const collection = await this.getCollection();
        const pipeline = [
            {
                $project: {
                    winners: {
                        $cond: {
                            if: { $eq: ["$isInfinite", true] },
                            then: {
                                $map: {
                                    input: { 
                                        $filter: { 
                                            input: { $ifNull: ["$claims", []] }, 
                                            as: "claim", 
                                            cond: { $eq: ["$$claim.status", "verified"] } 
                                        } 
                                    },
                                    as: "verifiedClaim",
                                    in: "$$verifiedClaim.userID"
                                }
                            },
                            else: {
                                $cond: {
                                    if: { $eq: ["$status", "verified"] },
                                    then: ["$assignedTo"],
                                    else: []
                                }
                            }
                        }
                    }
                }
            },
            { $unwind: "$winners" },
            {
                $group: {
                    _id: "$winners",
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: limit },
            // Lookup user details
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "userID",
                    as: "user"
                }
            },
            { $unwind: "$user" },
            {
                $project: {
                    userID: "$_id",
                    count: 1,
                    firstName: "$user.firstName",
                    lastName: "$user.lastName",
                    username: "$user.username",
                    image: "$user.image"
                }
            }
        ];
        return await collection.aggregate(pipeline).toArray();
    }

    static async addComment(bountyID, comment) {
        const collection = await this.getCollection();
        return await collection.updateOne(
            { bountyID },
            { $push: { comments: comment } }
        );
    }

    static async likeBounty(bountyID, userID) {
        const collection = await this.getCollection();
        return await collection.updateOne(
            { bountyID },
            { $addToSet: { likes: userID } }
        );
    }

    static async unlikeBounty(bountyID, userID) {
        const collection = await this.getCollection();
        return await collection.updateOne(
            { bountyID },
            { $pull: { likes: userID } }
        );
    }
}
