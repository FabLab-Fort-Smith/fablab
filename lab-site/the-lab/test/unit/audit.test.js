import { buildAuditEvent, auditLog } from "@/lib/audit";

const CLOCK = new Date("2026-05-29T12:00:00.000Z");

describe("buildAuditEvent (CLAUDE.md §9 audit logging)", () => {
  test("captures who/what/outcome/when in a structured record", () => {
    const rec = buildAuditEvent(
      "access.unlock",
      { actor: "user-1", target: "door-controller-01", outcome: "granted", source: "1.2.3.4" },
      CLOCK
    );
    expect(rec).toMatchObject({
      type: "audit",
      event: "access.unlock",
      outcome: "granted",
      actor: "user-1",
      target: "door-controller-01",
      source: "1.2.3.4",
      at: "2026-05-29T12:00:00.000Z",
    });
  });

  test("defaults outcome to success and missing fields to null", () => {
    const rec = buildAuditEvent("admin.action", {}, CLOCK);
    expect(rec.outcome).toBe("success");
    expect(rec.actor).toBeNull();
    expect(rec.target).toBeNull();
  });

  test("redacts sensitive-looking extra fields (no secret leakage)", () => {
    const rec = buildAuditEvent(
      "x",
      { actor: "u", secret: "s3cr3t", token: "abc", authorization: "Bearer z", note: "ok" },
      CLOCK
    );
    expect(rec.secret).toBe("[redacted]");
    expect(rec.token).toBe("[redacted]");
    expect(rec.authorization).toBe("[redacted]");
    expect(rec.note).toBe("ok");
    expect(JSON.stringify(rec)).not.toMatch(/s3cr3t|Bearer z/);
  });
});

describe("auditLog", () => {
  test("emits one JSON line to the injected sink", () => {
    const lines = [];
    const rec = auditLog("access.unlock", { actor: "u", outcome: "denied" }, { sink: (s) => lines.push(s) });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ event: "access.unlock", outcome: "denied", actor: "u" });
    expect(rec.event).toBe("access.unlock");
  });
});
