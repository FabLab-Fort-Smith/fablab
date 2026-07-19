// Manifest for the member-email plugin — self-service @<domain> mailboxes via
// PurelyMail. Inert data validated + frozen by the platform (manifest.schema.js).

import { defineManifest } from "@/lib/plugins/manifest.schema";

export default defineManifest({
  id: "member-email",
  name: "Member Email",
  version: "1.0.0",
  description: "Active members self-claim an @fablabfortsmith.org mailbox (PurelyMail).",
  author: "FabLab Fort Smith",
  sockets: {
    // Lifecycle hygiene: clean up a member's mailbox when they're removed. (The
    // suspended event is declared for a future auto-suspend; not yet emitted.)
    hooks: ["member.deleted", "membership.suspended"],
    adminNav: {
      sym: "@",
      label: "member email",
      desc: "manage member mailboxes",
      path: "/dashboard/admin/member-email",
      color: "var(--green)",
    },
    adminSettings: true,
    apiRoutes: ["/api/v1/plugins/member-email/*"],
  },
  configSchema: {
    maxMailboxesPerMember: {
      type: "number",
      default: 1,
      min: 1,
      max: 5,
      description: "Active mailboxes a member may hold",
    },
    minAccountCredit: {
      type: "number",
      default: 1,
      min: 0,
      description: "PurelyMail credit (USD) required before provisioning",
    },
    additionalReserved: {
      type: "string[]",
      default: [],
      description: "Extra reserved local parts (never claimable)",
    },
  },
  requiredPermissions: ["member-email:admin"],
  enabledByDefault: false, // ships disabled; enabling it is the feature flag
});
