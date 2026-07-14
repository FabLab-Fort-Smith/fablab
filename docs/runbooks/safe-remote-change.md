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
> flags as availability-risky. Access here is effectively **single-path** — SSH over the tailnet
> as `b007ab1e` with the `fablab_deploy` key (sudo needs the account password; no NOPASSWD, no
> `pam_ssh_agent_auth`). One bad firewall/sshd change with no fallback = **fully locked out**.
> Rules: `@rules/workflow-gated-actions.md`, `@rules/std-zero-trust.md`, `@rules/topic-iac-cloud.md`.
> (Motivating incident: closed PR #55 — a ufw-docker change that would have dropped all web ingress.)

## When to use
- Editing ufw / iptables / `/etc/ufw/*.rules` / `DEFAULT_FORWARD_POLICY`.
- Editing `sshd_config`, SSH keys/`authorized_keys`, the SSH CA, or fail2ban.
- Networking/routing/Docker-network changes, or an Ansible converge that touches the above.
- **NOT** needed for read-only diagnosis (always safe) — see `coolify/diagnose-server-conn.sh`.

## The non-negotiables (all of them, every time)
1. **Two live sessions.** Keep a **second SSH session open** to the host for the whole change.
   Never rely on the connection you're editing from. (Bonus: open the provider console too — step 6.)
2. **Additive / accept-only where possible; never flush.** Don't `iptables -F`, don't reset ufw as
   step 1. Prefer inserting ACCEPTs over deleting/replacing. Firewall **fails closed** — a partial
   ruleset can strand you.
3. **Test before you reload/restart.** `sshd -t` for sshd; `iptables -C …` to check a rule; render
   Ansible with `--check --diff` first. Reload/restart **only after** the test passes; prefer
   `reload` over `restart` for sshd.
4. **Arm a dead-man's-switch auto-revert BEFORE applying** (see below), and **cancel it only after**
   you've confirmed access + the service still work from the second session.
5. **Snapshot/back up** the thing you're changing (rules files, sshd_config) and, where the
   provider supports it, a VM snapshot.
6. **Know the break-glass path:** the **RackNerd panel → VNC/serial console** logs in without SSH
   if SSH is lost; from there, run the revert.

## Steps

### 1. Pre-flight (backup + arm auto-revert)
Ensure `atd` is running (`systemctl enable --now atd`), then:

**Firewall change:**
```
sudo iptables-save > /root/pre-change.iptables
sudo tar czf /root/pre-change.ufw.tgz /etc/ufw
# auto-revert in 10 min unless cancelled:
echo 'iptables-restore < /root/pre-change.iptables; systemctl restart docker' | sudo at now + 10 minutes
atq   # note the JOB ID
```

**sshd change:**
```
sudo cp /etc/ssh/sshd_config /root/pre-change.sshd_config
sudo sshd -t   # MUST pass before proceeding
echo 'cp /root/pre-change.sshd_config /etc/ssh/sshd_config; systemctl reload ssh' | sudo at now + 10 minutes
atq   # note the JOB ID
```

If `at`/`atd` is unavailable, use a background timer instead and record its PID:
```
sudo bash -c 'nohup sh -c "sleep 600; iptables-restore < /root/pre-change.iptables; systemctl restart docker" >/tmp/revert.log 2>&1 & echo $! > /tmp/revert.pid'
```

### 2. Apply the change
Make the change (Ansible converge, `ufw`/`iptables` edit, `sshd_config` edit + `sshd -t` + reload).

### 3. Verify from the SECOND session (and a fresh login)
- Open a **brand-new** SSH connection: `ssh -i ~/.ssh/fablab_deploy b007ab1e@fablab-prod true` → must succeed.
- Confirm the service path you care about, e.g. Coolify → host:
  `sudo docker run --rm --network container:coolify alpine nc -w4 -zv 10.0.0.1 22` → `open`.
- Confirm public ingress still works if you touched forward/DOCKER-USER rules:
  `curl -sS -o /dev/null -w '%{http_code}\n' https://staging.fablabfortsmith.org`.

### 4. Cancel the auto-revert — ONLY after step 3 passes
```
sudo atrm <JOB ID>        # or: sudo kill "$(cat /tmp/revert.pid)"
```
If step 3 did **not** pass, **do nothing** — let the timer restore the last-good state, then reassess.

## Rollback / abort
- Let the dead-man's-switch fire (do not cancel it), **or** from the second session / console run the
  revert commands from step 1 manually (`iptables-restore < /root/pre-change.iptables`;
  `cp /root/pre-change.sshd_config … && systemctl reload ssh`).
- If SSH is already lost: **RackNerd panel → Console/VNC**, log in, run the revert.

## Verification
New SSH login works, the target service path works, public ingress unaffected, and the auto-revert
was cancelled (`atq` empty of the job). Record the change + outcome.

## Escalation
If reverting doesn't restore access and the console is also unreachable, open a RackNerd support
ticket for out-of-band recovery / snapshot restore.

## Related
- `coolify/diagnose-server-conn.sh` (read-only diagnosis), `runbooks/redeploy-rollback.md`,
  `runbooks/secret-rotation.md`, `runbooks/bootstrap-vps.md`.

---
_Last validated: not yet drilled — rehearse the auto-revert + console break-glass on a low-risk change. Owner: platform._
