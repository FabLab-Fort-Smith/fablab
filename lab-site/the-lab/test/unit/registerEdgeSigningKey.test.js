// Model.registerEdgeSigningKey input hardening (SEC #170 F2) — the edge-trust-anchor mutation
// self-validates before touching the DB (all reject cases throw BEFORE any db.connect()).

import crypto from "crypto";

jest.mock("@/lib/database", () => ({ __esModule: true, db: { connect: jest.fn(async () => { throw new Error("DB must not be reached on a reject path"); }) } }));

import { registerEdgeSigningKey } from "@/plugins/door-access-controller/model";
import { db } from "@/lib/database";

const goodPub = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "der" }).toString("base64");
const rsaPub = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "der" }).toString("base64");

beforeEach(() => jest.clearAllMocks());

test("an unsafe edgeId is rejected before any DB access", async () => {
  for (const bad of ["", "a.b", "$x", "__proto__", "constructor", "prototype", "x".repeat(129), 123, null]) {
    await expect(registerEdgeSigningKey(bad, goodPub)).rejects.toThrow(/unsafe edgeId/);
  }
  expect(db.connect).not.toHaveBeenCalled();
});

test("a non-Ed25519 / malformed public key is rejected before any DB access", async () => {
  await expect(registerEdgeSigningKey("edge-1", rsaPub)).rejects.toThrow(/not a valid Ed25519/);
  await expect(registerEdgeSigningKey("edge-1", "not-base64-der")).rejects.toThrow(/not a valid Ed25519/);
  await expect(registerEdgeSigningKey("edge-1", "")).rejects.toThrow(/missing pubSpki/);
  await expect(registerEdgeSigningKey("edge-1", 123)).rejects.toThrow(/missing pubSpki/);
  expect(db.connect).not.toHaveBeenCalled();
});

test("a valid edgeId + Ed25519 key passes validation (then reaches the DB layer)", async () => {
  // Validation passes → it proceeds to cards()/db.connect(), which our mock makes throw — proving the
  // inputs cleared validation and the ONLY failure now is the (mocked) DB, not the guard.
  await expect(registerEdgeSigningKey("edge-1", goodPub)).rejects.toThrow(/DB must not be reached/);
  expect(db.connect).toHaveBeenCalled();
});
