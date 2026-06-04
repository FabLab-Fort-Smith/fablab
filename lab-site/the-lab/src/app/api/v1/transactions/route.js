import { db } from '@/lib/database';

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type');
        const status = searchParams.get('status');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '25');
        const skip = (page - 1) * limit;

        const filter = {};
        if (type) filter.type = type;
        if (status) filter.status = status;

        const txns = await db.dbTransactions();
        const [transactions, total] = await Promise.all([
            txns.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
            txns.countDocuments(filter),
        ]);

        return Response.json({ transactions, total, page, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        console.error('GET /api/v1/transactions error:', error);
        return Response.json({ error: 'Failed to fetch transactions.' }, { status: 500 });
    }
}
