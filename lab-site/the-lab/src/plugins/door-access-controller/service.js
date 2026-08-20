// door-access-controller service — business logic layer (no HTTP here; that's
// controller.js). SCAFFOLD: the lifecycle handlers currently audit the revocation
// intent. Wiring them to the card model (clear the pairing) and re-pushing a fresh
// signed offline allowlist lands with the model/route slice — see the design doc,
// "Migration". Keeping them as audited no-ops means enabling the addon is safe today.

import { PLUGIN_ID } from "./config";

const Service = {
  /**
   * A member was suspended → their door access must be revoked.
   * @param {{ userID?: string }} payload  IDs only (no PII) — see hooks.js
   * @param {{ audit?: Function }} [ctx]
   */
  async onMembershipSuspended(payload, ctx) {
    ctx?.audit?.("door-access.revoke", {
      target: payload?.userID,
      outcome: "pending",
      reason: "membership-suspended",
      plugin: PLUGIN_ID,
    });
    // TODO(model): clear the member's card pairing + re-push the offline allowlist.
  },

  /**
   * A member was deleted → remove any door credentials.
   * @param {{ userID?: string }} payload
   * @param {{ audit?: Function }} [ctx]
   */
  async onMemberDeleted(payload, ctx) {
    ctx?.audit?.("door-access.revoke", {
      target: payload?.userID,
      outcome: "pending",
      reason: "member-deleted",
      plugin: PLUGIN_ID,
    });
    // TODO(model): delete the member's card record + re-push the offline allowlist.
  },
};

export default Service;
