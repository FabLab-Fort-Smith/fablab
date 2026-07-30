// src/app/api/users/user.model.js
import { db } from "@/lib/database";
import { escapeRegExp } from "@/lib/escapeRegExp";
import logger from "@/lib/logger";

// Helper to sanitize null bytes from strings
const sanitizeStrings = (obj) => {
    if (typeof obj === 'string') {
        return obj.replace(/\u0000/g, '');
    }
    if (Array.isArray(obj)) {
        return obj.map(sanitizeStrings);
    }
    if (typeof obj === 'object' && obj !== null && !(obj instanceof Date)) {
        const newObj = {};
        for (const key in obj) {
            newObj[key] = sanitizeStrings(obj[key]);
        }
        return newObj;
    }
    return obj;
};

export default class UserModel {
    /**
     * ✅ Create a new user
     * @param {Object} user - The user object to create
     * @returns {Object|null} - The created user or null if failed
     */
    static createUser = async (user) => {
        try {
            // Sanitize user data
            user = sanitizeStrings(user);
            
            const dbUsers = await db.dbUsers();
            const results = await dbUsers.insertOne(user);
            if (!results.insertedId) {
                throw new Error("Failed to insert user.");
            }
            return user;
        } catch (error) {
            console.error("Error creating user:", error);
            return new Response(
                JSON.stringify({ error: "Error creating user", details: error.message }),
                { status: 500 }
            );
        }
    }

    /**
     * ✅ Get a user by their exact User ID
     * @param {string} userID - The user ID to search for
     * @returns {Object|null} - The found user or null
     */
    static getUserByID = async (userID) => {
        try {
            userID = sanitizeStrings(userID);
            const dbUsers = await db.dbUsers();
            return await dbUsers.findOne({ userID: userID });
        } catch (error) {
            console.error("Error getting user by ID:", error);
            return null;
        }
    }

    /**
     * ✅ Get accounts that have a Google identity — candidates for the Google-OAuth
     * retirement campaign (docs/analysis/google-oauth-removal-impact.md §6).
     *
     * Returns candidates, NOT the final cohort: the caller narrows them with
     * authMethodsOf() (`@/lib/authMethods`) so the "googleOnly" rule lives in exactly
     * one place. Projected to the minimum fields needed to classify and contact
     * (PII minimisation — CLAUDE.md §3); `email` is still encrypted at rest here.
     *
     * Matches `provider:'google'` as well as a populated `googleId`, because `googleId`
     * is backfilled by the Google `profile()` callback on SIGN-IN (auth.js) — the members
     * who most need the notice are exactly the ones who have not signed in lately, and a
     * missed account loses access silently.
     *
     * **Throws on failure — deliberately.** Unlike the read helpers around it, this feeds
     * the retirement cutover gate ("drive googleOnly to 0"); returning an empty array on a
     * transient DB error would report a false all-clear and authorise locking those
     * members out. Fail closed (master §2).
     *
     * @returns {Promise<Array<Object>>} candidate users
     * @throws {Error} if the query fails — never reports an empty cohort on error
     */
    static getGoogleIdentityUsers = async () => {
        try {
            const dbUsers = await db.dbUsers();
            return await dbUsers.find(
                { $or: [{ googleId: { $nin: [null, ""] } }, { provider: "google" }] },
                { projection: { userID: 1, email: 1, firstName: 1, googleId: 1, discordId: 1, password: 1, provider: 1, googleRetirementNoticeSentAt: 1, _id: 0 } }
            ).toArray();
        } catch (error) {
            logger.error({ err: error }, "getGoogleIdentityUsers failed — refusing to report an empty cohort");
            throw error;
        }
    }

    /**
     * ✅ Get a single user by any query parameter
     * @param {Object} query - Query object to search for a user
     * @returns {Object|null} - The found user or null if not found
     */
    static getUserByQuery = async (query) => {
        try {
            query = sanitizeStrings(query);
            const dbUsers = await db.dbUsers();
            
            // Optimization: Prioritize exact match for userID
            if (query.userID) {
                console.log("🔍 Searching user by ID (optimized):", query.userID);
                // Use case-insensitive match to be robust against "User-..." vs "user-..."
                const user = await dbUsers.findOne({ 
                    userID: { $regex: new RegExp(`^${escapeRegExp(query.userID)}$`, "i") } 
                });
                
                if (user) {
                    console.log("✅ User found by ID:", user.userID);
                    return user;
                }
                // If userID was provided but no user found, returning null is correct.
                // We shouldn't fall back to loose regex search if a specific ID was requested.
                console.warn("⚠️ No user found for specific userID:", query.userID);
                return null;
            }

            console.log("🔍 Searching user in the database with query:", query);
            const user = await dbUsers.findOne({
                $or: Object.keys(query).map(key => ({ [key]: { $regex: `^${escapeRegExp(query[key])}$`, $options: "i" } }))
            });

            if (!user) {
                console.warn("⚠️ No user found in database for query:", query);
            } else {
                console.log("✅ User found in database:", user);
            }
            
            return user;
        } catch (error) {
            console.error("❌ Error retrieving user from database:", error);
            return null;
        }
    }

