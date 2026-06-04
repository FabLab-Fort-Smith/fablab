#!/bin/bash

# Firewall Setup Script for Production Server
# Run with sudo

echo "Setting up UFW Firewall..."

# Reset to default
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (Port 22) - CRITICAL: Don't lock yourself out!
ufw allow 22/tcp

# Allow HTTP/HTTPS (Traefik)
ufw allow 80/tcp
ufw allow 443/tcp

# Explicitly deny MinIO/Traefik Dashboards from public internet
# (Though default deny handles this, explicit deny can be useful for logging if enabled)
# ufw deny 9000
# ufw deny 9001
# ufw deny 8080

echo "Enabling Firewall..."
# Using --force to avoid the "Command may disrupt existing ssh connections" prompt in scripts
ufw --force enable

echo "Firewall status:"
ufw status verbose

echo "Done. Ports 9001 (MinIO) and 8080 (Traefik Dashboard) should now be blocked from external access."
