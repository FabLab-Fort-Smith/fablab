import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { guardOperationalEndpoint } from '@/lib/adminGuard';
import { rateLimit } from '@/lib/rateLimit';
import { auditLog } from '@/lib/audit';
import { runGoogleRetirementNotice } from './service';
import logger from '@/lib/logger';

const DEADLINE_MAX_LENGTH = 40;

/**
 * 429 with a Retry-After header, matching the forgot-password endpoint.
 * @param {number} retryAfterMs - milliseconds until the caller may retry
 * @returns {NextResponse} the 429 response
 */
function tooMany(retryAfterMs) {
    return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
    );
}

/**
 * POST /api/v1/admin/google-retirement-notice
 *
 * Admin-only. Emails the Google-only cohort the sign-in retirement notice
 * (docs/analysis/google-oauth-removal-impact.md §6, Phase 2).
 *
 * Body (all optional): `{ send?: boolean, deadline?: string, force?: boolean, limit?: number }`
 * — **defaults to a dry run**; nothing is sent unless `send` is exactly `true`, so a stray
 * call cannot mail members. Idempotent: accounts already notified are skipped unless
 * `force:true` (reminder pass).
 *
 * Rate-limited because `{send:true, force:true}` is otherwise an unbounded repeat-mail
 * button, and repeated runs burn the shared SMTP relay's sending reputation.
 *
 * Responds with counts and MASKED addresses only — never plaintext member email.
 *
 * @param {Request} req - the incoming request
 * @returns {Promise<NextResponse>} 200 with the run summary, or 400/401/403/429/500
 */
export async function POST(req) {
    const denied = await guardOperationalEndpoint();
    if (denied) return denied;

    // The guard returns only the denial, so re-resolve the session for the audit actor.
    const session = await auth();
    const actor = session?.user?.userID;

    try {
        // Tolerate an empty body — that is the safe dry-run case.
        let body = {};
        try { body = await req.json(); } catch { body = {}; }

        const send = body.send === true;                 // must be exactly true
        const force = body.force === true;
        const limit = Number.isInteger(body.limit) && body.limit > 0 ? body.limit : 0;

        let deadline;
        if (body.deadline !== undefined) {
            if (typeof body.deadline !== 'string' || body.deadline.trim().length === 0
                || body.deadline.length > DEADLINE_MAX_LENGTH) {
                return NextResponse.json(
                    { error: `deadline must be a non-empty string of at most ${DEADLINE_MAX_LENGTH} characters.` },
                    { status: 400 },
                );
            }
            deadline = body.deadline.trim();
        }

        const runLimit = rateLimit('google-retirement-notice:run', { limit: 3, windowMs: 60 * 60_000 });
        if (!runLimit.allowed) {
            auditLog('admin.google_retirement_notice.rate_limited', { actor, outcome: 'blocked' });
            return tooMany(runLimit.retryAfterMs);
        }

        // Audited BEFORE the run: a crash mid-campaign must still leave a record that a
        // send was attempted (CLAUDE.md §9 — admin + PII-touching action).
        auditLog('admin.google_retirement_notice.started', { actor, outcome: 'started', send, force, limit });

        const summary = await runGoogleRetirementNotice({ send, deadline, force, limit });

        auditLog('admin.google_retirement_notice.completed', {
            actor,
            outcome: (summary.failed || summary.sentButUnstamped) ? 'partial' : 'success',
            send,
            cohort: summary.cohort,
            sent: summary.sent,
            failed: summary.failed,
            sentButUnstamped: summary.sentButUnstamped,
        });
        return NextResponse.json(summary);
    } catch (error) {
        // Includes a failed cohort query, which throws rather than reporting an empty
        // cohort (a false all-clear would authorise the cutover).
        logger.error({ err: error }, 'google retirement notice endpoint failed');
        auditLog('admin.google_retirement_notice.failed', { actor, outcome: 'error' });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
