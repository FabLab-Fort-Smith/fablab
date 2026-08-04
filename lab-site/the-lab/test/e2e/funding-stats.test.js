// Tests for the funding meter's data path (feat/funding-meter):
//   * dues revenue is computed from Square ACTIVE subscriptions joined to catalog prices,
//     with annual plans normalized to a monthly figure;
//   * GET /api/v1/donations/stats is PUBLIC but returns detail only to an admin;
//   * PUT is admin-only.

import { auth } from "@/auth";
import { searchOrders, searchSubscriptions } from "@/lib/square";
import PlansModel from "@/app/api/v1/plans/model";
import { db } from "@/lib/database";
import { getDuesRevenue } from "@/app/api/v1/donations/dues";
import { GET, PUT } from "@/app/api/v1/donations/stats/route";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/square", () => ({
  searchOrders: jest.fn(async () => ({ orders: [] })),
  searchSubscriptions: jest.fn(),
}));
jest.mock("@/app/api/v1/plans/model", () => ({ __esModule: true, default: { getPlans: jest.fn() } }));
jest.mock("@/lib/database", () => ({ db: { connect: jest.fn(), dbUsers: jest.fn() } }));

const CONFIG = { findOne: jest.fn(async () => null), updateOne: jest.fn(async () => ({})) };
const USERS = { countDocuments: jest.fn(async () => 0) };

beforeEach(() => {
  jest.clearAllMocks();
  db.connect.mockResolvedValue({ collection: (n) => (n === "config" ? CONFIG : USERS) });
  db.dbUsers.mockResolvedValue(USERS);
  auth.mockResolvedValue(null);
  CONFIG.findOne.mockResolvedValue(null);

  PlansModel.getPlans.mockResolvedValue([
    { name: "HackerRat", variations: [
      { id: "VAR_MONTHLY", name: "Monthly", cadence: "MONTHLY", priceCents: 4500 },
      { id: "VAR_ANNUAL", name: "Annual", cadence: "ANNUAL", priceCents: 48000 },
    ]},
    { name: "CodeRat", variations: [
      { id: "VAR_PREMIUM", name: "Premium", cadence: "MONTHLY", priceCents: 12500 },
      { id: "VAR_RELATIVE", name: "Pay-what-you-can", cadence: "MONTHLY", priceCents: null },
    ]},
  ]);
});

function subs(...variationIds) {
  return { subscriptions: variationIds.map((planVariationId, i) => ({ id: `sub${i}`, planVariationId, status: "ACTIVE" })) };
}

describe("getDuesRevenue", () => {
  test("sums active subscriptions at their catalog price", async () => {
    searchSubscriptions.mockResolvedValue(subs("VAR_MONTHLY", "VAR_MONTHLY", "VAR_PREMIUM"));
    const r = await getDuesRevenue();
    expect(r.duesCents).toBe(4500 + 4500 + 12500);
    expect(r.activeCount).toBe(3);
    expect(r.unmatchedCount).toBe(0);
  });

  test("normalizes an annual plan to a monthly figure", async () => {
    searchSubscriptions.mockResolvedValue(subs("VAR_ANNUAL"));
    const r = await getDuesRevenue();
    expect(r.duesCents).toBe(Math.round(48000 / 12)); // $480/yr → $40/mo
  });

  test("counts an unpriced (RELATIVE) subscription as unmatched, not zero-summed silently", async () => {
    searchSubscriptions.mockResolvedValue(subs("VAR_RELATIVE", "VAR_MONTHLY"));
    const r = await getDuesRevenue();
    expect(r.duesCents).toBe(4500);      // only the priced one
    expect(r.unmatchedCount).toBe(1);
    expect(r.activeCount).toBe(2);
  });

  test("groups by tier, highest monthly first", async () => {
    searchSubscriptions.mockResolvedValue(subs("VAR_MONTHLY", "VAR_MONTHLY", "VAR_PREMIUM"));
    const r = await getDuesRevenue();
    expect(r.byTier[0].variationName).toBe("Premium"); // 12500 > 9000
    expect(r.byTier.find(t => t.variationName === "Monthly").count).toBe(2);
  });

  test("pages through a cursor", async () => {
    searchSubscriptions
      .mockResolvedValueOnce({ ...subs("VAR_MONTHLY"), cursor: "next" })
      .mockResolvedValueOnce(subs("VAR_PREMIUM"));
    const r = await getDuesRevenue();
    expect(searchSubscriptions).toHaveBeenCalledTimes(2);
    expect(r.duesCents).toBe(4500 + 12500);
  });
});

describe("GET /api/v1/donations/stats — public aggregate, admin detail", () => {
  beforeEach(() => searchSubscriptions.mockResolvedValue(subs("VAR_MONTHLY", "VAR_PREMIUM")));

  test("anonymous gets aggregate only — no income breakdown", async () => {
    const body = await (await GET()).json();
    expect(body.duesCents).toBe(17000);
    expect(body.donationsCents).toBe(0);
    expect(body.totalCents).toBe(17000);
    expect(body.goalCents).toBe(70000); // default fallback
    expect(body.detail).toBeUndefined(); // <-- the gate
  });

  test("admin also gets the per-tier breakdown and expenses", async () => {
    auth.mockResolvedValue({ user: { userID: "a", role: "admin" } });
    const body = await (await GET()).json();
    expect(body.detail).toBeDefined();
    expect(body.detail.duesByTier.length).toBeGreaterThan(0);
    expect(body.detail).toHaveProperty("netCents");
  });

  test("reads the admin-set goal from config", async () => {
    CONFIG.findOne.mockResolvedValue({ key: "monthly_funding_goal_cents", value: 240000 });
    const body = await (await GET()).json();
    expect(body.goalCents).toBe(240000);
  });
});

describe("PUT /api/v1/donations/stats — admin-only goal", () => {
  const put = (body, session) => {
    auth.mockResolvedValue(session);
    return PUT(new Request("http://x/api/v1/donations/stats", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }));
  };

  test("anonymous → 401", async () => expect((await put({ goalDollars: 2400 }, null)).status).toBe(401));
  test("non-admin → 403", async () =>
    expect((await put({ goalDollars: 2400 }, { user: { userID: "m", role: "user" } })).status).toBe(403));
  test("rejects a non-positive goal", async () =>
    expect((await put({ goalDollars: -5 }, { user: { userID: "a", role: "admin" } })).status).toBe(400));
  test("admin sets the goal", async () => {
    const res = await put({ goalDollars: 2400 }, { user: { userID: "a", role: "admin" } });
    expect(res.status).toBe(200);
    expect((await res.json()).goalCents).toBe(240000);
    expect(CONFIG.updateOne).toHaveBeenCalled();
  });
});
