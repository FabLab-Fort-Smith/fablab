// On-site broker: per-door signed-envelope cache (Tier 1, rung 2 — see
// docs/architecture/door-controller-wifi.md §2/§3c). The cloud pushes each door a signed,
// broker-keyed envelope; the broker caches it and decides offline (brokerAccess.js) when the cloud
// is unreachable. This file owns STORAGE + anti-rollback; the signature check is INJECTED.
//
// Anti-rollback (F5), made atomic (SEC review F-1/F-2): the per-door envelope FILE is the single
// source of truth for the current `version` — there is no separate high-water file to clobber or
// desync from the envelope on a crash. Every write goes through a per-door async mutex (the broker
// is one Node process, so a promise-chain lock fully serializes it), and the injected `verify` runs
// INSIDE the critical section, so the stored version only ever advances from a signature-verified
// envelope: no lost-update race, no crash-window rollback, no unverified high-water poisoning.
//
// Path-safety (CWE-22): doorId is allow-listed to a bounded charset (never "." / ".." / a separator)
// before it becomes a leaf filename under <dir>/doors/.

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const DOORID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
function assertDoorId(id) {
  if (typeof id !== "string" || id === "." || id === ".." || !DOORID_RE.test(id)) {
    throw new Error(`invalid doorId: ${id}`);
  }
  return id;
}

/**
 * Build a broker envelope store bound to a directory. Persisted layout:
 *   <dir>/doors/<doorId>.json   the latest signed envelope for that door (also THE version of record)
 * @param {object} [opts]
 * @param {string} [opts.dir=process.env.BROKER_ENVELOPE_DIR]  persistent dir (required to use)
 * @returns {{ready,putEnvelope,getEnvelope,highWater,listDoors}}
 */
export function makeBrokerStore({ dir = process.env.BROKER_ENVELOPE_DIR } = {}) {
  const doorsDir = () => path.join(dir, "doors");
  const envPath = (doorId) => path.join(doorsDir(), `${assertDoorId(doorId)}.json`);

  // Per-door promise-chain mutex (single-process serialization). The tail never rejects.
  const chains = new Map();
  function withDoorLock(doorId, fn) {
    const prev = chains.get(doorId) || Promise.resolve();
    const run = prev.then(fn, fn); // run once prev settles, regardless of its outcome
    chains.set(doorId, run.then(() => {}, () => {}));
    return run;
  }

  async function readJson(p) {
    try {
      return JSON.parse(await fs.readFile(p, "utf8"));
    } catch {
      return null;
    }
  }
  async function writeJsonAtomic(p, value) {
    await fs.mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`; // unique → no writer collision
    await fs.writeFile(tmp, JSON.stringify(value), { mode: 0o640 });
    await fs.rename(tmp, p); // atomic replace
  }

  return {
    /** True when a persistent dir is configured. */
    ready() {
      return Boolean(dir);
    },

    /** The current stored version for a door (0 if none) — read from the envelope of record. */
    async highWater(doorId) {
      const cur = await readJson(envPath(doorId));
      return Number.isInteger(cur?.payload?.version) ? cur.payload.version : 0;
    },

    /**
     * Verify + store a per-door envelope IFF its `version` is strictly newer than the currently
     * stored one. Atomic per door (mutex) with `verify` INSIDE the lock — the stored version cannot
     * advance from an unverified or stale envelope. `verify` is REQUIRED (a caller cannot bump state
     * without it — SEC review F-2). The `version` is authenticated by the signature `verify` checks.
     * @param {{payload:{doorId:string, version:number}, sig:string}} signed
     * @param {{verify:(signed:object)=>boolean}} opts
     * @returns {Promise<{stored:boolean, reason?:string, version?:number}>}
     */
    async putEnvelope(signed, { verify } = {}) {
      const doorId = signed?.payload?.doorId;
      const version = signed?.payload?.version;
      if (typeof doorId !== "string" || !Number.isInteger(version)) {
        return { stored: false, reason: "bad-envelope" };
      }
      assertDoorId(doorId);
      if (typeof verify !== "function") return { stored: false, reason: "no-verify" };
      return withDoorLock(doorId, async () => {
        if (!verify(signed)) return { stored: false, reason: "bad-signature" };
        const cur = await readJson(envPath(doorId));
        const prev = Number.isInteger(cur?.payload?.version) ? cur.payload.version : 0;
        if (version <= prev) return { stored: false, reason: "stale-version" }; // anti-rollback (F5), atomic
        await writeJsonAtomic(envPath(doorId), signed);
        return { stored: true, version };
      });
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
      return names.filter((n) => n.endsWith(".json") && !n.includes(".tmp")).map((n) => n.slice(0, -5));
    },
  };
}

const BrokerStore = { makeBrokerStore };
export default BrokerStore;
