// AC-2 disputes service: allow-listed list + detail, bigint-safe amounts, evidence ids only, not-found.

jest.mock("@/lib/square", () => ({ __esModule: true, listDisputes: jest.fn(), getDispute: jest.fn() }));

import { listDisputes, disputeDetail, DisputeNotFoundError } from "@/app/api/v1/square/disputes/service";
import { listDisputes as sq, getDispute } from "@/lib/square";

beforeEach(() => { jest.clearAllMocks(); });

test("lists shaped disputes + cursor", async () => {
  sq.mockResolvedValueOnce({ disputes: [
    { disputeId: "d1", state: "EVIDENCE_REQUIRED", reason: "AMOUNT_DIFFERS", amountMoney: { amount: 2500n, currency: "USD" }, cardBrand: "VISA", disputedPayment: { paymentId: "p1" }, dueAt: "2026-09-20T00:00:00Z" },
  ], cursor: "next" });
  const r = await listDisputes({});
  expect(r.cursor).toBe("next");
  expect(r.disputes[0]).toEqual(expect.objectContaining({ id: "d1", state: "EVIDENCE_REQUIRED", amountCents: 2500, paymentId: "p1", cardBrand: "VISA" }));
});

test("passes cursor + states through to the adapter", async () => {
  sq.mockResolvedValueOnce({ disputes: [] });
  await listDisputes({ cursor: "c1", states: "INQUIRY_EVIDENCE_REQUIRED" });
  expect(sq).toHaveBeenCalledWith({ cursor: "c1", states: "INQUIRY_EVIDENCE_REQUIRED" });
});

test("empty adapter response → empty list, null cursor", async () => {
  sq.mockResolvedValueOnce({});
  expect(await listDisputes({})).toEqual({ disputes: [], cursor: null });
});

test("detail includes evidence ids only (no content)", async () => {
  getDispute.mockResolvedValueOnce({ dispute: { disputeId: "d1", state: "WON", amountMoney: { amount: 100, currency: "USD" }, evidenceIds: ["e1", "e2"], disputedPayment: { paymentId: "p9" } } });
  const d = await disputeDetail("d1");
  expect(d).toEqual(expect.objectContaining({ id: "d1", state: "WON", paymentId: "p9", evidenceIds: ["e1", "e2"] }));
  expect(d).not.toHaveProperty("evidence");
});

test("blank id or unknown dispute → DisputeNotFoundError (404)", async () => {
  await expect(disputeDetail("  ")).rejects.toBeInstanceOf(DisputeNotFoundError);
  getDispute.mockResolvedValueOnce({ dispute: null });
  const err = await disputeDetail("nope").catch((e) => e);
  expect(err).toBeInstanceOf(DisputeNotFoundError);
  expect(err.status).toBe(404);
});
