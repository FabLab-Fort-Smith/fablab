// AC-5 member↔Square service: link/unlink, subscription lifecycle (ownership-guarded), saved cards.

jest.mock("@/app/api/v1/users/service", () => ({ __esModule: true, default: { getUserByQuery: jest.fn(), updateUser: jest.fn() } }));
jest.mock("@/lib/square", () => ({ __esModule: true,
  getSubscription: jest.fn(), cancelSubscription: jest.fn(), pauseSubscription: jest.fn(),
  resumeSubscription: jest.fn(), swapPlan: jest.fn(), listCards: jest.fn(), disableCard: jest.fn(),
}));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import { linkCustomer, unlinkCustomer, subscriptionAction, listSavedCards, disableSavedCard, SquareMemberValidationError, MemberNotFoundError } from "@/app/api/v1/admin/members/square";
import UserService from "@/app/api/v1/users/service";
import * as sq from "@/lib/square";
import { auditLog } from "@/lib/audit";

const ADMIN = { userID: "admin-1", role: "admin" };
const member = (over = {}) => ({ userID: "u1", membership: { squareCustomerId: "cus_1" }, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  UserService.getUserByQuery.mockResolvedValue(member());
  UserService.updateUser.mockResolvedValue(member());
  sq.getSubscription.mockResolvedValue({ subscription: { id: "sub_1", customerId: "cus_1", status: "ACTIVE" } });
  sq.cancelSubscription.mockResolvedValue({ subscription: { id: "sub_1", status: "CANCELED" } });
  sq.pauseSubscription.mockResolvedValue({ subscription: { id: "sub_1" } });
  sq.resumeSubscription.mockResolvedValue({ subscription: { id: "sub_1" } });
  sq.swapPlan.mockResolvedValue({ subscription: { id: "sub_1" } });
  sq.listCards.mockResolvedValue({ cards: [{ id: "card_1", cardBrand: "VISA", last4: "1111", expMonth: 12, expYear: 2030, enabled: true }] });
  sq.disableCard.mockResolvedValue({ card: { id: "card_1", enabled: false } });
});

// ---- link / unlink -------------------------------------------------------

test("link: sets membership.squareCustomerId + audits with previous", async () => {
  const r = await linkCustomer({ userID: "u1", squareCustomerId: "cus_new", actor: ADMIN });
  expect(r).toEqual({ userID: "u1", squareCustomerId: "cus_new" });
  expect(UserService.updateUser).toHaveBeenCalledWith({ userID: "u1" }, { membership: { squareCustomerId: "cus_new" } }, ADMIN);
  expect(auditLog).toHaveBeenCalledWith("admin.member.square.link", expect.objectContaining({ target: "u1", squareCustomerId: "cus_new", previous: "cus_1", outcome: "success" }));
});

test("link: blank id → validation error, no write", async () => {
  await expect(linkCustomer({ userID: "u1", squareCustomerId: "", actor: ADMIN })).rejects.toBeInstanceOf(SquareMemberValidationError);
  expect(UserService.updateUser).not.toHaveBeenCalled();
});

test("unlink: clears all three legacy fields + audits previous", async () => {
  const r = await unlinkCustomer({ userID: "u1", actor: ADMIN });
  expect(r).toMatchObject({ userID: "u1", unlinked: true, previous: "cus_1" });
  expect(UserService.updateUser).toHaveBeenCalledWith({ userID: "u1" }, { membership: { squareCustomerId: "" }, squareCustomerId: "", squareID: "" }, ADMIN);
});

// ---- subscription lifecycle ---------------------------------------------

test.each(["cancel", "pause", "resume"])("subscription %s: dispatches the right wrapper + audits", async (action) => {
  await subscriptionAction({ userID: "u1", subscriptionId: "sub_1", action, actor: ADMIN });
  const fn = { cancel: sq.cancelSubscription, pause: sq.pauseSubscription, resume: sq.resumeSubscription }[action];
  expect(fn).toHaveBeenCalledWith("sub_1");
  expect(auditLog).toHaveBeenCalledWith("admin.member.square.subscription", expect.objectContaining({ subscriptionId: "sub_1", action, outcome: "success" }));
});

