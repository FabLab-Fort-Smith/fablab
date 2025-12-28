import { db } from "@/lib/database";
import { ObjectId } from "mongodb";

export default class ContactSubmissionModel {
    /**
     * ✅ Create a new contact submission
     * @param {Object} submission - The submission object
     * @returns {Object} - The created submission
     */
    static createSubmission = async (submission) => {
        try {
            const dbSubmissions = await db.dbContactSubmissions();
            const result = await dbSubmissions.insertOne({
                ...submission,
                createdAt: new Date(),
                status: 'new' // new, read, replied, archived
            });
            
            if (!result.insertedId) {
                throw new Error("Failed to insert submission.");
            }
            
            return { ...submission, _id: result.insertedId };
        } catch (error) {
            console.error("Error creating contact submission:", error);
            throw error;
        }
    }

    /**
     * ✅ Get all submissions
     * @returns {Array} - List of submissions
     */
    static getAllSubmissions = async () => {
        try {
            const dbSubmissions = await db.dbContactSubmissions();
            return await dbSubmissions.find({}).sort({ createdAt: -1 }).toArray();
        } catch (error) {
            console.error("Error getting submissions:", error);
            return [];
        }
    }

    /**
     * ✅ Update submission status
     * @param {string} id - The submission ID
     * @param {string} status - The new status
     * @returns {Object} - The updated submission
     */
    static updateStatus = async (id, status) => {
        try {
            const dbSubmissions = await db.dbContactSubmissions();
            const result = await dbSubmissions.findOneAndUpdate(
                { _id: new ObjectId(id) },
                { $set: { status } },
                { returnDocument: 'after' }
            );
            return result;
        } catch (error) {
            console.error("Error updating submission status:", error);
            throw error;
        }
    }
}
