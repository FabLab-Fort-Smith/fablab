import { NextResponse } from 'next/server';
import ArcadeService from '../service';

export async function POST(req) {
    try {
        const { userID, game } = await req.json();
        
        if (!userID) {
            return NextResponse.json({ error: "UserID is required" }, { status: 400 });
        }

        const result = await ArcadeService.startGame(userID, game);
        return NextResponse.json(result);
    } catch (error) {
        console.error("Arcade Start Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
