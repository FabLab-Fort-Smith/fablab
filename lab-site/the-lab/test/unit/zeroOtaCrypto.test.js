// Cross-validate the Pi Zero OTA crypto (vps/firmware/pi-zero/otacrypto.py, uses `cryptography`)
// against the Node signer (vps/lib/otaManifest.js): Node signs, the Zero verifies. Also proves
// canonical() byte-matches across languages.

import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { signManifest, canonical } from "../../vps/lib/otaManifest.js";

const ZERO_DIR = path.resolve("vps/firmware/pi-zero");
let ready = true;
try {
  execFileSync("python3", ["-c", "import cryptography"], { stdio: "ignore" });
} catch {
  ready = false; // cryptography not installed in this env → skip (still proven via pico interop)
}

const DRIVER = `
import sys, json
sys.path.insert(0, sys.argv[1])
import otacrypto
inp = json.load(open(sys.argv[2]))
res = {
  "canonical": otacrypto.canonical(inp["manifest"]),
  "verify": bool(otacrypto.verify_manifest(inp["manifest"], inp["sig"], inp["verifyKey"])),
}
if "wrongKey" in inp:
  res["verifyWrong"] = bool(otacrypto.verify_manifest(inp["manifest"], inp["sig"], inp["wrongKey"]))
print(json.dumps(res))
`;

let driverPath;
beforeAll(() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  process.env.DOOR_FW_SIGNING_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  process.env.DOOR_FW_VERIFY_KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  driverPath = path.join(os.tmpdir(), "zero-crypto-" + crypto.randomBytes(4).toString("hex") + ".py");
  fs.writeFileSync(driverPath, DRIVER);
});
afterAll(() => { try { fs.unlinkSync(driverPath); } catch { /* ignore */ } });

function runPython(input) {
  const p = path.join(os.tmpdir(), "zero-in-" + crypto.randomBytes(4).toString("hex") + ".json");
  fs.writeFileSync(p, JSON.stringify(input));
  try { return JSON.parse(execFileSync("python3", [driverPath, ZERO_DIR, p], { encoding: "utf8" })); }
  finally { fs.unlinkSync(p); }
}

const manifest = (over = {}) => ({
  role: "pi-zero", version: "1.4.0", minVersion: "1.0.0",
  sha256: "a".repeat(64), size: 1024, blobKey: "firmware/pi-zero/1.4.0.tgz", ...over,
});

const maybe = ready ? test : test.skip;

maybe("canonical() byte-matches Node", () => {
  const m = manifest();
  expect(runPython({ manifest: m, sig: signManifest(m).sig, verifyKey: process.env.DOOR_FW_VERIFY_KEY }).canonical)
    .toBe(canonical(m));
});

maybe("Node signs → Zero verifies (cryptography)", () => {
  const m = manifest({ version: "3.0.0" });
  expect(runPython({ manifest: m, sig: signManifest(m).sig, verifyKey: process.env.DOOR_FW_VERIFY_KEY }).verify).toBe(true);
});

maybe("tampered manifest → false", () => {
  const m = manifest({ version: "3.0.0" });
  const sig = signManifest(m).sig;
  expect(runPython({ manifest: { ...m, version: "9.9.9" }, sig, verifyKey: process.env.DOOR_FW_VERIFY_KEY }).verify).toBe(false);
});

maybe("wrong key → false", () => {
  const m = manifest();
  const sig = signManifest(m).sig;
  const wrong = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const res = runPython({ manifest: m, sig, verifyKey: process.env.DOOR_FW_VERIFY_KEY, wrongKey: wrong });
  expect(res.verify).toBe(true);
  expect(res.verifyWrong).toBe(false);
});
