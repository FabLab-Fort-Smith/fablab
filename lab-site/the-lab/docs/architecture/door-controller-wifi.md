---
title: Tiered door access — cloud authority · on-site HA broker · autonomous edge nodes
status: proposed
audience: developers, operators, reviewers
owners: app dev
last_reviewed: 2026-08-23
related:
  - access-control-iot.md
  - door-access-controller.md
  - ota-updates.md
---

# Tiered door access — cloud authority · on-site HA broker · autonomous edge nodes

> **Status: PROPOSED (design-first).** No firmware/infra written yet. Records the design + threat
> model for review, per CLAUDE §3 / master §3 (a change adding a trust boundary is threat-modeled
> before code). Approve/adjust before implementation.

## 1. Context & confirmed decisions

A door unit today is a **Pico W brain + Pi Zero W reader wired over UART** (`pico/main.py`
`ZeroLink`, `pi-zero/link.py`, `protocol.md` "Link 2"). This design replaces that with a **three-tier**
access system.

Confirmed direction (2026-08-23, latest supersedes earlier):

- **Freeze the Pico.** No further Pico work; doors migrate off it.
- **Three tiers:** a **cloud** authority (existing `socket-server` on Coolify), an **on-site broker**
  running as a **container on Proxmox** (the local authority), and a **per-door edge node** (Pi Zero W:
  NFC reader **+** the door strike relay).
- **Hybrid defense-in-depth.** Every tier degrades gracefully to the one below it, and the **edge node
  itself** caches a signed allowlist so a single door keeps working even if it loses the broker. Four
  levels, always fail-secure (§2, §8).
- **The reader↔decision link is WiFi** (was UART) — a new trust boundary (§3). Card PII rides the LAN
  → TLS + mutual auth mandatory.
- **On-site broker is a container, not a board.** A container has no GPIO, so the **strike moves to the
  edge node** (this reverses the earlier "strike on the broker" — a consequence of containerizing the
  brain). The broker reuses the `socket-server` stack: it is effectively an on-site instance of that
  service.
- **HA for the broker.** ≥2 broker containers behind a keepalived **VIP**; Proxmox HA restarts/migrates
  a failed one; edge fallback covers the failover gap (§6).

**Firmware footprint shrinks to one role** — the **edge node** (`pi-zero` OTA image). The broker is
infra (deployed like any container), not firmware. The Pico stays frozen.

## 2. Tiers, transport & the degradation ladder

```
TIER 0  CLOUD  socket-server (Coolify)         source of truth: member DB, policy, audit aggregation;
   ⇅  Link B: WSS (WAN) — broker authenticates as a service      SIGNS + pushes the allowlist
TIER 1  ON-SITE BROKER  container(s) on Proxmox (HA behind a VIP)   LOCAL AUTHORITY: routes edge nodes;
   ⇅  Link A: mTLS (LAN)                                            online→proxy to cloud, offline→cached
                                                                    signed allowlist; distributes per-edge
                                                                    allowlist slices. NO relay.
TIER 2  EDGE NODE per door  Pi Zero W = NFC reader + strike relay   fail-secure actuator + LOCAL FALLBACK:
                                                                    caches its door's signed allowlist,
                                                                    decides alone if it loses the broker.
```

**Degradation ladder (hybrid defense-in-depth)** — the decision is made as high as reachable, and
every rung is fail-secure:

1. **Normal:** edge → broker → **cloud** authorizes (authoritative + audited). Broker pulses nothing;
   it returns the grant, the **edge** pulses its own strike.
2. **WAN/cloud down:** edge → broker → the **broker's cached signed allowlist** decides (offline `mode`),
   returns the grant to the edge.
3. **Broker/LAN unreachable to a door** (switch, cable, host, or all brokers down): the **edge decides
   from its own cached signed allowlist** and actuates locally — the door stays usable in isolation.
