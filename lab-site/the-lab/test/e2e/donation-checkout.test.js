// Abuse-case + regression test for #182 on the donation route. Anonymous donations are
// legitimate (kiosk QR, public /donate), so the guard is not auth — it is refusing to
// trust the client for the amount, the attribution, and the post-payment redirect.

import { auth } from "@/auth";
import { createPaymentLink } from "@/lib/square";
import { db } from "@/lib/database";
import { POST } from "@/app/api/v1/donations/checkout/route";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/square", () => ({
  createPaymentLink: jest.fn(async () => ({ paymentLink: { id: "pl_1", url: "https://squareup.link/mock" } })),
}));
jest.mock("@/lib/database", () => ({ db: { dbTransactions: jest.fn() } }));

const insertOne = jest.fn(async () => ({}));
const updateOne = jest.fn(async () => ({}));

beforeAll(() => { process.env.NEXT_PUBLIC_URL = "https://lab.test"; process.env.SQUARE_LOCATION_ID = "LOC1"; });

beforeEach(() => {
  jest.clearAllMocks();
  db.dbTransactions.mockResolvedValue({ insertOne, updateOne });
  auth.mockResolvedValue(null); // anonymous by default
  createPaymentLink.mockResolvedValue({ paymentLink: { id: "pl_1", url: "https://squareup.link/mock" } });
});

async function donate(body) {
  const req = new Request("http://localhost/api/v1/donations/checkout", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const res = await POST(req);
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

describe("#182 — donation checkout", () => {
  test("a valid anonymous donation works", async () => {
    const { status } = await donate({ amount: 25 });
    expect(status).toBe(200);
    expect(Number(createPaymentLink.mock.calls[0][0].quickPay.priceMoney.amount)).toBe(2500);
  });

  test.each([["abc"], [-5], [0], [null], [{}], [1e12]])("rejects a bad amount: %p", async (amount) => {
    const { status } = await donate({ amount });
    expect(status).toBe(400);
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  test("a body userId cannot forge attribution — anonymous donor is stored as null", async () => {
    await donate({ amount: 25, userId: "victim-member" });
    expect(insertOne.mock.calls[0][0].senderId).toBeNull();
  });

  test("attribution uses the session when the donor is signed in", async () => {
    auth.mockResolvedValue({ user: { userID: "real-donor" } });
    await donate({ amount: 25, userId: "victim-member" });
    expect(insertOne.mock.calls[0][0].senderId).toBe("real-donor");
  });

  test("a client redirectUrl is ignored — no open redirect", async () => {
    await donate({ amount: 25, redirectUrl: "https://evil.example/steal" });
    const sent = createPaymentLink.mock.calls[0][0].redirectUrl;
    expect(sent).toContain("lab.test");
    expect(sent).not.toContain("evil.example");
  });

  test("$-prefixed keys in donorInfo are stripped before Mongo", async () => {
    await donate({ amount: 25, donorInfo: { name: "X", $where: "1==1" } });
    expect(JSON.stringify(insertOne.mock.calls[0][0].metadata)).not.toContain("$where");
  });

  test("the pending row is written as pending, never completed", async () => {
    await donate({ amount: 25 });
    expect(insertOne.mock.calls[0][0].status).toBe("pending");
  });

  test("Square's error text is not leaked to the client", async () => {
    createPaymentLink.mockRejectedValue(new Error("Square internal: secret detail"));
    const { status, body } = await donate({ amount: 25 });
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("secret detail");
  });
});
