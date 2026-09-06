// AC-5 member↔Square routes: link/unlink/subscription/cards + the sync-route auth fix.

jest.mock("@/auth", () => ({ __esModule: true, auth: jest.fn() }));
jest.mock("@/app/api/v1/admin/members/square", () => {
  class SquareMemberValidationError extends Error { constructor(m) { super(m); this.name = "SquareMemberValidationError"; this.status = 400; } }
  class MemberNotFoundError extends Error { constructor(m = "member not found") { super(m); this.name = "MemberNotFoundError"; this.status = 404; } }
  return { __esModule: true, linkCustomer: jest.fn(), unlinkCustomer: jest.fn(), subscriptionAction: jest.fn(), listSavedCards: jest.fn(), disableSavedCard: jest.fn(), SquareMemberValidationError, MemberNotFoundError };
});
jest.mock("@/lib/square", () => ({ __esModule: true, bigintReplacer: (k, v) => (typeof v === "bigint" ? v.toString() : v) }));
jest.mock("@/app/api/v1/square/subscriptions/service", () => ({ __esModule: true, default: { syncSubscription: jest.fn() } }));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import { POST as LINK } from "@/app/api/v1/admin/members/square/link/route";
import { POST as UNLINK } from "@/app/api/v1/admin/members/square/unlink/route";
import { POST as SUBSCRIPTION } from "@/app/api/v1/admin/members/square/subscription/route";
import { GET as CARDS } from "@/app/api/v1/admin/members/square/cards/route";
import { POST as CARD_DISABLE } from "@/app/api/v1/admin/members/square/cards/disable/route";
import { POST as SYNC } from "@/app/api/v1/square/subscriptions/sync/route";
import { auth } from "@/auth";
import { linkCustomer, subscriptionAction, listSavedCards, disableSavedCard, SquareMemberValidationError } from "@/app/api/v1/admin/members/square";
import SubscriptionService from "@/app/api/v1/square/subscriptions/service";
import { auditLog } from "@/lib/audit";

const ADMIN = { user: { role: "admin", userID: "admin-1" } };
const post = (fn, url, body) => fn(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => { jest.clearAllMocks(); auth.mockResolvedValue(ADMIN); });

test("all admin routes reject non-admin with 401, service not called", async () => {
  auth.mockResolvedValue({ user: { role: "member", userID: "m1" } });
  expect((await post(LINK, "http://l/link", { userID: "u1", squareCustomerId: "c" })).status).toBe(401);
  expect((await post(UNLINK, "http://l/unlink", { userID: "u1" })).status).toBe(401);
  expect((await post(SUBSCRIPTION, "http://l/sub", { userID: "u1", subscriptionId: "s", action: "cancel" })).status).toBe(401);
  expect((await CARDS(new Request("http://l/cards?userID=u1"))).status).toBe(401);
  expect((await post(CARD_DISABLE, "http://l/cd", { userID: "u1", cardId: "c1" })).status).toBe(401);
  expect(linkCustomer).not.toHaveBeenCalled();
  expect(subscriptionAction).not.toHaveBeenCalled();
  expect(disableSavedCard).not.toHaveBeenCalled();
});

test("link: valid → 200 delegates with actor; validation → 400", async () => {
  linkCustomer.mockResolvedValueOnce({ userID: "u1", squareCustomerId: "c" });
  const res = await post(LINK, "http://l/link", { userID: "u1", squareCustomerId: "c" });
  expect(res.status).toBe(200);
  expect(linkCustomer).toHaveBeenCalledWith({ userID: "u1", squareCustomerId: "c", actor: { userID: "admin-1", role: "admin" } });
  linkCustomer.mockRejectedValueOnce(new SquareMemberValidationError("squareCustomerId is required"));
  expect((await post(LINK, "http://l/link", { userID: "u1" })).status).toBe(400);
});

test("subscription: valid → 200 delegates; validation → 400; unexpected → 500 generic", async () => {
  subscriptionAction.mockResolvedValueOnce({ userID: "u1", subscriptionId: "s", action: "cancel", subscription: null });
  expect((await post(SUBSCRIPTION, "http://l/sub", { userID: "u1", subscriptionId: "s", action: "cancel" })).status).toBe(200);
  subscriptionAction.mockRejectedValueOnce(new SquareMemberValidationError("does not belong to this member"));
  expect((await post(SUBSCRIPTION, "http://l/sub", { userID: "u1", subscriptionId: "x", action: "cancel" })).status).toBe(400);
  subscriptionAction.mockRejectedValueOnce(new Error("square down"));
  const res = await post(SUBSCRIPTION, "http://l/sub", { userID: "u1", subscriptionId: "s", action: "cancel" });
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "Subscription action failed" });
});

test("cards GET: 400 without userID; 200 with", async () => {
  expect((await CARDS(new Request("http://l/cards"))).status).toBe(400);
  listSavedCards.mockResolvedValueOnce({ customerId: "cus_1", cards: [] });
  expect((await CARDS(new Request("http://l/cards?userID=u1"))).status).toBe(200);
});

test("sync route: now admin-gated (was unauthenticated) — non-admin 401, admin 200 + audit", async () => {
  auth.mockResolvedValueOnce(null);
  expect((await post(SYNC, "http://l/sync", { squareID: "cus_1" })).status).toBe(401);
  expect(SubscriptionService.syncSubscription).not.toHaveBeenCalled();
  SubscriptionService.syncSubscription.mockResolvedValueOnce({ userID: "u1" });
  const res = await post(SYNC, "http://l/sync", { squareID: "cus_1", userID: "u1" });
  expect(res.status).toBe(200);
  expect(auditLog).toHaveBeenCalledWith("admin.member.square.sync", expect.objectContaining({ squareID: "cus_1", outcome: "success" }));
});

test("sync route: rejects non-string squareID/userID (operator-injection guard, SEC #185 F-2)", async () => {
  expect((await post(SYNC, "http://l/sync", { squareID: { $ne: null } })).status).toBe(400);
  expect((await post(SYNC, "http://l/sync", { squareID: "cus_1", userID: { $ne: null } })).status).toBe(400);
  expect(SubscriptionService.syncSubscription).not.toHaveBeenCalled();
});
