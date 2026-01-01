import { NextResponse } from 'next/server';
import ArcadeService from '../service';

export async function POST(req) {
    try {
        const { sessionID, score } = await req.json();
        
        if (!sessionID || score === undefined) {
            return NextResponse.json({ error: "SessionID and Score are required" }, { status: 400 });
        }

        const result = await ArcadeService.submitScore(sessionID, score);
        return NextResponse.json(result);
    } catch (error) {
        console.error("Arcade Submit Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
