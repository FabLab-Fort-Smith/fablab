import { NextResponse } from "next/server";
import UserModel from "../users/model";
import BountyModel from "../bounties/model";

export const runtime = "nodejs";

export async function GET(req) {
    try {
        // Fetch data sequentially to isolate errors
        let topStake = [];
        try {
            topStake = await UserModel.getTopStake(10);
        } catch (e) {
            console.error("Error fetching top stake:", e);
        }

        let topVolunteers = [];
        try {
            topVolunteers = await UserModel.getTopVolunteerHours(10);
        } catch (e) {
            console.error("Error fetching top volunteers:", e);
        }

        let topBountyHunters = [];
        try {
            topBountyHunters = await BountyModel.getTopBountyHunters(10);
        } catch (e) {
            console.error("Error fetching top bounty hunters:", e);
        }

        return NextResponse.json({
            topStake,
            topVolunteers,
            topBountyHunters
        });
    } catch (error) {
        console.error("Error fetching leaderboard data:", error);
        return NextResponse.json({ error: "Failed to fetch leaderboard data" }, { status: 500 });
    }
}
