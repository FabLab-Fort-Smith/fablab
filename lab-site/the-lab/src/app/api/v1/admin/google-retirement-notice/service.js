import UserModel from '@/app/api/v1/users/model';
import AuthService from '@/app/api/auth/[...nextauth]/service';
import { authMethodsOf } from '@/lib/authMethods';
import { sendGoogleRetirementEmail } from '@/app/utils/email.util';
import logger from '@/lib/logger';
import { retirementDeadline } from '@/lib/googleRetirement';


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
 * Two limits worth knowing before running it:
 * - `sentButUnstamped` counts members who WERE emailed but whose stamp write failed. A
 *   blanket re-run would mail them twice, so handle those individually (or with `limit`)
 *   rather than re-running the whole cohort.
 * - There is no run lock: two concurrent `send:true` calls both read the pre-stamp cohort
 *   and would both mail everyone. Mitigated by the route's rate limit and a single admin
 *   operator, not by atomic claiming — chosen deliberately, since claim-before-send
 *   inverts the failure mode into "claimed but never sent" (a silent miss, which is worse
 *   here than a rare duplicate).
 *
 * @param {Object} [options]
 * @param {boolean} [options.send=false] - actually send; false = dry run
 * @param {string} [options.deadline] - human-readable retirement date for the copy
 * @param {boolean} [options.force=false] - re-send to accounts already notified (reminder pass)
 * @param {number} [options.limit=0] - cap the number of recipients (0 = no cap)
 * @returns {Promise<{dryRun: boolean, candidates: number, cohort: number, strandedNoCredential: number, alreadyNotified: number, sent: number, failed: number, sentButUnstamped: number, undecryptable: number, remaining: number, recipients: string[]}>}
 */
export async function runGoogleRetirementNotice({ send = false, deadline, force = false, limit = 0 } = {}) {
    const when = deadline || retirementDeadline();
    // Throws if the query fails — a false "cohort: 0" must never look like an all-clear.
    const candidates = await UserModel.getGoogleIdentityUsers();

    const cohort = candidates.filter((u) => authMethodsOf(u).googleOnly);
    // Accounts with NO usable sign-in method at all: already locked out and invisible to
    // the googleOnly rule (e.g. provider:'google' with no googleId). Surfacing this is the
    // point — "cohort: 0" only means "nobody is locked out" if this is 0 too.
    const strandedNoCredential = candidates.filter((u) => authMethodsOf(u).methodCount === 0).length;

    let alreadyNotified = 0;
    let undecryptable = 0;
    let sent = 0;
    let failed = 0;
    let sentButUnstamped = 0;
    let processed = 0;
    const recipients = [];

    for (const user of cohort) {
        if (!force && user.googleRetirementNoticeSentAt) { alreadyNotified++; processed++; continue; }
        if (limit > 0 && recipients.length >= limit) break;

        const email = AuthService.decryptEmail(user.email);
        if (!email || !email.includes('@')) { undecryptable++; processed++; continue; }
        recipients.push(maskEmail(email));
        processed++;

        if (!send) continue; // dry run: counted, not contacted

        try {
            await sendGoogleRetirementEmail(email, user.firstName, when);
            sent++;
        } catch (error) {
            failed++;
            logger.error({ err: error, userID: user.userID }, 'google retirement notice failed to send');
            continue; // unstamped on purpose — retried on the next run
        }

        // Stamped in a SEPARATE try: the mail is already delivered, so a stamp failure is
        // NOT a send failure. Counting it as `failed` would invite a re-run that
        // double-mails this member.
        try {
            await UserModel.updateUser({ userID: user.userID }, { googleRetirementNoticeSentAt: new Date() });
        } catch (error) {
            sentButUnstamped++;
            logger.error({ err: error, userID: user.userID }, 'notice delivered but stamp failed — a re-run would duplicate it');
        }
    }

    const summary = {
        dryRun: !send,
        candidates: candidates.length,
        cohort: cohort.length,
        strandedNoCredential,
        alreadyNotified,
        sent,
        failed,
        sentButUnstamped,
        undecryptable,
        remaining: Math.max(0, cohort.length - processed),
        recipients,
    };
    logger.info({ ...summary, recipients: undefined }, 'google retirement notice run');
    return summary;
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
