// src/app/api/auth/auth.model.js
import { db } from '@/lib/database'; 
import crypto from 'crypto';

export default class UserModel {
    /**
     * ✅ Find user by email
     * @param {string} email
     * @returns {Object | null} - User object or null if not found
     */
    static async findByEmail(email) {
        const dbInstance = await db.connect();
        return await dbInstance.collection("users").findOne({ email });
    }

    /**
     * ✅ Find user by ID
     * @param {string} userID
     * @returns {Object | null}
     */
    static async findById(userID) {
        const dbInstance = await db.connect();
        return await dbInstance.collection("users").findOne({ userID });
    }

    /**
     * ✅ Find user by verification token
     * @param {string} token
     * @returns {Object | null}
     */
    static async findByVerificationToken(token) {
        const dbInstance = await db.connect();
        return await dbInstance.collection("users").findOne({ verificationToken: token });
    }

    /**
     * ✅ Find user by username
     * @param {string} username
     * @returns {Object | null} - User object or null if not found
     */
    static async findByUsername(username) {
        const dbInstance = await db.connect();
        return await dbInstance.collection("users").findOne({ username });
    }

    /**
     * ✅ Create a new user
     * @param {Object} userData - User object data
     * @returns {Object} - The created user object
     */
    static async create(userData) {
        const dbInstance = await db.connect();


        await dbInstance.collection("users").insertOne(userData);
        return userData;
    }

    /**
     * ✅ Update user by ID with error handling
     * @param {string} userID
     * @param {Object} updateData
     * @returns {boolean} - Whether the update was successful
     */
    static updateById = async (userID, updateData) => {
        const dbInstance = await db.connect();
        
        const { _id, ...rest } = updateData;
        const updateOp = {};
        const setFields = { updatedAt: new Date() };
        
        Object.keys(rest).forEach(key => {
            if (key.startsWith('$')) {
                updateOp[key] = rest[key];
            } else {
                setFields[key] = rest[key];
            }
        });
        
        if (Object.keys(setFields).length > 0) {
            updateOp.$set = { ...(updateOp.$set || {}), ...setFields };
        }

        const result = await dbInstance.collection("users").updateOne(
            { userID },
            updateOp
        );

        if (result.matchedCount === 0) {
            throw new Error("User not found.");
        }

        return result.modifiedCount > 0;
    }

    /**
     * ✅ Delete user by ID
     * @param {string} userID
     * @returns {boolean} - Whether the deletion was successful
     */
    static async deleteById(userID) {
        const dbInstance = await db.connect();
        const result = await dbInstance.collection("users").deleteOne({ userID });
        return result.deletedCount > 0;
    }

    /**
     * ✅ Save user object (full object update)
     * @param {Object} user
     * @returns {boolean} - If the update was successful
     */
    static async save(user) {
        return await this.updateById(user.userID, user);
    }

    /**
     * ✅ Check if the email already exists
     * @param {string} email
     * @returns {boolean}
     */
    static async emailExists(email) {
        const dbInstance = await db.connect();
        const existingUser = await dbInstance.collection("users").findOne({ email });
        return !!existingUser;
    }

    /**
     * ✅ Verify a user's email by setting the status and removing the token
     * @param {string} token
     * @returns {boolean}
     */
    static async verifyUserByToken(token) {
        const dbInstance = await db.connect();
        const result = await dbInstance.collection("users").updateOne(
            { verificationToken: token },
            { $set: { status: 'verified', verificationToken: null, updatedAt: new Date() } }
        );
        return result.modifiedCount > 0;
    }

    /**
     * ✅ Reset a user's password
     * @param {string} email
     * @param {string} hashedPassword
     */
    static async resetPassword(email, hashedPassword) {
        const dbInstance = await db.connect();
        const result = await dbInstance.collection("users").updateOne(
            { email },
            { $set: { password: hashedPassword, updatedAt: new Date() } }
        );
        return result.modifiedCount > 0;
    }
}
