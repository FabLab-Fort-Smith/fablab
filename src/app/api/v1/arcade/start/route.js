import { NextResponse } from 'next/server';
import ArcadeService from '../service';
import OrchestratorService from '@/services/orchestrator';

export async function POST(req) {
    try {
        const { userID, game } = await req.json();
        
        if (!userID) {
            return NextResponse.json({ error: "UserID is required" }, { status: 400 });
        }

        // Check if it's a mission (Hack the Lab v2)
        if (game && game.startsWith('mission-')) {
            // TODO: Add payment/permission check here
            const result = await OrchestratorService.startMission(userID, game);
            return NextResponse.json(result);
        }

        const result = await ArcadeService.startGame(userID, game);
        return NextResponse.json(result);
    } catch (error) {
        console.error("Arcade Start Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
