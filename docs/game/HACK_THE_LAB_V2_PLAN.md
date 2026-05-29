# Hack the Lab v2: "The Holodeck" - Master Plan

## 1. High-Level Architecture
The system uses a **Hybrid Architecture** to combine the ease of Vercel with the raw power of a Linux VPS.

### **A. The Frontend (Vercel)**
-   **Role:** Mission Control.
-   **Responsibilities:**
    -   User Authentication (NextAuth).
    -   Mission Selection UI.
    -   Storyline & Dialogue.
    -   Payment Processing (Stripe/Square).
    -   **Action:** Sends commands to the RackNerd VPS to "Spawn" a mission.

### **B. The Backend (RackNerd VPS)**
-   **Role:** The Engine Room.
-   **Components:**
    1.  **The Orchestrator (Node.js API):** Listens for commands from Vercel.
    2.  **Docker Host:** Runs the actual mission containers.
    3.  **Traefik (Reverse Proxy):** Automatically routes `https://mission-123.term.crittercodes.dev` to the correct container.

---

## 2. The "Start Mission" Flow
1.  **User** clicks "Start Mission 1" on the Dashboard.
2.  **Vercel** verifies the user owns the mission (or has paid).
3.  **Vercel** sends a secure POST request to RackNerd:
    ```json
    POST https://api.crittercodes.dev/spawn
    { "userID": "jacob", "missionID": "mission-01" }
    ```
4.  **RackNerd Orchestrator**:
    -   Checks if a container already exists for this user.
    -   If not, runs: `docker run -d --name mission-jacob-01 -v /data/jacob:/home/hacker/data mission-01-image`
    -   Generates a **One-Time Token** for access.
5.  **RackNerd** responds with: `{ "url": "https://mission-jacob-01.term.crittercodes.dev?token=xyz" }`
6.  **Vercel** displays an `<iframe>` pointing to that URL.
7.  **User** is now hacking a real Linux box inside their browser.

---

## 3. Technical Stack

### **A. The Terminal Bridge: `ttyd` + Traefik**
Instead of Wetty, we will use **ttyd** (C++ based, extremely fast) combined with **Traefik**.
-   **Why Traefik?** It listens to Docker. When a container starts, Traefik *instantly* generates an SSL certificate and a subdomain for it. No manual Nginx config needed.
-   **Why ttyd?** It's a tiny binary we can bake into our Mission Docker Images.

### **B. Persistence (The "Backpack")**
-   We create a folder on the RackNerd Host: `/opt/hackthelab/users/{userID}/`.
-   We mount this folder to `/home/hacker/backpack` inside *every* mission container.
-   **Result:** If a user writes a script in Mission 1 and saves it to `~/backpack`, it is available in Mission 2.

### **C. Security**
1.  **Network Isolation:** Mission containers have **NO Internet Access** (by default). They can only talk to the "Target" containers in their specific mission network.
2.  **Resource Limits:**
    -   CPU: 0.5 Cores
    -   RAM: 256MB
    -   PIDs: 50 (Prevents fork bombs)
3.  **Timeouts:** Containers auto-kill after 1 hour of inactivity.

---

## 4. Implementation Roadmap

### **Phase 1: Infrastructure Setup**
-   [ ] Buy RackNerd VPS (Ubuntu 24.04).
-   [ ] Point `*.term.crittercodes.dev` DNS to VPS IP.
-   [ ] Install Docker & Traefik on VPS.

### **Phase 2: The Orchestrator**
-   [ ] Build a simple Node.js Express app on the VPS.
-   [ ] Implement `POST /spawn` endpoint using `dockerode` library.
-   [ ] Secure it with a shared `ORCHESTRATOR_SECRET` key.

### **Phase 3: The First Mission**
-   [ ] Create `Dockerfile` for "Mission 1: Hello World".
    -   Base: Alpine Linux.
    -   Tools: `vim`, `nano`, `grep`.
    -   Entrypoint: `ttyd login`.
-   [ ] Test manual deployment.

### **Phase 4: Integration**
-   [ ] Update Next.js Dashboard to call the Orchestrator.
-   [ ] Build the "Terminal Window" component (iframe).

---

## 5. Cost Estimate
-   **RackNerd VPS:** ~$20-30/year (2GB RAM is plenty for ~10 concurrent users).
-   **Domain:** Already owned.
-   **Vercel:** Free tier (or Pro).
-   **Total:** ~$2.50 / month.
