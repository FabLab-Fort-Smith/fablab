// Behaviour for the repair-notifications addon. Reacts to the `repair.created` and
// `repair.updated` hooks: re-fetches the repair server-side (the events are
// ID-only) and notifies the admin-configured staff address via the shared mail
// transport.
//
// Invariants (ADR 0013 + the-lab/CLAUDE.md §5):
// - Fail closed: every path catches; a failure here is a clean no-op and NEVER
//   propagates into the core repair POST/PUT (the hook bus also isolates throws —
//   this is defence in depth).
// - No PII in logs/audit: audit records carry the repairID + non-PII reasons (and
//   the status enum) only. The name/email/phone/description are read into memory to
//   compose the email and nowhere else.

import { getRepairById } from "./model";
import { resolveConfig, PLUGIN_ID } from "./config";
import { sendNotificationEmail, escapeHtml } from "@/app/utils/email.util";
import { auditLog } from "@/lib/audit";

/**
 * Build the notification email's HTML body from a repair. Every member-controlled
 * field is HTML-escaped (CWE-79) before interpolation; the layout mirrors the app's
 * terminal-green notification style.
 * @param {{repairID?:string, name?:string, email?:string, deviceType?:string, issueDescription?:string, status?:string}} repair
 * @returns {string}
 */
function buildNotificationHtml(repair) {
  const repairID = escapeHtml(repair?.repairID);
  const name = escapeHtml(repair?.name);
  const email = escapeHtml(repair?.email);
  const deviceType = escapeHtml(repair?.deviceType);
  const status = escapeHtml(repair?.status);
  const issue = escapeHtml(repair?.issueDescription);
  return `
    <div style="font-family: 'Roboto Mono', monospace; background-color: #000000; color: #00ff00; padding: 20px; border-radius: 8px;">
      <h2 style="color: #00ff00;">Repair notification</h2>
      <p><strong>Repair:</strong> ${repairID}</p>
      <p><strong>Status:</strong> ${status}</p>
      <p><strong>Device:</strong> ${deviceType}</p>
      <p><strong>Requested by:</strong> ${name} (${email})</p>
      <div style="border: 1px solid #333; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p><strong>Issue:</strong></p>
        <p style="white-space: pre-wrap;">${issue}</p>
      </div>
    </div>`;
}

const Service = {
  /**
   * Handle a `repair.created` or `repair.updated` event. Best-effort + fail closed:
   * any problem is audited (no PII) and the function resolves without throwing.
   * @param {{repairID?:string|null, status?:string}} payload - ID-only event payload
   * @returns {Promise<void>}
   */
  async onRepairEvent(payload) {
    const repairID = payload?.repairID;
    try {
      if (!repairID) {
        auditLog("repair-notifications.skip", {
          actor: { pluginId: PLUGIN_ID },
          outcome: "skipped",
          reason: "no-repair-id",
        });
        return;
      }

      const config = await resolveConfig();
      const notifyTo = typeof config.notifyTo === "string" ? config.notifyTo.trim() : "";
      if (!notifyTo) {
        auditLog("repair-notifications.skip", {
          actor: { pluginId: PLUGIN_ID },
          target: repairID,
          outcome: "skipped",
          reason: "not-configured",
        });
        return;
      }

      // Status gate. "all" notifies on every event. A specific status only fires on
      // a repair.updated event whose payload status matches — so a created event
      // (no status on the bus) is only notified when notifyOn is "all". Filtering
      // here (before the DB read) keeps unmatched events cheap.
      const notifyOn = typeof config.notifyOn === "string" ? config.notifyOn : "all";
      if (notifyOn !== "all") {
        const eventStatus = typeof payload?.status === "string" ? payload.status : null;
        if (!eventStatus || eventStatus !== notifyOn) {
          auditLog("repair-notifications.skip", {
            actor: { pluginId: PLUGIN_ID },
            target: repairID,
            outcome: "skipped",
            reason: "status-filtered",
          });
          return;
        }
      }

      const repair = await getRepairById(repairID);
      if (!repair) {
        auditLog("repair-notifications.skip", {
          actor: { pluginId: PLUGIN_ID },
          target: repairID,
          outcome: "skipped",
          reason: "not-found",
        });
        return;
      }

      const statusLabel = typeof repair.status === "string" ? repair.status : "updated";
      const subject = `${config.subjectPrefix || "[Repair]"} ${statusLabel}`;
      const html = buildNotificationHtml(repair);
      await sendNotificationEmail(notifyTo, subject, html);

      auditLog("repair-notifications.notified", {
        actor: { pluginId: PLUGIN_ID },
        target: repairID,
        outcome: "sent",
      });
    } catch (err) {
      // Never break the core repair flow. Record the failure SHAPE only — the error
      // may reference the recipient, so log err.message, never the object.
      auditLog("repair-notifications.notify_failed", {
        actor: { pluginId: PLUGIN_ID },
        target: repairID || null,
        outcome: "error",
        reason: err?.message || "notify error",
      });
    }
  },
};

export default Service;
