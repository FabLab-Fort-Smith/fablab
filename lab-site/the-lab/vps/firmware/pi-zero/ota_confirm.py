"""Pi Zero OTA confirm — runs at boot (door-ota-confirm.service, after door-reader). If the current
release is a pending trial, run the e2e self-test and COMMIT on success, else REVERT to the previous
release (or RETRY until ota_max_tries). This is the confirm-or-rollback gate. See
docs/architecture/ota-updates.md §5.2.

Self-test = the door-reader app is healthy: it touches a health file once it has the UART link to the
Pico and the Pico reports the link online. A fresh health file → the new firmware actually works.
"""

import os
import sys
import time

import ota
import otastate


def self_test(cfg):
    """True iff door-reader has recently proven the door path (fresh health file)."""
    hp = cfg.get("health_file", "/run/door/health")
    max_age = cfg.get("health_max_age_s", 30)
    try:
        return (time.time() - os.path.getmtime(hp)) <= max_age
    except Exception:
        return False  # no/stale health file → not healthy → fail closed


def _repoint_current(cfg, version):
    """Atomically point `current` at releases/<version> (used on revert)."""
    paths = ota._paths(cfg)
    dest = os.path.join(paths["releases"], version)
    tmp = paths["current"] + ".tmp"
    if os.path.islink(tmp) or os.path.exists(tmp):
        os.remove(tmp)
    os.symlink(dest, tmp)
    os.replace(tmp, paths["current"])


def run(cfg):
    """Execute the confirm decision. Returns the action taken: noop|commit|revert|retry."""
    state = ota.load_state(cfg)
    if not state.get("pending"):
        return "noop"

    # Count this attempt FIRST (persisted), so a crash before the decision still advances tries →
    # a crash-loop eventually reverts.
    state = otastate.increment_tries(state)
    ota.save_state(cfg, state)

    ok = self_test(cfg)
    action = otastate.plan_confirm(True, state["tries"], cfg.get("ota_max_tries", 3), ok)

    if action == "commit":
        ota.save_state(cfg, otastate.on_commit(state))
        print("[ota-confirm] self-test PASSED -> committed", state["current"])
        return "commit"
    if action == "revert":
        prev = state.get("previous") or state.get("committed_version")
        _repoint_current(cfg, prev)
        ota.save_state(cfg, otastate.on_revert(state))
        print("[ota-confirm] self-test FAILED, tries exhausted -> reverted to", prev)
        ota._reboot(cfg)
        return "revert"
    # retry: leave pending, reboot to try the self-test again
    print("[ota-confirm] self-test FAILED, retry", state["tries"])
    ota._reboot(cfg)
    return "retry"


def _load_cfg(path):
    import json
    with open(path) as f:
        return json.load(f)


if __name__ == "__main__":
    cfg_path = sys.argv[1] if len(sys.argv) > 1 else "/opt/door/current/config.json"
    run(_load_cfg(cfg_path))
