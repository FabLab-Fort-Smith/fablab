import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getMissionTotal } from '../flags';
import { db } from '@/lib/database';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const database = await db.connect();
        const completions = await database
            .collection('holodeck_completions')
            .find({ userID: session.user.userID })
            .toArray();

        // Group by mission: { missionID -> Set of found flagValues }
        const byMission = {};
        for (const c of completions) {
            if (!byMission[c.missionID]) byMission[c.missionID] = new Set();
            byMission[c.missionID].add(c.flagValue);
        }

        // Build progress map and list of fully-completed missions
        const progress = {};
        const completedMissions = [];
        for (const [missionID, foundSet] of Object.entries(byMission)) {
            const total = getMissionTotal(missionID);
            const found = foundSet.size;
            progress[missionID] = { found, total };
            if (found >= total) completedMissions.push(missionID);
        }

        return NextResponse.json({ completedMissions, progress });
    } catch (error) {
        console.error('Holodeck completions error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
