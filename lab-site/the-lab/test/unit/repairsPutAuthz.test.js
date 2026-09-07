// #213 — Repairs PUT hardening: authorization (BOLA/authz), repairID format
// validation, and mass-assignment allow-list (CWE-915). These abuse-path tests
// FAIL against the old handler (which had no auth, no id validation, and passed
// the raw body straight into $set) and PASS after the fix.

jest.mock("@/auth", () => ({ __esModule: true, auth: jest.fn() }));
jest.mock("@/app/api/v1/repairs/model", () => {
  const actual = jest.requireActual("@/app/api/v1/repairs/model");
  return { __esModule: true, ...actual, default: { updateRepair: jest.fn() } };
});
jest.mock("@/lib/plugins/registry", () => ({ __esModule: true, emitEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/plugins/hooks", () => ({ __esModule: true, CORE_EVENTS: { REPAIR_UPDATED: "repair.updated" } }));

import { PUT } from "@/app/api/v1/repairs/route";
import { auth } from "@/auth";
import RepairModel from "@/app/api/v1/repairs/model";

const ADMIN = { user: { role: "admin", userID: "admin-1" } };
const VALID_ID = "repair-abcdef01-2345-6789-abcd-ef0123456789";
const url = (id) => `http://localhost/api/v1/repairs${id === undefined ? "" : `?repairID=${encodeURIComponent(id)}`}`;
const put = (id, body) =>
  new Request(url(id), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

beforeEach(() => {
  jest.clearAllMocks();
  auth.mockResolvedValue(ADMIN);
  RepairModel.updateRepair.mockResolvedValue({ repairID: VALID_ID, status: "completed" });
});

describe("authorization (deny by default, fail closed)", () => {
  test("anonymous (no session) → 401 and updateRepair is NOT called", async () => {
    auth.mockResolvedValue(null);
    const res = await PUT(put(VALID_ID, { status: "completed" }));
    expect(res.status).toBe(401);
    expect(RepairModel.updateRepair).not.toHaveBeenCalled();
  });

  test("authenticated non-admin → 403 and updateRepair is NOT called", async () => {
    auth.mockResolvedValue({ user: { role: "member", userID: "u-1" } });
    const res = await PUT(put(VALID_ID, { status: "completed" }));
    expect(res.status).toBe(403);
    expect(RepairModel.updateRepair).not.toHaveBeenCalled();
  });

  test("error message is generic (no internal leak)", async () => {
    auth.mockResolvedValue({ user: { role: "member" } });
    const res = await PUT(put(VALID_ID, { status: "completed" }));
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden." });
  });
});

describe("repairID validation (BOLA/NoSQL filter guard)", () => {
  test("missing repairID → 400, updateRepair NOT called", async () => {
    const res = await PUT(put(undefined, { status: "completed" }));
    expect(res.status).toBe(400);
    expect(RepairModel.updateRepair).not.toHaveBeenCalled();
  });

  test("malformed repairID → 400, updateRepair NOT called", async () => {
    const res = await PUT(put("not-a-repair-id", { status: "completed" }));
    expect(res.status).toBe(400);
    expect(RepairModel.updateRepair).not.toHaveBeenCalled();
  });
});

describe("mass-assignment allow-list (CWE-915)", () => {
  test("non-allow-listed fields are NOT persisted; only allow-listed reach the model", async () => {
    const res = await PUT(
      put(VALID_ID, {
        status: "completed",
        // hostile / privileged / immutable fields a client must never set:
        name: "HACKER",
        email: "attacker@evil.test",
        role: "admin",
        repairID: "repair-forged",
        _id: "deadbeef",
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
        $where: "1==1",
      })
    );
    expect(res.status).toBe(200);
    expect(RepairModel.updateRepair).toHaveBeenCalledTimes(1);
    const [, update] = RepairModel.updateRepair.mock.calls[0];
    // Exactly the allow-listed field — nothing else leaked through.
    expect(update).toEqual({ status: "completed" });
    for (const forbidden of ["name", "email", "role", "repairID", "_id", "createdAt", "updatedAt", "$where"]) {
      expect(update).not.toHaveProperty(forbidden);
    }
  });

  test("allow-listed staff-workflow fields (notes, assignedTo) pass through", async () => {
    RepairModel.updateRepair.mockResolvedValue({ repairID: VALID_ID, status: "in_progress" });
    await PUT(put(VALID_ID, { status: "in_progress", notes: "waiting on part", assignedTo: "tech-7" }));
    const [, update] = RepairModel.updateRepair.mock.calls[0];
    expect(update).toEqual({ status: "in_progress", notes: "waiting on part", assignedTo: "tech-7" });
  });

  test("a body with NO allow-listed field → 400, updateRepair NOT called", async () => {
    const res = await PUT(put(VALID_ID, { name: "x", role: "admin" }));
    expect(res.status).toBe(400);
    expect(RepairModel.updateRepair).not.toHaveBeenCalled();
  });
});

describe("status enum validation", () => {
  test("invalid status → 400, updateRepair NOT called", async () => {
    const res = await PUT(put(VALID_ID, { status: "pwned" }));
    expect(res.status).toBe(400);
    expect(RepairModel.updateRepair).not.toHaveBeenCalled();
  });

  test.each(["pending", "in_progress", "completed", "cancelled"])(
    "valid status %s → 200",
    async (status) => {
      RepairModel.updateRepair.mockResolvedValue({ repairID: VALID_ID, status });
      const res = await PUT(put(VALID_ID, { status }));
      expect(res.status).toBe(200);
      expect(RepairModel.updateRepair).toHaveBeenCalledWith(VALID_ID, { status });
    }
  );
});

describe("legitimate authorized update still works", () => {
  test("admin + valid id + valid status → 200 returns updated repair", async () => {
    RepairModel.updateRepair.mockResolvedValue({ repairID: VALID_ID, status: "completed" });
    const res = await PUT(put(VALID_ID, { status: "completed" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ repair: { repairID: VALID_ID, status: "completed" } });
  });

  test("unknown repair (model returns null) → 404", async () => {
    RepairModel.updateRepair.mockResolvedValue(null);
    const res = await PUT(put(VALID_ID, { status: "completed" }));
    expect(res.status).toBe(404);
  });
});