4. **No valid/unexpired allowlist anywhere reachable → locked.** Fail-secure.

Each offline decision (rungs 2–3) is logged locally and **store-and-forward synced to the cloud audit**
on recovery (non-repudiation across outages, §8).

**Why containerize the broker:** HA/failover (your redundancy ask), no GPIO/wiring ceiling, one place to
patch/deploy/observe the brain, and it reuses the `socket-server` code. The cost — the Proxmox host + LAN
become a shared failure domain — is bought back by rung 3 (edge autonomy) + HA + UPS/redundant switch.

## 3. Trust boundaries & STRIDE

Boundaries, most-changed first. **Link A (edge ⇄ broker)** is NEW (replaces a trusted UART wire).
**Link B (broker ⇄ cloud)** is the existing authenticated device/service boundary
(`access-control-iot.md`). Two **new local trust** paths appear (broker *and* edge deciding from cached
signed data), plus the **Proxmox host + HA** as infrastructure to harden.

### 3a. Edge ⇄ broker (new LAN boundary)

| STRIDE | Threat | Mitigation |
|---|---|---|
| **S**poofing | Rogue LAN box poses as the broker (issue fake grants → open the strike) or as an edge (inject scans). | **mTLS** via a small **internal CA** (§5): the edge only accepts commands over a broker cert the CA signed; the broker only accepts edges it signed. Plus a per-edge secret (constant-time). No public PKI on the LAN → pin the CA root. |
| **T**amper / **R**eplay | Replay a captured grant/unlock to re-open a door. | TLS integrity; each `scan`/grant carries a fresh `requestId` + monotonic nonce bound to the edge session; the edge rejects duplicates in a window. A replayed grant can't pulse twice. |
| **I**nfo disclosure | Card code (PII) sniffed on WiFi. | mTLS on Link A; raw `cred` never logged/displayed on any tier. |
| **D**enial of service | Flood the broker / an edge with scans or connections. | Per-connection auth gate + scan rate-limit + bounded connections. Any error/timeout → **locked**. |
| **E**levation | An edge coerces a grant it wasn't given; a compromised edge self-fires its relay. | The edge submits only a `cred`; the **broker/cloud** decides. Rung 3 aside, the relay energizes only on a validated decision (broker grant, or the edge's own signature-verified allowlist hit) — never on an unauthenticated local command. Physically mount the edge on the **secure side** of the door. |

### 3b. Edge offline decision — rung 3 (new local trust in cached data)

| STRIDE | Threat | Mitigation |
|---|---|---|
| **T**ampering | Forged/edited allowlist grants access when the edge is isolated. | Allowlist is **Ed25519-signed by the cloud**, verified **on the edge** with the allowlist public key (reuse the on-board verify shipped for OTA — `otacrypto`/`ed25519`). Invalid → rejected; unknown creds stay locked. |
| **Replay / stale** | A stale allowlist re-enables a revoked card on an isolated door. | Signed payload carries `issuedAt`/`expiresAt` (already in `buildSignedAllowlist`); the edge enforces its **TTL**, refuses expired snapshots, refreshes whenever the broker is reachable. Short TTL bounds the revocation gap; **edge TTL may be longer than the broker's** (last-resort tier). |
| **I**nfo disclosure | Cached allowlist leaks member data at rest on the edge. | Snapshot has **no PII / raw codes** — only keyed blind-index hashes + door/window entries. Store access-scoped, restrictive perms. |

### 3c. Broker offline decision — rung 2

Same as 3b, one tier up: the broker verifies + TTL-checks the cloud-signed allowlist it caches. Identical
guarantees; shorter TTL (it refreshes from the cloud more often than an edge refreshes from a broker).

### 3d. Broker ⇄ cloud (existing boundary — extended)

The broker authenticates to the cloud `socket-server` as a service/device (a broker credential, akin to
`DEVICE_SECRETS`), `wss://`/TLS, constant-time, fail-closed, audited. The cloud pushes the signed
allowlist and handles online scans + audit over this uplink.