    /**
     * ✅ Get all users
     * @param {Object} filters - Filter criteria
     * @param {number} skip - Number of records to skip
     * @param {number} limit - Number of records to return
     * @returns {Array} - Array of all users
     */
    static getAllUsers = async (filters = {}, skip = 0, limit = 0) => {
        try {
            const dbUsers = await db.dbUsers();
            const query = {};

            if (filters.isPublic) {
                query.isPublic = { $ne: false };
                query.$or = [
                    { "membership.status": { $in: ["active", "probation", "onboarding", "applicant"] } },
                    { "membership.isWaived": true },
                    { "membership.subscriptionStatus": "ACTIVE" }
                ];
            }

            if (filters.role) {
                query.role = filters.role;
            }

            if (filters.search) {
                const re = { $regex: escapeRegExp(filters.search), $options: "i" };
                const searchOr = [
                    { firstName: re }, { lastName: re }, { email: re }, { username: re },
                ];
                query.$and = [...(query.$and || []), { $or: searchOr }];
            }

            if (filters.memberType === 'coop') {
                query.$and = [...(query.$and || []), { $or: [
                    { "membership.subscriptionStatus": { $in: ["ACTIVE", "PENDING"] } },
                    { "membership.isWaived": true },
                ]}];
            } else if (filters.memberType === 'community') {
                query["membership.subscriptionStatus"] = { $nin: ["ACTIVE", "PENDING"] };
                query["membership.isWaived"] = { $ne: true };
            } else if (filters.memberType === 'delinquent') {
                // Co-op members (active subscription holders) whose Square sub is lapsed
                query["membership.type"] = "co-op";
                query["membership.squareSubscriptionId"] = { $exists: true, $ne: null };
                query["membership.subscriptionStatus"] = { $in: ["CANCELED", "DEACTIVATED", "PAST_DUE"] };
                query["membership.isWaived"] = { $ne: true };
            }

            let cursor = dbUsers.find(query);
            if (skip > 0) cursor = cursor.skip(skip);
            if (limit > 0) cursor = cursor.limit(limit);
            
            const users = await cursor.toArray();
            return users;
        } catch (error) {
            console.error("Error retrieving all users:", error);
            return [];
        }
    }

    /**
     * ✅ Get top stake holders
     * @param {number} limit - Number of users to return
     * @returns {Array} - Array of users sorted by stake
     */
    static getTopStakeHolders = async (limit = 10) => {
        try {
            const dbUsers = await db.dbUsers();
            return await dbUsers.find({ stake: { $gt: 0 } })
                .sort({ stake: -1 })
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error("Error retrieving top stake holders:", error);
            return [];
        }
    }

    static countUsers = async (filters = {}) => {
        try {
            const dbUsers = await db.dbUsers();
            const query = {};

            if (filters.isPublic) {
                query.isPublic = { $ne: false };
                query.$or = [
                    { "membership.status": { $in: ["active", "probation", "onboarding", "applicant"] } },
                    { "membership.isWaived": true },
                    { "membership.subscriptionStatus": "ACTIVE" }
                ];
            }

            if (filters.role) {
                query.role = filters.role;
            }

            if (filters.search) {
                const re = { $regex: escapeRegExp(filters.search), $options: "i" };
                const searchOr = [
                    { firstName: re }, { lastName: re }, { email: re }, { username: re },
                ];
                query.$and = [...(query.$and || []), { $or: searchOr }];
            }

            if (filters.memberType === 'coop') {
                query.$and = [...(query.$and || []), { $or: [
                    { "membership.subscriptionStatus": { $in: ["ACTIVE", "PENDING"] } },
                    { "membership.isWaived": true },
                ]}];
            } else if (filters.memberType === 'community') {
                query["membership.subscriptionStatus"] = { $nin: ["ACTIVE", "PENDING"] };
                query["membership.isWaived"] = { $ne: true };
            } else if (filters.memberType === 'delinquent') {
                query["membership.type"] = "co-op";
                query["membership.squareSubscriptionId"] = { $exists: true, $ne: null };
                query["membership.subscriptionStatus"] = { $in: ["CANCELED", "DEACTIVATED", "PAST_DUE"] };
                query["membership.isWaived"] = { $ne: true };
            }

            return await dbUsers.countDocuments(query);
        } catch (error) {
            console.error("Error counting users:", error);
            return 0;
        }
    }

