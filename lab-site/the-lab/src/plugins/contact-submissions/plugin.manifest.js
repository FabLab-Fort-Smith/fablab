// Manifest for the contact-submissions plugin — the pilot addon proving the
// in-repo plugin platform end-to-end (AD-4). Inert data validated + frozen by the
// platform (manifest.schema.js). Ships DISABLED; enabling it is the feature flag.
//
// What it adds: when a public contact form is submitted the core stores the record
// and emails the site admin (unchanged). This addon, when enabled + configured,
// ADDITIONALLY forwards a copy of the new submission to a configurable routing
// address (e.g. a shared team / department inbox) so intake can be triaged without
// touching the core flow. It subscribes to the `contact.submitted` hook (ID-only
// payload) and fetches the record itself server-side — no PII travels on the bus.

import { defineManifest } from "@/lib/plugins/manifest.schema";

export default defineManifest({
  id: "contact-submissions",
  name: "Contact Submissions",
  version: "1.0.0",
  description:
    "Forward new public contact-form submissions to a configurable routing inbox (e.g. a shared team address).",
  author: "FabLab Fort Smith",
  icon: "✉", // ✉ envelope — addon-manager card glyph (AD-1/AD-2)
  category: "Communications",
  sockets: {
    // React to a new public submission. ID-only payload — the handler re-fetches
    // the record server-side, so no name/email/message rides the bus (ADR 0013).
    hooks: ["contact.submitted"],
    // Renders a config form from configSchema in the addon manager (AD-2). No
    // adminNav slot: the addon has no page of its own; it is pure hook behaviour.
    adminSettings: true,
  },
  // Flat, declarative knobs only (AD-1 config types). No `secret`: the addon reuses
  // the app's env-configured SMTP transport, so there is no plugin-specific
  // credential to hold — a secret field here would be dead weight (least surface).
  configSchema: {
    forwardTo: {
      type: "string",
      default: "",
      max: 254, // RFC 5321 max address length; also bounds the stored value
      description:
        "Email address new contact submissions are forwarded to (e.g. a shared team inbox). Leave blank to disable forwarding — the addon then no-ops.",
    },
    subjectPrefix: {
      type: "string",
      default: "[Contact]",
      max: 40,
      description: "Prefix prepended to the forwarded email's subject line.",
    },
    includeMessage: {
      type: "select",
      options: ["full", "summary", "none"],
      default: "full",
      description:
        "How much of the submission to include in the forward: full message, a short truncated summary, or none (notify only, no body).",
    },
  },
  requiredPermissions: ["contact-submissions:admin"],
  enabledByDefault: false, // ships disabled; enabling it in the admin panel is the flag
});
