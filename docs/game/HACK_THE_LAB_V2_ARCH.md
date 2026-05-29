# Hack the Lab v2: Technical Architecture

## Overview
**Hack the Lab v2** is a Capture-The-Flag (CTF) platform where users interact with ephemeral, real Linux environments to complete security challenges.

**Core Philosophy:**
- **Realism:** Real Docker containers, not emulations.
- **Isolation:** Every user gets their own sandbox.
- **Persistence:** User progress is saved between sessions.

---

## 1. The Orchestrator (RackNerd VPS)

The Orchestrator is the "Brain" running on the VPS. It manages the lifecycle of user sessions.

### Recommended Tech Stack
- **Runtime:** Node.js (TypeScript)
- **Framework:** Fastify (Low overhead, high performance)
- **Docker Interface:** `dockerode` (NPM package to control Docker Socket)
- **Reverse Proxy:** Traefik (Automatic SSL & Routing based on Docker Labels)

### API Contract (Internal Only)
*Protected by a Shared Secret Header (`x-service-key`)*

#### `POST /mission/start`
**Request:**
```json
{
  "userID": "user_2jC...",
  "missionID": "mission_sql_injection_01",
  "options": {
    "duration": 3600 // 1 hour lease
  }
}
```

**Response:**
```json
{
  "status": "ready",
  "containerID": "a1b2c3d4...",
  "terminalUrl": "https://term-user-2jC.thelab.com",
  "authToken": "abc-123-xyz" // One-time token for the terminal
}
```

#### `POST /mission/stop`
**Request:**
```json
{
  "userID": "user_2jC..."
}
```

---

## 2. The Terminal Bridge

We will use **Traefik** as the ingress controller and **ttyd** (C++ WebSocket Terminal) inside the containers. This is more robust than a custom Node.js proxy for raw shell performance.

### Architecture Diagram
```mermaid
graph LR
    User[User Browser] -- HTTPS --> Traefik[Traefik Proxy (VPS)]
    Traefik -- HTTP --> Container[User Container]
    subgraph Container
        ttyd[ttyd Process] -- PTY --> Bash[Bash Shell]
    end
```

### The "Start Mission" Flow (Step-by-Step)

1.  **User Action:** User clicks "Start Mission" on the Next.js Dashboard.
2.  **Vercel Backend:** Next.js API Route (`/api/v1/arcade/start`) validates the user's credits/permissions.
3.  **Orchestration Call:** Vercel sends a request to the VPS Orchestrator: `POST /mission/start`.
4.  **Volume Check:** Orchestrator checks if a Docker Volume exists for this user (`vol_user_2jC`). If not, it creates one.
5.  **Container Spin-up:** Orchestrator instructs Docker to run the image `crittercodes/mission-01:latest`.
    -   **Cmd:** `ttyd -p 8080 -t credential=token:randomSecret123 bash`
    -   **Env:** `MISSION_FLAG=flag{s3cr3t}`
    -   **Mounts:** `vol_user_2jC:/home/hacker/workspace`
    -   **Labels (Traefik):**
        -   `traefik.http.routers.user-2jC.rule=Host('user-2jC.term.thelab.com')`
        -   `traefik.http.services.user-2jC.loadbalancer.server.port=8080`
6.  **DNS/Routing:** Traefik detects the new container and instantly provisions the route (and SSL if configured with Let's Encrypt).
7.  **Handshake:** Orchestrator returns the URL `https://user-2jC.term.thelab.com` and the credential `randomSecret123` to Vercel.
8.  **Redirect:** Vercel redirects the user (or opens an iframe) to the URL with the credential (e.g., via Basic Auth in URL `https://token:randomSecret123@user-2jC.term.thelab.com`).

---

## 3. Persistence Strategy

We need to ensure that if a user writes a script or saves a file, it's there when they come back tomorrow.

### Docker Volumes
- **Naming Convention:** `data_{userID}`
- **Mount Point:** `/home/hacker/data`
- **Lifecycle:** Volumes are **never** deleted by the `stop` command. They persist on the VPS disk.

### Implementation
When starting a container:
```javascript
// Orchestrator Logic
const volumeName = `data_${userID}`;
// Ensure volume exists
await docker.createVolume({ Name: volumeName });

// Start container with mount
docker.createContainer({
  Image: 'mission-image',
  HostConfig: {
    Binds: [`${volumeName}:/home/hacker/data`]
  }
  // ...
})
```

---

## 4. Security Measures

### A. Authentication (Vercel <-> VPS)
- **Shared Secret:** A long, random string stored in `.env` on both Vercel and the VPS.
- **IP Whitelisting:** If possible, restrict VPS API access to Vercel's IP ranges (hard due to dynamic IPs) or use mTLS. For now, a strong `x-service-key` is sufficient.

### B. Terminal Access (Browser <-> VPS)
- **One-Time Token:** `ttyd` supports a credential parameter. We generate a random password for every session.
- **HTTPS:** Traefik handles TLS termination. No unencrypted traffic.

### C. Container Isolation (The "Jail")
- **Network:** Containers run on an internal Docker network (`mission-net`) with **no internet access** (unless the mission specifically requires `curl` access to a specific target).
- **Resources:**
    -   `Memory`: 512MB limit.
    -   `CPUShares`: Limited to prevent crypto-mining.
    -   `PidsLimit`: 50 (prevents fork bombs).
- **Privilege:** Containers run as a non-root user (`hacker`), preventing modification of the container's core system files.
- **Timeouts:** The Orchestrator runs a cron job to kill containers that have been running for > 2 hours to save resources.

---

## 5. Deployment Checklist

1.  **VPS Setup:**
    -   Install Docker & Docker Compose.
    -   Install Traefik (Port 80/443).
    -   Point `*.term.thelab.com` A-record to VPS IP.
2.  **Orchestrator:**
    -   Deploy Node.js app (PM2 or Docker).
    -   Expose API on Port 3000 (blocked by firewall, only accessible via Traefik or VPN if needed, or public with Auth).
3.  **Mission Images:**
    -   Build `Dockerfile` for base mission (Ubuntu + Tools + ttyd).
    -   Push to Docker Hub or private registry.
