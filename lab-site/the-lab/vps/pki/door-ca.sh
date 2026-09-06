#!/usr/bin/env bash
# Door-system internal CA + provisioning (door-controller-wifi.md §13 S3). Mints the Link-A mTLS
# material and the per-recipient index keys / uplink bearer the broker + edges need. openssl does the
# X.509; the index keys are derived by the node helper (derive-index-key.mjs) that REUSES the cloud's
# recipientIndexKey — so a provisioned key byte-matches how the cloud re-keys that recipient (§2 F1).
#
# Trust model: this tool runs on a provisioning host that holds the master DOOR_CARD_INDEX_KEY (in the
# ENV, never argv). Output key files are 0600. The CA private key never leaves the CA dir.
#
# Commands:
#   init-ca      <ca-dir>
#   issue-broker <brokerId> <san> <ca-dir> <out-dir>     (san e.g. "IP:10.0.0.2" or "DNS:broker.lan")
#   issue-edge   <edgeId> <doorId> <brokerId> <ca-dir> <out-dir>
# Ed25519 keys throughout (topic-cryptography). Fail-closed: never clobber existing keys.

set -euo pipefail
IFS=$'\n\t'

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CA_DAYS="${DOOR_CA_DAYS:-3650}"     # CA root ~10y
LEAF_DAYS="${DOOR_LEAF_DAYS:-825}"  # leaves ~27mo (short-lived; re-issue on rotation)

die() { echo "door-ca: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing required tool: $1"; }

# --- input validation (allow-list; boundary defense — std-owasp-proactive #5) -------------------
# These args flow into openssl -subj / the leaf ext-file / SAN. Unvalidated, a newline or crafted
# value injects openssl CONF lines (duplicate-key-last-wins) → a leaf minted CA:TRUE, an EKU/role
# override, or SAN impersonation; a "/" in an id injects extra DN RDNs. Reject anything off the
# allow-list up front (fail-closed) so no such value ever reaches openssl.
_reject_ctrl() { case "$1" in *[$'\n\r\t']*) return 1 ;; *) return 0 ;; esac; }
# ids (CN / doorId / brokerId): the identity the registry + cert CN key on — strict charset, 1..64.
_valid_id() { _reject_ctrl "$1" && [[ "$1" =~ ^[A-Za-z0-9._-]{1,64}$ ]]; }
# SAN: only comma-separated DNS:<host> / IP:<addr> tokens; nothing that could add a CONF line.
_valid_san() { _reject_ctrl "$1" && [[ "$1" =~ ^(DNS:[A-Za-z0-9*.-]+|IP:[0-9A-Fa-f:.]+)(,(DNS:[A-Za-z0-9*.-]+|IP:[0-9A-Fa-f:.]+))*$ ]]; }

_gen_key() { # <path> — Ed25519 private key, 0600, never overwrite
  local path="$1"
  [ -L "$path" ] && die "refusing to write through a symlink: $path" # don't follow a pre-planted link
  [ -e "$path" ] && die "refusing to overwrite existing key: $path"
  # Residual (accepted): a symlinked PARENT dir or the check→genpkey TOCTOU window (openssl -out has no
  # O_EXCL) could still redirect/race the write — but $out is an operator arg and exploiting the race
  # needs concurrent local write access (= host compromise). Bounded by the single-user provisioning host.
  ( umask 077 && openssl genpkey -algorithm ed25519 -out "$path" )
  chmod 600 "$path"
}

_derive_index_key() { # <recipientId> <out-path> — via the node helper (cloud-parity); 0600
  local id="$1" out="$2"
  [ -n "${DOOR_CARD_INDEX_KEY:-}" ] || die "DOOR_CARD_INDEX_KEY must be set in the env to derive index keys"
  ( umask 077 && DOOR_CARD_INDEX_KEY="$DOOR_CARD_INDEX_KEY" node "$here/derive-index-key.mjs" "$id" > "$out" )
  chmod 600 "$out"
}

cmd_init_ca() {
  local ca_dir="${1:?usage: init-ca <ca-dir>}"
  mkdir -p "$ca_dir"
  local key="$ca_dir/ca.key" crt="$ca_dir/ca.crt"
  [ -e "$key" ] && die "CA already exists at $key (refusing to re-init)"
  _gen_key "$key"
  # Self-signed CA root: basicConstraints CA:TRUE (critical), keyCertSign — Link-A trust anchor.
  openssl req -x509 -new -key "$key" -days "$CA_DAYS" -out "$crt" \
    -subj "/CN=fablab-door-ca" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"
  chmod 644 "$crt"
  echo "initialized door CA at $ca_dir (ca.crt, ca.key 0600)"
}

