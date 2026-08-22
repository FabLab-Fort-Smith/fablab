// OTA server logic: publish signed manifests, and resolve the manifest a device should apply
// (honoring an admin target-pin + anti-rollback). Pure logic — the manifest STORE is injected
// (see otaStore.js for the filesystem impl; tests inject an in-memory stub), so this is unit-
// testable without a disk. See docs/architecture/ota-updates.md. Fail-closed throughout.

import { verifyManifest, isEligibleUpdate, validateManifest, compareSemver } from "./otaManifest.js";

/**
 * Verify + store a signed manifest (called by the CI publish route).
 * @param {object} args
 * @param {{getManifest,getLatestManifest,putManifest,getPin,setPin,blobUrl}} args.store
 * @param {{manifest:object, sig:string}} args.signed
 * @param {import('crypto').KeyObject} [args.verifyKey]  defaults to DOOR_FW_VERIFY_KEY
 * @returns {Promise<{ok:boolean, reason?:string, role?:string, version?:string}>}
 */
export async function publish({ store, signed, verifyKey } = {}) {
  if (!verifyManifest(signed, verifyKey)) return { ok: false, reason: "bad-signature" };
  // validateManifest already ran inside verifyManifest; re-read fields safely.
  const { role, version } = signed.manifest;
  await store.putManifest(signed);
  return { ok: true, role, version };
}

/**
 * Resolve which signed manifest a device should apply.
 * Target selection: a device-specific pin, else a role pin, else the latest published version.
 * Then anti-rollback/staging via isEligibleUpdate. Returns an update envelope (with a blob URL) or
 * {upToDate:true}. Never throws.
 * @param {object} args
 * @param {object} args.store
 * @param {string} args.role
 * @param {string} args.deviceId
 * @param {string} args.currentVersion
 * @param {import('crypto').KeyObject} [args.verifyKey]
 * @returns {Promise<{update:true, manifest:object, sig:string, blobUrl:string, version:string}
 *                   | {upToDate:true, reason?:string}>}
 */
export async function resolveManifest({ store, role, deviceId, currentVersion, verifyKey } = {}) {
  try {
    const pinned = (await store.getPin(role, deviceId)) || null;
    const candidate = pinned
      ? await store.getManifest(role, pinned)
      : await store.getLatestManifest(role);
    if (!candidate) return { upToDate: true, reason: pinned ? "pinned-version-missing" : "none-published" };

    const elig = isEligibleUpdate({ signed: candidate, role, currentVersion, publicKey: verifyKey });
    if (!elig.eligible) return { upToDate: true, reason: elig.reason };

    return {
      update: true,
      manifest: candidate.manifest,
      sig: candidate.sig,
      blobUrl: store.blobUrl(candidate.manifest.blobKey),
      version: candidate.manifest.version,
    };
  } catch {
    return { upToDate: true, reason: "error" }; // fail-closed: never push a bad update on error
  }
}

/**
 * Pin a role (optionally a specific device) to a published target version (admin action).
 * @param {object} args
 * @param {object} args.store
 * @param {string} args.role
 * @param {string} [args.deviceId]  omit to pin the whole role
 * @param {string} args.version
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function setPin({ store, role, deviceId, version } = {}) {
  if (!role) return { ok: false, reason: "role-required" };
  // Validate the target version is a real semver and actually published.
  if (validateManifest({ role, version, minVersion: "0.0.0", sha256: "0".repeat(64), size: 1, blobKey: "x" }).length) {
    return { ok: false, reason: "bad-version" };
  }
  const target = await store.getManifest(role, version);
  if (!target) return { ok: false, reason: "version-not-published" };
  await store.setPin(pinKey(role, deviceId), version);
  return { ok: true };
}

/** Compose a pin key: device-specific (`role:deviceId`) or role-wide (`role`). */
export function pinKey(role, deviceId) {
  return deviceId ? `${role}:${deviceId}` : role;
}

export { compareSemver };
