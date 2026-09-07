# Door-unit OTA updates — design + threat model

Over-the-air firmware updates for the two boards in a door unit — the **Pi Pico W** (MicroPython,
relay + WSS client) and the **Pi Zero W** (CPython, NFC + UI). Pairs with
`door-access-controller.md` and the firmware in `vps/firmware/`.

> **Non-negotiable requirement (from the ask):** an update is an **atomic transaction** — it either
> fully succeeds or fully reverts. A board **boots back to the previous, known-good firmware on
> reboot UNLESS**, after bring-up, an **end-to-end connectivity self-test passes** and the board
> sets a **committed** flag. Default outcome of any reboot during a trial = **revert**.

This is the classic **A/B slot + confirm-or-rollback (trial boot)** pattern, plus **signed,
anti-rollback** bundles. Secure-OTA controls follow `@rules/templates/embedded-firmware.md`
(authenticated, integrity-checked, atomic with rollback, anti-rollback) and
`@rules/std-supplychain.md` (signed artifacts, provenance).

---

## 1. Goals / invariants

1. **Atomic:** the active firmware is only ever a fully-written, signature+hash-verified slot. A
   partial download or a crash mid-apply never becomes active.
2. **Confirm-or-revert:** a freshly-applied slot is on **trial**. It becomes permanent only when the
   board proves connectivity (self-test) and writes `committed`. Otherwise the next boot reverts.
3. **Authenticated + integrity-checked:** every bundle is **Ed25519-signed** and **SHA-256**-hashed;
   verified on-device before apply. Unsigned/tampered/mismatched → rejected, no apply.
4. **Anti-rollback:** a board refuses a bundle whose version is **below** its committed version
   (blocks downgrade-to-vulnerable). Emergency downgrade is an explicit, signed `minVersion` reset.
5. **Fail-secure for the door:** access control keeps working on the current slot throughout an
   update; a revert restores it. The relay is **never** left energized across an update/reboot
   (defaults locked — see the firmware design). Egress stays on the mechanical override.
6. **Observable + audited:** every update attempt, self-test result, commit, and revert is logged
   (server-side audit event; `@rules/topic-logging-observability.md`), never with secrets.

---

## 2. Topology & transport

```
                         (object store: SeaweedFS)                (git repo)
                          signed blobs  ▲  manifests                 │ CI builds+signs
                                        │                            ▼
  [Pi Zero W] --WiFi/HTTPS(OTA only)--> socket-server /api/v2/firmware/*  <-- publishes manifest
       │  UART (access)                        ▲
       ▼                                       │ WSS (access + update_available push)
  [Pi Pico W] --------------------------------┘
```

- **Pico W** already holds the WSS link to the socket-server. It receives an `update_available`
  push (admin trigger) or polls `firmware/manifest` over the same channel, then downloads the blob
  over **HTTPS** (a short-lived, capability URL the server returns) — MicroPython can do TLS GET but
  not hold a big blob in RAM, so it **streams to flash in chunks** (see §5).
- **Pi Zero W** gets **its own WiFi + an OTA-only device identity** (decision: own-WiFi/HTTPS). It
  polls/pulls from the socket-server directly. It still makes **no access decisions** and holds **no
  access secret** — only an OTA fetch credential, least-privilege (`@rules/std-owasp-masvs` device-
  is-hostile mindset still applies).
- **Object store:** signed blobs live in **SeaweedFS** (the platform's S3 store — see the objstore
  memory). The socket-server serves the **manifest** and mints a **short-TTL capability URL** for
  the blob; it does not proxy large blobs itself.

---

## 3. Bundle & manifest format

A **bundle** is a tar (Zero) / a concatenated module set (Pico) plus a `manifest.json`. The manifest
is the signed unit; the blob is content-addressed by its SHA-256 so the signature covers the bytes.

```jsonc
// manifest.json  (the SIGNED object — canonicalized before signing/verifying)
{
  "role": "pico" | "pi-zero",
  "version": "1.4.0",              // semver; strictly increasing per role (anti-rollback)
  "minVersion": "1.0.0",          // device must be >= this to accept (staged upgrades)
  "sha256": "<hex of the blob>",   // integrity
  "size": 184320,                  // bytes (bound the download; DoS guard)
  "blobKey": "firmware/pico/1.4.0.bin",  // object-store key (URL minted by the server)
  "builtAt": "2026-08-22T00:00:00Z",
  "commit": "<git sha>",           // provenance
  "notes": "..."
}
// detached signature (Ed25519 over the canonical manifest bytes), base64:
"sig": "<base64>"
```

