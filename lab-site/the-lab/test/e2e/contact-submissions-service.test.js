// AD-4 pilot addon — hook handler behaviour. Proves the handler:
//  - fetches the submission by ID SERVER-SIDE (event is ID-only) and forwards it
//    only when enabled+configured (forwardTo set),
//  - no-ops when unconfigured or the record is missing,
//  - is FAIL-CLOSED: a send failure never throws out of the handler,
//  - honours the includeMessage select knob,
//  - never puts PII (name/email/message) into an audit/log line.
//
// Hermetic: the DB read and the mailer are mocked; escapeHtml stays REAL so we can
// assert the composed HTML is escaped.

jest.mock("@/plugins/contact-submissions/model", () => ({
  __esModule: true,
  getSubmissionById: jest.fn(),
  default: {},
}));
jest.mock("@/plugins/contact-submissions/config", () => ({
  __esModule: true,
  PLUGIN_ID: "contact-submissions",
  PERM_ADMIN: "contact-submissions:admin",
  resolveConfig: jest.fn(),
}));
jest.mock("@/app/utils/email.util", () => {
  const actual = jest.requireActual("@/app/utils/email.util");
  return { __esModule: true, ...actual, sendNotificationEmail: jest.fn() };
});

import Service from "@/plugins/contact-submissions/service";
import { getSubmissionById } from "@/plugins/contact-submissions/model";
import { resolveConfig } from "@/plugins/contact-submissions/config";
import { sendNotificationEmail } from "@/app/utils/email.util";

const PII = { name: "Ada <b>Lovelace</b>", email: "ada@example.com", message: "secret note: 42" };
const SUBMISSION = { ...PII, createdAt: new Date("2026-01-01T00:00:00Z") };

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

describe("onContactSubmitted — forwarding", () => {
  test("forwards to the configured address, fetching the record by ID", async () => {
    resolveConfig.mockResolvedValue({ forwardTo: "team@fablab.test", subjectPrefix: "[Contact]", includeMessage: "full" });
    getSubmissionById.mockResolvedValue(SUBMISSION);

    await Service.onContactSubmitted({ submissionID: "abc123" });

    expect(getSubmissionById).toHaveBeenCalledWith("abc123");
    expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendNotificationEmail.mock.calls[0];
    expect(to).toBe("team@fablab.test");
    expect(subject).toContain("[Contact]");
    // Body is HTML-ESCAPED (CWE-79): the raw <b> tag must not survive.
    expect(html).toContain("Ada &lt;b&gt;Lovelace&lt;/b&gt;");
    expect(html).not.toContain("<b>Lovelace</b>");
    expect(html).toContain("secret note: 42"); // full message included
    assertNoPII(); // audit line carries only the submissionID
  });

  test("audit records the submissionID only — never PII", async () => {
    resolveConfig.mockResolvedValue({ forwardTo: "team@fablab.test", subjectPrefix: "[Contact]", includeMessage: "full" });
    getSubmissionById.mockResolvedValue(SUBMISSION);
    await Service.onContactSubmitted({ submissionID: "abc123" });
    expect(allLogs()).toContain("abc123");
    assertNoPII();
  });
});

describe("onContactSubmitted — no-op paths", () => {
  test("does nothing when forwardTo is unconfigured (blank)", async () => {
    resolveConfig.mockResolvedValue({ forwardTo: "", subjectPrefix: "[Contact]", includeMessage: "full" });
    await Service.onContactSubmitted({ submissionID: "abc123" });
    expect(getSubmissionById).not.toHaveBeenCalled();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(allLogs()).toContain("not-configured");
  });

  test("does nothing when there is no submissionID", async () => {
    resolveConfig.mockResolvedValue({ forwardTo: "team@fablab.test", includeMessage: "full" });
    await Service.onContactSubmitted({});
    expect(getSubmissionById).not.toHaveBeenCalled();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  test("does nothing when the submission is not found", async () => {
    resolveConfig.mockResolvedValue({ forwardTo: "team@fablab.test", subjectPrefix: "[Contact]", includeMessage: "full" });
    getSubmissionById.mockResolvedValue(null);
    await Service.onContactSubmitted({ submissionID: "missing" });
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(allLogs()).toContain("not-found");
  });
});

describe("onContactSubmitted — fail closed", () => {
  test("a send failure never throws out of the handler", async () => {
    resolveConfig.mockResolvedValue({ forwardTo: "team@fablab.test", subjectPrefix: "[Contact]", includeMessage: "full" });
    getSubmissionById.mockResolvedValue(SUBMISSION);
    sendNotificationEmail.mockRejectedValueOnce(new Error("smtp down"));

    await expect(Service.onContactSubmitted({ submissionID: "abc123" })).resolves.toBeUndefined();
    expect(allLogs()).toContain("forward_failed");
    assertNoPII();
  });

  test("a config/DB failure never throws out of the handler", async () => {
    resolveConfig.mockRejectedValueOnce(new Error("registry down"));
    await expect(Service.onContactSubmitted({ submissionID: "abc123" })).resolves.toBeUndefined();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    assertNoPII();
  });
});

describe("onContactSubmitted — includeMessage select", () => {
  test('"none" forwards without the message body', async () => {
    resolveConfig.mockResolvedValue({ forwardTo: "team@fablab.test", subjectPrefix: "[Contact]", includeMessage: "none" });
    getSubmissionById.mockResolvedValue(SUBMISSION);
    await Service.onContactSubmitted({ submissionID: "abc123" });
    const html = sendNotificationEmail.mock.calls[0][2];
    expect(html).not.toContain("secret note: 42");
    expect(html).not.toContain("Message:");
  });

  test('"summary" truncates a long message with an ellipsis', async () => {
    const long = "x".repeat(500);
    resolveConfig.mockResolvedValue({ forwardTo: "team@fablab.test", subjectPrefix: "[Contact]", includeMessage: "summary" });
    getSubmissionById.mockResolvedValue({ ...SUBMISSION, message: long });
    await Service.onContactSubmitted({ submissionID: "abc123" });
    const html = sendNotificationEmail.mock.calls[0][2];
    expect(html).toContain("…");
    expect(html).not.toContain("x".repeat(300)); // not the full 500-char body
  });
});
