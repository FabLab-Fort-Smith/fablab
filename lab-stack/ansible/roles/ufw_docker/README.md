# role: ufw_docker

Makes **ufw and Docker coexist** so the firewall survives reboots/`ufw reload`
without breaking container networking — in particular the **container → host**
path that Coolify's control plane depends on.

## Why this exists

ufw's default-deny policy and its generated chains don't know about Docker. On a
`ufw`-managed host this causes two well-known problems:

1. **Docker bypasses ufw** for published container ports (Docker inserts its own
   `iptables` rules ahead of ufw's).
2. **Containers can't reach the host.** After a `ufw reload` or a reboot re-applies
   ufw over Docker's rules, traffic from a container to a host IP (e.g. a docker
   gateway) gets dropped.

We hit (2) in production on 2026-07-14: Coolify's control-plane container connects
to the host over SSH via `host.docker.internal:22` (its "localhost" server), and
it failed with:

```
Deployment failed: ssh: connect to host host.docker.internal port 22: Connection refused
```

The server showed **"not reachable"**, Sentinel went out of sync, and staging
deployments failed. Diagnosis (see `coolify/diagnose-server-conn.sh`): the host's
`sshd` was healthy on `0.0.0.0:22` and a *default-bridge* container could reach it,
but a container on Coolify's own bridge (`10.0.1.0/24`) could not reach the host on
`:22` at all — a ufw/Docker firewall interaction, not an app or sshd fault.

## What it does (idempotent, SSH-safe — adds ACCEPTs only)

1. Ensures `net.ipv4.ip_forward=1` (Docker requires it; ufw can turn it off).
2. Sets `DEFAULT_FORWARD_POLICY="ACCEPT"` in `/etc/default/ufw` (Docker governs the
   forward path through `DOCKER-USER`).
3. Installs the canonical **ufw-docker** block in `/etc/ufw/after.rules` (managed by
   an Ansible marker) so ufw owns the `DOCKER-USER` chain: container-originated
   traffic from private ranges is allowed; inbound public access to container ports
   must be opened explicitly.
4. Adds ufw allows for the **Docker bridge subnets → host** on the ports containers
   legitimately need (`ufw_docker_host_ports`, default `[22]` for Coolify).
5. On change: **reload ufw, then restart Docker** (so Docker re-inserts its bridge
   chains on top of the reloaded ruleset).

## Variables (`defaults/main.yml`)

- `ufw_docker_bridge_cidrs` — private Docker subnets allowed to reach the host
  (default `10.0.0.0/8`, `172.16.0.0/12`).
- `ufw_docker_host_ports` — host ports containers may reach (default `[22]`).

## Placement

Runs **after `docker`** (needs Docker installed) and **before `coolify`** (Coolify
must be able to reach the host once installed) in `playbook.yml`.

## Verify

After applying, reproduce Coolify's path — it should now connect:

```
sudo docker run --rm --network container:coolify alpine nc -w4 -zv 10.0.0.1 22   # expect: open
```

Then in Coolify: **Servers → Validate** (the `host.docker.internal:22` error clears)
→ redeploy. The full diagnostic lives in `lab-stack/coolify/diagnose-server-conn.sh`.

## References

- chaifeng/ufw-docker (the after.rules block) — the upstream of the block used here.
- ADR 0006 (Coolify migration), ADR 0011 (SSH-CA); `@rules/topic-iac-cloud.md`,
  `@rules/std-cis.md` (host hardening).
