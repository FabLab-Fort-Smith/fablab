// The instrumented internal/check-access: the LIVE decision is unchanged in shadow mode,
// and the addon's decision is returned ONLY when shadowCompare reports authoritative.
// db + shadowCompare are mocked. The route reads INTERNAL_API_SECRET at module load, so
// it's imported dynamically after the env is set.

jest.mock("@/lib/database", () => ({ __esModule: true, db: { dbUsers: jest.fn() } }));
jest.mock("@/plugins/door-access-controller/parallelRun", () => ({ __esModule: true, shadowCompare: jest.fn() }));

import { db } from "@/lib/database";
import { shadowCompare } from "@/plugins/door-access-controller/parallelRun";

const SECRET = "check-access-test-secret";
let GET;

const activeUser = { userID: "u1", username: "amy", firstName: "Amy", lastName: "Ng", role: "member", membership: { status: "active", subscriptionStatus: "ACTIVE", accessKey: { issued: true } } };

const setUser = (user) => db.dbUsers.mockResolvedValue({ findOne: jest.fn().mockResolvedValue(user) });
const get = (headers, qs) => GET(new Request(`http://lab.test/api/internal/check-access?${qs}`, { headers }));

beforeAll(async () => {
  process.env.INTERNAL_API_SECRET = SECRET;
  ({ GET } = await import("@/app/api/internal/check-access/route"));
});
beforeEach(() => {
  jest.clearAllMocks();
  shadowCompare.mockResolvedValue({ ran: false }); // default: shadow only, no cutover
});

test("missing bearer → 401", async () => {
  const res = await get({}, "cardId=abc");
  expect(res.status).toBe(401);
});

test("missing cardId → 400", async () => {
  const res = await get({ authorization: `Bearer ${SECRET}` }, "");
  expect(res.status).toBe(400);
});

test("shadow mode: returns the LIVE grant unchanged", async () => {
  setUser(activeUser);
  const res = await get({ authorization: `Bearer ${SECRET}` }, "cardId=abc&doorId=front");
  expect(await res.json()).toMatchObject({ granted: true, userId: "u1", role: "member" });
  // the live user was passed to the shadow for comparison
  expect(shadowCompare).toHaveBeenCalledWith(expect.objectContaining({ liveGranted: true, doorId: "front" }));
});

test("shadow mode: unknown card returns live 'Unknown Card' (no throw)", async () => {
  setUser(null);
  const res = await get({ authorization: `Bearer ${SECRET}` }, "cardId=ghost");
  expect(await res.json()).toEqual({ granted: false, message: "Unknown Card" });
});

test("cutover: addon authoritative deny overrides a live grant", async () => {
  setUser(activeUser);
  shadowCompare.mockResolvedValue({ ran: true, authoritative: true, granted: false, reason: "not-in-good-standing" });
  const res = await get({ authorization: `Bearer ${SECRET}` }, "cardId=abc&doorId=front");
  const body = await res.json();
  expect(body).toMatchObject({ granted: false, reason: "not-in-good-standing" });
  expect(body.userId).toBeUndefined(); // no identity leaked on a deny
});

test("cutover: addon authoritative grant returns identity", async () => {
  setUser(activeUser);
  shadowCompare.mockResolvedValue({ ran: true, authoritative: true, granted: true, reason: "rule-match" });
  const res = await get({ authorization: `Bearer ${SECRET}` }, "cardId=abc&doorId=front");
  expect(await res.json()).toMatchObject({ granted: true, reason: "rule-match", userId: "u1", role: "member" });
});
