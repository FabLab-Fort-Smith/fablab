import { db } from "@/lib/database";
import { v4 as uuidv4 } from 'uuid';

export default class CheckInModel {
    static async getCollection() {
        const database = await db.connect();
        return database.collection('checkins');
    }

    static async createCheckIn(userID) {
        try {
            const dbCheckIns = await this.getCollection();
            const checkIn = {
                checkInID: `checkin-${uuidv4().slice(0, 8)}`,
                userID,
                checkInTime: new Date(),
                checkOutTime: null,
                durationMinutes: 0,
                status: 'active' // active, completed
            };
            
            await dbCheckIns.insertOne(checkIn);
            return checkIn;
        } catch (error) {
            console.error("Error creating check-in:", error);
            return null;
        }
    }

    static async completeCheckIn(userID) {
        try {
            const dbCheckIns = await this.getCollection();
            
            // Find the active check-in for this user
            const activeCheckIn = await dbCheckIns.findOne({ 
                userID, 
                status: 'active' 
            });

            if (!activeCheckIn) {
                console.warn(`No active check-in found for user ${userID}`);
                return null;
            }

            const checkOutTime = new Date();
            const durationMs = checkOutTime - new Date(activeCheckIn.checkInTime);
            const durationMinutes = Math.round(durationMs / 60000);

            const result = await dbCheckIns.findOneAndUpdate(
                { _id: activeCheckIn._id },
                { 
                    $set: { 
                        checkOutTime, 
                        durationMinutes, 
                        status: 'completed' 
                    } 
                },
                { returnDocument: 'after' }
            );

            return result;
        } catch (error) {
            console.error("Error completing check-in:", error);
            return null;
        }
    }

    static async getLogs(filter = {}, limit = 100, skip = 0) {
        try {
            const dbCheckIns = await this.getCollection();
            
            // Join with users to get names
            const pipeline = [
                { $match: filter },
                { $sort: { checkInTime: -1 } },
                { $skip: skip },
                { $limit: limit },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'userID',
                        foreignField: 'userID',
                        as: 'user'
                    }
                },
                {
                    $unwind: {
                        path: '$user',
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $project: {
                        checkInID: 1,
                        userID: 1,
                        checkInTime: 1,
                        checkOutTime: 1,
                        durationMinutes: 1,
                        status: 1,
                        userName: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
                        userEmail: '$user.email'
                    }
                }
            ];

            return await dbCheckIns.aggregate(pipeline).toArray();
        } catch (error) {
            console.error("Error fetching check-in logs:", error);
            return [];
        }
    }

    static async getCheckInCount(userID) {
        try {
            const dbCheckIns = await this.getCollection();
            return await dbCheckIns.countDocuments({ userID });
        } catch (error) {
            console.error("Error counting check-ins:", error);
            return 0;
        }
    }
}
