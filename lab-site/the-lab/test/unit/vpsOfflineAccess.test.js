// vps/lib/offlineAccess.js — the socket-server's offline decider + snapshot store. Snapshots
// are signed by the addon (real signAllowlist) and verified here (interop), so this also proves
// addon-signs / socket-server-verifies works end to end.

import crypto from "crypto";
import { signAllowlist } from "@/plugins/door-access-controller/allowlistCrypto";
import offline, { blindIndex } from "../../vps/lib/offlineAccess.js";

const TZ = "America/Chicago";
const WED_2PM = new Date("2026-08-19T19:00:00Z");
const SAT_2PM = new Date("2026-08-22T19:00:00Z");
const FAR = "2026-08-30T00:00:00.000Z";
const PAST = "2026-08-19T18:59:00.000Z";

const snap = (expiresAt, entries) => signAllowlist({ version: 1, expiresAt, tz: TZ, entries });

beforeAll(() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  process.env.DOOR_ALLOWLIST_SIGNING_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"); // addon signs
  process.env.DOOR_ALLOWLIST_VERIFY_KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64"); // vps verifies
  process.env.DOOR_CARD_INDEX_KEY = "vps-offline-index-key";
});
beforeEach(() => offline.clearSnapshot());

test("no snapshot → fail-secure deny", () => {
  expect(offline.authorizeOffline({ code: "CARD-A", doorId: "front", now: WED_2PM })).toEqual({ granted: false, reason: "no-snapshot" });
});

test("setSnapshot rejects a forged (bad-signature) push", () => {
  const s = snap(FAR, [{ credHash: blindIndex("CARD-A"), entries: [{ doorId: "front", windows: [] }] }]);
  s.payload.entries[0].entries[0].doorId = "vault"; // tamper after signing
  expect(offline.setSnapshot(s).stored).toBe(false);
  expect(offline.snapshotStatus().hasSnapshot).toBe(false);
});

test("stores a valid snapshot; 24/7 door → granted", () => {
  const s = snap(FAR, [{ credHash: blindIndex("CARD-A"), entries: [{ doorId: "front", windows: [] }] }]);
  expect(offline.setSnapshot(s)).toMatchObject({ stored: true, entryCount: undefined }); // entryCount absent in this hand-built payload
  expect(offline.snapshotStatus().hasSnapshot).toBe(true);
  expect(offline.authorizeOffline({ code: "CARD-A", doorId: "front", now: WED_2PM })).toEqual({ granted: true, reason: "granted" });
});

test("windowed door: in-window grant, out-of-window deny, unknown card + wrong door deny", () => {
  const s = snap(FAR, [{ credHash: blindIndex("CARD-A"), entries: [{ doorId: "front", windows: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }] }] }]);
  offline.setSnapshot(s);
  expect(offline.authorizeOffline({ code: "CARD-A", doorId: "front", now: WED_2PM }).granted).toBe(true);
  expect(offline.authorizeOffline({ code: "CARD-A", doorId: "front", now: SAT_2PM })).toEqual({ granted: false, reason: "no-window" });
  expect(offline.authorizeOffline({ code: "GHOST", doorId: "front", now: WED_2PM }).reason).toBe("unknown-credential");
  expect(offline.authorizeOffline({ code: "CARD-A", doorId: "vault", now: WED_2PM }).reason).toBe("no-door");
});

test("expired snapshot → deny", () => {
  offline.setSnapshot(snap(PAST, [{ credHash: blindIndex("CARD-A"), entries: [{ doorId: "front", windows: [] }] }]));
  expect(offline.authorizeOffline({ code: "CARD-A", doorId: "front", now: WED_2PM })).toEqual({ granted: false, reason: "expired" });
});

test("window tz falls back to the snapshot's tz when the caller passes none", () => {
  offline.setSnapshot(snap(FAR, [{ credHash: blindIndex("CARD-A"), entries: [{ doorId: "front", windows: [{ days: [3], start: "09:00", end: "17:00" }] }] }]));
  // WED_2PM is Wed 14:00 in the snapshot's America/Chicago tz → in window, even with no tz arg.
  expect(offline.authorizeOffline({ code: "CARD-A", doorId: "front", now: WED_2PM }).granted).toBe(true);
});
