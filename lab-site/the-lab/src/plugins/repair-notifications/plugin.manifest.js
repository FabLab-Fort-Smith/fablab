// Manifest for the repair-notifications plugin — the final Phase-1 pilot addon
// (AD-5), mirroring the AD-4 contact-submissions addon. Inert data validated +
// frozen by the platform (manifest.schema.js). Ships DISABLED; enabling it is the
// feature flag.
//
// What it adds: the core repair flow stores the request and lets admins change its
// status (unchanged). This addon, when enabled + configured, ADDITIONALLY notifies
// a configurable staff/team address when a repair is submitted or its status
// changes — so the shop can triage without touching the core route. It subscribes
// to the `repair.created` and `repair.updated` hooks (ID-only payloads) and fetches
// the record itself server-side — no PII travels on the bus (ADR 0013).

import { defineManifest } from "@/lib/plugins/manifest.schema";

export default defineManifest({
  id: "repair-notifications",
  name: "Repair Notifications",
  version: "1.0.0",
  description:
    "Notify a configurable staff/team address when a repair request is submitted or its status changes.",
  author: "FabLab Fort Smith",
  icon: "🔧", // 🔧 wrench — addon-manager card glyph (AD-1/AD-2)
  category: "Operations",
  sockets: {
    // React to a new repair request and to repair status changes. ID-only payloads
    // — the handler re-fetches the record server-side, so no name/email/phone/
    // description rides the bus (ADR 0013).
    hooks: ["repair.created", "repair.updated"],
    // Renders a config form from configSchema in the addon manager (AD-2). No
    // adminNav slot: the addon has no page of its own; it is pure hook behaviour.
    adminSettings: true,
  },
  // Flat, declarative knobs only (AD-1 config types). No `secret`: the addon reuses
  // the app's env-configured SMTP transport, so there is no plugin-specific
  // credential to hold — a secret field here would be dead weight (least surface).
  configSchema: {
    notifyTo: {
      type: "string",
      default: "",
      max: 254, // RFC 5321 max address length; also bounds the stored value
      description:
        "Email address repair notifications are sent to (e.g. the repair-shop inbox). Leave blank to disable notifications — the addon then no-ops.",
    },
    subjectPrefix: {
      type: "string",
      default: "[Repair]",
      max: 40,
      description: "Prefix prepended to the notification email's subject line.",
    },
    notifyOn: {
      type: "select",
      // "all" = every new request + every status change. A specific status only
      // fires on a repair.updated event whose status matches (core statuses:
      // pending / in_progress / completed / cancelled).
      options: ["all", "in_progress", "completed", "cancelled"],
      default: "all",
      description:
        "Which repair transitions to notify on: all events, or only when a repair moves to a specific status.",
    },
  },
  requiredPermissions: ["repair-notifications:admin"],
  enabledByDefault: false, // ships disabled; enabling it in the admin panel is the flag
});
