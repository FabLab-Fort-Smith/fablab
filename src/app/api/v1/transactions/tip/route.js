import { NextResponse } from 'next/server';
import { auth } from "@/auth";
import TransactionService from '../service';

export async function POST(request) {
    try {
        const session = await auth();
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { receiverId, amount } = body;

        if (!receiverId || !amount) {
            return NextResponse.json({ error: "Missing receiverId or amount" }, { status: 400 });
        }

        if (amount <= 0) {
            return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
        }

        const result = await TransactionService.processTip(session.user.userID, amount, receiverId);

        return NextResponse.json({ success: true, result });

    } catch (error) {
        console.error("Tip API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
