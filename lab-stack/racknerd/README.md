# RackNerd SolusVM API — control-plane helper

`api.sh` wraps the RackNerd **SolusVM 1 client API** (`nerdvm.racknerd.com`) for the few things
it's good for during provisioning and ops. It is **not** how we provision — that's Ansible over
SSH (ADR 0004). This is control-plane only.

## What it can / can't do
| | |
|---|---|
| ✅ `ip` | print the VPS primary IPv4 — used to **auto-discover** `LAB_VPS_HOST` in `make setup` |
| ✅ `status` | power state (online/offline) — a preflight check |
| ✅ `info` | ip / hostname / vmstat / hdd / mem / bw |
| ✅ `boot` `reboot` `shutdown` | power control — **GATED**, requires an explicit `--yes` |
| ❌ create a VPS | ordering is WHMCS billing — no client API |
| ❌ reinstall the OS | SolusVM **panel only** (or the reseller API we don't have); it also can't inject SSH keys/cloud-init — hence `cloud-init/manual-bootstrap.sh` for first boot |
| ❌ run config / a shell | no exec in the client API — **Ansible uses SSH**, not this |

The client API has only these 5 functions (`boot`/`reboot`/`shutdown`/`status`/`info`); everything
else is the panel.

## Setup
1. In the RackNerd panel → your VPS → **API** tab, enable the API and copy the **key** + **hash**
   (per-VPS, least-privilege by construction).
2. Put them in the git-ignored `../.env` (never commit — `@rules/workflow-secrets.md`):
   ```
   RACKNERD_API_KEY=...
   RACKNERD_API_HASH=...
   # RACKNERD_API_BASE defaults to https://nerdvm.racknerd.com/api/client/command.php
   ```
3. Use it:
   ```bash
   cd lab-stack
   make racknerd ARGS=ip        # -> the VPS IP
   make racknerd ARGS=status    # -> online / offline
   make racknerd ARGS=info
   make racknerd ARGS="reboot --yes"   # GATED power action
   # (or directly: bash racknerd/api.sh <cmd>)
   ```

Once creds are present, `make setup` calls `api.sh ip` to prefill the VPS host (falls back to the
manual prompt on any failure), and `provision.sh preflight` reports the power state (non-fatal).

## Security model
- **Secrets off argv:** the key+hash go into the request URL, which is fed to `curl` via a stdin
  config (`-K -`) — never on the command line, so they don't leak into `ps`/shell history. They
  are never printed. (They still travel in the URL over TLS and may be logged server-side by
  RackNerd — inherent to the SolusVM client API; treat the pair as a credential and rotate on
  exposure — `docs/runbooks/secret-rotation.md`.)
- **Read vs. write:** `ip`/`status`/`info` are read-only and safe to script; `boot`/`reboot`/
  `shutdown` change VPS state and are **gated** behind `--yes` (`@rules/workflow-gated-actions.md`).
- **Third-party upstream:** timeouts + response validation; the `<status>` tag is checked before
  trusting any value (`@rules/topic-api-consumption.md`).

## Tests
`bash racknerd/api.test.sh` (also in `make test`) — hermetic, no network: the API call is stubbed
via `RACKNERD_FIXTURE` and creds via `RACKNERD_ENV_FILE`. Covers parsing, API-error handling, the
missing-creds gate, and the `--yes` gate on power actions.

## Related
- `docs/runbooks/bootstrap-vps.md` (provisioning flow), `cloud-init/manual-bootstrap.sh`
  (first-boot user+keys), ADR 0004 (provider-agnostic host).
