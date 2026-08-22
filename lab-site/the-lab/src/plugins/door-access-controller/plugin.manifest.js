// Manifest for the door-access-controller plugin — physical door access for the
// makerspace. Consolidates the existing (scattered) door-unlock / card-pairing /
// good-standing logic into one policy-owning addon. Inert data, validated + frozen
// by the platform (manifest.schema.js). Ships DISABLED; enabling it is the flag.
//
// The addon owns door POLICY (role x time x door x account), the card model, the
// door registry, audit, and the offline-allowlist signer. It does NOT own identity
// or membership — the core resolves those and presents them per request.
// Design: docs/architecture/door-access-controller.md.

import { defineManifest } from "@/lib/plugins/manifest.schema";

export default defineManifest({
  id: "door-access-controller",
  name: "Door Access Controller",
  version: "0.1.0",
  description:
    "Policy-driven physical door access (NFC / QR / app) over the VPS socket-server, with a signed offline allowlist.",
  author: "FabLab Fort Smith",
  sockets: {
    // Revoke a member's door access the moment they're suspended or removed.
    hooks: ["membership.suspended", "member.deleted"],
    adminNav: {
      sym: "▤", // ▤
      label: "door access",
      desc: "doors, access policy & cards",
      path: "/dashboard/admin/door-access-controller",
      color: "var(--cyan)",
    },
    adminSettings: true,
    apiRoutes: ["/api/v1/plugins/door-access-controller/*"],
  },
  // Flat operational knobs only. The structured policy (role x time-window rules,
  // per-account overrides, door registry) lives in the addon's own DB model — it is
  // too rich for the flat configSchema. See the design doc, "Data model".
  configSchema: {
    requireGoodStanding: {
      type: "boolean",
      default: true,
      description: "Require active membership + subscription (from core facts) before any door rule applies",
    },
    allowAdminBypass: {
      type: "boolean",
      default: true,
      description: "Admins bypass time-window rules (still subject to an account ban)",
    },
    defaultTimezone: {
      type: "string",
      default: "America/Chicago",
      description: "IANA timezone used to evaluate access time-windows when a door sets none",
    },
    offlineRefreshMinutes: {
      type: "number",
      default: 15,
      min: 1,
      max: 240,
      description: "How often the signed offline allowlist is rebuilt + pushed to the socket-server",
    },
    offlineTtlMinutes: {
      type: "number",
      default: 30,
      min: 5,
      max: 1440,
      description: "Validity of a pushed offline allowlist; the door denies once it expires (fail-secure)",
    },
    authoritative: {
      type: "boolean",
      default: false,
      description:
        "CUTOVER flag: when false the addon only shadow-compares against the live check-access (logs divergences, changes nothing). When true (and enabled) the addon's decision becomes authoritative for internal/check-access. Flip only after parallel-run shows agreement.",
    },
    retirePlaintextCode: {
      type: "boolean",
      default: false,
      description:
        "RETIRE flag: when true (and the addon is enabled + ready), stop persisting the raw card code in membership.accessKey.code — new pairings live ONLY in the encrypted addon store. Flip AFTER cutover (authoritative) is proven and the backfill has run; then run scripts/purge-plaintext-card-codes.mjs to remove the old codes.",
    },
  },
  requiredPermissions: ["door-access-controller:admin"],
  enabledByDefault: false, // ships disabled; enabling it in the admin panel is the feature flag
});
