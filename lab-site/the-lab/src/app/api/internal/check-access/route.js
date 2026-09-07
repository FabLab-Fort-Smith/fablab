// src/app/api/internal/check-access/route.js
import { NextResponse } from 'next/server';
import { db } from "@/lib/database";
import { API_SECRET_KEY } from '@/lib/constants';
import { timingSafeEqualStr } from '@/lib/secureCompare';

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

        if (!cardId) {
            return NextResponse.json({ error: 'Missing cardId' }, { status: 400 });
        }

        const dbUsers = await db.dbUsers();
        // Exact match on the nested field
        const user = await dbUsers.findOne({ 'membership.accessKey.code': cardId });

        if (!user) {
            return NextResponse.json({ granted: false, message: 'Unknown Card' });
        }

        // Check Membership Status
        const m = user.membership || {};
        // Access rules:
        // 1. Status is active or probation
        // 2. Or subscription is ACTIVE
        // 3. User is not Suspended
        // 4. AccessKey is 'issued'
        
        const isActiveStatus = ['active', 'probation'].includes(m.status);
        const hasActiveSub = m.subscriptionStatus === 'ACTIVE';
        const isSuspended = m.status === 'suspended' || m.status === 'banned';
        
        // If they have the card saved, we assume it was issued, but check flag just in case
        const keyIssued = m.accessKey && m.accessKey.issued;
        
        // Trust the key if it's issued, unless they are explicitly suspended/banned
        if ((isActiveStatus || hasActiveSub || keyIssued) && !isSuspended) {
             return NextResponse.json({ 
                 granted: true, 
                 userId: user.userID,
                 username: user.username,
                 name: `${user.firstName} ${user.lastName}`,
                 role: user.role
             });
        } else {
             return NextResponse.json({ 
                 granted: false, 
                 message: `Membership ${m.status || 'Inactive'}` 
             });
        }

    } catch (error) {
        console.error("Check Access Error:", error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
