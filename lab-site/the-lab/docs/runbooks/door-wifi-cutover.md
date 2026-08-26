# Runbook: Door WiFi controller — parallel-run + cut-over (S7)

> The executable procedure for §10 of `docs/architecture/door-controller-wifi.md`: bring up the tiered
> WiFi door-access system (cloud → on-site HA broker → per-door edge nodes), prove one door through the
> full 4-rung fail-secure ladder + an HA drill, then roll out door-by-door and retire the frozen Pico
> units. Every step is **reversible** (re-flash / rebind / re-point the VIP).
>
> This is an **on-site, gated** procedure — it touches production hardware, the internal CA, and real
> device secrets. It is NOT run by an agent; a human operator executes it and clears each gate. Rules:
> `@rules/workflow-runbooks.md`, `@rules/workflow-release.md`, `@rules/workflow-gated-actions.md`.

## When to use
- Initial rollout of the WiFi door controller to a door that is still served by a frozen Pico, or
  adding a new door/edge to an existing broker cluster.
- **When NOT to use:** a routine allowlist refresh (that's automatic), a broker software redeploy
  (`docs/runbooks` deploy for the broker container), or edge **key rotation** alone (admin UI → Edge
  audit keys → register; see `door-controller-wifi.md` §6). For a suspected compromise, stop and use the
  incident-response runbook + revoke (denylist) before continuing.

## Severity / impact
- A botched cut-over can leave a door **locked** (fail-secure — inconvenient, not unsafe) or, worse,
  leave the old Pico path live in parallel (double authority). Bias to **locked + rollback**, never to
  "leave both paths authoritative." Blast radius is one door until you explicitly roll to the next.

## Prerequisites & access
- **Access:** Proxmox host admin; the broker container host (`ssh deploy@fablab-prod` per the VPS
  convention); the internal CA material (offline/secured — `vps/pki/`); the door-access **admin UI**
  (`/dashboard/admin/door-access-controller`, admin role); physical access to the door (reader, strike,
  Pi Zero, Pico); a tailnet device to reach the broker health endpoint.
- **Green state:** CI green on `dev`/`main` for the door-access + vps code; the app's `INTERNAL_API_SECRET`
  and `BROKER_UPLINK_SECRETS` provisioned in the vault (`@rules/workflow-secrets.md`); MongoDB reachable.
- **Per-door plan recorded:** the `doorId`, the edge CN (`edge-N`), the `brokerId`, and which physical
  door — write these down before touching hardware.

## Steps

### 1. Stand up the on-site broker tier (HA) — §10.1
1. On the Proxmox host, bring up **≥2 broker containers** + the keepalived VIP:
   `docker compose -f vps/docker-compose.broker.yml up -d` on each node (see `vps/keepalived/`).
2. Confirm each broker's loopback health (never bind health to the LAN):
   `curl -s http://127.0.0.1:${BROKER_HEALTH_PORT:-9090}/` → `{"ready":true,"uplinkUp":true,"doors":N}`.
   `uplinkUp:true` means Link-B (broker→cloud) authenticated. **Freeze the Pico** (leave it running but
   plan no further changes) until this door is cut over.
3. **Decision point:** if `uplinkUp:false` on both, the cloud bearer/URL is wrong — fix
   `BROKER_UPLINK_SECRETS`/`CLOUD_UPLINK_URL` before proceeding (the ladder still works offline, but you
   want online authoritative first).

### 2. Stand up the internal CA + issue certs — §10.2
1. One-time: `bash vps/pki/door-ca.sh init-ca ./ca` (keep `./ca` offline/secured — it is the root of
   trust for every edge/broker; `@rules/topic-cryptography.md`).
2. Broker cert: `bash vps/pki/door-ca.sh issue-broker <brokerId> IP:<broker-ip> ./ca ./out/<brokerId>`
   → install `broker.crt`/`broker.key`(0600)/`ca.crt`/`broker.index.key` + the projected `registry.json`
   into the container mount (`vps/pki/README.md`). The broker **refuses a loose-perm key** — keep 0600.

### 3. Provision the edge node — §10.3
1. Edge cert + secrets: `bash vps/pki/door-ca.sh issue-edge <edge-N> <doorId> <brokerId> ./ca ./out/<edge-N>`
   → `edge.crt`, `edge.key`(0600), `ca.crt`, `edge.index.key`(0600); this **appends `doorId → edgeDeviceId`
   to `./ca/registry.json`** (server-derived door binding, never from the wire).
2. Install onto the Pi Zero: the edge cert/key + pinned `ca.crt` + `edge.index.key` + the allowlist
   **verify key** + the broker **VIP host**. (The concrete NFC/GPIO/mTLS-socket adapter + supervisor is
   firmware S4b-3 — bench-tested; flash that image.)
3. **Provision the edge AUDIT key** (S6-b-a2): on the device,
   `python -m edge.provision_audit_key --out /var/lib/dooraccess/audit_key.b64 --edge-id <edge-N>`
   (writes the private key 0600, prints only the **public** key). It refuses to overwrite without
   `--force` — a reflash is deliberate.
4. **Register the edge's public key** (genesis binding): admin UI → **Edge audit keys** → paste
   `<edge-N>` + the printed `pubSpki` → Register. Confirm it appears in the list with a fingerprint.
   Until this is done the cloud rejects that edge's audit as `unregistered-edge` (fail-closed by design).

### 4. Parallel-run ONE door through the 4-rung ladder — §10.4 (the gate)
Verify each rung in order; a scan that should grant must grant, a revoked one must deny, and every
decision must be audited. `@rules/door-controller-wifi.md` §2.
1. **Rung 1 — online authoritative + audited:** everything up. Scan a valid card → strike pulses; scan a
   revoked card → denied. In the admin UI, the door's edge shows a recent **Last seen** with **Last mode =
   online** (audit backfilled to the cloud anchor).
2. **Rung 2 — broker cache:** pull the WAN (cloud unreachable). Scan again → still decides from the
   broker's cached per-door envelope; `Last mode` will read `online` (broker answered) or the edge falls
   to offline if the broker also can't answer — confirm the door still works.
3. **Rung 3 — edge offline:** partition the edge from the broker. Scan → the edge decides locally against
   its stored signed allowlist (`Last mode = offline`); audit is **stored-and-forwarded** on the edge.
4. **Rung 4 — everything down:** kill the edge's uplink + power-cycle nothing else. The strike **stays
   locked** (fail-secure — no grant ⇒ no pulse). This is the correct, safe failure.
5. **Recovery + audit backfill:** restore connectivity. Within a flush cycle the edge pushes its buffered
   audit up; confirm the door's `Last seen` advances and the offline decisions appear in the anchor
   (no gap/alert in `door-access.audit`). **This audit backfill is the exit criterion for the door.**

> **GATE:** do not proceed to rollout until all four rungs behave as above on this one door AND the
> offline decisions backfilled cleanly. If any rung mis-behaves, **Rollback** (below).

### 5. HA drill — §10.5
1. Kill the **active** broker container (`docker compose ... stop` on the active node). Confirm the VIP
   fails over to the standby (keepalived) and the door keeps working — rung 3 covers the brief blip.
2. Bring the killed broker back; confirm it rejoins and both members receive envelope pushes (HA members
   share one `brokerId`; the cloud feeds all live members).

### 6. Roll out door-by-door + retire the Pico — §10.6
1. Repeat steps 3–4 per additional door (one edge each; the door binding comes from `registry.json`).
2. Once a door has passed the rung-4 gate and backfilled audit for a soak period (≥ the audit buffer,
   ≥7 days recommended), **retire its Pico**: physically disconnect it. (App-side policy cutover flags —
   `authoritative`, `retirePlaintextCode` — are the separate Pico→WiFi *policy* migration in
   `parallelRun.js`; flip those per that migration, not here.)
3. Keep the retired Pico + its config for the reversal window before decommissioning.

## Verification
- Every cut-over door: a valid scan grants + pulses; a revoked scan denies; all four rungs behave;
  offline decisions backfill to the cloud anchor with **no gap/tamper alert** in `door-access.audit`.
- Admin UI: the edge shows a fresh `Last seen`, the correct `Via broker`, and a plausible `Last mode`.
- Broker health `uplinkUp:true`; VIP failover leaves no door dark.

## Rollback / abort
- **Per door (fast):** re-connect the frozen Pico for that door and disable the WiFi door in the admin UI
  (Doors → set `enabled` off) — the door reverts to the old path. Reversible; no data loss.
- **Edge misbehaving / suspected compromise:** add the edge CN to the broker **denylist**
  (`BROKER_EDGE_DENYLIST`) — it's refused on its next connection (within `EDGE_IDLE_MS`, ~60s). Use the
  **exact** issued CN.
- **Bad broker rollout:** re-point the VIP to the last-good broker / `docker compose ... down` the bad
  member; the standby carries the cluster.
- **Do NOT** leave both the Pico path and the WiFi path authoritative for the same door — that's double
  authority. One door, one authority, at all times.

## Escalation
- Page `<on-call>` / the door-access owner. A door stuck **locked** is SEV3 (workaround: manual/mechanical
  entry per site policy). Evidence of **forged/rewritten audit** (a `chain-fork`/`tamper` alert) or a
  compromised edge is a security incident → `docs/security` + `@rules/workflow-incident-response.md`
  (contain: denylist the edge, rotate the broker bearer, preserve logs).

## Related
- `docs/architecture/door-controller-wifi.md` (§2 ladder, §6 revocation, §10 cut-over).
- `vps/pki/README.md` (CA + cert issuance); `vps/keepalived/` (HA VIP); the door-access **admin UI**.
- `@rules/workflow-release.md`, `@rules/workflow-incident-response.md`, `@rules/workflow-secrets.md`.

---
_Last validated: PENDING — not yet drilled on real hardware. Run this as a game-day on the first door
(step 4 is the drill) and stamp the date + operator here. Owner: door-access / FabLab ops._
