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
                                                                    signed allowlist; distributes per-door
                                                                    signed envelopes. NO relay.
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

### Offline-match & signing model (SEC review F1–F3, F5)

The naive "reuse `buildSignedAllowlist` as-is" does not survive review — three corrections define how an
offline tier actually matches a card and trusts a snapshot:

- **Per-door signed envelopes, not slices (F2).** `buildSignedAllowlist` today emits **one** payload with
  **one** Ed25519 signature — a per-door "slice" of it is not independently verifiable. The cloud instead
  signs a **separate envelope per door** (`{ doorId, version, issuedAt, expiresAt, entries[] }`, one
  signature each). An edge caches + verifies **only its own door's** envelope; a broker caches the
  envelopes for the doors it serves. (Alternative kept on record: a single Merkle root signed once, with
  per-door inclusion proofs — more moving parts; per-door envelopes are the recommended default.)
- **Per-edge index keys, never a global one (F1).** Entries are keyed by `credHash = HMAC(indexKey, code)`
  (today `cardCrypto.blindIndex` with the **system-wide** `DOOR_CARD_INDEX_KEY`). Shipping that master key
  to every SD-card-based edge would let one stolen node enumerate/forge card matches **system-wide**. So
  the cloud re-keys each door's envelope with a **per-edge key** `edgeIndexKey = HKDF(DOOR_CARD_INDEX_KEY,
  edgeDeviceId)` (it decrypts stored `codeEnc` at build time to recompute the HMAC); the edge holds only
  **its own** derived key and matches `HMAC(edgeIndexKey, scannedCode)` locally. A stolen edge compromises
  **only its own door**, and never the master key (HKDF is one-way). Requires a **card-code entropy floor**
  (else a leaked per-edge key still allows a local dictionary) — set it as a provisioning rule.
- **A new nested canonicalizer, not the OTA one (F3).** The on-device OTA verify (`otacrypto.canonical`) is
  **flat-only** — it raises on arrays/nested objects. The allowlist payload is deeply nested, so the edge/
  broker need a **new** canonical-JSON serializer that byte-matches the JS signer (`allowlistCrypto.canonical`:
  recursive key-sort + array handling). This is a classic cross-language signature-bypass trap → it ships
  with **golden-vector tests** (§12). The allowlist verify key stays distinct from the OTA verify key
  (`DOOR_ALLOWLIST_VERIFY_KEY` ≠ `DOOR_FW_VERIFY_KEY`).
- **Anti-rollback on the envelope (F5).** TTL alone lets an attacker who can write the cache replay an
  older-but-unexpired envelope (re-enabling a since-revoked card). Each tier persists the newest
  `version`/`issuedAt` it has seen and **rejects any older envelope**, mirroring the OTA anti-rollback.

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
| **T**ampering (signature) | Forged/edited envelope grants access when the edge is isolated. | Per-door envelope is **Ed25519-signed by the cloud**, verified on the edge with `DOOR_ALLOWLIST_VERIFY_KEY` via a **nested canonicalizer that byte-matches the JS signer** — a **new** primitive, NOT the flat OTA `otacrypto.canonical` (F3). Golden-vector tested. Invalid → rejected; unknown creds locked. |
| **Offline match** (F1) | Matching a scan offline needs a keyed HMAC of the card code — a system-wide `DOOR_CARD_INDEX_KEY` on every SD-card edge would be a global-enumeration/forgery key. | The cloud re-keys each envelope with a **per-edge** `edgeIndexKey = HKDF(DOOR_CARD_INDEX_KEY, edgeDeviceId)`; the edge holds only its own derived key and computes `HMAC(edgeIndexKey, scannedCode)`. Stolen edge ⇒ **its door only**, master key never leaves the cloud. Enforce a **card-code entropy floor** so a leaked per-edge key can't be dictionaried. |
| **Replay / stale + rollback** (F5) | A stale or rolled-back envelope re-enables a revoked card offline. | `issuedAt`/`expiresAt` → **TTL** enforced (edge TTL may exceed the broker's — last-resort tier); **plus anti-rollback**: reject any envelope with `version`/`issuedAt` older than the newest persisted. Refresh on every broker contact. |
| **Clock trust** (F4) | The Pi Zero W has **no battery-backed RTC**; on the exact rung-3 case (power-loss → boot, no NTP) the clock is wrong — a **backwards** clock makes an expired/revoked snapshot look valid; window checks go wrong too. | Add a **hardware RTC** to the edge BOM; persist a **monotonic last-known-good time floor** and reject any wall-clock earlier than it (anti clock-rollback); an **unsynced/implausible clock → treat as ambiguity → LOCKED** (added to the fail-secure invariant). |
| **I**nfo disclosure | Cached envelope leaks member data at rest on the SD card. | Envelope carries **no PII / raw codes** — only per-edge keyed hashes + door/window entries. Note `credHash` is still a **stable pseudonymous** identifier (personal data) → store access-scoped, restrictive perms; per-door envelopes minimize what any one edge holds. |

### 3c. Broker offline decision — rung 2

Same as 3b, one tier up: the broker verifies (same nested canonicalizer + `DOOR_ALLOWLIST_VERIFY_KEY`),
TTL-checks, and **anti-rollback-checks** the per-door envelopes it caches. Identical guarantees; shorter
TTL (it refreshes from the cloud more often than an edge refreshes from a broker). A containerized broker
has a real clock (NTP), so the F4 RTC concern is edge-specific — but the broker still applies the
monotonic-version anti-rollback (F5).

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

### 3f. Store-and-forward audit (F6 — new local trust in buffered records)

Offline decisions (rungs 2–3) are logged locally and replayed to the cloud audit on reconnect. That
buffer is a new boundary — without integrity it breaks non-repudiation (CLAUDE §9, `topic-logging-observability`).

| STRIDE | Threat | Mitigation |
|---|---|---|
| **R**epudiation / **T**ampering | A compromised edge edits or drops buffered unlock records to hide an entry. | Append-only, **sequence-numbered + hash-chained** buffer (or per-record signed with the edge identity); the cloud verifies chain continuity and **alerts on a sequence gap** (a gap is a tamper/loss signal, not silence). |
| **D**enial / loss | Buffer overflow silently drops audit. | Bounded + **persistent across reboot**; on overflow **block-and-alert, never silent-drop**. |
| Replay / dup | Re-sent records double-count at the cloud. | Cloud **dedups by `(edgeId, seq)`** and orders by it. |
| **I**nfo disclosure | Buffered `credHash + doorId + timestamps` = an access-pattern record. | Same at-rest scoping as the envelope (§3b); `credHash` is pseudonymous personal data. |

**Fail-secure invariant (all tiers):** the strike (on the edge) is de-energized/locked at rest; it pulses
only on a validated grant — cloud, broker cache, or the edge's own signature-verified allowlist hit. Any
timeout, transport/auth error, expired **or rolled-back** allowlist, **unsynced/implausible clock (F4)**,
split-brain, or ambiguity → **locked**.

## 4. Protocol (`protocol.md` rewrite)

- **Retire UART "Link 2".**
- **Link A — edge ⇄ broker (mTLS/TCP on the LAN, newline-JSON):** edge → `hello{edgeId}` (mTLS client
  cert + per-edge secret), `scan{cred, requestId, nonce}`, `ping`, status/telemetry; broker →
  `result{requestId, granted, reason, mode}`, `status{online}`, **per-door signed-envelope push**; edge →
  hash-chained `audit{seq, ...}` records for backfill (§3f). `cred` is PII — never logged.
- **Link B — broker ⇄ cloud (WSS):** broker → `auth`(service), `scan`(proxy), `ping`, aggregated
  `audit{edgeId, seq, ...}` + telemetry, OTA status relay; cloud → `scan_result`, **per-door signed-envelope
  push** (each re-keyed with the target edge's `edgeIndexKey`, §2). Unchanged shape otherwise.
- **Decision flow (per the ladder, §2):** edge `scan` → broker: cloud reachable? proxy for the
  authoritative, audited result; else broker cache. Broker unreachable to the edge? the edge decides from
  **its own cached envelope** (verify sig + TTL + anti-rollback, match via its `edgeIndexKey`). Grant →
  **edge pulses the strike** → `result` to the reader UI. No grant → locked.

## 5. Identity, secrets & registry

- **Internal CA + mTLS (resolves the old cert question).** A tiny internal CA signs the **broker**
  server/client cert and each **edge** cert; both ends pin the CA root. This gives mutual auth on Link A
  and easy rotation (one root). The CA is offline-capable (on the LAN, not the cloud).
- **Broker ↔ cloud:** a per-broker service credential (akin to `DEVICE_SECRETS`); WSS.
- **Edge identity:** per-edge cert (from the CA) + a per-edge secret. The edge carries `DOOR_ALLOWLIST_VERIFY_KEY`
  (public, distinct from the OTA `DOOR_FW_VERIFY_KEY`) to verify its own cached envelope (rung 3), and its
  **own `edgeIndexKey = HKDF(DOOR_CARD_INDEX_KEY, edgeDeviceId)`** for offline card matching (F1) — a
  derived, door-scoped key, **never** the master `DOOR_CARD_INDEX_KEY`. No cloud credential on the edge.
  Edge key material lives on an SD card → store access-scoped (a secure element is the stronger option;
  tracked as a deferred hardening item).
- **Door registry:** `doorId → { edgeDeviceId, brokerId }`. Each edge node **is** one door (reader +
  strike), so there is no per-broker relay-channel fan-out — the edge knows its own door; the broker maps
  `edgeDeviceId → doorId` from the registry (server-derived, never client-supplied). The cloud signs a
  **per-door envelope** (F2) and re-keys it with the target edge's `edgeIndexKey` (F1). Admin UI lists
  doors + their edge/broker + last status.
- **Config:** **edge (`pi-zero` image):** broker VIP host, edge cert+key, pinned CA root, per-edge secret,
  `DOOR_ALLOWLIST_VERIFY_KEY`, **`edgeIndexKey`**, `edge_allowlist_ttl`, **hardware RTC** (F4), NFC + relay
  pins. **broker container:** cloud uplink creds, CA-signed cert, CA root, `DOOR_ALLOWLIST_VERIFY_KEY`,
  `broker_allowlist_ttl`, registry, HA/VIP config. Master `DOOR_CARD_INDEX_KEY` stays **cloud-only**. WiFi
  is OS-managed on the Pi Zero.

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
| **edge node** (`pi-zero` image) | The whole firmware fleet. NFC read + **strike relay GPIO** + mTLS client to the broker VIP + **local per-door-envelope cache: nested-canonical Ed25519 verify (F3) + TTL + anti-rollback (F5) + `edgeIndexKey` HMAC match (F1)** (rung 3) + **hardware-RTC time source + monotonic clock floor (F4)** + fail-secure supervisor loop (reconnect/backoff, heartbeat, `WatchdogSec`, OTA commit/poll) + **hash-chained store-and-forward audit buffer (F6)**. |
| **broker container** (new infra) | On-site instance of the `socket-server` stack: mTLS listener (Link A) + cloud uplink (Link B) + cached decision with the same verify + anti-rollback (rung 2) + **per-door signed-envelope distribution, re-keyed per edge** + registry/routing + relays hash-chained audit up. Proxmox (HA). **No relay.** |
| `pico` firmware | **FROZEN.** No changes; doors migrate to the edge-node unit. |
| cloud `socket-server.js` | Authenticate brokers (service creds); **build + Ed25519-sign per-door envelopes, each re-keyed with the edge's `edgeIndexKey` (HKDF)** and push to brokers; keep the online scan/authorize path; **aggregate audit** — verify the edge hash-chain, **dedup by `(edgeId, seq)`, alert on gaps** — incl. backfilled offline decisions. |
| door-access addon | Extend `buildSignedAllowlist` from one monolithic signature to **per-door signed envelopes** + a **per-edge HKDF re-key** of `credHash` (decrypt `codeEnc` at build time to recompute the HMAC). Add a JS **nested canonicalizer** with golden vectors the edge/broker verifiers must byte-match. Registry gains `edgeDeviceId`/`brokerId`; admin UI shows tier + last status. |
| Proxmox / infra | New host to provision + CIS-harden; broker image signed/SBOM'd, deployed as code; VIP/HA; UPS + redundant switch; backup/restore of broker config + registry (`@rules/topic-iac-cloud`, `std-cis`, `std-supplychain`). |
| `protocol.md` | Rewrite: retire Link 2; add Link A (edge⇄broker) + Link B (broker⇄cloud) + the ladder. |
| OTA | **Edge nodes only** (single `pi-zero` image/role; anti-rollback; staged/pinned rollout; status telemetry). Brokers deploy via the container path, not OTA. |
| Tests | edge unit (mTLS, fail-secure relay, **local offline decision** verify+TTL+revoked-rejected+expired-rejected); broker (cache decision, slice distribution, cloud proxy); the **4-rung degradation ladder** end-to-end; **HA failover** (kill active broker → doors keep working via rung 3, VIP moves); audit backfill; abuse (unauth edge, forged/expired allowlist, replayed grant, split-brain double-grant). |

## 8. Offline behavior & audit continuity

- **Rung 1 → 4 ladder (§2)** gives graceful degradation with fail-secure at the bottom. The edge cache
  (rung 3) is the defense-in-depth win: a door survives WAN loss **and** on-site broker/host/LAN loss.
- **Audit continuity (F6):** online decisions audit at the cloud as today. Offline decisions (rungs 2–3)
  go to a **hash-chained, sequence-numbered** local buffer (bounded, persistent across reboot,
  block-and-alert on overflow) and **store-and-forward** to the cloud on reconnect, where they are
  chain-verified, **deduped by `(edgeId, seq)`**, and a **sequence gap raises an alert** — so a dropped or
  tampered record is detected, not silent. Every unlock stays accountable across an outage.
- **Revocation gap** is bounded by the two TTLs (broker + edge) **and** by envelope **anti-rollback (F5)** —
  an older-but-unexpired envelope is rejected, so a since-revoked card can't be replayed back in. Edge TTL
  enforcement depends on a trustworthy clock — see the **RTC + monotonic floor (F4)**; an unsynced clock
  fails **locked**, never open.

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
6. **Edge hardware:** Pi Zero W confirmed (needs compute/storage for the rung-3 cache + crypto) + a relay
   board/HAT **with a battery-backed RTC** (F4) + the SD-vs-secure-element choice for key material.
7. **Card-code entropy floor (F1):** minimum code entropy so a leaked per-edge `edgeIndexKey` can't be
   dictionaried — set as a provisioning rule; confirm the value.
8. **TTL/anti-rollback params (F4/F5):** the broker/edge TTLs (proposed 24h/72h) hold **once** the RTC +
   monotonic floor + anti-rollback land; confirm.

_(Resolved: freeze Pico; three tiers — cloud / on-site HA broker container / edge node; **strike on the
edge**; hybrid defense-in-depth 4-rung ladder; edge dials the broker VIP over mTLS; **internal CA + mTLS**
for Link A; one edge firmware role. **SEC review F1–F6 folded in:** per-door signed envelopes (F2),
per-edge HKDF index keys (F1), a new nested canonicalizer + golden vectors (F3), edge RTC + monotonic
clock floor (F4), envelope anti-rollback (F5), hash-chained store-and-forward audit (F6). Deferred to
tracked issues: F7 per-edge cert revocation (broker-side `edgeId` deny-list), F8 honest compromised-edge
residual wording, F9 at-rest key encryption / secure element, F10 tamper alerting + split-brain wording,
F11 `credHash` = pseudonymous personal data.)_

## 12. Definition of done (when we build)

§3 threat model realized across all boundaries; mTLS via the internal CA on Link A, `wss://` on Link B (no
plaintext); per-edge + per-broker auth, constant-time, fail-closed; the **4-rung degradation ladder proven
by test** (cloud → broker cache → edge cache → locked); offline allowlist verify + TTL proven at **both**
the broker and the edge; fail-secure relay proven; **HA failover proven** (kill active broker, doors keep
working, no split-brain double-grant); **audit backfill** proven; readers never log `cred`; Proxmox host
CIS-hardened + broker image signed/SBOM'd + deployed as code; `protocol.md` updated; abuse tests green
(unauth edge, forged/expired allowlist, replayed grant, split-brain); `pi-zero` edge image builds + OTAs
cleanly; docs + this design promoted `status: current`; SEC review of §3 (Link A, both offline-decision
tiers, §3f audit, the Proxmox host + HA).

