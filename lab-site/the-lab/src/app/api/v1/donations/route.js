
import { NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { auth } from '@/auth'; // Assuming auth helper exists or using getServerSession

export const dynamic = 'force-dynamic';

export async function GET(req) {
    try {
        const session = await auth(); 
        
        if (!session) {
             return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const transactions = await db.dbTransactions();
        let query = { type: 'donation' };

        // If not admin, restrict to own donations
        if (session.user.role !== 'admin') {
            query.userID = session.user.userID;
        } else {
            // Admin can filter by userID if provided in query params
            const { searchParams } = new URL(req.url);
            const userID = searchParams.get('userID');
            if (userID) {
                query.userID = userID;
            }
        }

        const donations = await transactions.find(query).sort({ createdAt: -1 }).toArray();

        return NextResponse.json(donations);
    } catch (error) {
        console.error("Error fetching donations:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

