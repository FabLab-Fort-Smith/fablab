import BountyIdeaService from "../service";
import { NextResponse } from "next/server";
import { auth } from "../../../../../../auth";

export async function PUT(req, { params }) {
    try {
        const session = await auth();
        if (!session || session.user.role !== 'admin') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { ideaID } = await params;
        const body = await req.json();
        const success = await BountyIdeaService.updateIdea(ideaID, body);
        
        if (!success) {
            return NextResponse.json({ error: "Idea not found or update failed" }, { status: 404 });
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const session = await auth();
        if (!session || session.user.role !== 'admin') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { ideaID } = await params;
        const success = await BountyIdeaService.deleteIdea(ideaID);

        if (!success) {
            return NextResponse.json({ error: "Idea not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}