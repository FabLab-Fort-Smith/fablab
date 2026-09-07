// Unit coverage for the bug-board -> GitHub Issues mirror client (issue #137).
// fetch is INJECTED so no network is touched. Verifies untrusted-content
// sanitization (no @mention pinging, no HTML/markdown injection, length cap),
// the request shape (fixed host, headers, label), config fail-closed, repo-slug
// validation, and that the SECRET token never leaks into an error or a log.
import {
  sanitizeGithubText,
  createBugIssue,
  bugboardMirrorReady,
  repository,
  label,
  BugboardMirrorError,
} from "@/lib/bugboardGithub";

const OK = (result) => ({ ok: true, status: 201, json: async () => result });

// A deliberately fake, non-PAT-shaped token (won't trip secret scanners).
const SECRET = "fake-bugboard-token-should-never-leak";

beforeEach(() => {
  process.env.GITHUB_BUGBOARD_TOKEN = SECRET;
  process.env.GITHUB_BUGBOARD_REPO = "FabLab-Fort-Smith/fablab";
  delete process.env.GITHUB_BUGBOARD_LABEL;
  process.env.NEXT_PUBLIC_APP_URL = "https://fablabfortsmith.org";
});

describe("sanitizeGithubText", () => {
  test("neutralizes @mentions so GitHub can't ping the named user", () => {
    const out = sanitizeGithubText("ping @octocat and @maintainer now");
    expect(out).not.toContain("@octocat");
    expect(out).not.toContain("@maintainer");
    // The visible name survives (only the autolink token is broken).
    expect(out).toContain("octocat");
    expect(out).toContain("maintainer");
  });

  test("neutralizes #issue references and HTML", () => {
    const out = sanitizeGithubText("see #1234 <img src=x onerror=alert(1)>");
    expect(out).not.toContain("#1234");
    expect(out).toContain("1234");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  test("caps length (bounded, DoS guard)", () => {
    const out = sanitizeGithubText("a".repeat(9000), 100);
    expect(out.length).toBeLessThanOrEqual(101); // cap + ellipsis
    expect(out.endsWith("…")).toBe(true);
  });

  test("strips control characters but keeps newlines/tabs", () => {
    const out = sanitizeGithubText("line1\n\tline2\u0007\u0000\u001Fend");
    expect(out).toContain("line1\n\tline2");
    expect(out).not.toContain("\u0007");
    expect(out).not.toContain("\u0000");
    expect(out).not.toContain("\u001F");
    expect(out).toContain("line2end");
  });
});

describe("config helpers", () => {
  test("bugboardMirrorReady reflects token presence (fail-closed when unset)", () => {
    expect(bugboardMirrorReady()).toBe(true);
    delete process.env.GITHUB_BUGBOARD_TOKEN;
    expect(bugboardMirrorReady()).toBe(false);
  });

  test("repository validates the owner/name slug (blocks injection)", () => {
    expect(repository()).toBe("FabLab-Fort-Smith/fablab");
    process.env.GITHUB_BUGBOARD_REPO = "evil/../../etc/passwd";
    expect(() => repository()).toThrow(BugboardMirrorError);
    delete process.env.GITHUB_BUGBOARD_REPO;
    expect(() => repository()).toThrow(/not set/);
  });

  test("label defaults to bug-board", () => {
    expect(label()).toBe("bug-board");
    process.env.GITHUB_BUGBOARD_LABEL = "triage";
    expect(label()).toBe("triage");
  });
});

describe("createBugIssue", () => {
  const bug = {
    bugID: "bug-abc-123",
    title: "Crash when clicking @admin button",
    description: "Steps: open <b>page</b>, ping @octocat, ref #99. boom",
    submitterUsername: "alice",
  };

  test("POSTs to the fixed GitHub host with correct headers, label, and sanitized body", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(OK({ number: 42, html_url: "https://github.com/FabLab-Fort-Smith/fablab/issues/42" }));
    const ret = await createBugIssue(bug, { fetchImpl });

    expect(ret).toEqual({ number: 42, url: "https://github.com/FabLab-Fort-Smith/fablab/issues/42" });

    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/FabLab-Fort-Smith/fablab/issues");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(opts.headers.Accept).toBe("application/vnd.github+json");
    expect(opts.headers["X-GitHub-Api-Version"]).toBe("2022-11-28");

    const body = JSON.parse(opts.body);
    expect(body.labels).toEqual(["bug-board"]);

    // Title: @mention neutralized, single line.
    expect(body.title).not.toContain("@admin");
    expect(body.title).toContain("admin");

    // Body: username + backlink present; @mention/#ref/HTML neutralized; fenced.
    expect(body.body).toContain("alice");
    expect(body.body).toContain("https://fablabfortsmith.org/dashboard/resources/bugs");
    expect(body.body).toContain("bug-abc-123");
    expect(body.body).not.toContain("@octocat");
    expect(body.body).not.toContain("#99");
    expect(body.body).not.toContain("<b>");
    expect(body.body).toContain("&lt;b&gt;");
  });

  test("does NOT include the submitter email / PII (record has none, we never fetch it)", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(OK({ number: 1, html_url: "https://github.com/x/y/issues/1" }));
    await createBugIssue({ ...bug, submitterUsername: "alice" }, { fetchImpl });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.body).not.toContain("alice@example.com"); // no email address
    // No `@` is ever directly followed by a mention char (the autolink token is always broken).
    expect(body.title).not.toMatch(/@[A-Za-z0-9_]/);
    expect(body.body).not.toMatch(/@[A-Za-z0-9_]/);
  });

  test("throws BugboardMirrorError on non-2xx WITHOUT leaking the token", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: "forbidden" }) });
    let caught;
    try {
      await createBugIssue(bug, { fetchImpl });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BugboardMirrorError);
    expect(caught.code).toBe("upstream");
    expect(caught.message).not.toContain(SECRET);
  });

  test("fails closed when the token is missing (never fetches)", async () => {
    delete process.env.GITHUB_BUGBOARD_TOKEN;
    const fetchImpl = jest.fn();
    await expect(createBugIssue(bug, { fetchImpl })).rejects.toMatchObject({ code: "config" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("a rejected fetch surfaces as a typed network error, token not in message", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error(`boom ${SECRET}`));
    let caught;
    try {
      await createBugIssue(bug, { fetchImpl });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BugboardMirrorError);
    expect(caught.message).not.toContain(SECRET);
  });

  test("untrusted content cannot break out of the code fence", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(OK({ number: 5, html_url: "https://github.com/x/y/issues/5" }));
    await createBugIssue({ ...bug, description: "```\nbreak out\n``` then **inject**" }, { fetchImpl });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    // The chosen fence is longer than any backtick run in the content.
    const fenceMatch = body.body.match(/`{4,}text/);
    expect(fenceMatch).not.toBeNull();
  });
});
