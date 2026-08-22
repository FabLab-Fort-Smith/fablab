// Pure A/B state transitions (vps/firmware/pico/otastate.py) via a Python driver — the
// confirm-or-rollback core: a trial that never commits reverts after max_tries.

import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

const PICO_DIR = path.resolve("vps/firmware/pico");
let havePython = true;
try { execFileSync("python3", ["--version"], { stdio: "ignore" }); } catch { havePython = false; }

const DRIVER = `
import sys, json
sys.path.insert(0, sys.argv[1])
import otastate
cmds = json.load(open(sys.argv[2]))
out = []
for c in cmds:
  op = c["op"]
  if op == "boot":
    action, ns = otastate.on_boot(c["state"], c.get("max", 3))
    out.append({"action": action, "state": ns})
  elif op == "apply":
    out.append({"state": otastate.on_apply(c["state"])})
  elif op == "commit":
    out.append({"state": otastate.on_commit(c["state"], c["version"])})
print(json.dumps(out))
`;

let driverPath;
beforeAll(() => {
  driverPath = path.join(os.tmpdir(), "pico-state-" + crypto.randomBytes(4).toString("hex") + ".py");
  fs.writeFileSync(driverPath, DRIVER);
});
afterAll(() => { try { fs.unlinkSync(driverPath); } catch { /* ignore */ } });

function run(cmds) {
  const p = path.join(os.tmpdir(), "pico-cmds-" + crypto.randomBytes(4).toString("hex") + ".json");
  fs.writeFileSync(p, JSON.stringify(cmds));
  try { return JSON.parse(execFileSync("python3", [driverPath, PICO_DIR, p], { encoding: "utf8" })); }
  finally { fs.unlinkSync(p); }
}

const maybe = havePython ? test : test.skip;

maybe("committed slot boots normally (not pending)", () => {
  const [r] = run([{ op: "boot", state: { active: "a", pending: false, tries: 0, committed_version: "1.0.0" } }]);
  expect(r.action).toBe("boot");
  expect(r.state.active).toBe("a");
});

maybe("apply flips to the inactive slot as a pending trial", () => {
  const [r] = run([{ op: "apply", state: { active: "a", pending: false, tries: 0, committed_version: "1.0.0" } }]);
  expect(r.state).toMatchObject({ active: "b", pending: true, tries: 0, committed_version: "1.0.0" });
});

maybe("trial boot increments tries below the cap", () => {
  const [r] = run([{ op: "boot", state: { active: "b", pending: true, tries: 0, committed_version: "1.0.0" }, max: 3 }]);
  expect(r.action).toBe("try");
  expect(r.state.tries).toBe(1);
});

maybe("trial that never commits REVERTS after max_tries (confirm-or-rollback)", () => {
  // Simulate repeated boots of a pending slot that never commits.
  let state = { active: "b", pending: true, tries: 0, committed_version: "1.0.0" };
  const actions = [];
  for (let i = 0; i < 4; i++) {
    const [r] = run([{ op: "boot", state, max: 3 }]);
    actions.push(r.action);
    state = r.state;
  }
  expect(actions).toEqual(["try", "try", "try", "revert"]);
  expect(state).toMatchObject({ active: "a", pending: false, tries: 0 }); // back to the known-good slot
});

maybe("commit makes the trial permanent + records its version", () => {
  const [r] = run([{ op: "commit", state: { active: "b", pending: true, tries: 2, committed_version: "1.0.0" }, version: "2.0.0" }]);
  expect(r.state).toMatchObject({ active: "b", pending: false, tries: 0, committed_version: "2.0.0" });
});

maybe("a committed trial then boots normally (no revert)", () => {
  const committed = { active: "b", pending: false, tries: 0, committed_version: "2.0.0" };
  const [r] = run([{ op: "boot", state: committed, max: 3 }]);
  expect(r.action).toBe("boot");
  expect(r.state.active).toBe("b");
});
