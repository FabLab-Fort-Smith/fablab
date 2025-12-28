import PortfolioService from "./service";
import { NextResponse } from "next/server";

export default class PortfolioController {
    static async createItem(req) {
        try {
            const data = await req.json();
            
            if (!data.userID || !data.title || !data.imageUrls || data.imageUrls.length === 0) {
                return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
            }

            const item = await PortfolioService.createItem(data);
            return NextResponse.json(item, { status: 201 });
        } catch (error) {
            console.error("Error creating portfolio item:", error);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }
    }

    static async getAllItems(req) {
        try {
            const { searchParams } = new URL(req.url);
            const limit = parseInt(searchParams.get("limit")) || 20;
            const skip = parseInt(searchParams.get("skip")) || 0;
            const sort = searchParams.get("sort") || 'latest';
            const userID = searchParams.get("userID");

            const filter = userID ? { userID } : {};

            const items = await PortfolioService.getAllItems(filter, limit, skip, sort);
            return NextResponse.json(items, { status: 200 });
        } catch (error) {
            console.error("Error fetching portfolio items:", error);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }
    }

    static async updateItem(req) {
        try {
            const data = await req.json();
            const { id, userID, action, text } = data;

            if (!id || !userID) {
                return NextResponse.json({ error: "Missing id or userID" }, { status: 400 });
            }

            if (action === 'comment') {
                if (!text) return NextResponse.json({ error: "Missing comment text" }, { status: 400 });
                const comment = await PortfolioService.addComment(id, userID, text);
                return NextResponse.json(comment, { status: 200 });
            } else if (action === 'share') {
                const { senderID, recipientID } = data;
                if (!senderID || !recipientID) return NextResponse.json({ error: "Missing sender or recipient" }, { status: 400 });
                
                await PortfolioService.shareItem(id, senderID, recipientID);
                return NextResponse.json({ success: true }, { status: 200 });
            } else {
                // Default to toggle like
                const result = await PortfolioService.toggleLike(id, userID);
                return NextResponse.json(result, { status: 200 });
            }
        } catch (error) {
            console.error("Error updating item:", error);
            return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
        }
    }
}
