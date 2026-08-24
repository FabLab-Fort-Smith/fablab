// On-site broker: per-door signed-envelope cache (Tier 1, rung 2 — see
// docs/architecture/door-controller-wifi.md §2/§3c). The cloud pushes each door a signed,
// broker-keyed envelope; the broker caches it and decides offline (brokerAccess.js) when the cloud
// is unreachable. This file owns STORAGE only — verification lives in brokerAccess.
//
// Anti-rollback (F5): a strictly-monotonic per-doorId `version` high-water is persisted; an envelope
// with a version <= the newest seen is REJECTED, so a writable-cache attacker can't replay an
// older-but-unexpired envelope to re-enable a revoked card. Persisting to disk keeps the high-water
// (and the envelopes) across a broker restart.
//
// Path-safety (CWE-22): doorId is allow-listed to a bounded charset (never "." / ".." / a separator)
// before it becomes a leaf filename under <dir>/doors/.

import fs from "fs/promises";
import path from "path";

// doorId → a safe leaf filename. Same charset as the OTA device-id guard.
const DOORID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
function assertDoorId(id) {
  if (typeof id !== "string" || id === "." || id === ".." || !DOORID_RE.test(id)) {
    throw new Error(`invalid doorId: ${id}`);
  }
  return id;
}

/**
 * Build a broker envelope store bound to a directory. Persisted layout:
 *   <dir>/doors/<doorId>.json   the latest signed envelope for that door
 *   <dir>/hwm.json              { doorId: highestVersionSeen }  (anti-rollback high-water)
 * @param {object} [opts]
 * @param {string} [opts.dir=process.env.BROKER_ENVELOPE_DIR]  persistent dir (required to use)
 * @returns {{ready,putEnvelope,getEnvelope,listDoors,highWater}}
 */
export function makeBrokerStore({ dir = process.env.BROKER_ENVELOPE_DIR } = {}) {
  const doorsDir = () => path.join(dir, "doors");
  const envPath = (doorId) => path.join(doorsDir(), `${assertDoorId(doorId)}.json`);
  const hwmPath = () => path.join(dir, "hwm.json");

  async function readJson(p) {
    try {
      return JSON.parse(await fs.readFile(p, "utf8"));
    } catch {
      return null;
    }
  }
  async function writeJsonAtomic(p, value) {
    await fs.mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value), { mode: 0o640 });
    await fs.rename(tmp, p); // atomic
  }

  return {
    /** True when a persistent dir is configured. */
    ready() {
      return Boolean(dir);
    },

    /** The persisted anti-rollback high-water for a door (0 if never seen). */
    async highWater(doorId) {
      assertDoorId(doorId);
      const hwm = (await readJson(hwmPath())) || {};
      return Number.isInteger(hwm[doorId]) ? hwm[doorId] : 0;
    },

    /**
     * Store a signed per-door envelope IF its `version` is strictly newer than the persisted
     * high-water for that door (anti-rollback). Caller MUST have verified the signature first
     * (brokerAccess.setEnvelope does). The `version` is authenticated by that signature.
     * @param {{payload:{doorId:string, version:number}, sig:string}} signed
     * @returns {Promise<{stored:boolean, reason?:string, version?:number}>}
     */
    async putEnvelope(signed) {
      const doorId = signed?.payload?.doorId;
      const version = signed?.payload?.version;
      if (typeof doorId !== "string" || !Number.isInteger(version)) {
        return { stored: false, reason: "bad-envelope" };
      }
      assertDoorId(doorId);
      const hwm = (await readJson(hwmPath())) || {};
      const prev = Number.isInteger(hwm[doorId]) ? hwm[doorId] : 0;
      if (version <= prev) return { stored: false, reason: "stale-version" }; // anti-rollback (F5)
      await writeJsonAtomic(envPath(doorId), signed);
      hwm[doorId] = version;
      await writeJsonAtomic(hwmPath(), hwm);
      return { stored: true, version };
    },

    /** Get the cached signed envelope for a door, or null. */
    async getEnvelope(doorId) {
      return readJson(envPath(doorId));
    },

    /** List the doorIds with a cached envelope. */
    async listDoors() {
      let names;
      try {
        names = await fs.readdir(doorsDir());
      } catch {
        return [];
      }
      return names.filter((n) => n.endsWith(".json") && !n.endsWith(".tmp")).map((n) => n.slice(0, -5));
    },
  };
}

const BrokerStore = { makeBrokerStore };
export default BrokerStore;
