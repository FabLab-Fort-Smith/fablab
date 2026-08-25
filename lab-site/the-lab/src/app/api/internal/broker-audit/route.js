// src/app/api/internal/broker-audit/route.js
// Internal (cloud-only) sink: the socket-server relays an edge's store-and-forward audit batch (which
// the broker forwarded up Link-B) here, and the app runs the fail-closed anchor check (S6-a) against the
// Mongo per-edge anchor, routing any tamper/gap/truncation to the audit log. Same INTERNAL_API_SECRET
// bearer as the other /api/internal routes; the caller (socket-server) is trusted, and the `edgeId` is
// broker-attested (the broker authenticated the edge cert on Link-A). Records carry no scan code (PII).

import { NextResponse } from 'next/server';
import { timingSafeEqualStr } from '@/lib/secureCompare';
import Service from '@/plugins/door-access-controller/service';

export async function POST(req) {
    try {
        const secret = process.env.INTERNAL_API_SECRET; // resolve per-call (SEC-21)
        if (!secret) {
            console.error('INTERNAL_API_SECRET is not configured');
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
        }
        if (!timingSafeEqualStr(req.headers.get('authorization'), `Bearer ${secret}`)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const body = await req.json().catch(() => null);
        const edgeId = body && typeof body.edgeId === 'string' ? body.edgeId : null;
        const records = body && Array.isArray(body.records) ? body.records : null;
        const signature = body && typeof body.signature === 'string' ? body.signature : null;
        if (!edgeId || !records) {
            return NextResponse.json({ error: 'edgeId and records[] are required' }, { status: 400 });
        }
        // The edge-batch signature is verified inside the service against the edge's registered key
        // (fail-closed: a missing/bad signature → rejected, not an ingest). We pass it through as-is.
        const result = await Service.ingestEdgeAudit({ edgeId, records, signature });
        // A boundary/auth rejection (bad-edgeId / batch-too-large / malformed-record / unregistered-edge /
        // bad-signature) is a 400; an accepted batch (even one carrying tamper ALERTS — those are
        // surfaced, not an HTTP error) is 200.
        if (result.rejected && result.rejected !== 'conflict') {
            return NextResponse.json(result, { status: 400 });
        }
        if (result.rejected === 'conflict') {
            return NextResponse.json(result, { status: 409 });
        }
        return NextResponse.json(result);
    } catch (e) {
        console.error('[broker-audit] error:', e && e.message ? e.message : e);
        return NextResponse.json({ error: 'audit ingest failed' }, { status: 500 });
    }
}
