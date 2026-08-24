# Door-system internal PKI (S3a)

The internal CA + provisioning tooling for the door access controller (see
`docs/architecture/door-controller-wifi.md` §13 S3). Mints the **Link-A mTLS** material (broker server
cert + edge client certs, all chaining to one CA root) and the **per-recipient index keys** +
**uplink bearer** the broker and edges need.

Runs on a **provisioning host** that holds the master `DOOR_CARD_INDEX_KEY` (in the env — never argv).
Not deployed to the VPS/broker; it produces artifacts you distribute.

## Why the index keys are derived in node, not openssl
`edgeIndexKey` / `brokerIndexKey = HKDF(DOOR_CARD_INDEX_KEY, "dooraccess/index/v1|"+recipientId)`. The
cloud re-keys each recipient's envelope with this exact function (`recipientIndexKey` in
`src/plugins/door-access-controller/cardCrypto.js`). `derive-index-key.mjs` **reuses that same
function** so a provisioned key byte-matches the cloud's re-keying — no second HKDF implementation to
drift (§2 F1/F3). openssl is used only to mint X.509.

## Commands
```bash
# 1) stand up the CA (once). ca.key is 0600 and never leaves this dir.
bash vps/pki/door-ca.sh init-ca ./ca

# 2) issue a broker bundle (server cert + brokerIndexKey + uplink bearer).
#    <san> is how edges address the broker, e.g. IP:10.0.0.2 or DNS:broker.lan
export DOOR_CARD_INDEX_KEY=…      # master, from the vault; env only
bash vps/pki/door-ca.sh issue-broker broker-1 IP:10.0.0.2 ./ca ./out/broker-1
#   → broker.crt, broker.key(0600), ca.crt, broker.index.key(0600), broker.uplink.secret(0600)

# 3) issue an edge bundle (client cert + edgeIndexKey), recording the door→edge/broker mapping.
bash vps/pki/door-ca.sh issue-edge edge-1 front broker-1 ./ca ./out/edge-1
#   → edge.crt, edge.key(0600), ca.crt, edge.index.key(0600); appends ./ca/registry.json
```

## Wiring the outputs
- **Broker container** (`docker-compose.broker.yml` mounts `./certs`): `broker.crt`→`BROKER_TLS_CERT`,
  `broker.key`→`BROKER_TLS_KEY` (**0600** — the broker refuses a loose-perm key, S2c-3 #4),
  `ca.crt`→`BROKER_CA_ROOT`, `broker.index.key`→`BROKER_INDEX_KEY`, and the broker's
  `registry.json` (edge CN → doorId) → `BROKER_REGISTRY`.
- **Cloud socket-server**: the uplink bearer → `BROKER_UPLINK_SECRETS` (`{brokerId: secret}`), and
  `BROKER_DOOR_MAP` (`{brokerId:[doorId]}`) is projected from `registry.json`.
- **Edge** (S4): `edge.crt`/`edge.key`/`ca.crt` + `edge.index.key` onto the device (secure-side mount).

## Security
- **All ids/SAN are allow-list validated** before they touch openssl (`A-Za-z0-9._-` ids; `DNS:`/`IP:`-only
  SAN; no control chars) — blocks openssl ext/DN injection (a crafted value can't mint a `CA:TRUE` leaf,
  override the EKU, or forge a SAN). Fail-closed: an invalid arg aborts before any key/cert is written.
- Ed25519 keys; CA root `pathlen:0`; leaves scoped by EKU (broker = `serverAuth`, edge = `clientAuth`).
- Every private key is written `0600` under `umask 077`; the tool **never overwrites** an existing key.
- The master `DOOR_CARD_INDEX_KEY` is read from the env only and never written to disk by this tool.
- Leaves are short-lived (`DOOR_LEAF_DAYS`, default 825d) — re-issue on rotation.

## Rotation & revocation
- **`edgeId` deny-list** (revoke a compromised edge without re-issuing the CA) — **S3b**.
- **Master rotation → fleet re-key** runbook (rotate `DOOR_CARD_INDEX_KEY`, re-derive every recipient
  key, re-provision) — **S3c**.
