#!/usr/bin/env bash
# keepalived track_script for the door-broker VIP (S5). Exit 0 iff the LOCAL broker is serving; any
# non-zero exit puts this node into VRRP FAULT and releases the VIP to the peer. Queries the broker's
# loopback health endpoint (S2c-3 #6 — 127.0.0.1 only, never the LAN).
#
# SCOPE (F1): this gates the VIP on the broker SERVING (listener up), NOT on cache/uplink freshness.
# A broker whose cloud uplink is down keeps its VIP while its rung-2 cache ages — bounded by the
# envelope TTL (then fail-secure deny) + edge rung-3. Making failover freshness-aware needs the health
# endpoint to expose uplink/cache state (tracked, tied to the S4b-a readiness item) — until then,
# STALENESS DOES NOT TRIGGER FAILOVER.
set -euo pipefail

port="${BROKER_HEALTH_PORT:-9090}"
# 200 = ready. curl -f fails (non-zero) on 503 (not-ready) or a dead socket → FAULT → failover.
curl -fsS --max-time 2 "http://127.0.0.1:${port}/" >/dev/null
