import { NextResponse } from 'next/server';
import { guardOperationalEndpoint } from '@/lib/adminGuard';
import { runGoogleRetirementNotice } from './service';
import logger from '@/lib/logger';

/**
 * POST /api/v1/admin/google-retirement-notice
 *
 * Admin-only. Emails the Google-only cohort the sign-in retirement notice
 * (docs/analysis/google-oauth-removal-impact.md §6, Phase 2).
 *
 * Body (all optional): `{ send?: boolean, deadline?: string, force?: boolean, limit?: number }`
 * — **defaults to a dry run**; nothing is sent unless `send:true` is passed explicitly, so
 * a stray call cannot mail members. Idempotent: accounts already notified are skipped
 * unless `force:true` (reminder pass).
 *
 * Responds with counts and MASKED addresses only — never plaintext member email.
 *
 * @param {Request} req - the incoming request
 * @returns {Promise<NextResponse>} 200 with the run summary, or 400/401/403/500
 */
export async function POST(req) {
    const denied = await guardOperationalEndpoint();
    if (denied) return denied;

    try {
        // Tolerate an empty body — that is the safe dry-run case.
        let body = {};
        try { body = await req.json(); } catch { body = {}; }

        const send = body.send === true;                 // must be exactly true
        const force = body.force === true;
        const deadline = typeof body.deadline === 'string' && body.deadline.trim() ? body.deadline.trim() : undefined;
        const limit = Number.isInteger(body.limit) && body.limit > 0 ? body.limit : 0;

        const summary = await runGoogleRetirementNotice({ send, deadline, force, limit });
        logger.info({ actor: 'admin', send, force, limit }, 'google retirement notice endpoint invoked');
        return NextResponse.json(summary);
    } catch (error) {
        logger.error({ err: error }, 'google retirement notice endpoint failed');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