test("subscription swap: requires planVariationId, then calls swapPlan", async () => {
  await expect(subscriptionAction({ userID: "u1", subscriptionId: "sub_1", action: "swap", actor: ADMIN })).rejects.toThrow(/planVariationId is required/);
  await subscriptionAction({ userID: "u1", subscriptionId: "sub_1", action: "swap", planVariationId: "var_9", actor: ADMIN });
  expect(sq.swapPlan).toHaveBeenCalledWith("sub_1", { newPlanVariationId: "var_9" });
});

test("subscription: OWNERSHIP guard — a sub belonging to another customer is rejected, no mutation", async () => {
  sq.getSubscription.mockResolvedValueOnce({ subscription: { id: "sub_x", customerId: "cus_OTHER" } });
  await expect(subscriptionAction({ userID: "u1", subscriptionId: "sub_x", action: "cancel", actor: ADMIN })).rejects.toThrow(/does not belong to this member/);
  expect(sq.cancelSubscription).not.toHaveBeenCalled();
});

test("subscription: member with no linked customer → rejected", async () => {
  UserService.getUserByQuery.mockResolvedValueOnce({ userID: "u1", membership: {} });
  await expect(subscriptionAction({ userID: "u1", subscriptionId: "sub_1", action: "cancel", actor: ADMIN })).rejects.toThrow(/no linked Square customer/);
});

test("subscription: invalid action → rejected, no wrapper call", async () => {
  await expect(subscriptionAction({ userID: "u1", subscriptionId: "sub_1", action: "delete", actor: ADMIN })).rejects.toThrow(/action must be one of/);
  expect(sq.cancelSubscription).not.toHaveBeenCalled();
});

// ---- saved cards ---------------------------------------------------------

test("cards: list returns sanitized cards (no PAN) with the customer id", async () => {
  sq.listCards.mockResolvedValueOnce({ cards: [{ id: "c1", cardBrand: "VISA", last4: "4242", expMonth: 1, expYear: 2031, pan: "4242424242424242", enabled: true }] });
  const r = await listSavedCards({ userID: "u1", actor: ADMIN });
  expect(JSON.stringify(r)).not.toContain("4242424242424242");
  expect(r.cards[0]).toEqual({ id: "c1", brand: "VISA", last4: "4242", expMonth: 1, expYear: 2031, enabled: true });
});

test("cards: no linked customer → empty list (no Square call)", async () => {
  UserService.getUserByQuery.mockResolvedValueOnce({ userID: "u1", membership: {} });
  const r = await listSavedCards({ userID: "u1", actor: ADMIN });
  expect(r).toEqual({ customerId: null, cards: [] });
  expect(sq.listCards).not.toHaveBeenCalled();
});

test("cards: disable a card that belongs to the member → disableCard + audit", async () => {
  await disableSavedCard({ userID: "u1", cardId: "card_1", actor: ADMIN });
  expect(sq.disableCard).toHaveBeenCalledWith("card_1");
  expect(auditLog).toHaveBeenCalledWith("admin.member.square.card.disable", expect.objectContaining({ target: "u1", cardId: "card_1", outcome: "success" }));
});

test("cards: OWNERSHIP guard — disabling a card not on the member's customer is rejected", async () => {
  await expect(disableSavedCard({ userID: "u1", cardId: "card_OTHER", actor: ADMIN })).rejects.toThrow(/does not belong to this member/);
  expect(sq.disableCard).not.toHaveBeenCalled();
});

test("unknown member → MemberNotFoundError across ops", async () => {
  UserService.getUserByQuery.mockResolvedValue(null);
  await expect(linkCustomer({ userID: "x", squareCustomerId: "c", actor: ADMIN })).rejects.toBeInstanceOf(MemberNotFoundError);
  await expect(listSavedCards({ userID: "x", actor: ADMIN })).rejects.toBeInstanceOf(MemberNotFoundError);
});
