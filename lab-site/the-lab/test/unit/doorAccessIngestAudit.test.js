// Service.ingestEdgeAudit (S6-b1 + S6-b-a): edge-signature gate, boundary validation, CAS persistence +
// retry, and alert routing. Model (Mongo) is mocked; the auditAnchor logic, recordHash, and the real
// Ed25519 sign/verify are REAL.

import crypto from "crypto";

jest.mock("@/plugins/door-access-controller/model", () => ({
  __esModule: true,
  default: { getAuditAnchor: jest.fn(), casAuditAnchor: jest.fn(), getEdgeSigningKey: jest.fn() },
}));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import Service from "@/plugins/door-access-controller/service";
import Model from "@/plugins/door-access-controller/model";
import { auditLog } from "@/lib/audit";
import { recordHash } from "@/plugins/door-access-controller/auditAnchor";
import { canonical } from "@/plugins/door-access-controller/allowlistCrypto";

// A real edge audit keypair (the edge holds the private key; the cloud registers the public one).
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const PUB = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const sign = (edgeId, records) => crypto.sign(null, Buffer.from(canonical({ edgeId, records })), privateKey).toString("base64");
/** Sign the batch with the registered key and ingest it. */
const ingest = (edgeId, records) => Service.ingestEdgeAudit({ edgeId, records, signature: sign(edgeId, records) });

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
  Model.getEdgeSigningKey.mockResolvedValue(PUB); // edge is provisioned by default
});

test("a valid genesis batch is persisted via CAS and accepted", async () => {
  const r0 = rec("", "b", 0, 1);
  const r1 = rec(r0.hash, "b", 1, 2);
  const res = await ingest("edge-1", [r0, r1]);
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
  expect(Model.getEdgeSigningKey).not.toHaveBeenCalled(); // boundary rejects before the auth check too
});

test("a reserved-key bootEpoch is rejected at the boundary (SEC #169)", async () => {
  for (const boot of ["__proto__", "constructor", "prototype", "$where", "a.b", ""]) {
    const r = rec("", "b", 0, 1); r.bootEpoch = boot;
    const res = await Service.ingestEdgeAudit({ edgeId: "e", records: [r] });
    expect(res.rejected).toBe("malformed-record");
  }
  expect(Model.getAuditAnchor).not.toHaveBeenCalled();
});

test("empty records is a no-op (not an error)", async () => {
  expect(await Service.ingestEdgeAudit({ edgeId: "e", records: [] })).toEqual({ accepted: 0, duplicates: 0, alerts: [] });
});

// --- edge-signature gate (S6-b-a, #151) ---------------------------------------------------------

test("an UNREGISTERED edge is rejected fail-closed, before any anchor read", async () => {
  Model.getEdgeSigningKey.mockResolvedValue(null);
  const res = await ingest("edge-x", [rec("", "b", 0, 1)]);
  expect(res.rejected).toBe("unregistered-edge");
  expect(Model.getAuditAnchor).not.toHaveBeenCalled();
  expect(Model.casAuditAnchor).not.toHaveBeenCalled();
  expect(auditLog).toHaveBeenCalledWith("door-access.audit", expect.objectContaining({ severity: "high", alert: "unregistered-edge" }));
});

test("a batch with a missing / wrong / other-key signature is rejected, no ingest", async () => {
  const r0 = rec("", "b", 0, 1);
  // missing signature
  expect((await Service.ingestEdgeAudit({ edgeId: "e", records: [r0] })).rejected).toBe("bad-signature");
  // garbage signature
  expect((await Service.ingestEdgeAudit({ edgeId: "e", records: [r0], signature: "not-base64-sig" })).rejected).toBe("bad-signature");
  // valid signature but over DIFFERENT records (tampered after signing)
  const sig = sign("e", [r0]);
  const tampered = rec("", "b", 0, 999); // different ts → different bytes
  expect((await Service.ingestEdgeAudit({ edgeId: "e", records: [tampered], signature: sig })).rejected).toBe("bad-signature");
  // valid signature but for a DIFFERENT edgeId (replay under another edge)
  expect((await Service.ingestEdgeAudit({ edgeId: "other", records: [r0], signature: sign("e", [r0]) })).rejected).toBe("bad-signature");
  expect(Model.getAuditAnchor).not.toHaveBeenCalled();
  expect(auditLog).toHaveBeenCalledWith("door-access.audit", expect.objectContaining({ severity: "high", alert: "bad-signature" }));
});

// --- anchor behaviour (batch is validly signed; anchor still detects the edge's own chain tamper) ---

test("a tamper batch (validly signed) is NOT persisted; the anchor alert is routed high", async () => {
  const r0 = rec("", "b", 0, 1); r0.hash = "deadbeef"; // corrupt the chain, THEN sign the corrupt batch
  const res = await ingest("e", [r0]);
  expect(res.alerts.some((a) => a.type === "tamper")).toBe(true);
  expect(Model.casAuditAnchor).not.toHaveBeenCalled();
  expect(auditLog).toHaveBeenCalledWith("door-access.audit", expect.objectContaining({ outcome: "alert", severity: "high", alert: "tamper" }));
});

test("a chain-fork against the stored anchor routes a high-severity alert, no persist", async () => {
  const genuine = rec("", "b", 0, 1);
  Model.getAuditAnchor.mockResolvedValue({ anchor: { boots: { b: { lastSeq: 0, chainTip: genuine.hash } }, currentBoot: "b" }, version: 3 });
  const forged = rec("WRONG-PREV", "b", 1, 2);
  const res = await ingest("e", [forged]);
  expect(res.accepted).toBe(0);
  expect(Model.casAuditAnchor).not.toHaveBeenCalled();
  expect(auditLog).toHaveBeenCalledWith("door-access.audit", expect.objectContaining({ severity: "high", reason: "chain-fork" }));
});

test("a duplicate re-send is not persisted (no CAS)", async () => {
  const r0 = rec("", "b", 0, 1);
  Model.getAuditAnchor.mockResolvedValue({ anchor: { boots: { b: { lastSeq: 0, chainTip: r0.hash } }, currentBoot: "b" }, version: 2 });
  const res = await ingest("e", [r0]);
  expect(res).toMatchObject({ accepted: 0, duplicates: 1 });
  expect(Model.casAuditAnchor).not.toHaveBeenCalled();
});

test("a CAS version conflict is retried, then reported as conflict", async () => {
  Model.casAuditAnchor.mockResolvedValue(false);
  const res = await ingest("e", [rec("", "b", 0, 1)]);
  expect(res.rejected).toBe("conflict");
  expect(Model.getAuditAnchor).toHaveBeenCalledTimes(3);
  expect(auditLog).toHaveBeenCalledWith("door-access.audit", expect.objectContaining({ outcome: "cas-conflict" }));
});

test("a conflict that clears on retry succeeds", async () => {
  Model.casAuditAnchor.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const res = await ingest("e", [rec("", "b", 0, 1)]);
  expect(res.accepted).toBe(1);
  expect(Model.getAuditAnchor).toHaveBeenCalledTimes(2);
});

test("no scan code is ever in an alert log line", async () => {
  Model.getEdgeSigningKey.mockResolvedValue(null);
  await ingest("e", [rec("", "b", 0, 1)]);
  const logged = JSON.stringify(auditLog.mock.calls);
  expect(logged).not.toMatch(/CODE|cred|secret/i);
});