**Plus the SEC-review abuse tests (F1–F6):**
1. **Canonical golden vectors (F3):** sign N nested payloads in JS; the Python edge verifier accepts the
   exact bytes and **rejects** a single-byte mutation, a reordered array, and a unicode-escaping variant.
2. **Clock-rollback (F4):** edge clock set backwards → an expired envelope is **rejected**; an unsynced/
   implausible clock → **locked**.
3. **Envelope anti-rollback (F5):** an envelope older than the persisted `version` is **rejected** even if
   unexpired; a revoked card in a prior valid-within-TTL envelope → **denied**.
4. **Stolen-edge blast radius (F1):** a compromised edge cannot produce a valid match for a **different**
   door, cannot forge a broker/cloud grant, and a leaked `edgeIndexKey` does not enable enumeration on
   other nodes (and not at all above the card-code entropy floor).
5. **Per-door envelope (F2):** an edge rejects any payload/slice not covered by a valid per-door signature;
   a truncated/edited envelope fails verification.
6. **Audit tamper/gap (F6):** edit or drop a buffered record → the cloud detects the hash-chain/sequence
   break and alerts; duplicates dedup by `(edgeId, seq)`; out-of-order arrivals are ordered.

## Changelog
| Date | Change | Author |
|------|--------|--------|
| 2026-08-23 | Initial proposed design (brokered via cloud) | app dev |
| 2026-08-23 | Revised for offline-VPS-down + keep-Pico | app dev |
| 2026-08-23 | Freeze Pico, two Pi Zero W (broker+reader), strike on broker, reader dials broker | app dev |
| 2026-08-23 | Add §8 multi-door (one broker board backs a door cluster) | app dev |
| 2026-08-23 | **Retopology: three tiers — cloud / on-site HA broker CONTAINER (Proxmox) / edge nodes; strike moves to the edge; hybrid defense-in-depth 4-rung ladder; mTLS internal CA; broker HA; firmware = one edge role** | app dev |
| 2026-08-23 | **Fold SEC-review F1–F6: per-door signed envelopes (F2), per-edge HKDF index keys (F1), new nested canonicalizer + golden vectors (F3), edge RTC + monotonic clock floor (F4), envelope anti-rollback (F5), hash-chained store-and-forward audit + §3f (F6). F7–F11 deferred to tracked issues.** | app dev |
