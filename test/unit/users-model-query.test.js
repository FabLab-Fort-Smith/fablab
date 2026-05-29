// SEC-12: user lookups must treat user input as a literal, not a regex, so
// `?username=.*` can't match (and dump) an arbitrary user.
jest.mock("@/lib/database", () => ({ db: { dbUsers: jest.fn() } }));

import { db } from "@/lib/database";
import UserModel from "@/app/api/v1/users/model";

const fakeCollection = () => ({ findOne: jest.fn().mockResolvedValue(null) });

describe("UserModel.getUserByQuery regex hardening (SEC-12)", () => {
  test("REGRESSION: a username wildcard is escaped + anchored", async () => {
    const coll = fakeCollection();
    db.dbUsers.mockResolvedValue(coll);
    await UserModel.getUserByQuery({ username: ".*" });
    const arg = coll.findOne.mock.calls[0][0];
    expect(arg.$or[0].username.$regex).toBe("^\\.\\*$"); // literal ".*", anchored
  });

  test("REGRESSION: a userID wildcard is escaped in the RegExp", async () => {
    const coll = fakeCollection();
    db.dbUsers.mockResolvedValue(coll);
    await UserModel.getUserByQuery({ userID: ".*" });
    const arg = coll.findOne.mock.calls[0][0];
    expect(arg.userID.$regex).toBeInstanceOf(RegExp);
    expect(arg.userID.$regex.source).toBe("^\\.\\*$");
  });

  test("a normal username is matched literally (still works)", async () => {
    const coll = fakeCollection();
    db.dbUsers.mockResolvedValue(coll);
    await UserModel.getUserByQuery({ username: "bob" });
    const arg = coll.findOne.mock.calls[0][0];
    expect(arg.$or[0].username.$regex).toBe("^bob$");
  });
});
