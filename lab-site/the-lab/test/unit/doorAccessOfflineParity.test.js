// DRIFT GUARD: the vps/ offline decider is a PORT of the addon's canonical logic. This asserts
// the two agree — same blind index, and identical decisions across the reason space — so a change
// on one side that isn't mirrored fails CI.

import crypto from "crypto";
import { signAllowlist } from "@/plugins/door-access-controller/allowlistCrypto";
import { blindIndex as addonBlindIndex } from "@/plugins/door-access-controller/cardCrypto";
import { decideOffline as addonDecide } from "@/plugins/door-access-controller/offlineDecision";
import { blindIndex as vpsBlindIndex, decideOffline as vpsDecide } from "../../vps/lib/offlineAccess.js";

const TZ = "America/Chicago";
const WED_2PM = new Date("2026-08-19T19:00:00Z");
const SAT_2PM = new Date("2026-08-22T19:00:00Z");
const FAR = "2026-08-30T00:00:00.000Z";
const PAST = "2026-08-19T18:59:00.000Z";

beforeAll(() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  process.env.DOOR_ALLOWLIST_SIGNING_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  process.env.DOOR_ALLOWLIST_VERIFY_KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  process.env.DOOR_CARD_INDEX_KEY = "parity-index-key";
});

test("blind index is identical across addon + vps ports", () => {
  for (const code of ["CARD-A", "PIN-CARD-001", "zzz-999"]) {
    expect(vpsBlindIndex(code)).toBe(addonBlindIndex(code));
  }
});

test("decideOffline agrees across addon + vps for the full reason space", () => {
  const cred = addonBlindIndex("CARD-A");
  const good = signAllowlist({
    version: 1, expiresAt: FAR, tz: TZ,
    entries: [{ credHash: cred, entries: [{ doorId: "front", windows: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }] }, { doorId: "lab", windows: [] }] }],
  });
  const expired = signAllowlist({ version: 1, expiresAt: PAST, tz: TZ, entries: [{ credHash: cred, entries: [{ doorId: "lab", windows: [] }] }] });

  const cases = [
    [good, { credHash: cred, doorId: "lab", now: WED_2PM }],       // 24/7 grant
    [good, { credHash: cred, doorId: "front", now: WED_2PM }],     // in-window grant
    [good, { credHash: cred, doorId: "front", now: SAT_2PM }],     // out-of-window
    [good, { credHash: "ghost", doorId: "lab", now: WED_2PM }],    // unknown credential
    [good, { credHash: cred, doorId: "vault", now: WED_2PM }],     // no door
    [expired, { credHash: cred, doorId: "lab", now: WED_2PM }],    // expired
  ];
  for (const [signed, q] of cases) {
    expect(vpsDecide(signed, q)).toEqual(addonDecide(signed, q));
  }
});
