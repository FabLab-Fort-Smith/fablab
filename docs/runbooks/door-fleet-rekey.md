---
title: Rotate the door master index key (fleet re-key)
category: Security
usage: Scheduled + on master exposure
order: 31
summary: Rotate DOOR_CARD_INDEX_KEY and re-key the whole door fleet — re-derive every broker/edge index key, switch the cloud to new-keyed envelopes, re-provision recipients; online stays up throughout.
---

# Runbook: Door master index-key rotation (fleet re-key)

> The door offline tiers match a scanned code by a **keyed HMAC** of it. The key each recipient holds is
> `recipientIndexKey = HKDF(DOOR_CARD_INDEX_KEY, "dooraccess/index/v1|"+recipientId)` (see
> `src/plugins/door-access-controller/cardCrypto.js`, `docs/architecture/door-controller-wifi.md` §2).
> Rotating the **master** `DOOR_CARD_INDEX_KEY` therefore re-derives **every** broker/edge index key at
> once. Principle: **the online (cloud-authoritative) path never uses the index key, so rotate while the
> fleet is online — online decisions are unaffected; only the OFFLINE fallback of a not-yet-re-keyed
> recipient is degraded (and it fails SECURE: deny, never open).**

## When to use
- **Scheduled:** master index-key rotation on your key-rotation cadence (align with `secret-rotation.md`;
  the door master is a §5 restricted secret — no key is valid forever).
- **On exposure (urgent):** suspected/confirmed exposure of `DOOR_CARD_INDEX_KEY`. The master enables
  **site-wide NFC enumeration** (the accepted-risk in §5) — treat any master that hit VCS/a log/a backup
  as compromised and rotate now. If a *specific* recipient's derived key leaked (not the master), you do
  **not** need a fleet re-key — deny-list that edge (`docs/runbooks/` → S3b deny-list) and/or re-issue its
  cert instead.

## What this does and does NOT rotate
- **This runbook:** `DOOR_CARD_INDEX_KEY` (master) → all `brokerIndexKey` / `edgeIndexKey`.
- **Separate, not covered here:**
  - `DOOR_CARD_ENC_KEY` (card-ciphertext key) — cloud-only; rotating it re-encrypts the card store, no
    recipient impact. Rotate via `secret-rotation.md` §C.
  - `DOOR_ALLOWLIST_SIGNING_KEY` / `DOOR_ALLOWLIST_VERIFY_KEY` (envelope signature) — rotating these needs
    the verify key redistributed to recipients; own procedure (treat like the CA overlap below).
  - **Internal CA / Link-A certs** (`vps/pki/door-ca.sh`) — cert rotation is independent of index-key
    rotation. Short-lived leaves auto-expire (`DOOR_LEAF_DAYS`); re-issue with `door-ca.sh issue-broker`/
    `issue-edge`; revoke a leaf early via the **edge deny-list** (S3b), and rotate the CA key on its own
    cadence (dual-trust overlap, like `secret-rotation.md` §A for the SSH CA).

## Why there's a brief offline-match gap (and why it's safe)
There is currently **one** master and **no key-version tag** on envelopes, so the cloud can't emit
old- and new-keyed envelopes simultaneously — the switch is atomic per master. Between "cloud switches to
the new master + re-pushes new-keyed envelopes" and "a given recipient holds its new derived key," that
recipient's **offline** match fails (deny). Throughout that window the **online** path (broker → cloud
authorize, edge → broker → cloud) still grants normally — it consults the real card store, not the index
key. So: rotate with the cloud/uplink **healthy**, keep the window short, and re-provision recipients
promptly. (A true zero-gap rotation needs the enhancement in the last section.)

## Prerequisites & access
- The current + a freshly generated master from the **vault** (CSPRNG, 32-byte-class secret); never on argv.
- The provisioning host with `vps/pki/door-ca.sh` + `derive-index-key.mjs` (holds the master in env only).
- Cloud app env access (`DOOR_CARD_INDEX_KEY`) + the ability to trigger an envelope refresh
  (`Service.refreshBrokerEnvelopes()` fan-out fires on any change; or a manual refresh).
- Per broker: update `BROKER_INDEX_KEY` + restart the broker container. Per edge: push the new
  `edge.index.key` (S4 provisioning path).
