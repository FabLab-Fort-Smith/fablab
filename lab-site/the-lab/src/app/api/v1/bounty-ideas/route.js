import BountyIdeaService from "./service";
import { NextResponse } from "next/server";
import { auth } from "../../../../../auth";

export async function GET(req) {
    try {
        const session = await auth();
        if (!session || session.user.role !== 'admin') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const ideas = await BountyIdeaService.getAllIdeas();
        return NextResponse.json({ ideas }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const session = await auth();
        if (!session || session.user.role !== 'admin') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const idea = await BountyIdeaService.createIdea(body);
        return NextResponse.json({ idea }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}