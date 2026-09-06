// src/app/api/internal/register-card/route.js
import { NextResponse } from 'next/server';
import UserService from '@/app/api/v1/users/service';
import { API_SECRET_KEY } from '@/lib/constants'; // Needs to be added or hardcoded for now
import { timingSafeEqualStr } from '@/lib/secureCompare';
import { enrollIfEnabled, plaintextRetired } from '@/plugins/door-access-controller/parallelRun';

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

        // Enroll into the addon's encrypted store FIRST (blind index + GCM ciphertext). Guarded +
        // fail-safe: no-ops if the addon is disabled. Doing it first lets us safely drop the
        // plaintext only when the code is confirmed stored in the addon.
        const enroll = await enrollIfEnabled({ userID: userId, code: String(cardId), credentialType: 'nfc' });

        // RETIRE: once cutover is proven and the retire flag is on, stop persisting the raw code —
        // but ONLY if the enroll actually landed, so a card is never stored nowhere (fail-safe).
        const omitPlaintext = (await plaintextRetired()) && enroll.ran;
        const accessKey = omitPlaintext
            ? { issued: true, pairedAt: new Date().toISOString() } // no raw code; encrypted store is the SoR
            : { issued: true, code: String(cardId), issuedAt: new Date().toISOString() };

        // Nested object so UserService runs its status-update logic (e.g. active-on-issue).
        const updatedUser = await UserService.updateUser(userId, { membership: { accessKey } });

        if (!updatedUser) {
            console.error('[Internal API] Update failed, user not found or match failed.');
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // SEC §5: log the user + that a key is present — NEVER the code itself.
        const ak = updatedUser.membership?.accessKey;
        console.log('[Internal API] Card registered for user:', updatedUser.userID, 'key present:', Boolean(ak?.code || ak?.pairedAt), 'plaintext-retired:', omitPlaintext);

        return NextResponse.json({ success: true, userId: updatedUser.userID });

    } catch (error) {
        console.error("Register Card Error:", error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
