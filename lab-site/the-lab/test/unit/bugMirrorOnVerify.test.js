// Issue #137 — mirror-on-verify behavior in BugService.updateBugStatus.
// Models, notifications, the GitHub client, and audit are mocked (no network,
// no DB). Constants is REAL. Asserts: one issue per verify, idempotency,
// fail-closed (verify + stake/badges survive a mirror failure), no-token skip,
// and that attribution uses the USERNAME (never the email/PII).

jest.mock("@/app/api/v1/bugs/model", () => ({
  __esModule: true,
  default: { getBugById: jest.fn(), updateBug: jest.fn(), createBug: jest.fn() },
}));
jest.mock("@/app/api/v1/users/model", () => ({
  __esModule: true,
  default: { getUserByQuery: jest.fn(), getAllUsers: jest.fn(), updateUser: jest.fn() },
}));
jest.mock("@/app/api/v1/notifications/service", () => ({
  __esModule: true,
  default: { create: jest.fn() },
}));
jest.mock("@/lib/bugboardGithub", () => ({
  __esModule: true,
  bugboardMirrorReady: jest.fn(),
  createBugIssue: jest.fn(),
}));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));

import BugService from "@/app/api/v1/bugs/service";
import BugModel from "@/app/api/v1/bugs/model";
import UserModel from "@/app/api/v1/users/model";
import { bugboardMirrorReady, createBugIssue } from "@/lib/bugboardGithub";
import { auditLog } from "@/lib/audit";

const BUG = {
  bugID: "bug-1",
  title: "Something broke",
  description: "detailed steps",
  submittedBy: "u1",
  status: "open",
};
// Submitter carries an email on the record; the mirror must NEVER use/expose it.
const SUBMITTER = { userID: "u1", username: "alice", firstName: "Alice", email: "alice@example.com", stake: 0, badges: [] };

beforeEach(() => {
  jest.clearAllMocks();
  BugModel.getBugById.mockResolvedValue({ ...BUG });
  BugModel.updateBug.mockResolvedValue(true);
  UserModel.getUserByQuery.mockResolvedValue({ ...SUBMITTER });
  UserModel.updateUser.mockResolvedValue(true);
  bugboardMirrorReady.mockReturnValue(true);
  createBugIssue.mockResolvedValue({ number: 77, url: "https://github.com/FabLab-Fort-Smith/fablab/issues/77" });
});

function issueNumberUpdateCalls() {
  return BugModel.updateBug.mock.calls.filter(([, data]) => data && "githubIssueNumber" in data);
}

test("verify creates exactly one GitHub issue and persists its number/url — attributed by USERNAME, not email", async () => {
  const res = await BugService.updateBugStatus("bug-1", "verified", "admin1", 50);
  expect(res).toEqual({ success: true });

  expect(createBugIssue).toHaveBeenCalledTimes(1);
  const arg = createBugIssue.mock.calls[0][0];
  expect(arg).toMatchObject({ bugID: "bug-1", title: "Something broke", submitterUsername: "alice" });
  expect(arg).not.toHaveProperty("email");
  expect(JSON.stringify(arg)).not.toContain("alice@example.com");

  const persisted = issueNumberUpdateCalls();
  expect(persisted).toHaveLength(1);
  expect(persisted[0][1]).toMatchObject({ githubIssueNumber: 77, githubIssueUrl: expect.stringContaining("/issues/77") });

  // Stake + badge still awarded.
  expect(UserModel.updateUser).toHaveBeenCalledTimes(1);
});

test("idempotent — a bug that already has a githubIssueNumber does NOT create a second issue", async () => {
  BugModel.getBugById.mockResolvedValue({ ...BUG, githubIssueNumber: 12 });
  const res = await BugService.updateBugStatus("bug-1", "verified", "admin1", 50);
  expect(res).toEqual({ success: true });
  expect(createBugIssue).not.toHaveBeenCalled();
  expect(issueNumberUpdateCalls()).toHaveLength(0);
});

test("fail-closed — a mirror failure never breaks verify; stake/badges still awarded, audited shape-only", async () => {
  createBugIssue.mockRejectedValue(new Error("GitHub API responded 500"));
  const res = await BugService.updateBugStatus("bug-1", "verified", "admin1", 50);

  expect(res).toEqual({ success: true }); // domain action succeeded
  expect(UserModel.updateUser).toHaveBeenCalledTimes(1); // rewards committed
  expect(issueNumberUpdateCalls()).toHaveLength(0); // left unset -> retryable later

  const failEvents = auditLog.mock.calls.filter(([evt]) => evt === "bugboard.mirror.failed");
  expect(failEvents).toHaveLength(1);
  // Shape-only: bugID present, no token/PII/email anywhere in the audit payload.
  const payload = JSON.stringify(auditLog.mock.calls);
  expect(payload).toContain("bug-1");
  expect(payload).not.toContain("alice@example.com");
});

test("no token — mirror is skipped, verify still works, and nothing is fetched", async () => {
  bugboardMirrorReady.mockReturnValue(false);
  const res = await BugService.updateBugStatus("bug-1", "verified", "admin1", 50);
  expect(res).toEqual({ success: true });
  expect(createBugIssue).not.toHaveBeenCalled();
  expect(UserModel.updateUser).toHaveBeenCalledTimes(1);
  const skipEvents = auditLog.mock.calls.filter(([evt]) => evt === "bugboard.mirror.skipped");
  expect(skipEvents).toHaveLength(1);
});

test("non-verify transitions never mirror", async () => {
  const res = await BugService.updateBugStatus("bug-1", "rejected", "admin1", 0);
  expect(res).toEqual({ success: true });
  expect(createBugIssue).not.toHaveBeenCalled();
  expect(bugboardMirrorReady).not.toHaveBeenCalled();
});

test("mirror still runs when the submitter lookup returns null (attribution falls back safely)", async () => {
  UserModel.getUserByQuery.mockResolvedValue(null);
  const res = await BugService.updateBugStatus("bug-1", "verified", "admin1", 50);
  expect(res).toEqual({ success: true });
  expect(createBugIssue).toHaveBeenCalledTimes(1);
  expect(createBugIssue.mock.calls[0][0].submitterUsername).toBe("unknown");
});
