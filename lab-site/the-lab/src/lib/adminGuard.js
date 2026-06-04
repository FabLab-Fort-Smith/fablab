// src/lib/adminGuard.js
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

// SEC-18: shared guard for operational endpoints (seed / migration / test).
// These perform bulk data writes or hardware actions and must never be
// anonymous. Returns a NextResponse to short-circuit the handler, or null when
// the caller is allowed.
//
// Pass { productionDisabled: true } for dev/test-only handlers (seed demo data,
// hardware toggles) that must be entirely unreachable in production (CLAUDE.md
// §8) — they 404 there even for an admin.
export async function guardOperationalEndpoint({ productionDisabled = false } = {}) {
    if (productionDisabled && process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const session = await auth();
    if (!session?.user?.userID) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return null;
}
