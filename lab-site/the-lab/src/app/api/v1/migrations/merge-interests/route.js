import { NextResponse } from 'next/server';
import { db } from "@/lib/database";
import { guardOperationalEndpoint } from '@/lib/adminGuard';

export async function GET() {
    try {
        // SEC-18: bulk migration over all users — admin-only.
        const blocked = await guardOperationalEndpoint();
        if (blocked) return blocked;

        const dbUsers = await db.dbUsers();
        const users = await dbUsers.find({}).toArray();
        let updatedCount = 0;

        for (const user of users) {
            const skills = Array.isArray(user.skills) ? user.skills : [];
            const hobbies = Array.isArray(user.hobbies) ? user.hobbies : [];
            const existingInterests = Array.isArray(user.interests) ? user.interests : [];

            // Combine and deduplicate
            const newInterests = [...new Set([
                ...skills,
                ...hobbies,
                ...existingInterests
            ])];

            // Only update if there are changes or if we need to clean up old fields
            if (newInterests.length > 0 || user.skills || user.hobbies) {
                await dbUsers.updateOne(
                    { _id: user._id },
                    { 
                        $set: { interests: newInterests },
                        $unset: { skills: "", hobbies: "" }
                    }
                );
                updatedCount++;
            }
        }

        return NextResponse.json({ 
            success: true, 
            message: `Migration complete. Updated ${updatedCount} users.`,
            totalUsers: users.length
        });

    } catch (error) {
        console.error("Migration failed:", error);
        return NextResponse.json({ error: "Migration failed", details: error.message }, { status: 500 });
    }
}
