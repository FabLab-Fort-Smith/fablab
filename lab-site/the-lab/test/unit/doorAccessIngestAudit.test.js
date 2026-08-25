// Service.ingestEdgeAudit (S6-b1): boundary validation, CAS persistence + retry, and alert routing.
// Model (Mongo) is mocked; the auditAnchor logic + recordHash are REAL.

jest.mock("@/plugins/door-access-controller/model", () => ({
  __esModule: true,
  default: { getAuditAnchor: jest.fn(), casAuditAnchor: jest.fn() },
}));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import Service from "@/plugins/door-access-controller/service";
import Model from "@/plugins/door-access-controller/model";
import { auditLog } from "@/lib/audit";
import { recordHash } from "@/plugins/door-access-controller/auditAnchor";

const EV = { doorId: "front", granted: true, reason: "granted", mode: "offline" };
function rec(prev, boot, seq, ts, event = EV) {
  const r = { prev, bootEpoch: boot, seq, ts, event };
  r.hash = recordHash(r);
  return r;
}
// Fresh object per call — Mongo returns a new doc each read, and the anchor logic mutates it in place.
const empty = () => ({ anchor: { boots: {}, currentBoot: null }, version: 0 });

beforeEach(() => {
  jest.clearAllMocks();
  Model.getAuditAnchor.mockImplementation(async () => empty());
  Model.casAuditAnchor.mockResolvedValue(true);
});

test("a valid genesis batch is persisted via CAS and accepted", async () => {
  const r0 = rec("", "b", 0, 1);
  const r1 = rec(r0.hash, "b", 1, 2);
  const res = await Service.ingestEdgeAudit({ edgeId: "edge-1", records: [r0, r1] });
  expect(res).toMatchObject({ accepted: 2, duplicates: 0, alerts: [] });
  expect(Model.casAuditAnchor).toHaveBeenCalledWith("edge-1", 0, expect.objectContaining({ currentBoot: "b" }));
});

test("boundary validation runs BEFORE any DB access", async () => {
  expect((await Service.ingestEdgeAudit({ edgeId: "", records: [] })).rejected).toBe("bad-edgeId");
  expect((await Service.ingestEdgeAudit({ edgeId: "a.b", records: [rec("", "b", 0, 1)] })).rejected).toBe("bad-edgeId");
  const huge = Array.from({ length: 1001 }, (_, i) => rec("", "b", i, i));
  expect((await Service.ingestEdgeAudit({ edgeId: "e", records: huge })).rejected).toBe("batch-too-large");
  const bad = rec("", "b", 0, 1); bad.seq = -1;
  expect((await Service.ingestEdgeAudit({ edgeId: "e", records: [bad] })).rejected).toBe("malformed-record");
  const noBoot = rec("", "b", 0, 1); delete noBoot.bootEpoch;
  expect((await Service.ingestEdgeAudit({ edgeId: "e", records: [noBoot] })).rejected).toBe("malformed-record");
  expect(Model.getAuditAnchor).not.toHaveBeenCalled();
});

test("a reserved-key bootEpoch is rejected at the boundary, not run as an object key (SEC #169)", async () => {
  // __proto__/$/. as a bootEpoch would read an inherited member or land as a Mongo field — reject it.
  for (const boot of ["__proto__", "constructor", "prototype", "$where", "a.b", ""]) {
    const r = rec("", "b", 0, 1); r.bootEpoch = boot;
    const res = await Service.ingestEdgeAudit({ edgeId: "e", records: [r] });
    expect(res.rejected).toBe("malformed-record");
  }
  expect(Model.getAuditAnchor).not.toHaveBeenCalled(); // rejected before any DB access
});

test("empty records is a no-op (not an error)", async () => {
  expect(await Service.ingestEdgeAudit({ edgeId: "e", records: [] })).toEqual({ accepted: 0, duplicates: 0, alerts: [] });
});

test("a tamper batch is NOT persisted and the alert is routed at high severity", async () => {
  const r0 = rec("", "b", 0, 1); r0.hash = "deadbeef"; // corrupt → bad-hash tamper
  const res = await Service.ingestEdgeAudit({ edgeId: "e", records: [r0] });
  expect(res.alerts.some((a) => a.type === "tamper")).toBe(true);
  expect(Model.casAuditAnchor).not.toHaveBeenCalled(); // nothing mutated → no persist
  expect(auditLog).toHaveBeenCalledWith("door-access.audit", expect.objectContaining({ outcome: "alert", severity: "high", alert: "tamper" }));
});

test("a chain-fork against the stored anchor routes a high-severity alert, no persist", async () => {
  // anchored at seq 0; a forged seq 1 with the wrong prev
  const genuine = rec("", "b", 0, 1);
  Model.getAuditAnchor.mockResolvedValue({ anchor: { boots: { b: { lastSeq: 0, chainTip: genuine.hash } }, currentBoot: "b" }, version: 3 });
  const forged = rec("WRONG-PREV", "b", 1, 2);
  const res = await Service.ingestEdgeAudit({ edgeId: "e", records: [forged] });
  expect(res.accepted).toBe(0);
  expect(Model.casAuditAnchor).not.toHaveBeenCalled();
  expect(auditLog).toHaveBeenCalledWith("door-access.audit", expect.objectContaining({ severity: "high", reason: "chain-fork" }));
});

test("a duplicate re-send is not persisted (no CAS)", async () => {
  const r0 = rec("", "b", 0, 1);
  Model.getAuditAnchor.mockResolvedValue({ anchor: { boots: { b: { lastSeq: 0, chainTip: r0.hash } }, currentBoot: "b" }, version: 2 });
  const res = await Service.ingestEdgeAudit({ edgeId: "e", records: [r0] });
  expect(res).toMatchObject({ accepted: 0, duplicates: 1 });
  expect(Model.casAuditAnchor).not.toHaveBeenCalled();
});

test("a CAS version conflict is retried, then reported as conflict", async () => {
  Model.casAuditAnchor.mockResolvedValue(false); // always conflicts
  const r0 = rec("", "b", 0, 1);
  const res = await Service.ingestEdgeAudit({ edgeId: "e", records: [r0] });
  expect(res.rejected).toBe("conflict");
  expect(Model.getAuditAnchor).toHaveBeenCalledTimes(3);   // 3 attempts
  expect(auditLog).toHaveBeenCalledWith("door-access.audit", expect.objectContaining({ outcome: "cas-conflict" }));
});

test("a conflict that clears on retry succeeds", async () => {
  Model.casAuditAnchor.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const r0 = rec("", "b", 0, 1);
  const res = await Service.ingestEdgeAudit({ edgeId: "e", records: [r0] });
  expect(res.accepted).toBe(1);
  expect(Model.getAuditAnchor).toHaveBeenCalledTimes(2);
});

test("no scan code is ever in an alert log line", async () => {
  const r0 = rec("", "b", 0, 1); r0.hash = "bad";
  await Service.ingestEdgeAudit({ edgeId: "e", records: [r0] });
  const logged = JSON.stringify(auditLog.mock.calls);
  expect(logged).not.toMatch(/CODE|cred|secret/i);
});
