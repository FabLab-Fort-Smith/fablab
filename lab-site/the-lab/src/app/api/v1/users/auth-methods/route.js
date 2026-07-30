import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import UserModel from '../model';
import { authMethodsOf } from '@/lib/authMethods';
import logger from '@/lib/logger';

/**
 * GET /api/v1/users/auth-methods
 *
 * Which sign-in methods the CURRENT session user has — booleans only. Powers the
 * Google-retirement nudge (docs/analysis/google-oauth-removal-impact.md §6).
 *
 * Read fresh from the database on every call rather than from the JWT: the session
 * token lives 7 days, so a cached flag would keep nagging a user who has already
 * set a password or linked Discord.
 *
 * SEC-02: bound to the session user — any client-supplied userID is ignored, so
 * this cannot disclose another account's credential shape.
 * Returns no password material, no hashes, and no email (booleans + a date only).
 *
 * @returns {Promise<NextResponse>} 200 with the flags, or 401/404/500
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.userID) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await UserModel.getUserByQuery({ userID: session.user.userID });
        if (!user) {
            return NextResponse.json({ error: 'User not found.' }, { status: 404 });
        }

        const { hasPassword, hasGoogle, hasDiscord, googleOnly } = authMethodsOf(user);
        return NextResponse.json({
            hasPassword,
            hasGoogle,
            hasDiscord,
            googleOnly,
            // Non-secret campaign deadline so the client renders one consistent date.
            googleRetiresOn: process.env.NEXT_PUBLIC_GOOGLE_RETIRES_ON || null,
        });
    } catch (error) {
        logger.error({ err: error }, 'failed to resolve sign-in methods');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
