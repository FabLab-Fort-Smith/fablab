# The Lab - Mission Hints & Solutions (Testing Guide)

This document contains solutions and hints for all currently implemented missions in The Lab terminal game.

## Mission 1: Initial Access
**Objective:** Find 3 hidden flags to gain access to the system.

1.  **Flag 1:** `flag{welcome_to_the_lab}`
    *   **Location:** `~/readme.txt`
    *   **Command:** `cat readme.txt`
    *   **Hint:** Read the welcome message.

2.  **Flag 2:** `flag{hack_the_planet}`
    *   **Location:** `~/.env` (Hidden file)
    *   **Command:** `ls -a` to see it, then `cat .env`
    *   **Hint:** Check for hidden configuration files in the home directory.

3.  **Flag 3:** `flag{curiosity_killed_the_cat_but_satisfaction_brought_it_back}`
    *   **Location:** `~/projects/secret_plans.txt`
    *   **Command:** `cd projects`, then `cat secret_plans.txt`
    *   **Hint:** Explore the `projects` directory.

---

## Mission 2: Operation Blackout
**Objective:** Decrypt the payload file to override the lockout.

1.  **Find the Key:**
    *   **Location:** `/var/log/auth.log`
    *   **Command:** `cd /var/log`, then `cat auth.log`
    *   **Key:** `super_secret_admin_key_99`
    *   **Hint:** The briefing mentions the key was in the authentication logs.

2.  **Decrypt the Payload:**
    *   **Location:** `~/missions/operation_blackout/payload.enc`
    *   **Command:** `decrypt ~/missions/operation_blackout/payload.enc super_secret_admin_key_99`
    *   **Flag:** `flag{protocol_override_initiated}`

---

## Mission 3: System Restoration
**Objective:** Restore the database configuration.

1.  **Investigate the Tool:**
    *   **Location:** `/usr/local/bin/restore_system.sh`
    *   **Command:** `cat /usr/local/bin/restore_system.sh`
    *   **Hint:** The script mentions a missing config file.

2.  **Find the Backup:**
    *   **Location:** `/var/backups/config_backup.old`
    *   **Command:** `cd /var/backups`, then `cat config_backup.old`
    *   **Flag:** `flag{system_restoration_imminent}`

3.  **Run the Restoration Script:**
    *   **Requirement:** Must be run as root.
    *   **Command:** `su root` (Password: `super_secret_admin_key_99`)
    *   **Command:** `./restore_system.sh` (or `/usr/local/bin/restore_system.sh`)

---

## Mission 4: Network Discovery
**Objective:** Map the internal network and find vulnerable hosts.

1.  **Identify Targets:**
    *   **Location:** `/etc/hosts`
    *   **Command:** `cat /etc/hosts`
    *   **Targets:** `10.0.0.5` (printer_farm), `10.0.0.6` (laser_cutter)

2.  **Scan Targets:**
    *   **Command:** `curl 10.0.0.5`
    *   **Flag:** `flag{internal_network_mapped}`
    *   **Note:** `curl 10.0.0.6` returns 403 Forbidden (no flag).

---

## Mission 5: Information Gathering
**Objective:** Decrypt the secure archive to uncover the Lab's history.

1.  **Locate the Secure Archive:**
    *   **Location:** `/var/backups/secure_data.zip`
    *   **Hint:** Check the `/var/backups` directory.

2.  **Find the Password:**
    *   **Step 1:** Read `/etc/shadow` to find the hash for user `shyft`.
    *   **Step 2:** Use the `crack` tool to recover the password.
    *   **Command:** `crack <hash_string> /usr/share/dict/words`
    *   **Password:** `maker`

3.  **Extract the Archive:**
    *   **Command:** `unzip /var/backups/secure_data.zip -p maker`
    *   **Result:** Files extracted to `~/extracted/`.

4.  **Retrieve Flags:**
    *   **Flag 1:** `flag{ache_building_legacy}` in `~/extracted/history.txt`
    *   **Flag 2:** `flag{shell_on_the_border_forever}` in `~/extracted/community.txt`
    *   **Flag 3:** `flag{admin_access_granted}` in `~/extracted/board_minutes.txt`

---

## Mission 6: Privilege Escalation
**Objective:** Access the Treasurer's ledger to investigate suspicious transactions.

1.  **Identify the Target:**
    *   **User:** `0xb007ab1e` (Treasurer)
    *   **Hint:** The email mentions the password is the username in reverse leetspeak.

2.  **Switch User:**
    *   **Command:** `su 0xb007ab1e`
    *   **Password:** `e1ba700b` (Reverse of `b007ab1e`)

3.  **Access the Ledger:**
    *   **Location:** `~/ledger.dat` (After switching user)
    *   **Command:** `cat ledger.dat`
    *   **Flag:** `flag{follow_the_money_trail}`

---

## Mission 7: Web Security
**Objective:** Find and exploit the backdoor in the web server.

1.  **Find the Backdoor:**
    *   **Location:** `/var/www/html/index.html`
    *   **Command:** `cat /var/www/html/index.html`
    *   **Hint:** Look for comments in the HTML code.
    *   **Discovery:** `<!-- TODO: Remove /api/debug endpoint... -->`

2.  **Exploit the Endpoint:**
    *   **Command:** `curl -X POST www.fablabfortsmith.org/api/debug`
    *   **Flag:** `flag{api_backdoor_discovered}`

---

## Mission 8: Process Forensics
**Objective:** Stop the malicious process causing high CPU usage.

1.  **Identify the Process:**
    *   **Command:** `ps -aux`
    *   **Suspicious Process:** PID `9999` - `./nemesis_v1` (High CPU)

2.  **Terminate the Process:**
    *   **Command:** `kill 9999`
    *   **Flag:** `flag{logic_bomb_defused}`

---

## Mission 9: Binary Analysis
**Objective:** Analyze the captured binary to find the C2 server.

1.  **Locate the Binary:**
    *   **Location:** `/tmp/nemesis`
    *   **Hint:** The email says the binary was captured here.

2.  **Analyze Strings:**
    *   **Command:** `strings /tmp/nemesis`
    *   **Flag:** `flag{c2_server_identified}`

---

## Mission 10: System Hardening
**Objective:** Secure the system by removing the persistent backdoor.

1.  **Locate the Startup Script:**
    *   **Location:** `/etc/init.d/S99update_check`
    *   **Command:** `ls /etc/init.d/` then `cat` files to find the malicious one.
    *   **Hint:** Look for a script that connects to the C2 server (192.168.1.99).

2.  **Disable the Script:**
    *   **Step 1 (Escalate Privileges):** `su root`
    *   **Password:** `super_secret_admin_key_99` (Found in Mission 2)
    *   **Step 2 (Action):**
        *   **Option A (Delete):** `rm /etc/init.d/S99update_check`
        *   **Option B (Lock):** `chmod 000 /etc/init.d/S99update_check`
    *   **Flag:** `flag{system_hardened_ghost_busted}`

---

## Bonus: Developer Easter Egg
**Objective:** Find the hidden developer secret.

1.  **Method 1 (Command):**
    *   **Command:** `crittercodes`

2.  **Method 2 (User):**
    *   **Command:** `su crittercodes`
    *   **Password:** `crittercodes`

3.  **Reward:**
    *   **Flag:** `flag{devs_are_watching}`