### 3e. Proxmox host + HA (new infrastructure boundary)

| Concern | Control |
|---|---|
| Host compromise → all doors | CIS-hardened Proxmox host; dedicated/segmented **management network**; least-privilege; the broker container runs non-root, read-only rootfs, minimal caps (`@rules/std-cis.md`, `topic-container-k8s`). |
| Supply chain | Broker image pinned by digest, **signed + SBOM'd**, deployed as code (`@rules/std-supplychain.md`); no secrets baked into the image. |
| HA integrity / split-brain | keepalived VIP, single active holder; edges reconnect to the VIP; **no two brokers grant the same door concurrently** (§6). |
| Availability | ≥2 broker containers + Proxmox HA/live-migrate; **UPS + redundant switch** for the host and LAN; rung 3 covers the gap. Backup/restore the broker config + registry. |

**Fail-secure invariant (all tiers):** the strike (on the edge) is de-energized/locked at rest; it pulses
only on a validated grant — cloud, broker cache, or the edge's own signature-verified allowlist hit. Any
timeout, transport/auth error, expired allowlist, split-brain, or ambiguity → **locked**.

## 4. Protocol (`protocol.md` rewrite)

- **Retire UART "Link 2".**
- **Link A — edge ⇄ broker (mTLS/TCP on the LAN, newline-JSON):** edge → `hello{edgeId}` (mTLS client
  cert + per-edge secret), `scan{cred, requestId, nonce}`, `ping`, status/telemetry; broker →
  `result{requestId, granted, reason, mode}`, `status{online}`, signed-allowlist slice push. `cred` is
  PII — never logged.
- **Link B — broker ⇄ cloud (WSS):** broker → `auth`(service), `scan`(proxy), `ping`, aggregated audit +
  telemetry, OTA status relay; cloud → `scan_result`, signed-allowlist push. Unchanged shape from the
  existing device protocol.
- **Decision flow (per the ladder, §2):** edge `scan` → broker: cloud reachable? proxy for the
  authoritative, audited result; else broker cache. Broker unreachable to the edge? the edge decides from
  its own cached slice. Grant → **edge pulses the strike** → `result` to the reader UI. No grant → locked.

## 5. Identity, secrets & registry

- **Internal CA + mTLS (resolves the old cert question).** A tiny internal CA signs the **broker**
  server/client cert and each **edge** cert; both ends pin the CA root. This gives mutual auth on Link A
  and easy rotation (one root). The CA is offline-capable (on the LAN, not the cloud).
- **Broker ↔ cloud:** a per-broker service credential (akin to `DEVICE_SECRETS`); WSS.
- **Edge identity:** per-edge cert (from the CA) + a per-edge secret. The edge also carries the allowlist
  **public** key to verify its own cached slice (rung 3). No cloud credential on the edge.
- **Door registry:** `doorId → { edgeDeviceId, brokerId }`. Each edge node **is** one door (reader +
  strike), so there is no per-broker relay-channel fan-out anymore — the edge knows its own door; the
  broker maps `edgeDeviceId → doorId` from the registry (server-derived, never client-supplied). Admin UI
  lists doors + their edge/broker + last status.
- **Config:** **edge (`pi-zero` image):** broker VIP host, edge cert+key, pinned CA root, per-edge secret,
  allowlist verify-key, `edge_allowlist_ttl`, NFC + relay pins. **broker container:** cloud uplink creds,
  CA-signed cert, CA root, allowlist verify-key, `broker_allowlist_ttl`, registry, HA/VIP config. WiFi is
  OS-managed on the Pi Zero.

## 6. High availability & failover

- **Topology:** ≥2 broker containers on Proxmox behind a keepalived **VIP**; edges connect to the VIP.
  **Active/standby** by default (only the VIP holder serves) — simplest, no split-brain. Active/active is
  possible (state is light + cloud-sourced) but not needed initially.
