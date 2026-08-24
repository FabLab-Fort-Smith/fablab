# Hack the Lab v2 - VPS Deployment

## Overview
This folder contains the configuration for the "Holodeck" backend, which runs on a VPS.
It uses Docker, Traefik, and a custom Node.js Orchestrator to spawn ephemeral mission containers.

## Architecture
- **Traefik**: Reverse proxy that handles routing to the Orchestrator and dynamic mission containers.
- **Orchestrator**: Node.js API that manages Docker containers.
- **Missions**: Docker images containing the CTF challenges (e.g., `mission-01`).

## Deployment

### Prerequisites
- A VPS (Ubuntu/Debian) with Docker and Docker Compose installed.
- DNS records pointing to the VPS IP.

### Setup Steps
1. **Copy Files**:
   ```bash
   scp -r vps/docker-compose.yml user@host:~/vps/
   scp -r vps/orchestrator user@host:~/vps/
   scp -r vps/missions user@host:~/vps/
   ```

2. **Build & Start**:
   ```bash
   ssh user@host
   cd ~/vps
   
   # Build mission images
   docker build -t mission-01 ./missions/mission-01
   
   # Start services
   docker compose up -d --build
   ```

### DNS Configuration
Point the following records to your VPS IP (`107.172.140.240`):
- `A` `api.term.crittercodes.dev` -> `107.172.140.240`
- `A` `*.term.crittercodes.dev` -> `107.172.140.240`

### Environment Variables (Frontend)
Set these in your Next.js `.env.local` or Vercel project:
- `ORCHESTRATOR_URL=http://api.term.crittercodes.dev`
- `ORCHESTRATOR_SECRET=change_me_in_prod` (Must match `vps/docker-compose.yml`)

---

## On-site Door Broker (Tier-1)

Separate from the CTF backend above. The **broker** (`broker-server.js`) is the on-site local
authority for door access — it caches per-door signed envelopes and decides scans when the cloud is
unreachable (see `docs/architecture/door-controller-wifi.md`). It runs on the **Proxmox** host, not
Coolify. Image: `Dockerfile.broker`; deploy unit: `docker-compose.broker.yml`.

### Deploy
```bash
# On the Proxmox host, in this vps/ directory:
mkdir -p certs                 # internal-CA-issued material (see S3 provisioning):
#   certs/broker.crt  certs/broker.key (chmod 0600)  certs/ca.crt  certs/registry.json
chmod 0600 certs/broker.key    # REQUIRED — the broker fails closed on a group/other-readable key (#4)
cp .env.broker.example .env    # fill in the required secrets (below); never commit it
docker compose -f docker-compose.broker.yml up -d --build
```

### Required environment (fail-closed — the broker won't start without them)
| Var | Meaning |
|---|---|
| `CLOUD_UPLINK_URL` | `wss://…` cloud uplink (scheme enforced; the broker validates + pins the cloud cert) |
| `BROKER_UPLINK_SECRET` | the broker's bearer for the cloud uplink (constant-time verified cloud-side) |
| `BROKER_INDEX_KEY` | 32-byte base64 per-broker index key (`brokerIndexKey`) — cloud-provisioned |
| `DOOR_ALLOWLIST_VERIFY_KEY` | Ed25519 spki (base64) — verifies envelope signatures |
| `BROKER_LAN_IP` | the host LAN IP to bind Link-A to (never `0.0.0.0`/public) |

Mounted (via `./certs`): `BROKER_TLS_CERT` / `BROKER_TLS_KEY` (0600) / `BROKER_CA_ROOT` / `BROKER_REGISTRY`.

### Health & network surface
- **Link-A** (mTLS, edges → broker) is the **only** LAN surface — bound to `BROKER_LAN_IP:8443`.
- The health endpoint (`BROKER_HEALTH_PORT`, default 9090) binds **127.0.0.1 only** and is **not**
  published — the container `HEALTHCHECK` curls it over loopback (#6). `200` = ready, `503` = not ready;
  the payload carries no secrets (status / ready / uplink up-down / door count).

### HA
This compose is a single broker. High availability (a second instance + keepalived VIP sharing one
`brokerId`) is slice **S5**.
