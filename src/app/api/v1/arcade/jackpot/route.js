import { NextResponse } from 'next/server';
import ArcadeService from '../service';

export const dynamic = 'force-dynamic';

export async function GET(req) {
    try {
        const jackpot = await ArcadeService.getJackpot();
        return NextResponse.json(jackpot);
    } catch (error) {
        console.error("Arcade Jackpot Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
