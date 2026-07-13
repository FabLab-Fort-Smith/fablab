// Security/abuse coverage for the member-email service — the real business
// rules with PurelyMail, the published UserService, and persistence mocked.
// Each rejection names the control it protects so a regression can't slip back.
jest.mock("@/lib/purelymail", () => ({
  __esModule: true,
  fullAddress: (lp) => `${lp}@fablabfortsmith.org`,
  mailboxExists: jest.fn(),
  createMailbox: jest.fn(),
  deleteMailbox: jest.fn(),
  suspendMailbox: jest.fn(),
  resetMailbox: jest.fn(),
  checkCredit: jest.fn(),
  purelyMailErrorDetail: (e) => e?.message || "err",
}));
jest.mock("@/app/api/v1/users/service", () => ({ __esModule: true, default: { getUserByQuery: jest.fn() } }));
jest.mock("@/plugins/member-email/model", () => ({
  __esModule: true,
  default: {
    findByUserID: jest.fn(), findByLocalPart: jest.fn(), insertMailbox: jest.fn(),
    countActiveForUser: jest.fn(), setStatusByUserID: jest.fn(), removeByUserID: jest.fn(), listAll: jest.fn(),
  },
}));
jest.mock("@/plugins/member-email/config", () => ({ __esModule: true, PERM_ADMIN: "member-email:admin", PLUGIN_ID: "member-email", resolveConfig: jest.fn() }));
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn(), default: { auditLog: jest.fn() } }));

import Service from "@/plugins/member-email/service";
import * as purelymail from "@/lib/purelymail";
import UserService from "@/app/api/v1/users/service";
import Model from "@/plugins/member-email/model";

const CONFIG = { maxMailboxesPerMember: 1, minAccountCredit: 1, additionalReserved: [] };
const MEMBER = { userID: "m1", role: "user" };
const activeMember = { userID: "m1", email: "personal@example.com", membership: { status: "active" } };

beforeEach(() => {
  jest.clearAllMocks();
  UserService.getUserByQuery.mockResolvedValue(activeMember);
  Model.countActiveForUser.mockResolvedValue(0);
  Model.findByLocalPart.mockResolvedValue(null);
  Model.insertMailbox.mockImplementation(async (d) => d);
  Model.findByUserID.mockResolvedValue([{ localPart: "jdoe", address: "jdoe@fablabfortsmith.org", status: "active" }]);
  purelymail.mailboxExists.mockResolvedValue(false);
  purelymail.checkCredit.mockResolvedValue(5);
  purelymail.createMailbox.mockResolvedValue({});
});

describe("claim", () => {
  test("SEC reserved-name: reserved local part -> 400", async () => {
    await expect(Service.claim({ localPart: "admin" }, MEMBER, CONFIG)).rejects.toMatchObject({ status: 400 });
    expect(purelymail.createMailbox).not.toHaveBeenCalled();
  });

  test("SEC authz: a non-active member -> 403", async () => {
    UserService.getUserByQuery.mockResolvedValue({ userID: "m1", email: "p@x.com", membership: { status: "applicant" } });
    await expect(Service.claim({ localPart: "jdoe" }, MEMBER, CONFIG)).rejects.toMatchObject({ status: 403 });
  });

  test("requires a valid personal recovery email -> 400", async () => {
    UserService.getUserByQuery.mockResolvedValue({ userID: "m1", email: "", membership: { status: "active" } });
    await expect(Service.claim({ localPart: "jdoe" }, MEMBER, CONFIG)).rejects.toMatchObject({ status: 400 });
  });

  test("SEC per-member cap: at the limit -> 409", async () => {
    Model.countActiveForUser.mockResolvedValue(1);
    await expect(Service.claim({ localPart: "jdoe" }, MEMBER, CONFIG)).rejects.toMatchObject({ status: 409 });
  });

  test("taken address -> 409 (checks both our DB and PurelyMail)", async () => {
    purelymail.mailboxExists.mockResolvedValue(true);
    await expect(Service.claim({ localPart: "jdoe" }, MEMBER, CONFIG)).rejects.toMatchObject({ status: 409 });
  });

  test("SEC spend-guard: credit below floor -> 503, no mailbox created", async () => {
    purelymail.checkCredit.mockResolvedValue(0);
    await expect(Service.claim({ localPart: "jdoe" }, MEMBER, CONFIG)).rejects.toMatchObject({ status: 503 });
    expect(purelymail.createMailbox).not.toHaveBeenCalled();
  });

  test("happy path creates the mailbox with the DECRYPTED personal email as recovery + persists", async () => {
    const res = await Service.claim({ localPart: "jdoe" }, MEMBER, CONFIG);
    expect(res).toEqual({ address: "jdoe@fablabfortsmith.org", status: "active" });
    expect(UserService.getUserByQuery).toHaveBeenCalledWith({ userID: "m1" }, MEMBER);
    expect(purelymail.createMailbox).toHaveBeenCalledWith({ localPart: "jdoe", recoveryEmail: "personal@example.com" });
    expect(Model.insertMailbox).toHaveBeenCalled();
  });

  test("provider failure -> 502 and nothing persisted", async () => {
    purelymail.createMailbox.mockRejectedValue(new Error("boom"));
    await expect(Service.claim({ localPart: "jdoe" }, MEMBER, CONFIG)).rejects.toMatchObject({ status: 502 });
    expect(Model.insertMailbox).not.toHaveBeenCalled();
  });

  test("race: unique-index collision -> 409 and the orphan mailbox is rolled back", async () => {
    const dup = new Error("dup"); dup.code = 11000;
    Model.insertMailbox.mockRejectedValue(dup);
    await expect(Service.claim({ localPart: "jdoe" }, MEMBER, CONFIG)).rejects.toMatchObject({ status: 409 });
    expect(purelymail.deleteMailbox).toHaveBeenCalledWith("jdoe");
  });
});

describe("admin management authz", () => {
  test("a non-admin cannot suspend/reset/delete another member's mailbox -> 403", async () => {
    await expect(Service.adminSuspend("m1", { userID: "x", role: "user" })).rejects.toMatchObject({ status: 403 });
    await expect(Service.adminDelete("m1", { userID: "x", role: "user" })).rejects.toMatchObject({ status: 403 });
    expect(purelymail.suspendMailbox).not.toHaveBeenCalled();
  });

  test("an admin can suspend a member's mailbox", async () => {
    await Service.adminSuspend("m1", { userID: "admin-1", role: "admin" });
    expect(purelymail.suspendMailbox).toHaveBeenCalledWith("jdoe");
    expect(Model.setStatusByUserID).toHaveBeenCalledWith("m1", "suspended");
  });
});
