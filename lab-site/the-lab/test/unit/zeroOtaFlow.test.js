// Full Pi Zero OTA flow on a temp dir (real code, CPython): verify → extract tar → atomic symlink
// swap → pending trial → confirm commit (fresh health) OR revert (no health, tries exhausted).
// Node signs the manifest whose sha256 pins the tarball; the Zero applies + confirms.

import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { signManifest } from "../../vps/lib/otaManifest.js";

const ZERO_DIR = path.resolve("vps/firmware/pi-zero");
let ready = true;
try { execFileSync("python3", ["-c", "import cryptography"], { stdio: "ignore" }); } catch { ready = false; }

const DRIVER = `
import sys, json, os
sys.path.insert(0, sys.argv[1])
import ota, ota_confirm, otacrypto
inp = json.load(open(sys.argv[2])); cfg = inp["cfg"]; op = inp["op"]
paths = ota._paths(cfg)
def cur_target():
    try: return os.path.basename(os.path.realpath(paths["current"]))
    except Exception: return None
if op == "seed":
    ota.save_state(cfg, inp["state"]); print(json.dumps({"ok": True}))
elif op == "apply":
    blob = open(inp["blobPath"], "rb").read()
    okm = otacrypto.verify_manifest(inp["manifest"], inp["sig"], cfg["verify_key"])
    okb = otacrypto.verify_blob(inp["manifest"]["sha256"], blob)
    if not (okm and okb):
        print(json.dumps({"verify": False, "okm": okm, "okb": okb})); sys.exit(0)
    res = ota._apply(cfg, paths, inp["manifest"], blob)
    print(json.dumps({"verify": True, "applied": res, "state": ota.load_state(cfg),
        "currentTarget": cur_target(),
        "extracted": os.path.exists(os.path.join(paths["releases"], inp["manifest"]["version"], "reader.py"))}))
elif op == "confirm":
    action = ota_confirm.run(cfg)
    print(json.dumps({"action": action, "state": ota.load_state(cfg), "currentTarget": cur_target()}))
`;

let driverPath, pub, priv;
beforeAll(() => {
  const kp = crypto.generateKeyPairSync("ed25519");
  priv = kp.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  pub = kp.publicKey.export({ type: "spki", format: "der" }).toString("base64");
  process.env.DOOR_FW_SIGNING_KEY = priv;
  process.env.DOOR_FW_VERIFY_KEY = pub;
  driverPath = path.join(os.tmpdir(), "zero-flow-" + crypto.randomBytes(4).toString("hex") + ".py");
  fs.writeFileSync(driverPath, DRIVER);
});
afterAll(() => { try { fs.unlinkSync(driverPath); } catch { /* ignore */ } });

function drive(input) {
  const p = path.join(os.tmpdir(), "zf-" + crypto.randomBytes(4).toString("hex") + ".json");
  fs.writeFileSync(p, JSON.stringify(input));
  try {
    const out = execFileSync("python3", [driverPath, ZERO_DIR, p], { encoding: "utf8" });
    // ota/ota_confirm print progress to stdout; the JSON result is the last "{...}" line.
    const line = out.trim().split("\n").filter((l) => l.trim().startsWith("{")).pop();
    return JSON.parse(line);
  } finally { fs.unlinkSync(p); }
}

