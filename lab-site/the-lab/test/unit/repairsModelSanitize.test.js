// #213 — Repairs model DTO/guard helpers (pure, no DB). Locks the allow-list,
// the repairID format guard, and the status enum so the mass-assignment / BOLA
// defenses can't silently regress.

import RepairModel, {
  isValidRepairID,
  isValidStatus,
  sanitizeRepairUpdate,
  REPAIR_STATUSES,
  REPAIR_UPDATABLE_FIELDS,
} from "@/app/api/v1/repairs/model";

const VALID_ID = "repair-abcdef01-2345-6789-abcd-ef0123456789";

describe("isValidRepairID", () => {
  test("accepts a well-formed repair-<uuid> key", () => {
    expect(isValidRepairID(VALID_ID)).toBe(true);
  });
  test.each([
    ["missing prefix", "abcdef01-2345"],
    ["empty", ""],
    ["operator object", { $gt: "" }],
    ["number", 123],
    ["null", null],
    ["path-ish", "repair-../../etc"],
  ])("rejects %s", (_label, value) => {
    expect(isValidRepairID(value)).toBe(false);
  });
});

describe("isValidStatus / REPAIR_STATUSES", () => {
  test("enum is exactly the repair lifecycle", () => {
    expect([...REPAIR_STATUSES]).toEqual(["pending", "in_progress", "completed", "cancelled"]);
  });
  test.each(REPAIR_STATUSES)("accepts %s", (s) => expect(isValidStatus(s)).toBe(true));
  test.each(["", "PENDING", "done", "admin", null, 1])("rejects %p", (s) =>
    expect(isValidStatus(s)).toBe(false)
  );
});

describe("sanitizeRepairUpdate (mass-assignment allow-list)", () => {
  test("keeps only allow-listed fields", () => {
    const out = sanitizeRepairUpdate({
      status: "completed",
      notes: "n",
      assignedTo: "t",
      name: "HACKER",
      role: "admin",
      repairID: "repair-forged",
      _id: "x",
      createdAt: "1970",
    });
    expect(out).toEqual({ status: "completed", notes: "n", assignedTo: "t" });
    expect(REPAIR_UPDATABLE_FIELDS).toEqual(["status", "notes", "assignedTo"]);
  });

  test("drops Mongo operator keys inside allow-listed values", () => {
    const out = sanitizeRepairUpdate({ notes: { $gt: "" }, status: "pending" });
    expect(out.notes).toEqual({});
    expect(out.status).toBe("pending");
  });

  test.each([null, undefined, "string", 42, ["arr"]])("non-object %p → {}", (v) => {
    expect(sanitizeRepairUpdate(v)).toEqual({});
  });
});

describe("RepairModel.updateRepair guards (no DB touched)", () => {
  test("malformed repairID → null (never reaches Mongo)", async () => {
    await expect(RepairModel.updateRepair("not-valid", { status: "completed" })).resolves.toBeNull();
  });

  test("no allow-listed fields → null (nothing to $set, no Mongo call)", async () => {
    await expect(RepairModel.updateRepair(VALID_ID, { name: "x", role: "admin" })).resolves.toBeNull();
  });

  test("invalid status reaching the model throws INVALID_STATUS (defense in depth)", async () => {
    await expect(RepairModel.updateRepair(VALID_ID, { status: "pwned" })).rejects.toMatchObject({
      code: "INVALID_STATUS",
    });
  });
});
