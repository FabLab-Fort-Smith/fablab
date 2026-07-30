import UserModel from '@/app/api/v1/users/model';
import AuthService from '@/app/api/auth/[...nextauth]/service';
import { authMethodsOf } from '@/lib/authMethods';
import { sendGoogleRetirementEmail } from '@/app/utils/email.util';
import logger from '@/lib/logger';

/**
 * Default retirement date shown in the notice. Overridable per run so the date can
 * move without a deploy; non-secret.
 */
export const DEFAULT_DEADLINE = process.env.GOOGLE_RETIRES_ON || 'the announced date';

/**
 * Send (or preview) the Google-sign-in retirement notice to the Google-only cohort.
 *
 * Phase 2 of docs/analysis/google-oauth-removal-impact.md §6 — these accounts have no
 * second credential, so they must set a password or link Discord before the provider
 * is removed.
 *
 * Safety properties:
 * - **Dry run by default** (`send:false`) — reports who WOULD be mailed and sends nothing.
 * - **Idempotent** — an account already stamped `googleRetirementNoticeSentAt` is skipped,
 *   so a re-run (or a reminder pass with `force`) cannot spam the cohort.
 * - **Marks only after SMTP accepts**; a failed send stays unmarked and is retried next run.
 * - **Returns counts and MASKED addresses only** — no plaintext member email leaves this
 *   function (CLAUDE.md §5 no-data-leakage; §3 PII minimisation).
 * - Sends **sequentially** to stay gentle on the SMTP relay.
 *
 * @param {Object} [options]
 * @param {boolean} [options.send=false] - actually send; false = dry run
 * @param {string} [options.deadline] - human-readable retirement date for the copy
 * @param {boolean} [options.force=false] - re-send to accounts already notified (reminder pass)
 * @param {number} [options.limit=0] - cap the number of recipients (0 = no cap)
 * @returns {Promise<{dryRun: boolean, candidates: number, cohort: number, alreadyNotified: number, sent: number, failed: number, undecryptable: number, recipients: string[]}>}
 */
export async function runGoogleRetirementNotice({ send = false, deadline, force = false, limit = 0 } = {}) {
    const when = deadline || DEFAULT_DEADLINE;
    const candidates = await UserModel.getGoogleIdentityUsers();

    const cohort = candidates.filter((u) => authMethodsOf(u).googleOnly);
    let alreadyNotified = 0;
    let undecryptable = 0;
    let sent = 0;
    let failed = 0;
    const recipients = [];

    for (const user of cohort) {
        if (!force && user.googleRetirementNoticeSentAt) { alreadyNotified++; continue; }
        if (limit > 0 && recipients.length >= limit) break;

        const email = AuthService.decryptEmail(user.email);
        if (!email || !email.includes('@')) { undecryptable++; continue; }
        recipients.push(maskEmail(email));

        if (!send) continue; // dry run: counted, not contacted

        try {
            await sendGoogleRetirementEmail(email, user.firstName, when);
            // Stamp only on success so a transient SMTP failure is retried, not lost.
            await UserModel.updateUser({ userID: user.userID }, { googleRetirementNoticeSentAt: new Date() });
            sent++;
        } catch (error) {
            failed++;
            logger.error({ err: error, userID: user.userID }, 'google retirement notice failed to send');
        }
    }

    logger.info(
        { dryRun: !send, candidates: candidates.length, cohort: cohort.length, alreadyNotified, sent, failed, undecryptable },
        'google retirement notice run'
    );

    return {
        dryRun: !send,
        candidates: candidates.length,
        cohort: cohort.length,
        alreadyNotified,
        sent,
        failed,
        undecryptable,
        recipients,
    };
}

/**
 * Mask an address for operator-facing output: first character of the local part kept,
 * domain kept (useful for triage), everything else hidden.
 * @param {string} addr - a plaintext email address
 * @returns {string} the masked form, e.g. "a***@example.org"
 */
export function maskEmail(addr) {
    const [local, domain] = String(addr).split('@');
    if (!domain) return '<malformed>';
    return `${local.slice(0, 1)}${'*'.repeat(Math.max(1, local.length - 1))}@${domain}`;
}
