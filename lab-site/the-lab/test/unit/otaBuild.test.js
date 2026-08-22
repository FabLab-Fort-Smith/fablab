// scripts/ota-build.mjs — build + sign OTA bundles. Assert the produced manifest verifies with the
// device-side verifier and the blob SHA-256 matches (so a device would accept it).

import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { verifyManifest, isEligibleUpdate } from "../../vps/lib/otaManifest.js";

const SCRIPT = "scripts/ota-build.mjs"; // relative to the-lab (jest cwd)
let signEnv;

beforeAll(() => {
  const kp = crypto.generateKeyPairSync("ed25519");
  process.env.DOOR_FW_VERIFY_KEY = kp.publicKey.export({ type: "spki", format: "der" }).toString("base64");
  signEnv = { ...process.env, DOOR_FW_SIGNING_KEY: kp.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64") };
});

function build(args) {
  const out = execFileSync("node", [SCRIPT, ...args], { encoding: "utf8", env: signEnv });
  return JSON.parse(out.trim().split("\n").pop());
}

test("pico bundle: files-map blob, signed manifest verifies, sha matches", () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "picosrc-"));
  fs.writeFileSync(path.join(src, "main.py"), "print('pico v1.2.0')\n");
  fs.writeFileSync(path.join(src, "wsclient.py"), "# ws\n");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "picoout-"));

  const r = build(["--role", "pico", "--version", "1.2.0", "--min", "1.0.0", "--src", src, "--out", out, "--commit", "abc123"]);
  expect(r.blobKey).toBe("firmware/pico/1.2.0.bin");

  const blob = fs.readFileSync(r.blobPath);
  expect(crypto.createHash("sha256").update(blob).digest("hex")).toBe(r.sha256);

  const signed = JSON.parse(fs.readFileSync(r.manifestPath, "utf8"));
  expect(signed.manifest.sha256).toBe(r.sha256);
  expect(verifyManifest(signed)).toBe(true); // the DEVICE-side verifier accepts it
  expect(isEligibleUpdate({ signed, role: "pico", currentVersion: "1.1.0" }).eligible).toBe(true);

  const files = JSON.parse(blob.toString("utf8")).files;
  expect(Buffer.from(files["main.py"], "base64").toString()).toContain("pico v1.2.0");
  expect(Object.keys(files).sort()).toEqual(["main.py", "wsclient.py"]);
});

test("pi-zero bundle: tgz blob, signed manifest verifies, sha matches", () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "zerosrc-"));
  fs.writeFileSync(path.join(src, "reader.py"), "# reader\n");
  fs.writeFileSync(path.join(src, "ota.py"), "# ota\n");
  fs.writeFileSync(path.join(src, "config.json"), "{}\n"); // must be EXCLUDED
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "zeroout-"));

  const r = build(["--role", "pi-zero", "--version", "2.0.0", "--src", src, "--out", out]);
  expect(r.blobKey).toBe("firmware/pi-zero/2.0.0.tgz");

  const blob = fs.readFileSync(r.blobPath);
  expect(crypto.createHash("sha256").update(blob).digest("hex")).toBe(r.sha256);
  expect(blob.length).toBe(r.size);

  const signed = JSON.parse(fs.readFileSync(r.manifestPath, "utf8"));
  expect(verifyManifest(signed)).toBe(true);
  expect(signed.manifest.role).toBe("pi-zero");

  // config.json is not a .py file → excluded from the tar member list.
  const list = execFileSync("tar", ["-tzf", r.blobPath], { encoding: "utf8" });
  expect(list).toMatch(/reader\.py/);
  expect(list).not.toMatch(/config\.json/);
});

test("fails loud without a signing key", () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "nokey-"));
  fs.writeFileSync(path.join(src, "main.py"), "x\n");
  fs.writeFileSync(path.join(src, "wsclient.py"), "y\n");
  const env = { ...process.env };
  delete env.DOOR_FW_SIGNING_KEY;
  expect(() => execFileSync("node", [SCRIPT, "--role", "pico", "--version", "1.0.0", "--src", src, "--out", src], { env, stdio: "pipe" }))
    .toThrow();
});
