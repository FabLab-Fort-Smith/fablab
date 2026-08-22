"""Pure A/B (release+symlink) state transitions for the Pi Zero OTA — no FS/systemd/network, so
unit-testable off-device. ota.py + ota_confirm.py call these and persist to the state file. See
docs/architecture/ota-updates.md §5.2.

state = {
  "current": "x.y.z",           # version `current` symlink points at (the running release)
  "previous": "x.y.z" | None,   # last release (revert target)
  "pending": bool,              # True while `current` is a freshly-applied TRIAL (not committed)
  "tries": int,                 # confirm/boot attempts of the pending release
  "committed_version": "x.y.z"  # last COMMITTED version (== previous during a trial)
}
"""

DEFAULT_STATE = {"current": "0.0.0", "previous": None, "pending": False, "tries": 0, "committed_version": "0.0.0"}


def normalize(state):
    """Fill defaults for a missing/partial state (fail-safe)."""
    s = dict(DEFAULT_STATE)
    if isinstance(state, dict):
        for k in ("current", "committed_version"):
            if isinstance(state.get(k), str):
                s[k] = state[k]
        if isinstance(state.get("previous"), str):
            s["previous"] = state["previous"]
        s["pending"] = bool(state.get("pending", False))
        try:
            s["tries"] = int(state.get("tries", 0))
        except Exception:
            s["tries"] = 0
    return s


def on_apply(state, new_version):
    """A verified release extracted + `current` repointed to `new_version` → mark it a pending trial.
    `previous` becomes the last committed version (the revert target)."""
    s = normalize(state)
    return {
        "current": new_version,
        "previous": s["current"],
        "pending": True,
        "tries": 0,
        "committed_version": s["committed_version"],
    }


def increment_tries(state):
    """Count one trial attempt (called at each confirm/boot while pending)."""
    s = normalize(state)
    s["tries"] = s["tries"] + 1
    return s


def on_commit(state):
    """Trial passed its e2e self-test → make `current` permanent."""
    s = normalize(state)
    s["pending"] = False
    s["tries"] = 0
    s["committed_version"] = s["current"]
    return s


def on_revert(state):
    """Trial failed/exhausted → fall back to `previous` (caller repoints the symlink)."""
    s = normalize(state)
    prev = s["previous"] or s["committed_version"]
    return {
        "current": prev,
        "previous": None,
        "pending": False,
        "tries": 0,
        "committed_version": prev,
    }


def plan_confirm(pending, tries, max_tries, selftest_ok):
    """Decide the confirm action (pure): what to do given the trial state + self-test result.

      not pending          -> "noop"     (already committed; nothing to do)
      self-test passed      -> "commit"
      failed, tries < max   -> "retry"    (reboot and try the self-test again)
      failed, tries >= max  -> "revert"   (give up → previous release)

    `tries` is the count INCLUDING the current attempt (caller increments first).
    """
    if not pending:
        return "noop"
    if selftest_ok:
        return "commit"
    if tries >= max_tries:
        return "revert"
    return "retry"