// Build a temp release_root with a seeded previous release (1.0.0) + a signed 2.0.0 tarball.
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "door-"));
  const releases = path.join(root, "opt", "releases");
  fs.mkdirSync(path.join(releases, "1.0.0"), { recursive: true });
  fs.writeFileSync(path.join(releases, "1.0.0", "reader.py"), "# v1\n");
  fs.symlinkSync(path.join(releases, "1.0.0"), path.join(root, "opt", "current"));

  // Build the 2.0.0 release tarball.
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "rel2-"));
  fs.writeFileSync(path.join(src, "reader.py"), "# v2\n");
  fs.writeFileSync(path.join(src, "config.json"), "{}\n");
  const tarPath = path.join(root, "2.0.0.tgz");
  execFileSync("tar", ["-czf", tarPath, "-C", src, "."]);
  const blob = fs.readFileSync(tarPath);
  const sha = crypto.createHash("sha256").update(blob).digest("hex");
  const manifest = { role: "pi-zero", version: "2.0.0", minVersion: "1.0.0", sha256: sha, size: blob.length, blobKey: "firmware/pi-zero/2.0.0.tgz" };
  const sig = signManifest(manifest).sig;

  const cfg = {
    verify_key: pub,
    release_root: path.join(root, "opt"),
    state_file: path.join(root, "var", "state.json"),
    health_file: path.join(root, "run", "health"),
    health_max_age_s: 30,
    ota_max_tries: 1,
    reboot_cmd: ["true"], // no-op reboot in tests
  };
  return { root, cfg, manifest, sig, tarPath };
}

const maybe = ready ? test : test.skip;

maybe("apply → pending trial (extracted + current repointed to 2.0.0)", () => {
  const { cfg, manifest, sig, tarPath } = setup();
  drive({ op: "seed", cfg, state: { current: "1.0.0", previous: null, pending: false, tries: 0, committed_version: "1.0.0" } });
  const r = drive({ op: "apply", cfg, manifest, sig, blobPath: tarPath });
  expect(r.verify).toBe(true);
  expect(r.applied).toBe(true);
  expect(r.extracted).toBe(true);
  expect(r.currentTarget).toBe("2.0.0");
  expect(r.state).toMatchObject({ current: "2.0.0", previous: "1.0.0", pending: true });
});

maybe("confirm with a fresh health file → COMMIT", () => {
  const { cfg, manifest, sig, tarPath } = setup();
  drive({ op: "seed", cfg, state: { current: "1.0.0", previous: null, pending: false, tries: 0, committed_version: "1.0.0" } });
  drive({ op: "apply", cfg, manifest, sig, blobPath: tarPath });
  fs.mkdirSync(path.dirname(cfg.health_file), { recursive: true });
  fs.writeFileSync(cfg.health_file, "ok"); // fresh → self-test passes
  const r = drive({ op: "confirm", cfg });
  expect(r.action).toBe("commit");
  expect(r.state).toMatchObject({ current: "2.0.0", pending: false, committed_version: "2.0.0" });
  expect(r.currentTarget).toBe("2.0.0");
});

maybe("confirm with no health file (tries exhausted) → REVERT to 1.0.0", () => {
  const { cfg, manifest, sig, tarPath } = setup();
  drive({ op: "seed", cfg, state: { current: "1.0.0", previous: null, pending: false, tries: 0, committed_version: "1.0.0" } });
  drive({ op: "apply", cfg, manifest, sig, blobPath: tarPath });
  // No health file → self-test fails; ota_max_tries=1 → first confirm reverts.
  const r = drive({ op: "confirm", cfg });
  expect(r.action).toBe("revert");
  expect(r.state).toMatchObject({ current: "1.0.0", pending: false, committed_version: "1.0.0" });
  expect(r.currentTarget).toBe("1.0.0"); // symlink rolled back to the previous release
});

maybe("tampered blob → verify fails, nothing applied", () => {
  const { cfg, manifest, sig, tarPath } = setup();
  drive({ op: "seed", cfg, state: { current: "1.0.0", previous: null, pending: false, tries: 0, committed_version: "1.0.0" } });
  const badManifest = { ...manifest, sha256: "b".repeat(64) }; // sha won't match the tar
  const badSig = signManifest(badManifest).sig; // validly signed, but sha mismatches the blob
  const r = drive({ op: "apply", cfg, manifest: badManifest, sig: badSig, blobPath: tarPath });
  expect(r.verify).toBe(false);
  expect(r.okb).toBe(false); // blob sha256 mismatch caught
});