- **State is easy to replicate:** the registry + signed allowlist come from the cloud and are
  read-mostly; a standby just needs the latest cloud-pushed snapshot. No door state to lose on failover.
- **Failover:** VIP moves to the standby; Proxmox HA restarts/live-migrates a dead container. During the
  brief failover, **rung 3 (edge local decision) keeps doors working** — the outage is invisible at the door.
- **Split-brain guard:** single VIP holder ⇒ one authority at a time; a partitioned ex-active loses the
  VIP and stops serving. Edges only ever talk to the VIP.

## 7. Component impact

| Component | Change |
|---|---|
| **edge node** (`pi-zero` image) | The whole firmware fleet. NFC read + **strike relay GPIO** + mTLS client to the broker VIP + **local signed-allowlist cache/verify/TTL** (rung 3) + fail-secure supervisor loop (reconnect/backoff, heartbeat, systemd `WatchdogSec`, OTA commit/poll) + local audit buffer with store-and-forward. |
| **broker container** (new infra) | An on-site instance of the `socket-server` stack: mTLS listener for edges (Link A) + cloud uplink (Link B) + cached allowlist decision (rung 2) + per-edge allowlist slice distribution + edge registry/routing. Deployed on Proxmox (HA). **No relay.** |
| `pico` firmware | **FROZEN.** No changes; doors migrate to the edge-node unit. |
| cloud `socket-server.js` | Authenticate brokers (service creds) + push signed allowlist to brokers; keep the online scan/authorize path; **aggregate audit** incl. backfilled offline decisions. |
| door-access addon | Reuse `buildSignedAllowlist` (PII-free + TTL'd) as the signed source for both cache tiers. Registry gains `edgeDeviceId`/`brokerId`; admin UI shows tier + last status. |
| Proxmox / infra | New host to provision + CIS-harden; broker image signed/SBOM'd, deployed as code; VIP/HA; UPS + redundant switch; backup/restore of broker config + registry (`@rules/topic-iac-cloud`, `std-cis`, `std-supplychain`). |
| `protocol.md` | Rewrite: retire Link 2; add Link A (edge⇄broker) + Link B (broker⇄cloud) + the ladder. |
| OTA | **Edge nodes only** (single `pi-zero` image/role; anti-rollback; staged/pinned rollout; status telemetry). Brokers deploy via the container path, not OTA. |
| Tests | edge unit (mTLS, fail-secure relay, **local offline decision** verify+TTL+revoked-rejected+expired-rejected); broker (cache decision, slice distribution, cloud proxy); the **4-rung degradation ladder** end-to-end; **HA failover** (kill active broker → doors keep working via rung 3, VIP moves); audit backfill; abuse (unauth edge, forged/expired allowlist, replayed grant, split-brain double-grant). |

## 8. Offline behavior & audit continuity

- **Rung 1 → 4 ladder (§2)** gives graceful degradation with fail-secure at the bottom. The edge cache
  (rung 3) is the defense-in-depth win: a door survives WAN loss **and** on-site broker/host/LAN loss.
- **Audit continuity:** online decisions audit at the cloud as today. Offline decisions (rungs 2–3) are
  logged locally (broker or edge) and **store-and-forward** replayed to the cloud audit on reconnect, so
  every unlock is accountable even across an outage. Buffer bounded + persistent across reboot.
- **Revocation gap** is bounded by the two allowlist TTLs (broker + edge); both refresh whenever their
  uplink is healthy.

## 9. Scale

Centralizing the brain removes the wiring/GPIO ceiling that a board-broker had: **one broker container
serves the whole site**, edges are strictly 1:door, and adding a door = provisioning one edge node +
a registry entry. Redundancy comes from **HA brokers** (§6), not from spreading brains across boards.
Very large sites can shard edges across multiple broker containers by zone, still behind HA.

## 10. Migration / cut-over plan

1. Stand up the Proxmox host + broker container (deploy the on-site `socket-server` tier), wire it to the
   cloud (allowlist sync + upstream authorize); bring up HA (≥2 containers + VIP). Freeze the Pico.
2. Stand up the internal CA; issue the broker cert + edge certs.
3. Provision an edge node (Pi Zero, reader + relay): edge cert + per-edge secret + pinned CA root +
   allowlist verify-key + broker VIP host; register `doorId → { edgeDeviceId, brokerId }`.
4. **Parallel-run one door through the whole ladder:** online authoritative + audited → pull the WAN
   (rung 2, broker cache) → partition the edge from the broker (rung 3, edge decides) → kill everything
   (rung 4, fail-secure locked). Confirm audit backfill on recovery.
5. **HA drill:** kill the active broker → VIP failover; confirm doors keep working (rung 3 covers the
   blip) and resume via the standby.
6. Roll out door-by-door; retire the Pico units. Reversible (re-flash / rebind / re-point the VIP).

## 11. Open questions (for review)

1. **HA mode:** active/standby via VIP (recommended, no split-brain) vs active/active (needs shared/replicated
   read cache). Start active/standby?
2. **Two allowlist TTLs:** broker cache vs edge cache lifetimes. Proposed broker **24h**, edge **72h**
   (last-resort tier tolerates a longer gap); both refresh on uplink recovery. Confirm.
3. **Proxmox host:** dedicated to access control, or shared with other on-site workloads? (Blast radius +
   patch cadence.) Management-network isolation + backup/DR plan for the broker config + registry.
4. **Provisioning + rotation** of edge certs/secrets + broker creds at fleet scale — a provisioning helper
   / the internal-CA issuance workflow.
5. **Audit store-and-forward** buffer size + retention on edge and broker for offline decisions.
6. **Edge hardware:** Pi Zero W confirmed (needs compute/storage for the rung-3 cache + crypto) + the relay
   board/HAT choice.

_(Resolved: freeze Pico; three tiers — cloud / on-site HA broker container / edge node; **strike on the
edge**; hybrid defense-in-depth 4-rung ladder; edge dials the broker VIP over mTLS; **internal CA + mTLS**
for Link A; one edge firmware role.)_

## 12. Definition of done (when we build)

§3 threat model realized across all boundaries; mTLS via the internal CA on Link A, `wss://` on Link B (no
plaintext); per-edge + per-broker auth, constant-time, fail-closed; the **4-rung degradation ladder proven
by test** (cloud → broker cache → edge cache → locked); offline allowlist verify + TTL proven at **both**
the broker and the edge; fail-secure relay proven; **HA failover proven** (kill active broker, doors keep
working, no split-brain double-grant); **audit backfill** proven; readers never log `cred`; Proxmox host
CIS-hardened + broker image signed/SBOM'd + deployed as code; `protocol.md` updated; abuse tests green
(unauth edge, forged/expired allowlist, replayed grant, split-brain); `pi-zero` edge image builds + OTAs
cleanly; docs + this design promoted `status: current`; SEC review of §3 (Link A, both offline-decision
tiers, the Proxmox host + HA).

## Changelog
| Date | Change | Author |
|------|--------|--------|
| 2026-08-23 | Initial proposed design (brokered via cloud) | app dev |
| 2026-08-23 | Revised for offline-VPS-down + keep-Pico | app dev |
| 2026-08-23 | Freeze Pico, two Pi Zero W (broker+reader), strike on broker, reader dials broker | app dev |
| 2026-08-23 | Add §8 multi-door (one broker board backs a door cluster) | app dev |
| 2026-08-23 | **Retopology: three tiers — cloud / on-site HA broker CONTAINER (Proxmox) / edge nodes; strike moves to the edge; hybrid defense-in-depth 4-rung ladder; mTLS internal CA; broker HA; firmware = one edge role** | app dev |
