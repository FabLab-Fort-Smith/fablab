import { NextResponse } from "next/server";
import BugService from "./service";
import { auth } from "../../../../../auth";

export default class BugController {
    static async createBug(req) {
        try {
            const session = await auth();
            if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

            const data = await req.json();
            const bug = await BugService.createBug({
                ...data,
                submittedBy: session.user.userID
            });

            return NextResponse.json(bug, { status: 201 });
        } catch (error) {
            console.error("Error creating bug:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
    }

    static async getBugs(req) {
        try {
            const { searchParams } = new URL(req.url);
            const status = searchParams.get('status');
            const page = parseInt(searchParams.get('page') || '1');
            const limit = parseInt(searchParams.get('limit') || '20');

            const bugs = await BugService.getAllBugs(status, page, limit);
            return NextResponse.json(bugs);
        } catch (error) {
            console.error("Error fetching bugs:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
    }

    static async updateBug(req) {
        try {
            const session = await auth();
            if (!session || session.user.role !== 'admin') {
                return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
            }

            const data = await req.json();
            const { bugID, status, stakeReward } = data;

            if (!bugID || !status) {
                return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
            }

            const result = await BugService.updateBugStatus(bugID, status, session.user.userID, stakeReward);
            return NextResponse.json(result);
        } catch (error) {
            console.error("Error updating bug:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
    }
}
