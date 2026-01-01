import { NextResponse } from 'next/server';
import { db } from '@/lib/database';

export const dynamic = 'force-dynamic';

export async function GET(req) {
    try {
        const database = await db.connect();
        const usersCollection = database.collection('users');

        // Update all users to have notificationPreferences set to false
        const result = await usersCollection.updateMany(
            {}, // Filter: all users
            {
                $set: {
                    notificationPreferences: {
                        email: false,
                        discord: false
                    }
                }
            }
        );

        return NextResponse.json({
            message: "Migration complete",
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount
        });

    } catch (error) {
        console.error("Migration failed:", error);
        return NextResponse.json({ error: "Migration failed", details: error.message }, { status: 500 });
    }
}
