// src/app/api/internal/register-card/route.js
import { NextResponse } from 'next/server';
import UserService from '@/app/api/v1/users/service';
import { API_SECRET_KEY } from '@/lib/constants'; // Needs to be added or hardcoded for now
import { timingSafeEqualStr } from '@/lib/secureCompare';
import { enrollIfEnabled } from '@/plugins/door-access-controller/parallelRun';

// Shared secret check — required via env, no hardcoded fallback (SEC-04).
const SECRET = process.env.INTERNAL_API_SECRET;

export async function POST(req) {
    try {
        if (!SECRET) {
            console.error('INTERNAL_API_SECRET is not configured');
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
        }
        const authHeader = req.headers.get('authorization');
        if (!timingSafeEqualStr(authHeader, `Bearer ${SECRET}`)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { userId, cardId } = await req.json();

        if (!userId || !cardId) {
            return NextResponse.json({ error: 'Missing userId or cardId' }, { status: 400 });
        }

        // SEC §5: never log the card code (it's Restricted/PII) — log the user only.
        console.log(`[Internal API] Registering a card for User ${userId}`);

        // Update User
        // We use nested objects so UserService triggers its internal status update logic
        // (e.g. Setting status to 'active' if key is issued)
        const updateData = {
            membership: {
                accessKey: {
                    issued: true,
                    code: String(cardId), // Force string to avoid any schema casting issues
                    issuedAt: new Date().toISOString()
                }
            }
        };

        const updatedUser = await UserService.updateUser(userId, updateData);

        if (!updatedUser) {
            console.error('[Internal API] Update failed, user not found or match failed.');
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        
        // SEC §5: log the user + that a key is present — NEVER the code itself.
        console.log('[Internal API] Card registered for user:', updatedUser.userID, 'key present:', Boolean(updatedUser.membership?.accessKey?.code));

        // Migration coexistence: also store the code in the door-access addon (encrypted +
        // blind index) so the addon can resolve real cards during parallel-run/cutover. This
        // is guarded + fail-safe — it never breaks card registration if the addon is off.
        await enrollIfEnabled({ userID: updatedUser.userID, code: String(cardId), credentialType: 'nfc' });

        return NextResponse.json({ success: true, userId: updatedUser.userID });

    } catch (error) {
        console.error("Register Card Error:", error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
