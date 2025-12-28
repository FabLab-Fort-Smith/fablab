import FeedService from "./service";
import { NextResponse } from "next/server";

export default class FeedController {
    static async getFeed(req) {
        try {
            const { searchParams } = new URL(req.url);
            const limit = parseInt(searchParams.get("limit")) || 20;
            const skip = parseInt(searchParams.get("skip")) || 0;

            const items = await FeedService.getFeed(limit, skip);
            return NextResponse.json(items, { status: 200 });
        } catch (error) {
            console.error("Error fetching feed:", error);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }
    }
}
