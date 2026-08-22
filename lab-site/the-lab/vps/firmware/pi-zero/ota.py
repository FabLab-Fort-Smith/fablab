"""Pi Zero OTA updater (CPython/Linux): fetch → verify → extract to releases/<v> → atomically
repoint the `current` symlink → mark a pending trial → reboot. Commit/revert is done by
ota_confirm.py at the next boot (after the e2e self-test). See docs/architecture/ota-updates.md §5.2.

Blob = a gzip tarball of the release dir (reader.py, ota*.py, manifest.json, ...); its SHA-256 is
pinned in the signed manifest. Uses only the stdlib (urllib, tarfile) — no extra runtime deps.

SECURITY: the manifest signature AND the blob SHA-256 are verified BEFORE extraction; the tar is
extracted with the 'data' filter (no path traversal / absolute paths / symlinks — CWE-22); `current`
only moves via an atomic rename after a full extract.
"""

import io
import json
import os
import ssl
import subprocess
import tarfile
import urllib.request

import otastate
import otacrypto

ROLE = "pi-zero"


def _cfg(cfg, key, default=None):
    return cfg.get(key, default)


def _paths(cfg):
    root = _cfg(cfg, "release_root", "/opt/door")
    return {
        "root": root,
        "releases": os.path.join(root, "releases"),
        "current": os.path.join(root, "current"),
        "state": _cfg(cfg, "state_file", "/var/lib/door-ota/state.json"),
    }


def load_state(cfg):
    """Read the OTA state file (normalized; safe defaults if missing/corrupt)."""
    try:
        with open(_paths(cfg)["state"]) as f:
            return otastate.normalize(json.load(f))
    except Exception:
        return otastate.normalize(None)


def save_state(cfg, state):
    """Persist state atomically (temp + rename)."""
    p = _paths(cfg)["state"]
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f)
    os.replace(tmp, p)


def current_version(cfg):
    """Version of the running release (from state)."""
    return load_state(cfg).get("current", "0.0.0")


def _http_get(url, bearer=None, timeout=15, max_bytes=None):
    req = urllib.request.Request(url)
    if bearer:
        req.add_header("Authorization", "Bearer " + bearer)
    ctx = ssl.create_default_context()  # verify TLS against system CAs
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        if max_bytes:
            data = r.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise ValueError("response exceeds max_bytes")
            return data
        return r.read()


def check_and_apply(cfg):
    """Poll for an eligible signed manifest; verify + apply + reboot into the trial. Returns False if
    nothing to do (or on any failure — fail closed, no apply)."""
    paths = _paths(cfg)
    cur = current_version(cfg)
    base = _cfg(cfg, "ota_base", "").rstrip("/")
    if not base:
        return False
    url = "%s/api/v2/firmware/manifest?role=%s&deviceId=%s&current=%s" % (
        base, ROLE, _cfg(cfg, "device_id", ""), cur)
    bearer = _cfg(cfg, "ota_device_secret") or _cfg(cfg, "device_secret")
    try:
        body = json.loads(_http_get(url, bearer=bearer, max_bytes=64 * 1024))
    except Exception as e:
        print("[ota] manifest check failed:", e)
        return False
    if not body or not body.get("update"):
        return False

    manifest, sig = body.get("manifest"), body.get("sig")
    if not otacrypto.verify_manifest(manifest, sig, _cfg(cfg, "verify_key", "")):
        print("[ota] REJECT: bad manifest signature")
        return False
    if manifest.get("role") != ROLE:
        return False
    size = manifest.get("size", 0)
    max_bytes = _cfg(cfg, "ota_max_bytes", 8 * 1024 * 1024)
    if not isinstance(size, int) or size <= 0 or size > max_bytes:
        print("[ota] REJECT: bad/too-large size")
        return False

    try:
        blob = _http_get(body["blobUrl"], max_bytes=max_bytes)
    except Exception as e:
        print("[ota] blob download failed:", e)
        return False
    if not otacrypto.verify_blob(manifest["sha256"], blob):
        print("[ota] REJECT: blob sha256 mismatch")
        return False

    return _apply(cfg, paths, manifest, blob)


def _apply(cfg, paths, manifest, blob):
    """Extract the verified blob to releases/<version>, atomically repoint `current`, reboot."""
    version = manifest["version"]
    dest = os.path.join(paths["releases"], version)
    try:
        os.makedirs(dest, exist_ok=True)
        with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tar:
            # 'data' filter blocks path traversal, absolute paths, and symlinks (CWE-22).
            tar.extractall(dest, filter="data")
    except Exception as e:
        print("[ota] extract failed (current untouched):", e)
        return False

    # Atomic symlink swap: create a temp link then rename over `current`.
    tmp_link = paths["current"] + ".tmp"
    try:
        if os.path.islink(tmp_link) or os.path.exists(tmp_link):
            os.remove(tmp_link)
        os.symlink(dest, tmp_link)
        os.replace(tmp_link, paths["current"])  # atomic
    except Exception as e:
        print("[ota] symlink swap failed (current untouched):", e)
        return False

    save_state(cfg, otastate.on_apply(load_state(cfg), version))
    print("[ota] applied", version, "-> current; rebooting into trial")
    _reboot(cfg)
    return True


def _reboot(cfg):
    """Reboot to boot the trial (ota_confirm runs the self-test + commit/revert)."""
    cmd = _cfg(cfg, "reboot_cmd", ["systemctl", "reboot"])
    try:
        subprocess.run(cmd, check=False)
    except Exception as e:
        print("[ota] reboot failed:", e)
