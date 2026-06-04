import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { db } from '@/lib/database';

export async function GET(request) {
    try {
        const session = await auth();
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const dbUsers = await db.dbUsers();
        const user = await dbUsers.findOne({ userID: session.user.userID });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json({ 
            capturedFlags: user.capturedFlags || [],
            stake: user.stake || 0,
            stakeHistory: user.stakeHistory || []
        });

    } catch (error) {
        console.error("Error fetching terminal state:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
