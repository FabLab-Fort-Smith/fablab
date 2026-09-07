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