- **Canonicalization:** JSON with sorted keys, no insignificant whitespace (same approach as the
  addon's `allowlistCrypto.canonical`). Sign the canonical bytes; the device verifies identically.
- **Keys (dedicated — separation of duties, NOT the allowlist keys):**
  - `DOOR_FW_SIGNING_KEY` — Ed25519 private (pkcs8 DER, base64). **Vault-held; used ONLY by CI.**
  - `DOOR_FW_VERIFY_KEY` — Ed25519 public (spki DER, base64). On **every device** + the server.
  - Rotation: ship the new public key in a firmware update signed by the OLD key first (key-rollover
    window), then start signing with the new key. Never a single flag day.

---

## 4. Signing & distribution (CI + object store)

1. **Build** (GitHub Actions, on a firmware release tag): assemble the per-role bundle, compute
   SHA-256, write `manifest.json`.
2. **Sign**: CI pulls `DOOR_FW_SIGNING_KEY` from the vault (OIDC-scoped, least-privilege) and signs
   the canonical manifest → `sig`. The signing key never leaves CI; it is never in the repo.
3. **Publish**: upload the blob to SeaweedFS at `blobKey`; register the signed manifest with the
   socket-server (an authed `POST /api/v2/firmware/publish`, or a manifest object in the store the
   server reads). Generate provenance (SLSA-style) alongside (`@rules/std-supplychain.md`).
4. **Serve** (socket-server, device-authed):
   - `GET /api/v2/firmware/manifest?role=&deviceId=&current=<ver>` → the latest **eligible** signed
     manifest for that device (honors admin **target pin** + `minVersion`), or `{upToDate:true}`.
   - The manifest response includes a **short-TTL capability URL** for the blob in SeaweedFS.
   - Auth: Pico via its `DEVICE_SECRETS` WS session; Zero via its OTA bearer (a new
     `OTA_DEVICE_SECRETS` map, distinct from door `DEVICE_SECRETS`). Constant-time compare.

---

## 5. On-device A/B + confirm-or-revert

### 5.1 Pi Pico W (MicroPython, littlefs — file-slot A/B)

Layout on flash:
```
/boot.py                # tiny loader (below) — the only thing that runs at power-on
/ota/state.json         # {active:"a"|"b", pending:bool, tries:int, committed_version:"x.y.z"}
/slots/a/               # a full app: main.py, wsclient.py, ... (+ its manifest.json)
/slots/b/
/ota/staging/           # where a download is assembled + verified before the flip
```
- **Apply:** download blob → `/ota/staging/` in **chunks** (bounded by manifest `size`), hashing as
  it writes; verify SHA-256 == manifest, verify Ed25519 sig; only then move files into the
  **inactive** slot and **atomically flip** `state.json` (write `state.json.tmp` + `os.rename` —
  littlefs rename is atomic) to `{active:<other>, pending:true, tries:0}`. Reboot (`machine.reset`).
- **Loader (`boot.py`)** at power-on:
  - read `state.json`; if `pending` → **increment `tries`** and persist *before* running the app.
    If `tries > MAX_TRIES` (e.g. 3) → **revert**: flip `active` back to the other slot, clear
    `pending`, boot the old slot. (Covers crash-loops/hangs that never reach commit.)
  - arm a **hardware watchdog** (`machine.WDT`) so a hang during trial forces a reboot → the loader
    then sees `tries` climb → revert.
  - `import` the active slot's `main`.
- **Commit:** the app runs its **e2e self-test** (below). On pass it calls `ota.mark_committed()`:
  set `pending:false`, `committed_version:=manifest.version`, feed the watchdog normally thereafter.
  On fail it does **not** commit → the trial times out / reboots → loader reverts.

### 5.2 Pi Zero W (Linux/CPython — symlink A/B + systemd)

Layout:
```
/opt/door/releases/<version>/   # extracted, verified release (reader.py, ...)
/opt/door/current -> releases/<version>   # atomic symlink = active
/opt/door/previous -> releases/<old>      # last known-good
/var/lib/door-ota/state.json    # {pending, tries, committed_version}
```
- **Apply:** download blob (bounded) → verify SHA-256 + sig → extract to `releases/<new>/` →
  atomically repoint `current` (`ln -sfn newrel current.tmp && mv -T` / `os.replace`) → set
  `pending:true, tries:0` → `systemctl reboot` (or restart the unit).
- **systemd:**
  - `door-reader.service` runs `/opt/door/current/reader.py` with a **`WatchdogSec=`** (sd_notify)
    so a hang is caught; `Restart=on-failure` with a burst limit.
  - `door-ota-confirm.service` (`Type=oneshot`, `After=door-reader.service`) runs the **e2e
    self-test**; on pass → write `committed`; on fail (or the boot-count guard trips) → repoint
    `current` back to `previous`, clear `pending`, reboot.
  - A **boot-count guard** (increment `tries` in a `ConditionFirstBoot`-style early unit; revert
    when `tries > MAX`) covers crash-before-confirm.

### 5.3 e2e connectivity self-test (defines "committed")

- **Pico:** WiFi associates → WSS connect → **device auth accepted** → a `selftest`/`ping` round-trip
  returns `pong` within a timeout. (Optionally a scan-authorize dry `ping` to prove the full path.)
- **Zero:** UART link to the Pico responds → the Pico reports WS **`online`** (a `status` line) →
  NFC reader initializes. (The Zero can't reach the VPS for access, so its self-test proves the
  *door path*, not the VPS.)
- Both: the test is **bounded** (timeout) and **idempotent**. Only an unambiguous PASS commits;
  anything else leaves `pending` set so the trial reverts.

---

## 6. Triggering (both: auto-poll + admin force)

- **Auto-poll:** each board checks `firmware/manifest` **on boot** and every `N` minutes
  (configurable). If a newer **eligible** signed version exists → apply per §5.
- **Admin force:** the addon admin UI pins a **target version** per device (or per role). The server
  returns that target in the manifest response and, for the Pico, may **push** `update_available`
  over WS so it applies promptly. Admin actions are audited.
- **Guards:** never auto-apply while a door event is in progress; back off + retry. One update in
  flight per device. Respect `minVersion` staged upgrades.

---

## 7. Threat model (STRIDE over the OTA trust boundary)

New trust boundary: **firmware distribution → device execution** (running new code = highest
privilege on the door). Assets: the door boards, the signing key, availability of the door.

| STRIDE | Threat | Mitigation |
|---|---|---|
| **S**poofing | Fake update server / MITM serves a malicious bundle | TLS to socket-server + object store; **Ed25519 signature** verified on-device (server identity alone is not trusted — the *bundle* is signed). Device authenticates to fetch (DEVICE/OTA secrets, constant-time). |
| **T**ampering | Modified bundle in transit or at rest in the store | SHA-256 over the blob + signature over the manifest (which pins the sha256). Any mismatch → reject, no apply. |
| **R**epudiation | "Who pushed this firmware?" | Manifest carries `commit`+`builtAt`; CI provenance; server audit-logs every publish/apply/commit/revert with actor. |
| **I**nfo disclosure | Bundle or capability URL leaks | Blobs are firmware (not secret) but fetch is authed + capability URLs are short-TTL; no secrets in bundles (device secrets are provisioned separately, never shipped in firmware). |
| **D**oS / **bricking** | A bad update disables the door (the real risk) | **Confirm-or-revert** + watchdog + boot-count = a bad slot auto-reverts to known-good. Bounded `size`/one-in-flight. Access control keeps running on the current slot until commit; egress mechanical override always works. |
| **E**levation | Downgrade to a vulnerable version; unsigned code exec | **Anti-rollback** (`version >= committed`, `minVersion`); code only executes from a **signature-verified** slot; unsigned/invalid never flips active. Signing key is CI-only, vaulted, rotatable. |

Abuse cases to test (§8): tampered blob (1 bit) → rejected; wrong/absent signature → rejected;
downgrade → rejected; power-cut mid-download → old slot still boots; self-test fails → reverts;
watchdog hang → reverts; expired capability URL → refetch, no apply.

---

## 8. Testing

- **Host-testable (CI):** manifest canonicalization + Ed25519 sign/verify (Node, like
  `allowlistCrypto`); anti-rollback comparator; the A/B state-machine logic extracted as pure
  functions (apply→pending→commit / →revert) unit-tested for both boards.
- **Emulated e2e:** reuse the harness pattern from the socket-server bring-up — a real
  socket-server + a Pico-glue stand-in + the Zero over a PTY — to drive an update: serve a signed
  manifest+blob, apply, self-test, commit; then a **tampered** and a **downgrade** manifest → assert
  reject; a **failed self-test** → assert revert.
- **On-hardware / Wokwi:** the actual MicroPython loader + `machine.WDT` revert path (can't run in
  CI). Documented manual drill: cut power mid-update → boots old slot; push a deliberately-broken
  build → auto-reverts.

---

## 9. Rollout (slices after this design PR)

1. **Signing lib + manifest** (Node `otaManifest.js`: canonical + Ed25519 sign/verify + anti-rollback) + tests. New `DOOR_FW_SIGNING_KEY`/`DOOR_FW_VERIFY_KEY` (vaulted).
2. **Server**: `/api/v2/firmware/{manifest,publish}` + capability URLs (SeaweedFS) + audit + admin target-pin; device-authed.
3. **Pico A/B**: `boot.py` loader, `ota.py` (download/verify/apply/commit/revert), `machine.WDT`, self-test hook in `main.py`.
4. **Zero A/B**: `ota.py`, `door-reader.service` + `door-ota-confirm.service`, symlink swap, self-test, OTA WiFi/bearer config.
5. **CI**: firmware build+sign+publish workflow (OIDC to vault; provenance).
6. **Admin UI**: per-device version + target pin + last self-test result/timestamp.

Each slice: tests + docs; security-relevant → SEC review (this feature adds a trust boundary).

---
_Status: DESIGN (pre-implementation). Owner: SEC + platform. Supersedes nothing; extends the door
firmware in `vps/firmware/`._
