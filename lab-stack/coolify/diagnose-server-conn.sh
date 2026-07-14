#!/usr/bin/env bash
# Diagnose Coolify "Server is not reachable / ssh: connect to host
# host.docker.internal port 22: Connection refused".
#
# READ-ONLY — makes no changes. Run as root ON the Coolify host:
#     sudo bash diagnose-server-conn.sh [coolify_container_name]
#
# It reproduces Coolify's own control-plane -> host SSH path from inside the
# Coolify container, checks the host.docker.internal mapping, the docker-network
# gateways, sshd's bind, and the firewall — then prints a heuristic verdict.
set -uo pipefail

CN="${1:-coolify}"    # Coolify control container (override as arg 1)
hr(){ printf '\n--- %s ---\n' "$1"; }

echo "### Coolify server-connection diagnostic  $(date -u +%FT%TZ)"
echo "### control container: $CN   host: $(hostname)"

hr "host sshd listeners (:22)"
ss -tlnp 2>/dev/null | grep ':22' || echo "NOTHING listening on :22"

if ! docker inspect "$CN" >/dev/null 2>&1; then
  hr "container '$CN' NOT found — coolify-ish candidates"
  docker ps --format '{{.Names}}' | grep -i coolify || echo "(none)"
  echo ">> Re-run with the correct name: sudo bash $0 <name>"
  exit 1
fi

hr "coolify extra_hosts (host.docker.internal mapping)"
docker inspect "$CN" --format '{{json .HostConfig.ExtraHosts}}'

hr "resolve host.docker.internal FROM inside coolify"
docker exec "$CN" getent hosts host.docker.internal 2>&1 || echo "resolve FAILED"

hr "TCP :22 FROM inside coolify -> host.docker.internal"
docker exec "$CN" bash -c 'timeout 3 bash -c "echo > /dev/tcp/host.docker.internal/22" && echo OPEN || echo REFUSED' 2>&1

hr "coolify networks + gateways"
docker inspect "$CN" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} gw={{$v.Gateway}} ip={{$v.IPAddress}}{{println}}{{end}}'

hr "host -> its own docker gateway(s) on :22"
docker network ls -q | while read -r n; do
  docker network inspect "$n" --format '{{range .IPAM.Config}}{{.Gateway}}{{"\n"}}{{end}}' 2>/dev/null
done | sort -u | grep -E '^[0-9]' | while read -r gw; do
  timeout 2 bash -c "echo > /dev/tcp/$gw/22" 2>/dev/null && echo "$gw:22 OPEN" || echo "$gw:22 REFUSED/UNREACHABLE"
done

hr "ufw status"
ufw status verbose 2>/dev/null | head -30 || echo "(ufw not present)"

hr "iptables: REJECT/DROP / dport 22 / DOCKER-USER"
iptables -S 2>/dev/null | grep -iE 'REJECT|DROP|dpt:22|--dport 22|DOCKER-USER' | head -40 || echo "(none / iptables unavailable)"

hr "VERDICT (heuristic)"
EH=$(docker inspect "$CN" --format '{{json .HostConfig.ExtraHosts}}' 2>/dev/null)
RES=$(docker exec "$CN" getent hosts host.docker.internal 2>/dev/null | awk '{print $1}')
CONN=$(docker exec "$CN" bash -c 'timeout 3 bash -c "echo > /dev/tcp/host.docker.internal/22" && echo OPEN || echo REFUSED' 2>/dev/null)
echo "extra_hosts=$EH"
echo "resolves_to=${RES:-<none>}"
echo "connect_to_:22=${CONN:-<unknown>}"
echo
if [ "$CONN" = "OPEN" ]; then
  echo ">> Container CAN reach host:22 now — the failure has cleared. Re-validate the server in the Coolify UI and redeploy."
elif [ -z "${RES:-}" ] || printf '%s' "$EH" | grep -q 'null'; then
  echo ">> LIKELY CAUSE: host.docker.internal is NOT mapped to the host gateway (extra_hosts null / no resolve)."
  echo "   FIX: recreate the coolify container with extra_hosts host.docker.internal:host-gateway"
  echo "        (Coolify's own compose sets this; a manual 'docker run/restart' that dropped it will break this)."
elif printf '%s' "$RES" | grep -qE '^127\.'; then
  echo ">> LIKELY CAUSE: host.docker.internal resolves to 127.0.0.1 INSIDE the container (no sshd there) -> refused."
  echo "   FIX: map it to the host gateway (host-gateway), not loopback."
else
  echo ">> LIKELY CAUSE: resolves to $RES but :22 is refused -> a firewall (ufw/iptables) is REJECTing the docker subnet -> host:22,"
  echo "   OR sshd is not accepting on that interface. Inspect the ufw / iptables sections above for a REJECT covering the docker net."
  echo "   FIX (ufw example): sudo ufw allow from <docker-subnet> to any port 22 proto tcp   (then re-validate in Coolify)."
fi
echo
echo "### done — paste this whole output back."
