// Authorize orchestration: credential → member → facts → policy.decide() → audited
// result. Model + users service + audit are mocked; the policy engine + blind index
// are REAL. Covers the deny paths (unknown card, banned, not-good-standing) and a grant.

jest.mock("@/plugins/door-access-controller/model", () => ({
  __esModule: true,
  default: { findCardByBlindIndex: jest.fn(), findDoor: jest.fn(), getPolicyDoc: jest.fn() },
}));
jest.mock("@/app/api/v1/users/service", () => ({ __esModule: true, default: { getUserByQuery: jest.fn() } }));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));
jest.mock("@/plugins/door-access-controller/config", () => ({
  __esModule: true,
  PLUGIN_ID: "door-access-controller",
  resolveConfig: jest.fn(async () => ({ requireGoodStanding: true, allowAdminBypass: true, defaultTimezone: "America/Chicago" })),
}));

import Service from "@/plugins/door-access-controller/service";
import Model from "@/plugins/door-access-controller/model";
import UsersService from "@/app/api/v1/users/service";
import { auditLog } from "@/lib/audit";

const WED_2PM = new Date("2026-08-19T19:00:00Z"); // Wed 14:00 CDT
const MEMBER_RULE = { id: "member-hours", roles: ["member"], doors: ["*"], windows: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }] };
const activeMember = { userID: "u1", username: "amy", role: "member", membership: { type: "co-op", status: "active", subscriptionStatus: "ACTIVE" } };

beforeAll(() => {
  process.env.DOOR_CARD_INDEX_KEY = "svc-test-index-key";
  process.env.DOOR_CARD_ENC_KEY = "svc-test-enc-key";
});
beforeEach(() => {
  jest.clearAllMocks();
  Model.findDoor.mockResolvedValue(null); // default door → {doorId}
  Model.getPolicyDoc.mockResolvedValue({ rules: [MEMBER_RULE], accountOverrides: {} });
});

test("unknown card → denied, audited, no user lookup", async () => {
  Model.findCardByBlindIndex.mockResolvedValue(null);
  const r = await Service.authorize({ credentialType: "nfc", credentialValue: "ghost", doorId: "front", now: WED_2PM });
  expect(r).toEqual({ granted: false, reason: "unknown-credential" });
  expect(UsersService.getUserByQuery).not.toHaveBeenCalled();
  expect(auditLog).toHaveBeenCalledWith("door-access.authorize", expect.objectContaining({ outcome: "denied", reason: "unknown-credential" }));
});

test("active member, in-window rule → granted (minimal identity only)", async () => {
  Model.findCardByBlindIndex.mockResolvedValue({ userID: "u1", status: "active" });
  UsersService.getUserByQuery.mockResolvedValue(activeMember);
  const r = await Service.authorize({ credentialType: "nfc", credentialValue: "card-u1", doorId: "front", now: WED_2PM });
  expect(r).toMatchObject({ granted: true, reason: "rule-match", userID: "u1", username: "amy", role: "member" });
  expect(auditLog).toHaveBeenCalledWith("door-access.authorize", expect.objectContaining({ outcome: "granted", user: "u1" }));
});

test("account ban → denied even with a valid card", async () => {
  Model.findCardByBlindIndex.mockResolvedValue({ userID: "u1", status: "active" });
  UsersService.getUserByQuery.mockResolvedValue(activeMember);
  Model.getPolicyDoc.mockResolvedValue({ rules: [MEMBER_RULE], accountOverrides: { u1: "deny" } });
  const r = await Service.authorize({ credentialType: "nfc", credentialValue: "card-u1", doorId: "front", now: WED_2PM });
  expect(r).toEqual({ granted: false, reason: "account-blocked" });
});

test("suspended member → not in good standing", async () => {
  Model.findCardByBlindIndex.mockResolvedValue({ userID: "s1", status: "active" });
  UsersService.getUserByQuery.mockResolvedValue({ userID: "s1", role: "member", membership: { type: "co-op", status: "suspended" } });
  const r = await Service.authorize({ credentialType: "nfc", credentialValue: "card-s1", doorId: "front", now: WED_2PM });
  expect(r).toEqual({ granted: false, reason: "not-in-good-standing" });
});

test("app-triggered: value is the userID, no card lookup", async () => {
  UsersService.getUserByQuery.mockResolvedValue(activeMember);
  const r = await Service.authorize({ credentialType: "app", credentialValue: "u1", doorId: "front", now: WED_2PM });
  expect(Model.findCardByBlindIndex).not.toHaveBeenCalled();
  expect(r).toMatchObject({ granted: true, userID: "u1" });
});

test("enrollCard stores ciphertext + blind index, replaces prior cards, never the raw code", async () => {
  Model.deleteCardsByUserID = jest.fn().mockResolvedValue();
  Model.upsertCard = jest.fn().mockResolvedValue();
  const r = await Service.enrollCard({ userID: "u1", code: "CARD-XYZ-777" });
  expect(Model.deleteCardsByUserID).toHaveBeenCalledWith("u1");
  const doc = Model.upsertCard.mock.calls[0][0];
  expect(doc).toMatchObject({ userID: "u1", credentialType: "nfc", status: "active" });
  expect(doc.bi).toMatch(/^[0-9a-f]{64}$/);
  expect(doc.codeEnc.split(":")).toHaveLength(3); // iv:tag:ciphertext
  expect(JSON.stringify(doc)).not.toContain("CARD-XYZ-777"); // raw code never persisted
  expect(r).toEqual({ userID: "u1", bi: doc.bi });
  expect(auditLog).toHaveBeenCalledWith("door-access.enroll", expect.objectContaining({ target: "u1", outcome: "enrolled" }));
});

test("enrollCard requires userID and code", async () => {
  await expect(Service.enrollCard({ userID: "", code: "x" })).rejects.toThrow();
  await expect(Service.enrollCard({ userID: "u1", code: "" })).rejects.toThrow();
});

test("revocation on suspend soft-revokes the member's cards", async () => {
  Model.revokeCardsByUserID = jest.fn().mockResolvedValue();
  await Service.onMembershipSuspended({ userID: "u9" });
  expect(Model.revokeCardsByUserID).toHaveBeenCalledWith("u9");
  expect(auditLog).toHaveBeenCalledWith("door-access.revoke", expect.objectContaining({ target: "u9", outcome: "revoked" }));
});
