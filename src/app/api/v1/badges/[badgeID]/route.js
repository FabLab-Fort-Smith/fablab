import { NextResponse } from 'next/server';
import BadgeModel from '../model';
import { auth } from "../../../../../../auth";

export async function GET(request, { params }) {
    try {
        const { badgeID } = await params;
        const badge = await BadgeModel.getBadgeById(badgeID);
        if (!badge) {
            return NextResponse.json({ error: "Badge not found" }, { status: 404 });
        }
        return NextResponse.json({ badge });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    try {
        const session = await auth();
        // TODO: Add admin check
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { badgeID } = await params;
        const body = await request.json();
        const success = await BadgeModel.updateBadge(badgeID, body);
        
        if (!success) {
            return NextResponse.json({ error: "Failed to update badge" }, { status: 400 });
        }
        
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const session = await auth();
        // TODO: Add admin check
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { badgeID } = await params;
        const success = await BadgeModel.deleteBadge(badgeID);
        
        if (!success) {
            return NextResponse.json({ error: "Failed to delete badge" }, { status: 400 });
        }
        
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
