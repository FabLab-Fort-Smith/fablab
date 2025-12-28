import { auth } from "../../../../../../auth";
import TransactionService from "../service";

export async function POST(req) {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        const { receiverId, amount, reason } = await req.json();
        await TransactionService.awardStake(session.user.userID, receiverId, amount, reason);
        return new Response(JSON.stringify({ message: "Stake awarded successfully" }), { status: 200 });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
