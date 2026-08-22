"""Pure A/B slot state transitions for the Pico OTA loader — no machine/FS/network imports, so it
is unit-testable off-device. The loader (boot.py) and updater (ota.py) call these and persist the
result to /ota/state.json. See docs/architecture/ota-updates.md §5.1.

state = {
  "active": "a" | "b",         # slot to boot
  "pending": bool,             # True while a freshly-applied slot is on TRIAL (not yet committed)
  "tries": int,                # boot attempts of the pending slot (loader increments before boot)
  "committed_version": "x.y.z" # version of the last COMMITTED slot (what a revert falls back to)
}
"""

DEFAULT_STATE = {"active": "a", "pending": False, "tries": 0, "committed_version": "0.0.0"}


def other(slot):
    """The inactive slot."""
    return "b" if slot == "a" else "a"


def normalize(state):
    """Fill defaults for a missing/partial state (fail-safe: unknown → boot 'a', not pending)."""
    s = dict(DEFAULT_STATE)
    if isinstance(state, dict):
        if state.get("active") in ("a", "b"):
            s["active"] = state["active"]
        s["pending"] = bool(state.get("pending", False))
        try:
            s["tries"] = int(state.get("tries", 0))
        except Exception:
            s["tries"] = 0
        if isinstance(state.get("committed_version"), str):
            s["committed_version"] = state["committed_version"]
    return s


def on_boot(state, max_tries=3):
    """Decide what the loader does at power-on. Returns (action, new_state):

      - not pending           → ("boot",   state)            boot the committed active slot
      - pending, tries<max    → ("try",    state+tries+1)    boot the trial slot (count this attempt)
      - pending, tries>=max   → ("revert", flipped)          give up: fall back to the other slot

    The DEFAULT of a trial that never commits (crash/hang → repeated boots) is REVERT once the
    attempts are exhausted — the core confirm-or-rollback guarantee.
    """
    s = normalize(state)
    if not s["pending"]:
        return ("boot", s)
    tries = s["tries"] + 1
    if tries > max_tries:
        reverted = dict(s)
        reverted["active"] = other(s["active"])
        reverted["pending"] = False
        reverted["tries"] = 0
        return ("revert", reverted)
    s = dict(s)
    s["tries"] = tries
    return ("try", s)


def on_apply(state):
    """After a verified download lands in the INACTIVE slot: make it active + pending (trial)."""
    s = normalize(state)
    ns = dict(s)
    ns["active"] = other(s["active"])
    ns["pending"] = True
    ns["tries"] = 0
    return ns  # committed_version unchanged until the trial commits


def on_commit(state, version):
    """The trial slot passed its e2e self-test: make it permanent."""
    s = normalize(state)
    ns = dict(s)
    ns["pending"] = False
    ns["tries"] = 0
    if isinstance(version, str):
        ns["committed_version"] = version
    return ns
