// src/app/api/internal/check-access/route.js
import { NextResponse } from 'next/server';
import { db } from "@/lib/database";
import { API_SECRET_KEY } from '@/lib/constants';
import { timingSafeEqualStr } from '@/lib/secureCompare';
import { shadowCompare } from '@/plugins/door-access-controller/parallelRun';

// Required via env — no hardcoded fallback (SEC-04).
const SECRET = process.env.INTERNAL_API_SECRET;

export async function GET(req) {
    try {
        if (!SECRET) {
            console.error('INTERNAL_API_SECRET is not configured');
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
        }
        const authHeader = req.headers.get('authorization');
        if (!timingSafeEqualStr(authHeader, `Bearer ${SECRET}`)) {
             return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const cardId = searchParams.get('cardId');
        // Optional door hint (the door-access addon evaluates per-door windows). Backward
        // compatible: absent → a single "default" door.
        const doorId = searchParams.get('doorId') || searchParams.get('deviceId') || 'default';

        if (!cardId) {
            return NextResponse.json({ error: 'Missing cardId' }, { status: 400 });
        }

        const dbUsers = await db.dbUsers();
        // Exact match on the nested field
        const user = await dbUsers.findOne({ 'membership.accessKey.code': cardId });

        // --- LIVE decision (unchanged behavior) -------------------------------------------
        // Access rules: (active/probation status) OR (subscription ACTIVE) OR (accessKey issued),
        // AND not suspended/banned.
        let liveGranted;
        let liveBody;
        if (!user) {
            liveGranted = false;
            liveBody = { granted: false, message: 'Unknown Card' };
        } else {
            const m = user.membership || {};
            const isActiveStatus = ['active', 'probation'].includes(m.status);
            const hasActiveSub = m.subscriptionStatus === 'ACTIVE';
            const isSuspended = m.status === 'suspended' || m.status === 'banned';
            const keyIssued = m.accessKey && m.accessKey.issued;
            if ((isActiveStatus || hasActiveSub || keyIssued) && !isSuspended) {
                liveGranted = true;
                liveBody = {
                    granted: true,
                    userId: user.userID,
                    username: user.username,
                    name: `${user.firstName} ${user.lastName}`,
                    role: user.role,
                };
            } else {
                liveGranted = false;
                liveBody = { granted: false, message: `Membership ${m.status || 'Inactive'}` };
            }
        }

        // --- Parallel-run / cutover (strangler migration) ---------------------------------
        // Shadow-evaluate the door-access addon against the SAME resolved user. It logs any
        // divergence and, ONLY once an admin flips the addon's `authoritative` flag, returns
        // the addon's decision instead. shadowCompare NEVER throws and never mutates the live
        // decision, so check-access keeps working when the addon is disabled/absent.
        const shadow = await shadowCompare({
            user,
            doorId,
            credentialType: 'nfc',
            liveGranted,
            source: req.headers.get('x-forwarded-for') || undefined,
        });
        if (shadow.ran && shadow.authoritative) {
            const grantFields = shadow.granted && user
                ? { userId: user.userID, username: user.username, name: `${user.firstName} ${user.lastName}`, role: user.role }
                : {};
            return NextResponse.json({ granted: shadow.granted, reason: shadow.reason, ...grantFields });
        }

        return NextResponse.json(liveBody);
    } catch (error) {
        console.error("Check Access Error:", error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
