import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { db } from '@/lib/database';

export async function POST(req) {
    try {
        const session = await auth();
        if (!session || session.user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const usersCollection = await db.dbUsers();
        const users = await usersCollection.find({}).toArray();
        
        let updatedCount = 0;
        const updates = [];

        for (const user of users) {
            const m = user.membership || {};
            let newType = 'community';

            const isWaived = m.isWaived === true;
            const isSubscriptionActive = m.subscriptionStatus === 'ACTIVE';
            const isSponsorshipActive = m.sponsorshipExpiresAt && new Date(m.sponsorshipExpiresAt) > new Date();
            
            if (isWaived || isSubscriptionActive || isSponsorshipActive) {
                newType = 'co-op';
            }

            // Only update if different or undefined
            if (m.type !== newType) {
                updates.push({
                    updateOne: {
                        filter: { _id: user._id },
                        update: { $set: { "membership.type": newType } }
                    }
                });
                updatedCount++;
            }
        }

        if (updates.length > 0) {
            await usersCollection.bulkWrite(updates);
        }

        return NextResponse.json({ 
            message: 'Migration complete', 
            totalUsers: users.length, 
            updatedCount 
        });

    } catch (error) {
        console.error("Migration error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
