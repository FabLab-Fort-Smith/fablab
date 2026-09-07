// Behaviour for the contact-submissions addon. Reacts to the `contact.submitted`
// hook: re-fetches the submission server-side (the event is ID-only) and forwards
// it to the admin-configured routing address via the shared mail transport.
//
// Invariants (ADR 0013 + the-lab/CLAUDE.md §5):
// - Fail closed: every path catches; a failure here is a clean no-op and NEVER
//   propagates into the core contact POST (the hook bus also isolates throws —
//   this is defence in depth).
// - No PII in logs/audit: audit records carry the submissionID + non-PII reasons
//   only. The name/email/message are read into memory to compose the email and
//   nowhere else.

import { getSubmissionById } from "./model";
import { resolveConfig, PLUGIN_ID } from "./config";
import { sendNotificationEmail, escapeHtml } from "@/app/utils/email.util";
import { auditLog } from "@/lib/audit";

/** Max characters of the message body included when includeMessage = "summary". */
const SUMMARY_LEN = 200;

/**
 * Build the forwarded email's HTML body from a submission, honouring the
 * includeMessage config knob. All member-controlled fields are HTML-escaped
 * (CWE-79) before interpolation.
 * @param {{name?:string, email?:string, message?:string, createdAt?:Date}} sub
 * @param {"full"|"summary"|"none"} includeMessage
 * @returns {string}
 */
function buildForwardHtml(sub, includeMessage) {
  const name = escapeHtml(sub?.name);
  const email = escapeHtml(sub?.email);
  let bodyBlock = "";
  if (includeMessage !== "none") {
    let msg = typeof sub?.message === "string" ? sub.message : "";
    if (includeMessage === "summary" && msg.length > SUMMARY_LEN) {
      msg = `${msg.slice(0, SUMMARY_LEN)}…`;
    }
    bodyBlock = `
      <div style="border: 1px solid #333; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap;">${escapeHtml(msg)}</p>
      </div>`;
  }
  return `
    <div style="font-family: 'Roboto Mono', monospace; background-color: #000000; color: #00ff00; padding: 20px; border-radius: 8px;">
      <h2 style="color: #00ff00;">Forwarded contact submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      ${bodyBlock}
    </div>`;
}

const Service = {
  /**
   * Handle a `contact.submitted` event. Best-effort + fail closed: any problem is
   * audited (no PII) and the function resolves without throwing.
   * @param {{submissionID?:string|null}} payload - ID-only event payload
   * @returns {Promise<void>}
   */
  async onContactSubmitted(payload) {
    const submissionID = payload?.submissionID;
    try {
      if (!submissionID) {
        auditLog("contact-submissions.skip", {
          actor: { pluginId: PLUGIN_ID },
          outcome: "skipped",
          reason: "no-submission-id",
        });
        return;
      }

      const config = await resolveConfig();
      const forwardTo = typeof config.forwardTo === "string" ? config.forwardTo.trim() : "";
      if (!forwardTo) {
        auditLog("contact-submissions.skip", {
          actor: { pluginId: PLUGIN_ID },
          target: submissionID,
          outcome: "skipped",
          reason: "not-configured",
        });
        return;
      }

      const submission = await getSubmissionById(submissionID);
      if (!submission) {
        auditLog("contact-submissions.skip", {
          actor: { pluginId: PLUGIN_ID },
          target: submissionID,
          outcome: "skipped",
          reason: "not-found",
        });
        return;
      }

      const subject = `${config.subjectPrefix || "[Contact]"} New submission`;
      const html = buildForwardHtml(submission, config.includeMessage);
      await sendNotificationEmail(forwardTo, subject, html);

      auditLog("contact-submissions.forwarded", {
        actor: { pluginId: PLUGIN_ID },
        target: submissionID,
        outcome: "sent",
      });
    } catch (err) {
      // Never break the core contact flow. Record the failure SHAPE only — the
      // error may reference the recipient, so log err.message, never the object.
      auditLog("contact-submissions.forward_failed", {
        actor: { pluginId: PLUGIN_ID },
        target: submissionID || null,
        outcome: "error",
        reason: err?.message || "forward error",
      });
    }
  },
};

export default Service;
