import { NextResponse } from 'next/server';
import ArcadeService from '../service';

export const dynamic = 'force-dynamic';

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const game = searchParams.get('game') || 'infinite_loop';
        const type = searchParams.get('type') || 'all_time';
        
        const leaderboard = await ArcadeService.getLeaderboard(game, type);
        return NextResponse.json(leaderboard);
    } catch (error) {
        console.error("Arcade Leaderboard Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
