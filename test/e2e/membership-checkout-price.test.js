// Abuse-case + regression test for #182: a signed-in member must not be able to choose
// their own subscription price.
//
// This doubles as the proof-of-concept. It drives the REAL route handler with Square, the
// database, and the session mocked, and captures the amount that would have been sent to
// Square's createPaymentLink. No network, no live checkout link, no real penny subscription
// — the exploit is demonstrated deterministically at the seam where money leaves our code.
//
// Against the pre-fix handler the first two cases FAIL: `price: 0.01` from the body reaches
// Square as 1 cent. Against the fixed handler they PASS: the body price is ignored and the
// amount comes from the catalog.

import { auth } from "@/auth";
import { getCatalogObject, createPaymentLink } from "@/lib/square";
import { db } from "@/lib/database";
import { POST } from "@/app/api/v1/memberships/[planID]/checkout/route";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/square", () => ({
  createPaymentLink: jest.fn(async () => ({ paymentLink: { url: "https://squareup.link/mock" } })),
  getCatalogObject: jest.fn(),
  searchCatalogObjects: jest.fn(async () => ({ objects: [] })),
  createCustomer: jest.fn(async () => ({ customer: { id: "cust-mock" } })),
}));
jest.mock("@/lib/database", () => ({ db: { dbUsers: jest.fn() } }));

const PLAN_VARIATION_ID = "VARIATION_ABC";
const REAL_PRICE_CENTS = 4500; // the plan's true price in the Square catalog: $45.00

const findOne = jest.fn(async () => ({
  userID: "member-self", email: "member@example.invalid", firstName: "Real", lastName: "Member",
  membership: { squareCustomerId: "cust-existing" },
}));

beforeAll(() => {
  process.env.NEXT_PUBLIC_URL = "https://lab.test";
  process.env.SQUARE_LOCATION_ID = "LOC1";
});

beforeEach(() => {
  jest.clearAllMocks();
  db.dbUsers.mockResolvedValue({ findOne, updateOne: jest.fn() });
  auth.mockResolvedValue({ user: { userID: "member-self", email: "member@example.invalid" } });
  getCatalogObject.mockImplementation(async (id) => {
    if (id === PLAN_VARIATION_ID) {
      return {
        object: {
          type: "SUBSCRIPTION_PLAN_VARIATION",
          subscriptionPlanVariationData: {
            name: "Monthly", subscriptionPlanId: "PLAN_PARENT",
            phases: [{ cadence: "MONTHLY", pricing: { type: "STATIC", priceMoney: { amount: 4500n, currency: "USD" } } }],
          },
        },
      };
    }
    return { object: { subscriptionPlanData: { name: "HackerRat" } } };
  });
  createPaymentLink.mockResolvedValue({ paymentLink: { url: "https://squareup.link/mock" } });
});

/** Drive the real handler; return {status, amountSentToSquare}. */
async function checkout(body, planID = PLAN_VARIATION_ID) {
  const req = new Request(`http://localhost/api/v1/memberships/${planID}/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await POST(req, { params: Promise.resolve({ planID }) });
  const call = createPaymentLink.mock.calls[0]?.[0];
  const amountSentToSquare = call ? Number(call.quickPay.priceMoney.amount) : null;
  return { status: res.status, amountSentToSquare };
}

describe("#182 — subscription price is set by the server, not the member", () => {
  test("PoC: a body price of $0.01 does NOT reach Square as 1 cent", async () => {
    const { amountSentToSquare } = await checkout({ price: 0.01, userID: "member-self" });
    expect(amountSentToSquare).not.toBe(1); // pre-fix: this was 1 — a $45 plan for a penny
  });

  test("the amount charged is the catalog price regardless of the body", async () => {
    const { status, amountSentToSquare } = await checkout({ price: 0.01, userID: "member-self" });
    expect(status).toBeLessThan(400);
    expect(amountSentToSquare).toBe(REAL_PRICE_CENTS);
  });

  test("an inflated body price is ignored too, not just the cheap one", async () => {
    const { amountSentToSquare } = await checkout({ price: 999999, userID: "member-self" });
    expect(amountSentToSquare).toBe(REAL_PRICE_CENTS);
  });

  test("anonymous checkout is refused — identity comes from the session", async () => {
    auth.mockResolvedValue(null);
    const { status } = await checkout({ price: 45 });
    expect(status).toBe(401);
    expect(createPaymentLink).not.toHaveBeenCalled();
  });

  test("a body userID cannot attribute the subscription to another member", async () => {
    await checkout({ price: 45, userID: "someone-else" });
    // The handler looks up the SESSION user, never the body userID.
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ userID: "member-self" }));
    expect(findOne).not.toHaveBeenCalledWith(expect.objectContaining({ userID: "someone-else" }));
  });
});
