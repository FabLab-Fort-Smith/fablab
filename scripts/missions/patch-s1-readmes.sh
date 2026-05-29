#!/bin/bash
# Patch S1 missions: add README display on terminal start + rich story briefings.
# Run on the VPS: bash /root/patch-s1-readmes.sh
set -euo pipefail

MISSIONS_DIR="/root/vps/missions"

# ── Helpers ─────────────────────────────────────────────────────────────────

add_bashrc_hook() {
    local home="$1"
    local bashrc="$home/.bashrc"
    if ! grep -q 'cat ~/README.txt' "$bashrc" 2>/dev/null; then
        echo 'echo ""; cat ~/README.txt; echo ""' >> "$bashrc"
    fi
}

# ── Mission 01 (legacy — uses files/home/hacker/) ───────────────────────────

cat > "$MISSIONS_DIR/mission-01/files/home/hacker/readme.txt" << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 1: Initial Access             [ DIFFICULTY: EASY ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    CritterCodes <ceo@thelab.local>
TO:      Agent
SUBJECT: Welcome to the mainframe.

This is a training exercise. The Lab's mainframe has been
configured as a sandboxed environment for new agents to learn
the basics. Three flags are scattered across this filesystem.

Start with the directory listing. Check everything — including
hidden files and subdirectories. Nothing here is off-limits.

One flag to get you started: flag{welcome_to_the_lab}

                                          — CritterCodes // CEO

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: Read this file. Already done.
              flag{welcome_to_the_lab}

  [ ] Flag 2: Something is hidden in ~/projects/
              Try: ls -la ~/projects/ and explore subdirs.

  [ ] Flag 3: Check your environment variables carefully.
              Try: env | grep -i flag
                   cat ~/.bashrc
EOF

# Add bashrc hook to mission-01 hacker home
echo 'echo ""; cat ~/readme.txt; echo ""' >> "$MISSIONS_DIR/mission-01/files/home/hacker/.bashrc" 2>/dev/null || true

echo "  patched mission-01 files"

# ── Mission 02 (setup.sh — user: hacker) ─────────────────────────────────────

cat > /tmp/m02_readme.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 2: Initial Access (cont.)     [ DIFFICULTY: EASY ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    CritterCodes <ceo@thelab.local>
TO:      Agent
SUBJECT: Three flags. One log file.

The anomaly we caught during your onboarding? It left evidence
behind in the system logs. VECTOR — or whatever is out there —
generated 600 log entries overnight.

Three flags are embedded in /var/log/mission/system.log.
Manual reading isn't practical. You need grep, tail, and regex.

                                          — CritterCodes // CEO

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: Plain text, buried in 200 lines of noise.
              Try: grep 'flag{' /var/log/mission/system.log

  [ ] Flag 2: At the very end of the log.
              Try: tail -1 /var/log/mission/system.log

  [ ] Flag 3: Wrapped in a specific pattern — [FLAG]...[/FLAG]
              Try: grep -oP '(?<=\[FLAG\] ).*(?= \[/FLAG\])' \
                        /var/log/mission/system.log
EOF

# Patch setup.sh to use rich README and add bashrc hook
python3 << 'PYEOF'
import re

path = '/root/vps/missions/mission-02/setup.sh'
with open(path) as f:
    content = f.read()

# Replace the terse README echo
content = re.sub(
    r"echo \"Three flags inside.*?\" > /home/hacker/README\.txt",
    "cp /tmp/m02_readme.txt /home/hacker/README.txt",
    content,
    flags=re.DOTALL
)

# Add bashrc hook before chown line
if 'cat ~/README.txt' not in content:
    content = content.replace(
        "chown -R hacker:hacker /home/hacker",
        "echo 'echo \"\"; cat ~/README.txt; echo \"\"' >> /home/hacker/.bashrc\nchown -R hacker:hacker /home/hacker",
        1
    )

with open(path, 'w') as f:
    f.write(content)
PYEOF
echo "  patched mission-02 setup.sh"

# ── Mission 03 ───────────────────────────────────────────────────────────────

cat > /tmp/m03_readme.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 3: System Restoration         [ DIFFICULTY: EASY ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    Shyft <president@thelab.local>
TO:      Agent
SUBJECT: Root access. Database is down.

Main database went dark. There's a restore script but it needs
root. The key from Operation Blackout gets you in.

Three permission puzzles stand between you and the flags.
Think sudo, chmod, and sticky bits.

                                          — Shyft // President

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: A root-owned file. Use sudo to read it.
              Try: sudo cat /root/secret.txt

  [ ] Flag 2: A file with permissions 000. Fix them.
              Try: chmod 644 locked.txt && cat locked.txt

  [ ] Flag 3: In a sticky-bit directory in /tmp.
              Try: ls -la /tmp/sticky/ && cat /tmp/sticky/flag.txt
EOF

python3 << 'PYEOF'
import re
path = '/root/vps/missions/mission-03/setup.sh'
with open(path) as f:
    content = f.read()
content = re.sub(
    r'echo "Three flags using different permission tricks.*?" > /home/hacker/README\.txt',
    'cp /tmp/m03_readme.txt /home/hacker/README.txt',
    content,
    flags=re.DOTALL
)
if 'cat ~/README.txt' not in content:
    content = content.replace(
        "chown -R hacker:hacker /home/hacker",
        "echo 'echo \"\"; cat ~/README.txt; echo \"\"' >> /home/hacker/.bashrc\nchown -R hacker:hacker /home/hacker",
        1
    )
with open(path, 'w') as f:
    f.write(content)
PYEOF
echo "  patched mission-03 setup.sh"

# ── Mission 04 ───────────────────────────────────────────────────────────────

cat > /tmp/m04_readme.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 4: Network Discovery         [ DIFFICULTY: MEDIUM ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    0xb007ab1e <anon@thelab.local>
TO:      Agent
SUBJECT: Strange traffic on the internal network.

Not external. It's coming from inside the 10.0.0.x range.
Something on that subnet is alive that shouldn't be.

Three encoding challenges. Someone scrambled these flags
before they could reach us. Peel them back.

                                          — 0xb007ab1e

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: Encoded in base64.
              Try: cat challenge_a.txt | awk '{print $NF}' | base64 -d

  [ ] Flag 2: Reversed string.
              Try: cat challenge_b.txt | awk '{print $NF}' | rev

  [ ] Flag 3: Hex encoded.
              Try: cat challenge_c.txt | awk '{print $NF}' | xxd -r -p
EOF

python3 << 'PYEOF'
import re
path = '/root/vps/missions/mission-04/setup.sh'
with open(path) as f:
    content = f.read()
content = re.sub(
    r'echo "Three encoding challenges.*?" > /home/hacker/README\.txt',
    'cp /tmp/m04_readme.txt /home/hacker/README.txt',
    content,
    flags=re.DOTALL
)
if 'cat ~/README.txt' not in content:
    content = content.replace(
        "chown -R hacker:hacker /home/hacker",
        "echo 'echo \"\"; cat ~/README.txt; echo \"\"' >> /home/hacker/.bashrc\nchown -R hacker:hacker /home/hacker",
        1
    )
with open(path, 'w') as f:
    f.write(content)
PYEOF
echo "  patched mission-04 setup.sh"

# ── Mission 05 ───────────────────────────────────────────────────────────────

cat > /tmp/m05_readme.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 5: Information Gathering     [ DIFFICULTY: MEDIUM ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    Shyft <president@thelab.local>
TO:      Agent
SUBJECT: A locked archive. The password is on this machine.

Sensitive legacy documents are locked in vault.tar.gz.
Three layers deep — tar inside zip inside tar.gz.
Unpack every layer. The flags are waiting inside.

                                          — Shyft // President

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: Inside the outermost archive layer.
              Try: tar xzf vault.tar.gz && ls

  [ ] Flag 2: Buried two layers in.
              Try: unzip layer2.zip && tar xf layer3.tar

  [ ] Flag 3: In the side archive, extracted alongside layer3.
              Try: tar xf extra.tar

  HINT: Work through them in order — each layer reveals the next.
EOF

python3 << 'PYEOF'
import re
path = '/root/vps/missions/mission-05/setup.sh'
with open(path) as f:
    content = f.read()
content = re.sub(
    r'echo "Three flags buried in nested archives.*?" > /home/hacker/README\.txt',
    'cp /tmp/m05_readme.txt /home/hacker/README.txt',
    content,
    flags=re.DOTALL
)
if 'cat ~/README.txt' not in content:
    content = content.replace(
        "chown -R hacker:hacker /home/hacker",
        "echo 'echo \"\"; cat ~/README.txt; echo \"\"' >> /home/hacker/.bashrc\nchown -R hacker:hacker /home/hacker",
        1
    )
with open(path, 'w') as f:
    f.write(content)
PYEOF
echo "  patched mission-05 setup.sh"

# ── Mission 06 ───────────────────────────────────────────────────────────────

cat > /tmp/m06_readme.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 6: Privilege Escalation      [ DIFFICULTY: MEDIUM ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    CritterCodes <ceo@thelab.local>
TO:      Agent
SUBJECT: The ledger confirms it. Money flowing to Project Nemesis.

The transaction log is locked behind running processes.
Two daemons are hiding flags in their environment and /proc.

Run ./start.sh to spawn the background services, then hunt.

                                          — CritterCodes // CEO

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: In a process environment variable.
              Try: ./start.sh
                   ps aux | grep sleep
                   cat /proc/<PID>/environ | tr '\0' '\n'

  [ ] Flag 2: In another process's environment.
              Try: ps aux | grep python3
                   cat /proc/<PID>/environ | tr '\0' '\n'

  [ ] Flag 3: Run the hint script.
              Try: bash proc_hint.sh
EOF

python3 << 'PYEOF'
import re
path = '/root/vps/missions/mission-06/setup.sh'
with open(path) as f:
    content = f.read()
content = re.sub(
    r'echo "Run \./start\.sh first.*?" > /home/hacker/README\.txt',
    'cp /tmp/m06_readme.txt /home/hacker/README.txt',
    content,
    flags=re.DOTALL
)
if 'cat ~/README.txt' not in content:
    content = content.replace(
        "chown -R hacker:hacker /home/hacker",
        "echo 'echo \"\"; cat ~/README.txt; echo \"\"' >> /home/hacker/.bashrc\nchown -R hacker:hacker /home/hacker",
        1
    )
with open(path, 'w') as f:
    f.write(content)
PYEOF
echo "  patched mission-06 setup.sh"

# ── Mission 07 ───────────────────────────────────────────────────────────────

cat > /tmp/m07_readme.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 7: Web Security              [ DIFFICULTY: MEDIUM ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    Moon Captain <secretary@thelab.local>
TO:      Agent
SUBJECT: A debug endpoint was left in the nginx config.

A web server is waiting. Three flags hidden across different
attack surfaces — a restricted page, robots.txt, and HTTP headers.

Run ./start.sh to launch the server on port 8080, then explore.

                                          — Moon Captain

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: In a restricted admin page.
              Try: curl http://localhost:8080/admin/secret.html

  [ ] Flag 2: In robots.txt — a comment hiding a flag.
              Try: curl http://localhost:8080/robots.txt

  [ ] Flag 3: In an HTTP response header.
              Try: curl -I http://localhost:8080/
EOF

python3 << 'PYEOF'
import re
path = '/root/vps/missions/mission-07/setup.sh'
with open(path) as f:
    content = f.read()
content = re.sub(
    r'echo "Run \./start\.sh then explore.*?" > /home/hacker/README\.txt',
    'cp /tmp/m07_readme.txt /home/hacker/README.txt',
    content,
    flags=re.DOTALL
)
if 'cat ~/README.txt' not in content:
    content = content.replace(
        "chown -R hacker:hacker /home/hacker",
        "echo 'echo \"\"; cat ~/README.txt; echo \"\"' >> /home/hacker/.bashrc\nchown -R hacker:hacker /home/hacker",
        1
    )
with open(path, 'w') as f:
    f.write(content)
PYEOF
echo "  patched mission-07 setup.sh"

# ── Mission 08 ───────────────────────────────────────────────────────────────

cat > /tmp/m08_readme.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 8: Process Forensics           [ DIFFICULTY: HARD ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    0xb007ab1e <anon@thelab.local>
TO:      Agent
SUBJECT: Closing the backdoor triggered a dead man's switch.

Three flags hiding in fragments, a CSV, and a binary.
Reassemble them. Parse them. Extract them.

                                          — 0xb007ab1e

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: Split across files in fragments/
              Try: cat fragments/part_*.txt | tr -d '\n'; echo

  [ ] Flag 2: Hidden in data/scores.csv
              Try: awk -F, '$3 != "none" {print $3}' data/scores.csv

  [ ] Flag 3: Embedded in a binary file.
              Try: strings data/mystery.bin | grep flag
EOF

python3 << 'PYEOF'
import re
path = '/root/vps/missions/mission-08/setup.sh'
with open(path) as f:
    content = f.read()
content = re.sub(
    r'echo "Three flags: reassemble fragments/.*?" > /home/hacker/README\.txt',
    'cp /tmp/m08_readme.txt /home/hacker/README.txt',
    content,
    flags=re.DOTALL
)
if 'cat ~/README.txt' not in content:
    content = content.replace(
        "chown -R hacker:hacker /home/hacker",
        "echo 'echo \"\"; cat ~/README.txt; echo \"\"' >> /home/hacker/.bashrc\nchown -R hacker:hacker /home/hacker",
        1
    )
with open(path, 'w') as f:
    f.write(content)
PYEOF
echo "  patched mission-08 setup.sh"

# ── Mission 09 ───────────────────────────────────────────────────────────────

cat > /tmp/m09_readme.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 9: Binary Analysis             [ DIFFICULTY: HARD ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    CritterCodes <ceo@thelab.local>
TO:      Agent
SUBJECT: The captured nemesis binary is in /tmp.

It's been phoning home. I need the C2 server address — and
anything else it left readable in memory.

Use strings. Look for URLs, IPs, and embedded flag patterns.

                                          — CritterCodes // CEO

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: Reassemble fragments in fragments/.
              Try: cat fragments/part_*.txt | tr -d '\n'; echo

  [ ] Flag 2: Extract a field from data/scores.csv
              Try: awk -F, '$3 != "none" {print $3}' data/scores.csv

  [ ] Flag 3: Embedded string inside data/mystery.bin
              Try: strings data/mystery.bin | grep flag
EOF

python3 << 'PYEOF'
import re
path = '/root/vps/missions/mission-09/setup.sh'
with open(path) as f:
    content = f.read()
content = re.sub(
    r'echo "Three flags: reassemble fragments/.*?" > /home/hacker/README\.txt',
    'cp /tmp/m09_readme.txt /home/hacker/README.txt',
    content,
    flags=re.DOTALL
)
if 'cat ~/README.txt' not in content:
    content = content.replace(
        "chown -R hacker:hacker /home/hacker",
        "echo 'echo \"\"; cat ~/README.txt; echo \"\"' >> /home/hacker/.bashrc\nchown -R hacker:hacker /home/hacker",
        1
    )
with open(path, 'w') as f:
    f.write(content)
PYEOF
echo "  patched mission-09 setup.sh"

# ── Mission 10 ───────────────────────────────────────────────────────────────

cat > /tmp/m10_readme.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 10: System Hardening           [ DIFFICULTY: HARD ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    Shyft <president@thelab.local>
TO:      Agent
SUBJECT: Persistent startup script. Survives every reboot.

They planted a daemon that reconnects to the C2 server every
boot. Three escalation paths. GTFObins, SUID, and cron.

Use every privilege escalation technique you know.
This is the final mission. End Project Nemesis.

                                          — Shyft // President

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: Root-owned file. Escalate via sudo python3.
              Try: sudo python3 -c "print(open('/root/flag.txt').read())"

  [ ] Flag 2: Protected file readable by SUID binary in /tmp.
              Try: /tmp/suid_cat /root/suid_secret.txt

  [ ] Flag 3: Inspect the cron job.
              Try: sudo python3 -c "print(open('/etc/cron.d/mission').read())"
EOF

python3 << 'PYEOF'
import re
path = '/root/vps/missions/mission-10/setup.sh'
with open(path) as f:
    content = f.read()
content = re.sub(
    r'echo "Three escalation paths.*?" > /home/hacker/README\.txt',
    'cp /tmp/m10_readme.txt /home/hacker/README.txt',
    content,
    flags=re.DOTALL
)
if 'cat ~/README.txt' not in content:
    content = content.replace(
        "chown -R hacker:hacker /home/hacker",
        "echo 'echo \"\"; cat ~/README.txt; echo \"\"' >> /home/hacker/.bashrc\nchown -R hacker:hacker /home/hacker",
        1
    )
with open(path, 'w') as f:
    f.write(content)
PYEOF
echo "  patched mission-10 setup.sh"

# ── Rebuild all S1 images ────────────────────────────────────────────────────

echo ""
echo "=== Rebuilding S1 images ==="
FAILED=()
for m in mission-01 mission-02 mission-03 mission-04 mission-05 \
          mission-06 mission-07 mission-08 mission-09 mission-10; do
    echo "  Building crittercodes/$m:latest ..."
    if docker build --no-cache -t "crittercodes/$m:latest" "$MISSIONS_DIR/$m/" > /tmp/build_$m.log 2>&1; then
        echo "  ✓ crittercodes/$m"
    else
        echo "  ✗ $m FAILED — see /tmp/build_$m.log"
        FAILED+=("$m")
    fi
done

echo ""
if [ ${#FAILED[@]} -eq 0 ]; then
    echo "All 10 S1 missions rebuilt successfully."
else
    echo "FAILED: ${FAILED[*]}"
    exit 1
fi
