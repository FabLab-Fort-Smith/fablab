---
title: Door broker HA failover drill
category: Security
usage: Scheduled drill + on incident
order: 32
summary: Verify the active/standby door-broker VIP fails over cleanly — the standby serves, doors keep working via the edge rung-3 during the blip, and no split-brain double-grant occurs.
---

# Runbook: Door broker HA failover drill

> The on-site broker runs active/standby behind a keepalived VIP (door-controller-wifi.md §13 S5). Both
> members share one logical `brokerId` and both receive every envelope push from the cloud (S5-a), so the
> standby's rung-2 cache is always warm. Principle: **a broker loss must be invisible at the door — the
> edge falls to its own rung-3 cache during the reconnect blip, then rides the VIP to the standby; never
> a double-grant, never a fail-open.**

## When to use
- **Scheduled:** rehearse failover on a cadence (an untested HA path is a hypothesis).
- **On incident:** the active broker host is degraded/unreachable and you need to confirm/force failover.

## Prerequisites & access
- SSH to both broker hosts; the keepalived + broker-container status on each. The VIP + both host IPs.
- A test edge (or a door you can safely scan) bound to the broker VIP. Know the envelope TTL.

## Steps
1. **Confirm steady state.** On both hosts: `systemctl status keepalived` and the broker container is
   `healthy` (`docker ps`); exactly ONE host holds the VIP (`ip addr show | grep <VIP>`). The cloud shows
   TWO uplink connections for the brokerId (both members registered — S5-a).
2. **Baseline scans.** A scan at the test door grants online (broker → cloud). Note it works.
3. **Fail the active.** On the VIP-holder, stop the broker (`docker stop door-broker`) — or the host —
   to simulate loss. keepalived's `check-broker.sh` fails → the node enters FAULT → **releases the VIP**.
4. **Observe failover.** Within a few seconds the standby takes the VIP (`ip addr` on the standby). The
   edge's uplink drops and reconnects to the VIP (now the standby). **During the blip** the edge decides
   **offline from its rung-3 cache** (a valid, unexpired envelope still grants; fail-secure otherwise).
5. **Verify on the standby.** A scan now grants online again via the standby (it had the fresh envelope
   from the cloud push). No manual re-provisioning needed.
6. **Recover.** Restart the broker on the original host. With `nopreempt` it rejoins as **standby** (the
   VIP does NOT flap back) — both members registered again. (To rebalance, do a planned failover later.)

## Verification
- The VIP is held by exactly ONE host at all times (never zero, never both — no split-brain).
- Scans grant throughout: online before, rung-3 offline during the blip, online again after.
- **No double-grant:** a single scan pulses the strike once (the edge holds one uplink + decides once);
  killing/restarting the broker never produces two grants for one scan.
- The cloud audit shows the edge's offline-grant(s) during the window, store-and-forwarded on reconnect.

## Rollback / abort
- Failover is the safe direction. If BOTH brokers are down, doors run entirely on rung-3 (edge cache)
  until a broker returns or the envelope TTL expires (then fail-secure deny) — restore a broker
  (`runbooks/` broker deploy) or, if the outage will outlast the TTL, treat as an incident.

## Escalation
- Split-brain (VIP on both / neither), or the standby not serving after failover → page `<on-call>`;
  check `virtual_router_id` uniqueness, VRRP peer auth, and that both members show as registered cloud-side.

## Related
- `docs/architecture/door-controller-wifi.md` §13 S5 · `vps/keepalived/` (VIP config + check script) ·
  `vps/docker-compose.broker.yml` (HA deploy notes) · `runbooks/incident-response.md`.

---
_Last validated: not yet drilled (scaffold — run on the two-host bench before relying on failover). Owner: platform._
