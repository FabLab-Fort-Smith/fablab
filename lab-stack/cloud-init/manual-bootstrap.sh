#!/usr/bin/env bash
# Manual first-boot hardening — use when the provider can't inject cloud-init
# (RackNerd/SolusVM typically can't). Run as ROOT on a fresh Ubuntu LTS box.
# Mirrors cloud-init/user-data.yaml; safe to re-run. After this, Ansible (../ansible) takes over.
#
# Usage (paste your real public key):
#   DEPLOY_PUBKEY="ssh-ed25519 AAAA... you@host" bash manual-bootstrap.sh
set -euo pipefail
IFS=$'\n\t'

: "${DEPLOY_PUBKEY:?Set DEPLOY_PUBKEY to the deploy SSH PUBLIC key (authorized key)}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"

echo "• Updating + installing base packages…"
export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get -y upgrade
apt-get install -y ufw fail2ban unattended-upgrades curl ca-certificates gnupg sudo

echo "• Creating non-root sudo user '${DEPLOY_USER}'…"
id "${DEPLOY_USER}" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "${DEPLOY_USER}"
usermod -aG sudo "${DEPLOY_USER}"
install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
printf '%s\n' "${DEPLOY_PUBKEY}" > "/home/${DEPLOY_USER}/.ssh/authorized_keys"
chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh/authorized_keys"
# Passwordless sudo so Ansible `become` works (least-privilege user, not root login).
printf '%s ALL=(ALL) NOPASSWD:ALL\n' "${DEPLOY_USER}" > "/etc/sudoers.d/90-${DEPLOY_USER}"
chmod 440 "/etc/sudoers.d/90-${DEPLOY_USER}"

echo "• Hardening SSH (keys only, no root, no passwords)…"
cat > /etc/ssh/sshd_config.d/10-fablab-hardening.conf <<EOF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
AllowUsers ${DEPLOY_USER}
EOF
sshd -t

echo "• Firewall (default-deny; SSH only for now — Ansible adds 80/443 locked to Cloudflare)…"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw --force enable

echo "• Enabling fail2ban + unattended security upgrades…"
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades || true
systemctl restart ssh 2>/dev/null || systemctl restart sshd

echo
echo "✓ Base hardening complete."
echo "  Verify from your laptop:  ssh ${DEPLOY_USER}@<vps-ip>   (root + password login must be refused)"
echo "  Next: configure ../ansible (inventory + group_vars) and run 'make converge'."