_sign_leaf() { # <csr> <out-crt> <ca-dir> <ext-file>
  local csr="$1" out="$2" ca_dir="$3" ext="$4"
  openssl x509 -req -in "$csr" -CA "$ca_dir/ca.crt" -CAkey "$ca_dir/ca.key" \
    -CAcreateserial -days "$LEAF_DAYS" -extfile "$ext" -out "$out"
  chmod 644 "$out"
}

cmd_issue_broker() {
  local broker_id="${1:?}" san="${2:?}" ca_dir="${3:?}" out="${4:?usage: issue-broker <brokerId> <san> <ca-dir> <out-dir>}"
  _valid_id "$broker_id" || die "invalid brokerId (allow-list: A-Za-z0-9._- , 1-64 chars)"
  _valid_san "$san" || die "invalid SAN (comma-separated DNS:<host> / IP:<addr> tokens only)"
  [ -f "$ca_dir/ca.key" ] || die "no CA at $ca_dir (run init-ca first)"
  mkdir -p "$out"
  _gen_key "$out/broker.key"
  openssl req -new -key "$out/broker.key" -subj "/CN=$broker_id" -out "$out/broker.csr"
  # Broker is the Link-A SERVER; SAN so edges can verify the host/IP they dial.
  local ext; ext="$(mktemp)"
  printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=%s\n' "$san" > "$ext"
  _sign_leaf "$out/broker.csr" "$out/broker.crt" "$ca_dir" "$ext"
  rm -f "$ext" "$out/broker.csr"
  cp "$ca_dir/ca.crt" "$out/ca.crt"
  _derive_index_key "$broker_id" "$out/broker.index.key"                 # BROKER_INDEX_KEY (base64)
  ( umask 077 && openssl rand -base64 32 > "$out/broker.uplink.secret" ) # BROKER_UPLINK_SECRET (bearer)
  chmod 600 "$out/broker.uplink.secret"
  echo "issued broker '$broker_id' → $out (broker.crt/key, ca.crt, broker.index.key, broker.uplink.secret)"
}

cmd_issue_edge() {
  local edge_id="${1:?}" door_id="${2:?}" broker_id="${3:?}" ca_dir="${4:?}" out="${5:?usage: issue-edge <edgeId> <doorId> <brokerId> <ca-dir> <out-dir>}"
  _valid_id "$edge_id" || die "invalid edgeId (allow-list: A-Za-z0-9._- , 1-64 chars)"
  _valid_id "$door_id" || die "invalid doorId (allow-list: A-Za-z0-9._- , 1-64 chars)"
  _valid_id "$broker_id" || die "invalid brokerId (allow-list: A-Za-z0-9._- , 1-64 chars)"
  [ -f "$ca_dir/ca.key" ] || die "no CA at $ca_dir (run init-ca first)"
  mkdir -p "$out"
  _gen_key "$out/edge.key"
  openssl req -new -key "$out/edge.key" -subj "/CN=$edge_id" -out "$out/edge.csr"
  # Edge is the Link-A CLIENT; identified by CN (→ doorId via the broker registry).
  local ext; ext="$(mktemp)"
  printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=clientAuth\n' > "$ext"
  _sign_leaf "$out/edge.csr" "$out/edge.crt" "$ca_dir" "$ext"
  rm -f "$ext" "$out/edge.csr"
  cp "$ca_dir/ca.crt" "$out/ca.crt"
  _derive_index_key "$edge_id" "$out/edge.index.key"   # edgeIndexKey (base64)
  # Append to the fleet registry: doorId → {edgeDeviceId, brokerId}. jq is REQUIRED (F3) so the
  # mapping is always written — a silent skip would leave the edge unauthorized with no signal.
  local reg="$ca_dir/registry.json"
  [ -f "$reg" ] || echo '{}' > "$reg"
  local tmp; tmp="$(mktemp)"
  jq --arg d "$door_id" --arg e "$edge_id" --arg b "$broker_id" \
    '.[$d] = {edgeDeviceId:$e, brokerId:$b}' "$reg" > "$tmp" && mv "$tmp" "$reg"
  echo "issued edge '$edge_id' for door '$door_id' (broker '$broker_id') → $out"
}

main() {
  need openssl
  local cmd="${1:-}"; shift || true
  case "$cmd" in
    init-ca)      cmd_init_ca "$@" ;;
    issue-broker) need node; cmd_issue_broker "$@" ;;
    issue-edge)   need node; need jq; cmd_issue_edge "$@" ;;
    *) die "usage: door-ca.sh {init-ca|issue-broker|issue-edge} ..." ;;
  esac
}
main "$@"
