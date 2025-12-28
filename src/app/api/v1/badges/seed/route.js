import { NextResponse } from 'next/server';
import BadgeModel from '../model';
import Constants from '@/lib/constants';
import { auth } from "../../../../../../auth";

export async function POST(request) {
    try {
        // const session = await auth();
        // // TODO: Add admin check
        // if (!session) {
        //     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        // }

        const badges = Object.values(Constants.BADGES);
        let createdCount = 0;
        let errors = [];

        for (const badge of badges) {
            try {
                // Check if exists
                const existing = await BadgeModel.getBadgeById(badge.id);
                if (!existing) {
                    await BadgeModel.createBadge({
                        ...badge,
                        type: badge.type || 'system', // Use defined type or default to system
                        imageUrl: null // Placeholder for now, they use 'icon' (emoji)
                    });
                    createdCount++;
                }
            } catch (err) {
                errors.push(`Failed to create ${badge.name}: ${err.message}`);
            }
        }

        return NextResponse.json({ 
            message: `Seeding complete. Created ${createdCount} badges.`,
            errors 
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
