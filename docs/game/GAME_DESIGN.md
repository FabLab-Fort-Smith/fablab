# The Lab - Future Mission Design Plan

This document outlines the proposed design for the remaining missions in The Lab terminal game. The goal is to reach 10 missions, progressively increasing difficulty and weaving a narrative of internal sabotage and investigation.

## Narrative Arc: "Ghost in the Machine"
- **Act 1 (Missions 1-3): Stabilization.** You fixed the immediate glitches (lockouts, DB crashes).
- **Act 2 (Missions 4-5): Investigation.** You discovered the glitches were intentional and secured legacy data.
- **Act 3 (Missions 6-8): The Hunt.** You track the attacker through the system, finding their backdoors and logic bombs.
- **Act 4 (Missions 9-10): The Showdown.** You analyze the attacker's tools and finally lock them out for good.

## Proposed Missions

### Mission 6: The Money Trail (Privilege Escalation)
**Concept:** The Treasurer (`0xb007ab1e`) has gone silent. You need to access their restricted ledger to see where the money is going.
**New Mechanics:**
- `su <user>` command to switch users.
- File permissions (simulated).
**Narrative:**
- `0xb007ab1e` is the only one with access to `~/ledger.dat`.
- Clue: A note in `board_minutes.txt` or an email hints that they use a "reversed leetspeak" version of their username as a password.
**Objective:**
1.  Deduce password: `e1ba700b` (0xb007ab1e reversed).
2.  `su 0xb007ab1e`.
3.  Read `~/ledger.dat`.
4.  **Reveal:** Funds are being siphoned to an external account labeled "PROJECT_NEMESIS".

### Mission 7: The Open Window (Web Application Security)
**Concept:** How did they get in? You analyze the internal Member Portal for vulnerabilities.
**New Mechanics:**
- `curl -X POST` (simulated).
- Reading HTML/JS files in `/var/www/html`.
**Narrative:**
- The "Member Portal" (`index.html`) has a comment left by a developer about a "debug" endpoint.
- The attacker used this backdoor to modify the database.
**Objective:**
1.  `cat /var/www/html/index.html` to find `<!-- TODO: Remove /api/debug endpoint -->`.
2.  `curl -X POST http://localhost/api/debug`.
3.  **Reveal:** The response contains the flag and a log of the attacker's IP.

### Mission 8: The Ticking Clock (Process Forensics)
**Concept:** The attacker knows you are onto them. They've triggered a "logic bomb" to wipe the system.
**New Mechanics:**
- `ps` (process status) command.
- `kill <pid>` command.
**Narrative:**
- System performance is degrading. A hidden process is eating CPU and preparing to delete files.
- The process is named deceptively (e.g., `kernel_task_helper`).
**Objective:**
1.  Run `ps` to list processes.
2.  Identify the suspicious process (high CPU, weird name).
3.  `kill <pid>` to stop it.
4.  **Reveal:** The kill confirmation drops a "memory dump" containing the next clue.

### Mission 9: The Payload (Binary Analysis)
**Concept:** Analyze the "logic bomb" binary you just killed to find out what else it did.
**New Mechanics:**
- `strings <file>` command.
- `xxd` (hex dump) command.
**Narrative:**
- The malicious process was running from a binary called `nemesis`.
- You need to reverse engineer it to find the hidden communication channel.
**Objective:**
1.  `strings /tmp/nemesis`.
2.  Find a hidden URL or command embedded in the binary.
3.  **Reveal:** The binary was communicating with a "C2" (Command & Control) server.

### Mission 10: The Final Lockdown (System Hardening)
**Concept:** The attacker still has a "rootkit" or a persistent backdoor. You must patch the system to lock them out forever.
**New Mechanics:**
- `chmod` (change permissions).
- `nano` or `vim` (simplified file editing).
**Narrative:**
- The attacker is trying to reconnect. You find a script in `/etc/init.d/` that opens a reverse shell on boot.
- You must disable this script and lock down the permissions.
**Objective:**
1.  Locate the malicious startup script.
2.  Remove the malicious lines or change permissions to `000` using `chmod`.
3.  **Reveal:** The system is finally secure. The "Ghost" is gone.

## Implementation Plan
1.  **Phase 1:** Implement Mission 6 (Privilege Escalation).
    - Add `su` command.
    - Update file system to support "owners" and "permissions".
2.  **Phase 2:** Implement Mission 7 (Web Security).
    - Enhance `curl` to support methods/data.
    - Add web files.
3.  **Phase 3:** Implement Mission 8 (Processes).
    - Add `ps` and `kill` commands.
    - Create a "process list" state.
4.  **Phase 4:** Implement Missions 9 & 10.
    - Add `strings`, `chmod`, and simple editing.

---
*Feedback Required: Do these difficulty jumps feel appropriate? Should we introduce a "Shop" or "Inventory" system for tools?*
