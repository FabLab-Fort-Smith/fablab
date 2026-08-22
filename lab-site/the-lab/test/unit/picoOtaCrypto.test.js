// Cross-validate the Pico firmware crypto (vps/firmware/pico/{otacrypto,ed25519,_sha512}.py)
// against the Node signer (vps/lib/otaManifest.js): Node signs, Python verifies. This proves the
// pure-Python Ed25519 + SHA-512 are correct AND that canonical() byte-matches across the two langs.

import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { signManifest, canonical } from "../../vps/lib/otaManifest.js";

const PICO_DIR = path.resolve("vps/firmware/pico");
let python = "python3";
let havePython = true;
try {
  execFileSync(python, ["--version"], { stdio: "ignore" });
} catch {
  havePython = false;
}

// Small Python driver: import the Pico crypto, run it over the JSON input, print results.
const DRIVER = `
import sys, json, binascii
sys.path.insert(0, sys.argv[1])
import otacrypto
inp = json.load(open(sys.argv[2]))
res = {
  "canonical": otacrypto.canonical(inp["manifest"]),
  "verify": bool(otacrypto.verify_manifest(inp["manifest"], inp["sig"], inp["verifyKey"])),
}
if "wrongKey" in inp:
  res["verifyWrong"] = bool(otacrypto.verify_manifest(inp["manifest"], inp["sig"], inp["wrongKey"]))
if "blobB64" in inp:
  data = binascii.a2b_base64(inp["blobB64"])
  res["sha256"] = otacrypto.sha256_hex(data)
  res["blobOk"] = bool(otacrypto.verify_blob(inp["blobSha"], data))
print(json.dumps(res))
`;

let driverPath;
beforeAll(() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  process.env.DOOR_FW_SIGNING_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  process.env.DOOR_FW_VERIFY_KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  driverPath = path.join(os.tmpdir(), "pico-otacrypto-driver-" + crypto.randomBytes(4).toString("hex") + ".py");
  fs.writeFileSync(driverPath, DRIVER);
});
afterAll(() => { try { fs.unlinkSync(driverPath); } catch { /* ignore */ } });

function runPython(input) {
  const inPath = path.join(os.tmpdir(), "pico-in-" + crypto.randomBytes(4).toString("hex") + ".json");
  fs.writeFileSync(inPath, JSON.stringify(input));
  try {
    const out = execFileSync(python, [driverPath, PICO_DIR, inPath], { encoding: "utf8" });
    return JSON.parse(out);
  } finally {
    fs.unlinkSync(inPath);
  }
}

const manifest = (over = {}) => ({
  role: "pico", version: "1.4.0", minVersion: "1.0.0",
  sha256: "a".repeat(64), size: 1024, blobKey: "firmware/pico/1.4.0.bin",
  builtAt: "2026-08-22T00:00:00Z", commit: "deadbeef", ...over,
});

const maybe = havePython ? test : test.skip;

maybe("canonical() byte-matches Node across languages", () => {
  const m = manifest();
  const res = runPython({ manifest: m, sig: signManifest(m).sig, verifyKey: process.env.DOOR_FW_VERIFY_KEY });
  expect(res.canonical).toBe(canonical(m)); // exact string equality → same signed bytes
});

maybe("Node signs → Pico verifies (Ed25519 + SHA-512 pure-python correct)", () => {
  const m = manifest({ version: "2.1.0" });
  const signed = signManifest(m);
  const res = runPython({ manifest: m, sig: signed.sig, verifyKey: process.env.DOOR_FW_VERIFY_KEY });
  expect(res.verify).toBe(true);
});

maybe("tampered manifest → Pico verify false (fail closed)", () => {
  const m = manifest({ version: "2.1.0" });
  const signed = signManifest(m);
  const tampered = { ...m, version: "9.9.9" }; // changed after signing
  const res = runPython({ manifest: tampered, sig: signed.sig, verifyKey: process.env.DOOR_FW_VERIFY_KEY });
  expect(res.verify).toBe(false);
});

maybe("wrong public key → Pico verify false", () => {
  const m = manifest();
  const signed = signManifest(m);
  const wrong = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const res = runPython({ manifest: m, sig: signed.sig, verifyKey: process.env.DOOR_FW_VERIFY_KEY, wrongKey: wrong });
  expect(res.verify).toBe(true);
  expect(res.verifyWrong).toBe(false);
});

maybe("blob SHA-256 matches Node + verify_blob true/false", () => {
  const data = crypto.randomBytes(2048);
  const sha = crypto.createHash("sha256").update(data).digest("hex");
  const m = manifest();
  const res = runPython({
    manifest: m, sig: signManifest(m).sig, verifyKey: process.env.DOOR_FW_VERIFY_KEY,
    blobB64: data.toString("base64"), blobSha: sha,
  });
  expect(res.sha256).toBe(sha);
  expect(res.blobOk).toBe(true);
  // wrong expected hash → false
  const res2 = runPython({
    manifest: m, sig: signManifest(m).sig, verifyKey: process.env.DOOR_FW_VERIFY_KEY,
    blobB64: data.toString("base64"), blobSha: "b".repeat(64),
  });
  expect(res2.blobOk).toBe(false);
});
