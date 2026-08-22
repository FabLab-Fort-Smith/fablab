// Filesystem-backed OTA manifest store for the socket-server. Signed manifests + admin pins live
// under OTA_MANIFEST_DIR (a persistent volume); firmware BLOBS live in the object store, reached
// via blobUrl(OTA_BLOB_BASE + key). See docs/architecture/ota-updates.md.
//
// Path-safety (CWE-22): role is allow-listed and version is semver-checked before touching the FS,
// so a crafted role/version can never escape the store dir.

import fs from "fs/promises";
import path from "path";
import { compareSemver } from "./otaManifest.js";

const ROLES = new Set(["pico", "pi-zero"]);
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function assertRole(role) {
  if (!ROLES.has(role)) throw new Error(`invalid role: ${role}`);
  return role;
}
function assertVersion(v) {
  if (typeof v !== "string" || !SEMVER_RE.test(v)) throw new Error(`invalid version: ${v}`);
  return v;
}

/**
 * Build a store bound to a directory + blob base URL.
 * @param {object} [opts]
 * @param {string} [opts.dir=process.env.OTA_MANIFEST_DIR]  persistent manifest dir (required to use)
 * @param {string} [opts.blobBase=process.env.OTA_BLOB_BASE]  object-store base URL for blobs
 * @returns {{ready,getManifest,getLatestManifest,putManifest,getPin,setPin,blobUrl}}
 */
export function makeStore({ dir = process.env.OTA_MANIFEST_DIR, blobBase = process.env.OTA_BLOB_BASE } = {}) {
  const pinsPath = () => path.join(dir, "pins.json");
  const roleDir = (role) => path.join(dir, assertRole(role));
  const manifestPath = (role, version) => path.join(roleDir(role), `${assertVersion(version)}.json`);

  async function readJson(p) {
    try {
      return JSON.parse(await fs.readFile(p, "utf8"));
    } catch {
      return null;
    }
  }

  return {
    /** True when the store is usable (dir + blob base configured). */
    ready() {
      return Boolean(dir && blobBase);
    },

    /** Get a specific signed manifest, or null. */
    async getManifest(role, version) {
      return readJson(manifestPath(role, version));
    },

    /** Get the highest-version signed manifest for a role, or null. */
    async getLatestManifest(role) {
      let names;
      try {
        names = await fs.readdir(roleDir(role));
      } catch {
        return null;
      }
      const versions = names
        .filter((n) => n.endsWith(".json"))
        .map((n) => n.slice(0, -5))
        .filter((v) => SEMVER_RE.test(v));
      if (!versions.length) return null;
      versions.sort(compareSemver);
      return this.getManifest(role, versions[versions.length - 1]);
    },

    /** Persist a signed manifest under its role/version (atomic write via temp+rename). */
    async putManifest(signed) {
      const { role, version } = signed.manifest;
      const p = manifestPath(role, version); // validates role+version
      await fs.mkdir(path.dirname(p), { recursive: true });
      const tmp = `${p}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(signed), { mode: 0o640 });
      await fs.rename(tmp, p); // atomic
      return { role, version };
    },

    /** Resolve a pin: device-specific (`role:deviceId`) wins over a role-wide pin. Returns version|null. */
    async getPin(role, deviceId) {
      const pins = (await readJson(pinsPath())) || {};
      return (deviceId && pins[`${role}:${deviceId}`]) || pins[role] || null;
    },

    /** Set a pin (key from otaServer.pinKey). Persisted atomically. */
    async setPin(key, version) {
      assertVersion(version);
      await fs.mkdir(dir, { recursive: true });
      const pins = (await readJson(pinsPath())) || {};
      pins[key] = version;
      const tmp = `${pinsPath()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(pins), { mode: 0o640 });
      await fs.rename(tmp, pinsPath());
    },

    /** Capability URL for a firmware blob in the object store. */
    blobUrl(blobKey) {
      if (!blobBase) throw new Error("OTA_BLOB_BASE is not configured");
      return `${blobBase.replace(/\/$/, "")}/${String(blobKey).replace(/^\//, "")}`;
    },
  };
}

export default { makeStore };
