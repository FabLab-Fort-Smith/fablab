---
title: Change the remote host safely (no lock-out)
category: Security
usage: Before any risky remote change
order: 45
summary: Never single-path a change that can sever access (firewall/sshd/network). Keep a 2nd session, test before reload, arm a dead-man's-switch auto-revert, and know the console break-glass.
---

# Runbook: Change the remote host safely (no lock-out)

> Follow this **before** any change to `fablab-prod` (or any VPS) that could cut off our own
> access: **ufw / iptables / firewall, sshd config, networking/routing**, or anything a review
> flags as availability-risky. The danger isn't that access is single-path — SSH/`:22` is reachable
> both over the tailnet (MagicDNS `fablab-prod`) and on the public IP — it's that **one bad rule
> (dropping `:22`, breaking sshd) kills every path at once**, and our only login is the
> `fablab_deploy` key. Rules: `@rules/workflow-gated-actions.md`, `@rules/std-zero-trust.md`,
> `@rules/topic-iac-cloud.md`. (Motivating incident: closed PR #55 — a ufw-docker change that would
> have dropped all web ingress.)

## When to use
- Editing ufw / iptables / `/etc/ufw/*.rules` / `DEFAULT_FORWARD_POLICY`.
- Editing sshd config, SSH keys/`authorized_keys`, the SSH CA, or fail2ban. **Note:** sshd here is
  configured via **drop-ins** (`/etc/ssh/sshd_config.d/*.conf`, written by the `harden` + `ssh_ca`
  roles), so a converge changes those, *not* the main `sshd_config`.
- Networking/routing/Docker-network changes, or an Ansible converge that touches the above.
- **NOT** needed for read-only diagnosis (always safe): `ss -tlnp`, `iptables -S`, `ufw status`,
  `docker inspect/exec … <read-only>`, `getent hosts`, `/dev/tcp` probes.

## The non-negotiables (all of them, every time)
1. **Two live sessions.** Keep a **second SSH session open** to the host for the whole change.
   Never rely on the connection you're editing from. (Bonus: open the provider console too — step 6.)
2. **Additive / accept-only where possible; never flush.** Don't `iptables -F`, don't reset ufw as
   step 1. Prefer inserting ACCEPTs over deleting/replacing. Firewall **fails closed** — a partial
   ruleset can strand you.
3. **Test before you reload/restart.** `sshd -t` for sshd; `iptables -C …` to check a rule; render
   Ansible with `--check --diff` first. Reload/restart **only after** the test passes; prefer
   `reload` over `restart` for sshd (note: the `harden` handler currently does `Restart ssh`).
4. **Arm a dead-man's-switch auto-revert BEFORE applying** (step 1), and **cancel it only after**
   you've confirmed access + the service still work from the second session (step 3).
5. **Snapshot/back up** the exact files you're changing, and take a **SolusVM snapshot** in the
   RackNerd panel where available.
6. **Break-glass must actually work:** the RackNerd panel → **Console/VNC** logs in without SSH — but
   this host is **key-only** (`PasswordAuthentication no`) and cloud images often ship with **locked
   local passwords**, so the console getty may have no usable login. **Precondition:** set a
   console password for a local account first (`sudo passwd b007ab1e`) and **rehearse a real console
   login once** — otherwise this fallback is illusory.

## Steps

### 1. Pre-flight (backup + arm auto-revert)
Ensure `atd` is running (`sudo systemctl enable --now atd`). Use absolute paths in `at`/`nohup` jobs
(minimal env).

**Firewall change** — restores the ufw config *and* both IP families, then reloads (no container
bounce):
```
sudo iptables-save  > /root/pre-change.iptables
sudo ip6tables-save > /root/pre-change.ip6tables
sudo tar czf /root/pre-change.ufw.tgz /etc/ufw
echo 'tar xzf /root/pre-change.ufw.tgz -C / && /usr/sbin/iptables-restore < /root/pre-change.iptables && /usr/sbin/ip6tables-restore < /root/pre-change.ip6tables && /usr/sbin/ufw --force reload' | sudo at now + 10 minutes
atq   # note the JOB ID
```
Only add `&& /usr/bin/systemctl restart docker` to the revert if you changed **Docker's own** chains
— and know it **bounces every container** (Coolify, Traefik, MongoDB, the app = real outage).

