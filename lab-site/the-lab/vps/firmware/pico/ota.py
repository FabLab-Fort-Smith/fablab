"""Pico OTA updater (MicroPython): check → verify → apply to the inactive slot → reboot on trial;
commit after the app's e2e self-test passes; the loader (boot.py) reverts a trial that never commits.

Depends on otastate (pure A/B transitions), otacrypto (Ed25519 + SHA-256 verify). Blob format is a
JSON files-map: {"files": {"main.py": "<base64>", ...}, "manifest": {...}} — dependency-free on
MicroPython (json + binascii), matches what CI produces (slice 5). See docs/architecture/ota-updates.md.

SECURITY: the manifest signature AND the blob SHA-256 are BOTH verified before anything is written
to a slot. A failed verify writes nothing (atomic: a slot only becomes active via otastate + a state
flip after a full, verified write).
"""

import json
import os
import binascii

import otastate
import otacrypto

STATE_PATH = "/ota/state.json"
SLOTS_DIR = "/slots"
ROLE = "pico"

try:
    import urequests as _requests  # MicroPython (mip install urequests)
except ImportError:
    _requests = None


# --- state persistence (atomic write) ---------------------------------------------------------

def load_state():
    """Read /ota/state.json (normalized; safe defaults if missing/corrupt)."""
    try:
        with open(STATE_PATH) as f:
            return otastate.normalize(json.load(f))
    except Exception:
        return otastate.normalize(None)


def save_state(state):
    """Persist state atomically (temp + rename; littlefs rename is atomic)."""
    _ensure_dir("/ota")
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f)
    os.rename(tmp, STATE_PATH)


def _ensure_dir(path):
    try:
        os.mkdir(path)
    except OSError:
        pass  # already exists


def current_version(state=None):
    """Committed version of the active slot (from its manifest, else state.committed_version)."""
    s = state or load_state()
    try:
        with open("%s/%s/manifest.json" % (SLOTS_DIR, s["active"])) as f:
            return json.load(f).get("version", s.get("committed_version", "0.0.0"))
    except Exception:
        return s.get("committed_version", "0.0.0")


# --- commit (called by main.py after the e2e self-test passes) --------------------------------

def commit_if_pending(version=None):
    """If the current boot is a pending trial, mark it committed. Idempotent no-op otherwise.
    Returns True if it committed."""
    s = load_state()
    if not s.get("pending"):
        return False
    save_state(otastate.on_commit(s, version or current_version(s)))
    print("[ota] committed", version or current_version(s))
    return True


# --- update check + apply ---------------------------------------------------------------------

def check_and_apply(cfg):
    """Poll the server for an eligible signed manifest; if found, verify + apply + reboot into the
    trial slot. Returns False if nothing to do (or on any failure — fail closed, no apply)."""
    if _requests is None:
        print("[ota] urequests unavailable; skipping update check")
        return False
    s = load_state()
    cur = current_version(s)
    url = "%s/api/v2/firmware/manifest?role=%s&deviceId=%s&current=%s" % (
        cfg["ota_base"].rstrip("/"), ROLE, cfg["device_id"], cur)
    try:
        r = _requests.get(url, headers={"Authorization": "Bearer " + cfg["device_secret"]})
        body = r.json()
        r.close()
    except Exception as e:
        print("[ota] manifest check failed:", e)
        return False
    if not body or not body.get("update"):
        return False  # {upToDate:true}

    manifest = body["manifest"]
    sig = body["sig"]
    # 1) signature over the manifest (server compromise cannot forge — asymmetric)
    if not otacrypto.verify_manifest(manifest, sig, cfg["verify_key"]):
        print("[ota] REJECT: bad manifest signature")
        return False
    # 2) sanity: role + bounded size before downloading
    if manifest.get("role") != ROLE:
        return False
    size = manifest.get("size", 0)
    if not isinstance(size, int) or size <= 0 or size > cfg.get("ota_max_bytes", 512 * 1024):
        print("[ota] REJECT: bad/too-large size")
        return False

    try:
        rb = _requests.get(body["blobUrl"])
        blob = rb.content
        rb.close()
    except Exception as e:
        print("[ota] blob download failed:", e)
        return False
    # 3) blob integrity must match the (signed) manifest sha256
    if not otacrypto.verify_blob(manifest["sha256"], blob):
        print("[ota] REJECT: blob sha256 mismatch")
        return False

    return _apply(s, manifest, blob)


def _apply(state, manifest, blob):
    """Write the verified blob into the INACTIVE slot, flip state to pending trial, reboot."""
    try:
        bundle = json.loads(blob)
        files = bundle["files"]
    except Exception as e:
        print("[ota] REJECT: unparseable blob:", e)
        return False

    target = otastate.other(state["active"])
    slot = "%s/%s" % (SLOTS_DIR, target)
    _ensure_dir(SLOTS_DIR)
    _ensure_dir(slot)
    # Write each file atomically (temp + rename). If any write fails we abort WITHOUT flipping state,
    # so the current active slot is untouched (atomic at the slot-activation boundary).
    try:
        for name, b64 in files.items():
            data = binascii.a2b_base64(b64)
            p = "%s/%s" % (slot, name)
            tmp = p + ".tmp"
            with open(tmp, "wb") as f:
                f.write(data)
            os.rename(tmp, p)
        with open("%s/manifest.json" % slot, "w") as f:
            json.dump(manifest, f)
    except Exception as e:
        print("[ota] apply write failed (slot untouched, no flip):", e)
        return False

    save_state(otastate.on_apply(state))  # active -> target, pending trial
    print("[ota] applied", manifest.get("version"), "-> slot", target, "; rebooting into trial")
    import machine
    machine.reset()
    return True  # not reached
