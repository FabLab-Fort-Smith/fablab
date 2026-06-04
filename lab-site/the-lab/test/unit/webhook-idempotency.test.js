// SEC-17: the Square payment webhook mutated state on every delivery, but Square
// delivers at-least-once and retries — so a redelivered event re-ran side effects
// (re-extending sponsorships, re-applying renewals/revocations). claimWebhookEvent
// dedupes by the unique event id: first delivery is claimed (process), duplicates
// are rejected (skip).

jest.mock("@/lib/database", () => ({ db: { connect: jest.fn() } }));

import { db } from "@/lib/database";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/webhookIdempotency";

function mockColl() {
    const coll = {
        createIndex: jest.fn().mockResolvedValue(undefined),
        insertOne: jest.fn(),
        deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    db.connect.mockResolvedValue({ collection: () => coll });
    return coll;
}

afterEach(() => jest.clearAllMocks());

describe("claimWebhookEvent (SEC-17 idempotency)", () => {
    test("REGRESSION: first delivery is claimed (true); a duplicate is rejected (false)", async () => {
        const coll = mockColl();
        coll.insertOne
            .mockResolvedValueOnce({ insertedId: "square:evt_1" })           // first delivery
            .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: 11000 })); // redelivery

        expect(await claimWebhookEvent("evt_1")).toBe(true);
        expect(await claimWebhookEvent("evt_1")).toBe(false);
        expect(coll.insertOne).toHaveBeenCalledTimes(2);
        expect(coll.insertOne.mock.calls[0][0]._id).toBe("square:evt_1");
    });

    test("missing event id processes best-effort (true) without touching the DB", async () => {
        mockColl();
        expect(await claimWebhookEvent(undefined)).toBe(true);
        expect(db.connect).not.toHaveBeenCalled();
    });

    test("an unexpected DB error propagates (so Square retries, not a silent skip)", async () => {
        const coll = mockColl();
        coll.insertOne.mockRejectedValue(Object.assign(new Error("down"), { code: 99 }));
        await expect(claimWebhookEvent("evt_2")).rejects.toThrow();
    });

    test("releaseWebhookEvent removes the claim so a retry can reprocess", async () => {
        const coll = mockColl();
        await releaseWebhookEvent("evt_3");
        expect(coll.deleteOne).toHaveBeenCalledWith({ _id: "square:evt_3" });
    });
});