    /**
     * ✅ Get all active members (active or probation)
     * @returns {Array} - Array of active users
     */
    static getActiveMembers = async () => {
        try {
            const dbUsers = await db.dbUsers();
            const users = await dbUsers.find({
                "membership.status": { $in: ["active", "probation"] }
            }).toArray();
            return users;
        } catch (error) {
            console.error("Error retrieving active members:", error);
            return [];
        }
    }

    /**
     * ✅ Update a user's data
     * @param {Object} query - Query to find the user
     * @param {Object} updateData - Data to update
     * @returns {Object|null} - Updated user data or null if failed
     */
    static updateUser = async (query, updateData) => {
        try {
            console.log("🔄 Updating user with query:", query);
            
            // Sanitize updateData and query
            updateData = sanitizeStrings(updateData);
            query = sanitizeStrings(query);
            console.log("🔄 Update data (sanitized):", updateData);

            // Exclude the _id field from the updateData object
            const { _id, ...updateFields } = updateData;

            const dbUsers = await db.dbUsers();

            let filter;
            if (typeof query === 'object') {
                // Handle object query (e.g. { userID: '...' })
                filter = {
                    $or: Object.keys(query).map(key => ({ [key]: { $regex: `^${escapeRegExp(query[key])}$`, $options: "i" } }))
                };
            } else {
                // Handle string query (search across multiple fields)
                filter = {
                    $or: [
                        { firstName: { $regex: query, $options: "i" } },
                        { lastName: { $regex: query, $options: "i" } },
                        { email: { $regex: query, $options: "i" } },
                        { phoneNumber: { $regex: query, $options: "i" } },
                        { userID: { $regex: query, $options: "i" } }
                    ]
                };
            }

            // Construct update operation to support both $set and other operators (like $push)
            const updateOp = {};
            const setFields = {};

            Object.keys(updateFields).forEach(key => {
                if (key.startsWith('$')) {
                    updateOp[key] = updateFields[key];
                } else {
                    setFields[key] = updateFields[key];
                }
            });

            if (Object.keys(setFields).length > 0) {
                updateOp.$set = { ...(updateOp.$set || {}), ...setFields };
            }

            const result = await dbUsers.updateOne(filter, updateOp);

            if (result.matchedCount === 0) {
                throw new Error("No user found to update.");
            }

            const updatedUser = await dbUsers.findOne(filter);
            return updatedUser;
        } catch (error) {
            console.error("Error updating user:", error);
            throw error;
        }
    }

    /**
     * ✅ Delete a user
     * @param {Object} query - Query to find the user
     * @returns {Boolean} - True if deletion was successful, false otherwise
     */
    static deleteUser = async (query) => {
        try {
            const dbUsers = await db.dbUsers();
            const result = await dbUsers.deleteOne(query);
            return result.deletedCount > 0;
        } catch (error) {
            console.error("Error deleting user:", error);
            return false;
        }
    }
    static async getTopStake(limit = 10) {
        try {
            const dbUsers = await db.dbUsers();
            return await dbUsers.find({ stake: { $gt: 0 } })
                .sort({ stake: -1 })
                .limit(limit)
                .project({ firstName: 1, lastName: 1, username: 1, image: 1, stake: 1, userID: 1 })
                .toArray();
        } catch (error) {
            console.error("Error getting top stake:", error);
            return [];
        }
    }

    static async getTopVolunteerHours(limit = 10) {
        try {
            const dbUsers = await db.dbUsers();
            const pipeline = [
                { $unwind: "$membership.volunteerLog" },
                { 
                    $match: { 
                        $or: [
                            { "membership.volunteerLog.status": "approved" },
                            { "membership.volunteerLog.status": { $exists: false } },
                            { "membership.volunteerLog.status": null }
                        ]
                    } 
                },
                {
                    $group: {
                        _id: "$userID",
                        firstName: { $first: "$firstName" },
                        lastName: { $first: "$lastName" },
                        image: { $first: "$image" },
                        username: { $first: "$username" },
                        totalHours: { $sum: { $toDouble: "$membership.volunteerLog.hours" } }
                    }
                },
                { $sort: { totalHours: -1 } },
                { $limit: limit }
            ];
            return await dbUsers.aggregate(pipeline).toArray();
        } catch (error) {
            console.error("Error getting top volunteer hours:", error);
            return [];
        }
    }

    static async removeBadgeFromAll(badgeID) {
        try {
            const dbUsers = await db.dbUsers();
            const result = await dbUsers.updateMany(
                { "badges.id": badgeID },
                { $pull: { badges: { id: badgeID } } }
            );
            return result.modifiedCount;
        } catch (error) {
            console.error("Error removing badge from all users:", error);
            return 0;
        }
    }

    static async getUsersByBadge(badgeID) {
        try {
            const dbUsers = await db.dbUsers();
            return await dbUsers.find({ "badges.id": badgeID }).toArray();
        } catch (error) {
            console.error("Error getting users by badge:", error);
            return [];
        }
    }
}
