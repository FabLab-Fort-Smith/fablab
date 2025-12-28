// src/app/api/users/user.model.js
import { db } from "@/lib/database";


export default class UserModel {
    /**
     * ✅ Create a new user
     * @param {Object} user - The user object to create
     * @returns {Object|null} - The created user or null if failed
     */
    static createUser = async (user) => {
        try {
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
            const dbUsers = await db.dbUsers();
            return await dbUsers.findOne({ userID: userID });
        } catch (error) {
            console.error("Error getting user by ID:", error);
            return null;
        }
    }

    /**
     * ✅ Get a single user by any query parameter
     * @param {Object} query - Query object to search for a user
     * @returns {Object|null} - The found user or null if not found
     */
    static getUserByQuery = async (query) => {
        try {
            const dbUsers = await db.dbUsers();
            console.log("🔍 Searching user in the database with query:", query);

            const user = await dbUsers.findOne({
                $or: Object.keys(query).map(key => ({ [key]: { $regex: query[key], $options: "i" } }))
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
                    { "membership.status": { $in: ["active", "probation"] } },
                    { "membership.isWaived": true }
                ];
            }

            if (filters.role) {
                query.role = filters.role;
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

    static countUsers = async (filters = {}) => {
        try {
            const dbUsers = await db.dbUsers();
            const query = {};

            if (filters.isPublic) {
                query.isPublic = { $ne: false };
                query.$or = [
                    { "membership.status": { $in: ["active", "probation"] } },
                    { "membership.isWaived": true }
                ];
            }

            if (filters.role) {
                query.role = filters.role;
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
            console.log("🔄 Update data:", updateData);

            // Exclude the _id field from the updateData object
            const { _id, ...updateFields } = updateData;

            const dbUsers = await db.dbUsers();

            let filter;
            if (typeof query === 'object') {
                // Handle object query (e.g. { userID: '...' })
                filter = {
                    $or: Object.keys(query).map(key => ({ [key]: { $regex: query[key], $options: "i" } }))
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
            return null;
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
    }}
