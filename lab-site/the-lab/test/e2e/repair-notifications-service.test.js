// AD-5 pilot addon — hook handler behaviour. Proves the handler:
//  - fetches the repair by ID SERVER-SIDE (events are ID-only) and notifies the
//    configured staff address only when enabled+configured (notifyTo set),
//  - no-ops when unconfigured, status-filtered, or the record is missing,
//  - is FAIL-CLOSED: a send failure never throws out of the handler,
//  - honours the notifyOn select knob (all vs a specific status),
//  - never puts PII (name/email/phone/issue) into an audit/log line.
//
// Hermetic: the DB read and the mailer are mocked; escapeHtml stays REAL so we can
// assert the composed HTML is escaped.

jest.mock("@/plugins/repair-notifications/model", () => ({
  __esModule: true,
  getRepairById: jest.fn(),
  default: {},
}));
jest.mock("@/plugins/repair-notifications/config", () => ({
  __esModule: true,
  PLUGIN_ID: "repair-notifications",
  PERM_ADMIN: "repair-notifications:admin",
  resolveConfig: jest.fn(),
}));
jest.mock("@/app/utils/email.util", () => {
  const actual = jest.requireActual("@/app/utils/email.util");
  return { __esModule: true, ...actual, sendNotificationEmail: jest.fn() };
});

import Service from "@/plugins/repair-notifications/service";
import { getRepairById } from "@/plugins/repair-notifications/model";
import { resolveConfig } from "@/plugins/repair-notifications/config";
import { sendNotificationEmail } from "@/app/utils/email.util";

const REPAIR_ID = "repair-11111111-2222-4333-8444-555555555555";
const PII = {
  name: "Ada <b>Lovelace</b>",
  email: "ada@example.com",
  phone: "555-0100",
  issueDescription: "won't <script>boot</script> after update",
};
const REPAIR = {
  repairID: REPAIR_ID,
  ...PII,
  deviceType: "Laptop",
  contactMethod: "email",
  status: "in_progress",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

let logSpy;
beforeEach(() => {
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => logSpy.mockRestore());

/** Concatenate every console.log arg across all calls (audit lines land here). */
function allLogs() {
  return logSpy.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
}
function assertNoPII() {
  const logs = allLogs();
  for (const v of Object.values(PII)) expect(logs).not.toContain(v);
}

describe("onRepairEvent — notifying", () => {
  test("notifies the configured address, fetching the record by ID", async () => {
    resolveConfig.mockResolvedValue({ notifyTo: "shop@fablab.test", subjectPrefix: "[Repair]", notifyOn: "all" });
    getRepairById.mockResolvedValue(REPAIR);

    await Service.onRepairEvent({ repairID: REPAIR_ID });

    expect(getRepairById).toHaveBeenCalledWith(REPAIR_ID);
    expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendNotificationEmail.mock.calls[0];
    expect(to).toBe("shop@fablab.test");
    expect(subject).toContain("[Repair]");
    expect(subject).toContain("in_progress"); // status in the subject line
    // Body is HTML-ESCAPED (CWE-79): the raw tags must not survive.
    expect(html).toContain("Ada &lt;b&gt;Lovelace&lt;/b&gt;");
    expect(html).not.toContain("<b>Lovelace</b>");
    expect(html).toContain("won&#39;t &lt;script&gt;boot&lt;/script&gt; after update");
    expect(html).not.toContain("<script>boot</script>");
    assertNoPII(); // audit line carries only the repairID
  });

  test("audit records the repairID only — never PII", async () => {
    resolveConfig.mockResolvedValue({ notifyTo: "shop@fablab.test", subjectPrefix: "[Repair]", notifyOn: "all" });
    getRepairById.mockResolvedValue(REPAIR);
    await Service.onRepairEvent({ repairID: REPAIR_ID });
    expect(allLogs()).toContain(REPAIR_ID);
    assertNoPII();
  });
});

describe("onRepairEvent — no-op paths", () => {
  test("does nothing when notifyTo is unconfigured (blank)", async () => {
    resolveConfig.mockResolvedValue({ notifyTo: "", subjectPrefix: "[Repair]", notifyOn: "all" });
    await Service.onRepairEvent({ repairID: REPAIR_ID });
    expect(getRepairById).not.toHaveBeenCalled();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(allLogs()).toContain("not-configured");
  });

  test("does nothing when there is no repairID", async () => {
    resolveConfig.mockResolvedValue({ notifyTo: "shop@fablab.test", notifyOn: "all" });
    await Service.onRepairEvent({});
    expect(resolveConfig).not.toHaveBeenCalled();
    expect(getRepairById).not.toHaveBeenCalled();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  test("does nothing when the repair is not found", async () => {
    resolveConfig.mockResolvedValue({ notifyTo: "shop@fablab.test", subjectPrefix: "[Repair]", notifyOn: "all" });
    getRepairById.mockResolvedValue(null);
    await Service.onRepairEvent({ repairID: REPAIR_ID });
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(allLogs()).toContain("not-found");
  });
});

describe("onRepairEvent — notifyOn select gating", () => {
  test('a specific status notifies only on a matching repair.updated event', async () => {
    resolveConfig.mockResolvedValue({ notifyTo: "shop@fablab.test", subjectPrefix: "[Repair]", notifyOn: "completed" });
    getRepairById.mockResolvedValue({ ...REPAIR, status: "completed" });

    await Service.onRepairEvent({ repairID: REPAIR_ID, status: "completed" });

    expect(getRepairById).toHaveBeenCalledWith(REPAIR_ID);
    expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
  });

  test('a specific status SKIPS a non-matching status (before any DB read)', async () => {
    resolveConfig.mockResolvedValue({ notifyTo: "shop@fablab.test", subjectPrefix: "[Repair]", notifyOn: "completed" });

    await Service.onRepairEvent({ repairID: REPAIR_ID, status: "in_progress" });

    expect(getRepairById).not.toHaveBeenCalled();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(allLogs()).toContain("status-filtered");
  });

  test('a specific status SKIPS a created event (no status on the bus)', async () => {
    resolveConfig.mockResolvedValue({ notifyTo: "shop@fablab.test", subjectPrefix: "[Repair]", notifyOn: "completed" });

    await Service.onRepairEvent({ repairID: REPAIR_ID }); // repair.created — no status

    expect(getRepairById).not.toHaveBeenCalled();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(allLogs()).toContain("status-filtered");
  });
});

describe("onRepairEvent — fail closed", () => {
  test("a send failure never throws out of the handler", async () => {
    resolveConfig.mockResolvedValue({ notifyTo: "shop@fablab.test", subjectPrefix: "[Repair]", notifyOn: "all" });
    getRepairById.mockResolvedValue(REPAIR);
    sendNotificationEmail.mockRejectedValueOnce(new Error("smtp down"));

    await expect(Service.onRepairEvent({ repairID: REPAIR_ID })).resolves.toBeUndefined();
    expect(allLogs()).toContain("notify_failed");
    assertNoPII();
  });

  test("a config/DB failure never throws out of the handler", async () => {
    resolveConfig.mockRejectedValueOnce(new Error("registry down"));
    await expect(Service.onRepairEvent({ repairID: REPAIR_ID })).resolves.toBeUndefined();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    assertNoPII();
  });
});
