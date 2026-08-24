// src/app/api/internal/broker-resync/route.js
// Internal (cloud-only) hook: the socket-server calls this when a broker's Link-B uplink (re)connects,
// so the app rebuilds + pushes THAT broker's current per-door envelopes immediately rather than waiting
// for the next change trigger or TTL refresh (door-controller-wifi.md §13 S2c-2c). Same INTERNAL_API_SECRET
// bearer as /api/internal/check-access. The brokerId the socket-server sends is the one IT authenticated
// (server-derived from the broker's bearer) — but the app still scopes the build to a configured broker
// (unknown brokerId → no-op), so a bad value can't fan out beyond BROKER_DOOR_MAP.

import { NextResponse } from 'next/server';
import { timingSafeEqualStr } from '@/lib/secureCompare';
import Service from '@/plugins/door-access-controller/service';

export async function POST(req) {
    try {
        // Resolve per call (SEC-21: no module-load capture / no empty fallback — fail loudly if unset).
        const secret = process.env.INTERNAL_API_SECRET;
        if (!secret) {
            console.error('INTERNAL_API_SECRET is not configured');
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
        }
        if (!timingSafeEqualStr(req.headers.get('authorization'), `Bearer ${secret}`)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const body = await req.json().catch(() => null);
        const brokerId = body && typeof body.brokerId === 'string' ? body.brokerId : null;
        if (!brokerId) {
            return NextResponse.json({ error: 'brokerId is required' }, { status: 400 });
        }
        const result = await Service.refreshBrokerEnvelopes({ brokerId });
        return NextResponse.json(result);
    } catch (e) {
        // Fail closed + don't leak internals; the socket-server treats this as best-effort anyway.
        console.error('[broker-resync] error:', e && e.message ? e.message : e);
        return NextResponse.json({ error: 'resync failed' }, { status: 500 });
    }
}
