// Pure Zero A/B transitions (vps/firmware/pi-zero/otastate.py) via a python3 driver.

import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

const ZERO_DIR = path.resolve("vps/firmware/pi-zero");
let havePython = true;
try { execFileSync("python3", ["--version"], { stdio: "ignore" }); } catch { havePython = false; }

const DRIVER = `
import sys, json
sys.path.insert(0, sys.argv[1])
import otastate
inp = json.load(open(sys.argv[2]))
out = {}
out["plan"] = [otastate.plan_confirm(*c) for c in inp["plan"]]
out["apply"] = otastate.on_apply({"current":"1.0.0","previous":None,"pending":False,"tries":0,"committed_version":"1.0.0"}, "2.0.0")
out["revert"] = otastate.on_revert({"current":"2.0.0","previous":"1.0.0","pending":True,"tries":3,"committed_version":"1.0.0"})
print(json.dumps(out))
`;

let driverPath;
beforeAll(() => {
  driverPath = path.join(os.tmpdir(), "zero-state-" + crypto.randomBytes(4).toString("hex") + ".py");
  fs.writeFileSync(driverPath, DRIVER);
});
afterAll(() => { try { fs.unlinkSync(driverPath); } catch { /* ignore */ } });

const maybe = havePython ? test : test.skip;

maybe("plan_confirm + on_apply/on_revert transitions", () => {
  const p = path.join(os.tmpdir(), "zs-" + crypto.randomBytes(4).toString("hex") + ".json");
  // plan_confirm(pending, tries, max_tries, selftest_ok)
  fs.writeFileSync(p, JSON.stringify({ plan: [
    [false, 1, 3, false],  // not pending -> noop
    [true, 1, 3, true],    // pass -> commit
    [true, 1, 3, false],   // fail, tries<max -> retry
    [true, 3, 3, false],   // fail, tries>=max -> revert
  ] }));
  let out;
  try { out = JSON.parse(execFileSync("python3", [driverPath, ZERO_DIR, p], { encoding: "utf8" })); }
  finally { fs.unlinkSync(p); }
  expect(out.plan).toEqual(["noop", "commit", "retry", "revert"]);
  expect(out.apply).toMatchObject({ current: "2.0.0", previous: "1.0.0", pending: true, tries: 0 });
  expect(out.revert).toMatchObject({ current: "1.0.0", previous: null, pending: false, committed_version: "1.0.0" });
});
