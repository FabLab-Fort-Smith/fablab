import { NextResponse } from 'next/server';
import BadgeModel from './model';
import { auth } from "../../../../../auth";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type');
        
        const filter = {};
        if (type) filter.type = type;

        const badges = await BadgeModel.getAllBadges(filter);
        return NextResponse.json({ badges });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const session = await auth();
        // TODO: Add admin check here
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        
        // Basic validation
        if (!body.id || !body.name) {
            return NextResponse.json({ error: "Missing required fields (id, name)" }, { status: 400 });
        }

        const badge = await BadgeModel.createBadge(body);
        return NextResponse.json({ badge }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
