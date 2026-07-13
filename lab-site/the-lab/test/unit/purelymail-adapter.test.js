// Unit coverage for the PurelyMail adapter seam (src/lib/purelymail.js).
// fetch is injected so no network is touched. Verifies envelope unwrapping,
// error mapping, existence checks, the created-mailbox request shape (local
// part + generated password we never return), and fail-closed config.
import {
  createMailbox, mailboxExists, listMailboxes, checkCredit,
  fullAddress, purelymailReady, PurelyMailError, call,
} from "@/lib/purelymail";

const OK = (result) => ({ ok: true, status: 200, json: async () => ({ type: "success", result }) });
const ERR = (code, message) => ({ ok: true, status: 200, json: async () => ({ type: "error", code, message }) });

beforeEach(() => {
  process.env.PURELYMAIL_API_TOKEN = "test-token";
  process.env.PURELYMAIL_DOMAIN = "fablabfortsmith.org";
});

describe("purelymail adapter", () => {
  test("purelymailReady reflects env presence", () => {
    expect(purelymailReady()).toBe(true);
    delete process.env.PURELYMAIL_API_TOKEN;
    expect(purelymailReady()).toBe(false);
  });

  test("call fails closed when the token is missing (never silently no-ops)", async () => {
    delete process.env.PURELYMAIL_API_TOKEN;
    const fetchImpl = jest.fn();
    await expect(call("listUser", {}, { fetchImpl })).rejects.toMatchObject({ code: "config" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("createMailbox posts local-part userName + generated password, sends token header", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(OK({}));
    const ret = await createMailbox({ localPart: "jdoe", recoveryEmail: "personal@example.com" }, { fetchImpl });
    expect(ret).toEqual({});
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://purelymail.com/api/v0/createUser");
    expect(opts.headers["Purelymail-Api-Token"]).toBe("test-token");
    const body = JSON.parse(opts.body);
    expect(body.userName).toBe("jdoe"); // LOCAL part only
    expect(body.domainName).toBe("fablabfortsmith.org");
    expect(body.recoveryEmail).toBe("personal@example.com");
    expect(body.sendWelcomeEmail).toBe(true);
    expect(body.enablePasswordReset).toBe(true);
    expect(typeof body.password).toBe("string");
    expect(body.password.length).toBeGreaterThan(16); // a real random secret
  });

  test("application errors throw PurelyMailError and are NOT retried", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ERR("UserExists", "already exists"));
    await expect(createMailbox({ localPart: "taken" }, { fetchImpl })).rejects.toBeInstanceOf(PurelyMailError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("mailboxExists: true when found, false when PurelyMail errors not-found", async () => {
    const found = jest.fn().mockResolvedValue(OK({ enableSearchIndexing: true }));
    expect(await mailboxExists("jdoe", { fetchImpl: found })).toBe(true);
    const missing = jest.fn().mockResolvedValue(ERR("NoSuchUser", "not found"));
    expect(await mailboxExists("ghost", { fetchImpl: missing })).toBe(false);
  });

  test("listMailboxes unwraps the users array; checkCredit parses credit", async () => {
    expect(await listMailboxes({ fetchImpl: jest.fn().mockResolvedValue(OK({ users: ["a@x", "b@x"] })) })).toEqual(["a@x", "b@x"]);
    expect(await checkCredit({ fetchImpl: jest.fn().mockResolvedValue(OK({ credit: "12.50" })) })).toBe(12.5);
  });

  test("fullAddress uses the configured domain", () => {
    expect(fullAddress("jdoe")).toBe("jdoe@fablabfortsmith.org");
  });
});
