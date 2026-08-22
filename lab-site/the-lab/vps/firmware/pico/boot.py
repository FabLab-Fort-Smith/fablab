"""OTA A/B loader — the only thing that runs at power-on. Selects the slot to boot, applying the
confirm-or-rollback rule (a pending trial that never committed reverts after max_tries), then imports
that slot's main. See docs/architecture/ota-updates.md §5.1.

Pre-OTA compatibility: if there is no /ota/state.json AND no /slots dir (device not yet migrated to
A/B), it runs the legacy /main.py unchanged.
"""

import sys


def _exists(path):
    try:
        import os
        os.stat(path)
        return True
    except Exception:
        return False


def _read_json(path):
    try:
        import json
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None


cfg = _read_json("/config.json") or {}

if not _exists("/ota/state.json") and not _exists("/slots"):
    # Not yet migrated to A/B — run the single-slot firmware as-is.
    print("[boot] no OTA slots; booting legacy /main.py")
    import main  # noqa: F401
else:
    import ota
    import otastate

    state = ota.load_state()
    action, ns = otastate.on_boot(state, cfg.get("ota_max_tries", 3))
    if ns != state:
        ota.save_state(ns)  # persist tries++/revert BEFORE running, so a crash still counts
    slot = ns["active"]
    if action == "revert":
        print("[boot] OTA trial did not commit -> reverted to slot", slot)
    else:
        print("[boot] booting slot", slot, "(pending trial)" if ns["pending"] else "(committed)")

    slot_path = "/slots/" + slot
    if not _exists(slot_path + "/main.py"):
        # Nothing runnable in the selected slot — reset so the next boot increments tries and,
        # once exhausted, reverts to the other (known-good) slot. Fail toward known-good.
        print("[boot] slot main missing; resetting to force revert")
        import machine
        machine.reset()

    sys.path.insert(0, slot_path)  # the slot's modules win over any at root
    try:
        import main  # noqa: F401  (runs the slot app's run loop)
    except Exception as e:
        print("[boot] slot main crashed on import; resetting to force revert:", e)
        import machine
        machine.reset()
