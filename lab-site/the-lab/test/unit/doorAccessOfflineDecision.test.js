// decideOffline: the socket-server's offline check. Verifies signature + TTL, then matches
// credHash → door → window. Deny by default. Uses a real signed snapshot.

import crypto from "crypto";
import { signAllowlist } from "@/plugins/door-access-controller/allowlistCrypto";
import { decideOffline, OFFLINE_REASON } from "@/plugins/door-access-controller/offlineDecision";

const TZ = "America/Chicago";
const WED_2PM = new Date("2026-08-19T19:00:00Z"); // Wed 14:00 CDT (in 09:00–17:00)
const SAT_2PM = new Date("2026-08-22T19:00:00Z"); // Sat 14:00 CDT (out)

const FAR = "2026-08-30T00:00:00.000Z"; // well after both WED and SAT test instants
const PAST = "2026-08-19T18:59:00.000Z"; // one minute before WED_2PM

const snapshot = (expiresAt) => ({
  version: 1,
  issuedAt: WED_2PM.toISOString(),
  expiresAt,
  entries: [
    {
      credHash: "C1",
      entries: [
        { doorId: "front", windows: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }] },
        { doorId: "lab", windows: [] }, // 24/7
      ],
    },
  ],
});

beforeAll(() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  process.env.DOOR_ALLOWLIST_SIGNING_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  process.env.DOOR_ALLOWLIST_VERIFY_KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64");
});

test("24/7 door → granted", () => {
  const signed = signAllowlist(snapshot(FAR));
  expect(decideOffline(signed, { credHash: "C1", doorId: "lab", now: WED_2PM, tz: TZ })).toMatchObject({ granted: true });
});

test("windowed door, in-window → granted; out-of-window → no-window", () => {
  const signed = signAllowlist(snapshot(FAR));
  expect(decideOffline(signed, { credHash: "C1", doorId: "front", now: WED_2PM, tz: TZ }).granted).toBe(true);
  expect(decideOffline(signed, { credHash: "C1", doorId: "front", now: SAT_2PM, tz: TZ })).toEqual({ granted: false, reason: OFFLINE_REASON.NO_WINDOW });
});

test("expired snapshot → deny", () => {
  const signed = signAllowlist(snapshot(PAST)); // already expired
  expect(decideOffline(signed, { credHash: "C1", doorId: "lab", now: WED_2PM, tz: TZ })).toEqual({ granted: false, reason: OFFLINE_REASON.EXPIRED });
});

test("unknown credential → deny", () => {
  const signed = signAllowlist(snapshot(FAR));
  expect(decideOffline(signed, { credHash: "GHOST", doorId: "lab", now: WED_2PM, tz: TZ }).reason).toBe(OFFLINE_REASON.UNKNOWN_CREDENTIAL);
});

test("door not in the credential's entry → deny", () => {
  const signed = signAllowlist(snapshot(FAR));
  expect(decideOffline(signed, { credHash: "C1", doorId: "vault", now: WED_2PM, tz: TZ }).reason).toBe(OFFLINE_REASON.NO_DOOR);
});

test("tampered snapshot → bad-signature (fail closed)", () => {
  const signed = signAllowlist(snapshot(FAR));
  signed.payload.entries[0].entries[1].doorId = "vault"; // grant lab-24/7 to vault
  expect(decideOffline(signed, { credHash: "C1", doorId: "vault", now: WED_2PM, tz: TZ })).toEqual({ granted: false, reason: OFFLINE_REASON.BAD_SIGNATURE });
});