**sshd change** — back up the main file **and the drop-in dir**, and re-test in the revert:
```
sudo cp -a /etc/ssh/sshd_config   /root/pre-change.sshd_config
sudo cp -a /etc/ssh/sshd_config.d /root/pre-change.sshd_config.d   # harden/ssh_ca write here
sudo sshd -t   # MUST pass before proceeding
echo 'cp -a /root/pre-change.sshd_config /etc/ssh/sshd_config && rm -rf /etc/ssh/sshd_config.d && cp -a /root/pre-change.sshd_config.d /etc/ssh/sshd_config.d && /usr/sbin/sshd -t && /usr/bin/systemctl reload ssh' | sudo at now + 10 minutes
atq   # note the JOB ID
```

If `at`/`atd` is unavailable, use a background timer and record its PID:
```
sudo bash -c 'nohup sh -c "sleep 600; tar xzf /root/pre-change.ufw.tgz -C /; /usr/sbin/iptables-restore < /root/pre-change.iptables; /usr/sbin/ip6tables-restore < /root/pre-change.ip6tables; /usr/sbin/ufw --force reload" >/tmp/revert.log 2>&1 & echo $! > /tmp/revert.pid'
```
(The `sudo at` job is scheduled as **root**, so it fires regardless of sudo password policy —
`b007ab1e` sudo needs the account password on this host; `deploy` has NOPASSWD.)

### 2. Apply the change
Make the change (Ansible converge, `ufw`/`iptables` edit, or sshd drop-in edit + `sshd -t` + reload).

### 3. Verify from the SECOND session (a brand-new login) — on BOTH SSH paths
```
ssh -i ~/.ssh/fablab_deploy b007ab1e@fablab-prod true        # tailnet (MagicDNS)
ssh -i ~/.ssh/fablab_deploy b007ab1e@<public-ip> true        # public IP (see inventory.ini)
```
Service path (Coolify → host) — resolve the gateway Coolify actually uses, don't hardcode:
```
NET=$(sudo docker inspect coolify -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
GW=$(sudo docker network inspect "$NET" -f '{{(index .IPAM.Config 0).Gateway}}')
sudo docker run --rm --network container:coolify alpine nc -w4 -zv "$GW" 22   # want: open
```
If you touched forward/DOCKER-USER rules, confirm **public ingress** still works:
```
curl -sS -o /dev/null -w '%{http_code}\n' https://staging.fablabfortsmith.org
```

### 4. Cancel the auto-revert — ONLY after step 3 passes
```
sudo atrm <JOB ID>        # or: sudo kill "$(cat /tmp/revert.pid)"
```
If step 3 did **not** pass, **do nothing** — let the timer restore the last-good state, then reassess.

## Rollback / abort
- Let the dead-man's-switch fire (don't cancel it), **or** from the second session / console run the
  revert manually from `/root/pre-change.*` (untar `/etc/ufw`, `iptables-restore`/`ip6tables-restore`,
  `ufw --force reload`; or restore `sshd_config` + `sshd_config.d/`, `sshd -t`, `systemctl reload ssh`).
- If SSH is already lost: **RackNerd panel → Console/VNC** (needs the console password precondition
  above), log in, run the revert.

## Verification
A brand-new SSH login works on **both** paths, the target service path works, public ingress is
unaffected, and the auto-revert was cancelled (`atq` shows the job gone). Record the change + outcome.

## Escalation
If reverting doesn't restore access and the console is unreachable, open a RackNerd support ticket
for out-of-band recovery / snapshot restore.

## Related
- `runbooks/redeploy-rollback.md`, `runbooks/secret-rotation.md`, `runbooks/bootstrap-vps.md`,
  `runbooks/agent-ssh-access.md`; `lab-stack/racknerd/` (provider/console).

---
_Last validated: not yet drilled — rehearse the auto-revert AND a real console login (with the password precondition) on a low-risk change before relying on this. Owner: platform._
