// internal/register-card: saves the paired code (live plaintext, unchanged), ALSO enrolls
// it into the door-access addon (guarded coexistence), and — SEC §5 — never logs the code.
// Reads INTERNAL_API_SECRET at module load, so it's imported dynamically after env is set.

jest.mock("@/app/api/v1/users/service", () => ({ __esModule: true, default: { updateUser: jest.fn() } }));
jest.mock("@/plugins/door-access-controller/parallelRun", () => ({ __esModule: true, enrollIfEnabled: jest.fn().mockResolvedValue({ ran: true }), plaintextRetired: jest.fn().mockResolvedValue(false) }));

import UserService from "@/app/api/v1/users/service";
import { enrollIfEnabled, plaintextRetired } from "@/plugins/door-access-controller/parallelRun";

const SECRET = "register-card-test-secret";
const CODE = "SECRET-CARD-CODE-42";
let POST;

const post = (headers, body) =>
  POST(new Request("http://lab.test/api/internal/register-card", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }));

beforeAll(async () => {
  process.env.INTERNAL_API_SECRET = SECRET;
  ({ POST } = await import("@/app/api/internal/register-card/route"));
});
beforeEach(() => {
  jest.clearAllMocks();
  enrollIfEnabled.mockResolvedValue({ ran: true });
  plaintextRetired.mockResolvedValue(false);
  UserService.updateUser.mockResolvedValue({ userID: "u1", membership: { accessKey: { code: CODE } } });
});

test("missing bearer → 401", async () => {
  const res = await post({}, { userId: "u1", cardId: CODE });
  expect(res.status).toBe(401);
});

test("missing fields → 400", async () => {
  const res = await post({ authorization: `Bearer ${SECRET}` }, { userId: "u1" });
  expect(res.status).toBe(400);
});

test("success saves the code AND enrolls it into the addon store", async () => {
  const res = await post({ authorization: `Bearer ${SECRET}` }, { userId: "u1", cardId: CODE });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ success: true, userId: "u1" });
  expect(enrollIfEnabled).toHaveBeenCalledWith(expect.objectContaining({ userID: "u1", code: CODE }));
  // pre-retire: the plaintext code IS still written
  const written = UserService.updateUser.mock.calls[0][1].membership.accessKey;
  expect(written.code).toBe(CODE);
});

test("retire mode: the raw code is NOT persisted (enrolled + pairedAt marker only)", async () => {
  plaintextRetired.mockResolvedValue(true);
  enrollIfEnabled.mockResolvedValue({ ran: true }); // confirmed stored in the addon
  await post({ authorization: `Bearer ${SECRET}` }, { userId: "u1", cardId: CODE });
  const written = UserService.updateUser.mock.calls[0][1].membership.accessKey;
  expect(written.code).toBeUndefined();
  expect(written.issued).toBe(true);
  expect(written.pairedAt).toBeTruthy();
});

test("retire mode but enroll did NOT land → still writes the code (fail-safe, never store nowhere)", async () => {
  plaintextRetired.mockResolvedValue(true);
  enrollIfEnabled.mockResolvedValue({ ran: false }); // addon off / not ready
  await post({ authorization: `Bearer ${SECRET}` }, { userId: "u1", cardId: CODE });
  expect(UserService.updateUser.mock.calls[0][1].membership.accessKey.code).toBe(CODE);
});

test("SEC §5: the card code is never written to the logs", async () => {
  const spy = jest.spyOn(console, "log").mockImplementation(() => {});
  await post({ authorization: `Bearer ${SECRET}` }, { userId: "u1", cardId: CODE });
  const logged = spy.mock.calls.flat().map(String).join(" ");
  expect(logged).not.toContain(CODE);
  spy.mockRestore();
});
