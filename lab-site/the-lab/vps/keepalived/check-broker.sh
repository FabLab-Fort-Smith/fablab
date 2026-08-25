#!/usr/bin/env bash
# keepalived track_script for the door-broker VIP (S5). Exit 0 iff the LOCAL broker is serving; any
# non-zero exit puts this node into VRRP FAULT and releases the VIP to the peer. Queries the broker's
# loopback health endpoint (S2c-3 #6 — 127.0.0.1 only, never the LAN).
set -euo pipefail

port="${BROKER_HEALTH_PORT:-9090}"
# 200 = ready. curl -f fails (non-zero) on 503 (not-ready) or a dead socket → FAULT → failover.
curl -fsS --max-time 2 "http://127.0.0.1:${port}/" >/dev/null