- Inventory of every `brokerId` and `edgeDeviceId` (the CA `registry.json`).

## Steps (scheduled, online-covered)
1. **Announce** a short maintenance window; confirm the **cloud + every broker uplink are healthy** (the
   online path must cover the gap). Broker health: the loopback `/` endpoint reports `uplink:"up"`.
2. **Generate** the NEW master in the vault. Do NOT activate it on the cloud yet.
3. **Derive** every recipient's new index key with the NEW master (env-only), on the provisioning host:
   ```bash
   export DOOR_CARD_INDEX_KEY="<NEW-master>"
   node vps/pki/derive-index-key.mjs <brokerId>     # → new BROKER_INDEX_KEY for each broker
   node vps/pki/derive-index-key.mjs <edgeDeviceId>  # → new edge.index.key for each edge
   ```
   Stage these per-recipient (don't distribute yet). `unset DOOR_CARD_INDEX_KEY` when done.
4. **Cut the CLOUD over** to the NEW master (`DOOR_CARD_INDEX_KEY=<new>`), then **rebuild + push** all
   envelopes so they're new-keyed: any card/policy change triggers the fan-out, or run the refresh
   explicitly. From here, envelopes on recipients still holding the OLD key won't match **offline**
   (online still grants).
5. **Re-provision recipients — fast, brokers first (they're quickest):**
   - **Broker:** set the new `BROKER_INDEX_KEY`, restart the container. On reconnect it ingests fresh
     new-keyed envelopes (S2c-2c resync) and its rung-2 offline match works again.
   - **Edge:** push the new `edge.index.key` + let it pull/receive its new envelope; rung-3 recovers.
   Each recipient's offline path is healthy once it has **both** its new key **and** a new-keyed envelope.
6. **Verify** (below). Then **destroy the OLD master** (secure wipe from the vault + provisioning host) and
   **record** the rotation (date, who, recipients re-keyed).

## Confirmed master compromise (urgent variant)
Do not wait for a window. Run steps 2–5 immediately; accept that not-yet-re-keyed recipients offline-deny
(fail-secure) until re-provisioned — online keeps the doors working. If a specific recipient was the
leak vector, also **deny-list** its edge CN (S3b) and **re-issue** its cert. **Escalate** via
`incident-response.md` and rotate any co-located secret (broker uplink bearer, etc.).

## Verification
- **Throughout:** online scans keep granting (watch the socket-server `authz`/scan audit — `mode:"online"`).
- **After re-provision, per recipient:** a scan decided **offline** (force it, or check the broker/edge
  next envelope carries the new `version` and a known card grants) → **grants** under the new key.
- The cloud audit shows new envelope versions distributed to every broker; no recipient still matching on
  an old-keyed envelope.
- Broker health `uplink:"up"`, no spike in offline **denies** after the window closes.

## Rollback / abort
- The failure mode during rotation is **offline-deny (fail-secure)**, never fail-open — a half-rotated
  fleet does not grant wrongly.
- **To abort mid-rotation:** revert the cloud `DOOR_CARD_INDEX_KEY` to the **OLD** master and re-push
  envelopes; recipients still holding OLD keys recover immediately (only the already-re-keyed ones then
  need reverting). **Keep the OLD master until verification passes** — don't wipe it in step 6 until the
  whole fleet is confirmed healthy on the new key.

## Zero-gap enhancement (future — out of scope here)
Add a **key-version tag** to envelopes and let each recipient hold **old + new** index keys during an
overlap (true add-new-before-revoke-old): the cloud emits new-keyed envelopes while recipients still
accept old-keyed ones, closing the offline gap entirely. Tracked as a design improvement; until then the
online-covered procedure above is the supported path.

## Related
- `secret-rotation.md` (SSH CA + app/provider secrets; the overlap pattern) · `incident-response.md`
  (compromise) · `vps/pki/README.md` (S3a issuance + S3b deny-list) ·
  `docs/architecture/door-controller-wifi.md` §2 (re-keying) / §5 (accepted risk).

---
_Last validated: not yet drilled (scaffold — rehearse on the bench fleet before a real rotation). Owner: platform._
