// buildSignedAllowlist + refreshAllowlist: assemble entries from cards + policy + facts, sign,
// and push. Model/users/config/transport mocked; the Ed25519 crypto is real (verifies the output).

jest.mock("@/plugins/door-access-controller/model", () => ({ __esModule: true, default: { listCards: jest.fn(), listDoors: jest.fn(), getPolicyDoc: jest.fn() } }));
jest.mock("@/app/api/v1/users/service", () => ({ __esModule: true, default: { getUserByQuery: jest.fn() } }));
jest.mock("@/plugins/door-access-controller/config", () => ({ __esModule: true, PLUGIN_ID: "door-access-controller", resolveConfig: jest.fn() }));
jest.mock("@/lib/access-control", () => ({ __esModule: true, pushAllowlist: jest.fn() }));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import crypto from "crypto";
import Service from "@/plugins/door-access-controller/service";
import Model from "@/plugins/door-access-controller/model";
import UsersService from "@/app/api/v1/users/service";
import { resolveConfig } from "@/plugins/door-access-controller/config";
import { pushAllowlist } from "@/lib/access-control";
import { auditLog } from "@/lib/audit";
import { verifyAllowlist } from "@/plugins/door-access-controller/allowlistCrypto";

const MEMBER_RULE = { id: "m", roles: ["member"], doors: ["front"], windows: [] }; // 24/7 front
const activeMember = { userID: "u1", role: "member", membership: { type: "co-op", status: "active", subscriptionStatus: "ACTIVE" } };

beforeAll(() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  process.env.DOOR_ALLOWLIST_SIGNING_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  process.env.DOOR_ALLOWLIST_VERIFY_KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64");
});
beforeEach(() => {
  jest.clearAllMocks();
  resolveConfig.mockResolvedValue({ requireGoodStanding: true, allowAdminBypass: true, defaultTimezone: "America/Chicago", offlineTtlMinutes: 30 });
  Model.getPolicyDoc.mockResolvedValue({ rules: [MEMBER_RULE], accountOverrides: {} });
  Model.listDoors.mockResolvedValue([{ doorId: "front" }]);
  Model.listCards.mockResolvedValue([{ userID: "u1", bi: "BI1", status: "active", credentialType: "nfc" }]);
  UsersService.getUserByQuery.mockResolvedValue(activeMember);
});

test("buildSignedAllowlist emits a verifiable, TTL'd snapshot with the member's entry", async () => {
  const signed = await Service.buildSignedAllowlist({ now: new Date("2026-08-19T19:00:00Z") });
  expect(verifyAllowlist(signed)).toBe(true);
  expect(signed.payload.expiresAt).toBe("2026-08-19T19:30:00.000Z"); // +30m
  expect(signed.payload.entries).toEqual([{ credHash: "BI1", entries: [{ doorId: "front", windows: [] }] }]);
});

test("members with no access are omitted (community)", async () => {
  UsersService.getUserByQuery.mockResolvedValue({ userID: "u1", role: "member", membership: { type: "community", status: "active" } });
  const signed = await Service.buildSignedAllowlist({});
  expect(signed.payload.entries).toEqual([]);
});

test("refreshAllowlist signs + pushes + audits", async () => {
  pushAllowlist.mockResolvedValue({});
  const r = await Service.refreshAllowlist({ now: new Date("2026-08-19T19:00:00Z") });
  expect(r).toMatchObject({ pushed: true, entries: 1 });
  const pushedArg = pushAllowlist.mock.calls[0][0];
  expect(verifyAllowlist(pushedArg)).toBe(true);
  expect(auditLog).toHaveBeenCalledWith("door-access.allowlist", expect.objectContaining({ outcome: "pushed", entries: 1 }));
});

test("refreshAllowlist skips (does not push) when the signing key is absent", async () => {
  const saved = process.env.DOOR_ALLOWLIST_SIGNING_KEY;
  delete process.env.DOOR_ALLOWLIST_SIGNING_KEY;
  const r = await Service.refreshAllowlist({});
  expect(r).toEqual({ pushed: false, reason: "signing-key-not-set" });
  expect(pushAllowlist).not.toHaveBeenCalled();
  process.env.DOOR_ALLOWLIST_SIGNING_KEY = saved;
});
