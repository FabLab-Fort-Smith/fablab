#!/usr/bin/env python3
"""
Season 1 Holodeck CTF Redesign — Container Patch Script
Patches all 10 mission setup.sh files with:
  - New narrative-driven READMEs (story-motivated, no Try: lines)
  - Easter egg files (character lore, G-HOST breadcrumbs, Nemesis artifacts, world-building)
  - Cross-mission callback values baked into container files
  - M07 start.sh env injection (NEMESIS_KEY=0p3r4t10n for Callback C)
Run on VPS: python3 /root/new-readmes.py
"""
import re
import subprocess

MISSIONS_DIR = '/root/vps/missions'

# ── README content ────────────────────────────────────────────────────────────
# Format: narrative email (FROM/TO/SUBJECT), 2-3 para body, THREE FLAGS section.
# No "Try:" lines. Narrative hints only. Each sender is a different character.

READMES = {
    'mission-01': (
        "╔══════════════════════════════════════════════════════════════╗\n"
        "║  SEASON 1 — HACK THE LAB                                    ║\n"
        "║  Mission 1: Operation Cold Boot        [ DIFFICULTY: EASY ] ║\n"
        "╚══════════════════════════════════════════════════════════════╝\n"
        "\n"
        "FROM:    CritterCodes <ceo@thelab.local>\n"
        "TO:      Agent\n"
        "SUBJECT: Welcome to The Lab. First login. Find the flags.\n"
        "\n"
        "You've landed on the mainframe as a guest. Three flags are\n"
        "hidden across this filesystem. This is your orientation —\n"
        "the environment is live, the flags are real, and nothing\n"
        "here is handed to you.\n"
        "\n"
        "Read everything. Explore everywhere. Something generated an\n"
        "anomalous read pattern across /home before your session\n"
        "initialized. We don't know what it was. It may have left\n"
        "something behind.\n"
        "\n"
        "                                          — CritterCodes // CEO\n"
        "\n"
        "──────────────────────────────────────────────────────────────\n"
        "THREE FLAGS. FIND THEM ALL.\n"
        "\n"
        "  Start here — in your home directory. The first flag doesn't\n"
        "  hide. It's in a file you're meant to read. Read everything\n"
        "  you find, not just what looks like a flag.\n"
        "\n"
        "  Your session has environment variables attached to it.\n"
        "  Every process does. There are commands that surface them.\n"
        "  One flag is living in your session environment right now.\n"
        "\n"
        "  Directories hold more directories. The filesystem has depth.\n"
        "  A file doesn't have to be in your home folder to belong\n"
        "  to this mission. Start in /home/hacker. Look everywhere.\n"
        "\n"
        "flag{welcome_to_the_lab}"
    ),
    'mission-02': (
        "╔══════════════════════════════════════════════════════════════╗\n"
        "║  SEASON 1 — HACK THE LAB                                    ║\n"
        "║  Mission 2: Operation Dead Drop        [ DIFFICULTY: EASY ] ║\n"
        "╚══════════════════════════════════════════════════════════════╝\n"
        "\n"
        "FROM:    CritterCodes <ceo@thelab.local>\n"
        "TO:      Agent\n"
        "SUBJECT: Something was here before you.\n"
        "\n"
        "We detected anomalous read patterns across /home before your\n"
        "session initialized. Whatever was in this system was navigating\n"
        "directories we didn't know to look at — hidden paths, invisible\n"
        "files. It left things behind.\n"
        "\n"
        "Three flags are scattered across this filesystem. Some of them\n"
        "don't appear unless you ask the right way. The default listing\n"
        "won't show you everything that exists here.\n"
        "\n"
        "                                          — CritterCodes // CEO\n"
        "\n"
        "──────────────────────────────────────────────────────────────\n"
        "THREE FLAGS. FIND THEM ALL.\n"
        "\n"
        "  Not every file announces itself. There's a convention for\n"
        "  making files invisible to standard listings — files and\n"
        "  directories that begin with a certain character don't appear\n"
        "  by default. There's a way to see them.\n"
        "\n"
        "  Hidden directories have contents too. Hidden directories\n"
        "  can have subdirectories. Those subdirectories can have files.\n"
        "  Follow the tree all the way down.\n"
        "\n"
        "  Some paths are so deep that listing won't reach them.\n"
        "  There are tools built specifically to search an entire\n"
        "  filesystem recursively. You'll need one. Learn it.\n"
        "\n"
        "  Read everything you find, not just what looks like a flag.\n"
        "  Some files contain information that matters later."
    ),
    'mission-03': (
        "╔══════════════════════════════════════════════════════════════╗\n"
        "║  SEASON 1 — HACK THE LAB                                    ║\n"
        "║  Mission 3: Operation Signal Noise     [ DIFFICULTY: EASY ] ║\n"
        "╚══════════════════════════════════════════════════════════════╝\n"
        "\n"
        "FROM:    CritterCodes <ceo@thelab.local>\n"
        "TO:      Agent\n"
        "SUBJECT: The anomaly left evidence behind.\n"
        "\n"
        "Something generated hundreds of log entries overnight.\n"
        "Three flags are buried inside /var/log/mission/system.log.\n"
        "The file is several hundred lines long. Reading it manually\n"
        "is the wrong approach.\n"
        "\n"
        "The right approach is filtering: find patterns in text without\n"
        "reading every line yourself. This is one of the most essential\n"
        "skills on the command line. Learn it here.\n"
        "\n"
        "Explore the rest of the machine too. The logs aren't the only\n"
        "thing that was left behind.\n"
        "\n"
        "                                          — CritterCodes // CEO\n"
        "\n"
        "──────────────────────────────────────────────────────────────\n"
        "THREE FLAGS. FIND THEM ALL.\n"
        "\n"
        "  One flag is embedded somewhere in the lines of noise.\n"
        "  You're looking for a specific string pattern. There are\n"
        "  tools that search files for text matching a pattern.\n"
        "  They don't read the whole file — they find your needle.\n"
        "\n"
        "  One flag is at the very end of the log. The file is too\n"
        "  long to scroll through. There are tools for reading just\n"
        "  the tail of a file without loading everything before it.\n"
        "\n"
        "  One flag is wrapped in a specific bracket structure.\n"
        "  You'll recognize it when you see the lines around it.\n"
        "  The same search tool can extract only the matching text."
    ),
    'mission-04': (
        "╔══════════════════════════════════════════════════════════════╗\n"
        "║  SEASON 1 — HACK THE LAB                                    ║\n"
        "║  Mission 4: Operation Lockpick         [ DIFFICULTY: EASY ] ║\n"
        "╚══════════════════════════════════════════════════════════════╝\n"
        "\n"
        "FROM:    Shyft <president@thelab.local>\n"
        "TO:      Agent\n"
        "SUBJECT: Three locks. Three different keys.\n"
        "\n"
        "Files on this system are locked in different ways — by\n"
        "ownership, by permission bits, by location. You'll need\n"
        "to understand the Unix permission model to get through.\n"
        "\n"
        "Note: the sudo configuration on this machine was modified\n"
        "by an unknown party before your session began. We don't\n"
        "know who. Check what you're authorized to do — it may\n"
        "be more than you expect.\n"
        "\n"
        "                                          — Shyft // President\n"
        "\n"
        "──────────────────────────────────────────────────────────────\n"
        "THREE FLAGS. FIND THEM ALL.\n"
        "\n"
        "  One flag is owned by root. You can't read root's files\n"
        "  directly — but there are ways to run commands with\n"
        "  elevated privileges if the system allows it.\n"
        "  Before guessing, ask the system what you're authorized to do.\n"
        "\n"
        "  One flag is in a file where every permission bit has been\n"
        "  stripped to zero. The file exists. You just can't read it\n"
        "  in its current state. Permissions can be changed by someone\n"
        "  with the right to change them.\n"
        "\n"
        "  One flag lives in /tmp — inside a directory with a special\n"
        "  permission bit that controls who can write there.\n"
        "  List the directory carefully. Look at all the bits."
    ),
    'mission-05': (
        "╔══════════════════════════════════════════════════════════════╗\n"
        "║  SEASON 1 — HACK THE LAB                                    ║\n"
        "║  Mission 5: Operation Cipher Peel    [ DIFFICULTY: MEDIUM ] ║\n"
        "╚══════════════════════════════════════════════════════════════╝\n"
        "\n"
        "FROM:    0xb007ab1e <anon@thelab.local>\n"
        "TO:      Agent\n"
        "SUBJECT: Intercepted transmissions. Three of them. All scrambled.\n"
        "\n"
        "These payloads were intercepted on the internal network before\n"
        "they could be transmitted. Three challenge files. Each one\n"
        "looks broken — it isn't. Each has been passed through a\n"
        "different transformation.\n"
        "\n"
        "Encoding is not encryption. There's no key required — just\n"
        "the right reversal tool. Identify what was done to the data.\n"
        "Find the tool that undoes it. Peel it back.\n"
        "\n"
        "                                          — 0xb007ab1e\n"
        "\n"
        "──────────────────────────────────────────────────────────────\n"
        "THREE FLAGS. FIND THEM ALL.\n"
        "\n"
        "  challenge_a.txt — the data is encoded using one of the most\n"
        "  common encoding schemes in computing. You've seen it in URLs\n"
        "  and email attachments. It uses a 64-character alphabet and\n"
        "  often ends with padding characters. There is a command\n"
        "  specifically for decoding it.\n"
        "\n"
        "  challenge_b.txt — the characters are all correct. The order\n"
        "  is not. Everything is backwards. The tool you need does\n"
        "  exactly what its name implies.\n"
        "\n"
        "  challenge_c.txt — sixteen possible values per character.\n"
        "  A base-16 number system. Also known as hex. The data looks\n"
        "  like pairs of hex digits. A tool exists to convert raw hex\n"
        "  back to readable text.\n"
        "\n"
        "  Read the files you find around these challenges too.\n"
        "  Not everything in this environment is a flag."
    ),
    'mission-06': (
        "╔══════════════════════════════════════════════════════════════╗\n"
        "║  SEASON 1 — HACK THE LAB                                    ║\n"
        "║  Mission 6: Operation Nested Doll    [ DIFFICULTY: MEDIUM ] ║\n"
        "╚══════════════════════════════════════════════════════════════╝\n"
        "\n"
        "FROM:    CritterCodes <ceo@thelab.local>\n"
        "TO:      Agent\n"
        "SUBJECT: Project Nemesis was hiding intelligence in nested archives.\n"
        "\n"
        "vault.tar.gz is in your home directory. Open it.\n"
        "\n"
        "What you find inside is not the end. Each layer you unpack\n"
        "reveals another format underneath. The flags are at the bottom\n"
        "of the stack. Keep unpacking until there's nothing left to open.\n"
        "\n"
        "You may have already encountered the key to the inner lock.\n"
        "Check what you've found in previous missions before you\n"
        "assume you need something new.\n"
        "\n"
        "                                          — CritterCodes // CEO\n"
        "\n"
        "──────────────────────────────────────────────────────────────\n"
        "THREE FLAGS. FIND THEM ALL.\n"
        "\n"
        "  Start with vault.tar.gz. The extension tells you the format —\n"
        "  a tar archive, compressed with gzip. Standard tools handle\n"
        "  both. Extract it.\n"
        "\n"
        "  Inside you'll find more archives. Different formats.\n"
        "  If you're not sure what a file actually is, there's a command\n"
        "  that identifies file types by their content — not their name.\n"
        "  Names can lie. Content doesn't.\n"
        "\n"
        "  One of the inner archives is locked. The password isn't\n"
        "  here — it's something you've already found. Look at what\n"
        "  you've collected across this investigation.\n"
        "\n"
        "  Every layer has a next layer until it doesn't.\n"
        "  Don't stop early."
    ),
    'mission-07': (
        "╔══════════════════════════════════════════════════════════════╗\n"
        "║  SEASON 1 — HACK THE LAB                                    ║\n"
        "║  Mission 7: Operation Ghost Signal   [ DIFFICULTY: MEDIUM ] ║\n"
        "╚══════════════════════════════════════════════════════════════╝\n"
        "\n"
        "FROM:    Moon Captain <ops@thelab.local>\n"
        "TO:      Agent\n"
        "SUBJECT: Something is running that shouldn't be.\n"
        "\n"
        "I've been hunting this signal for weeks. I think I finally\n"
        "have a fix on it. There's a process running on this machine\n"
        "that's masquerading as a legitimate system daemon.\n"
        "\n"
        "Run ./start.sh first to surface the activity. Then hunt.\n"
        "Running processes leave evidence in multiple places — they\n"
        "carry environment variables, the /proc filesystem exposes\n"
        "their internals, and they create temporary files. Read the\n"
        "process environment carefully. All of it.\n"
        "\n"
        "                                          — Moon Captain // Ops\n"
        "\n"
        "──────────────────────────────────────────────────────────────\n"
        "THREE FLAGS. FIND THEM ALL.\n"
        "\n"
        "  Run ./start.sh before anything else. It starts the activity\n"
        "  you're hunting. Without it, there's nothing to find.\n"
        "\n"
        "  After you start it: something is running that shouldn't be.\n"
        "  Find out what processes are active on this system. There are\n"
        "  tools for listing all running processes with their details.\n"
        "\n"
        "  Running processes carry environment variables. The /proc\n"
        "  filesystem exposes the internals of every running process —\n"
        "  including their full environment. Read it completely.\n"
        "  There may be more in there than just the flag.\n"
        "\n"
        "  Processes also write temporary files. Check the obvious\n"
        "  places where temporary data lives on a Linux system."
    ),
    'mission-08': (
        "╔══════════════════════════════════════════════════════════════╗\n"
        "║  SEASON 1 — HACK THE LAB                                    ║\n"
        "║  Mission 8: Operation Open Window      [ DIFFICULTY: HARD ] ║\n"
        "╚══════════════════════════════════════════════════════════════╝\n"
        "\n"
        "FROM:    Shyft <president@thelab.local>\n"
        "TO:      Agent\n"
        "SUBJECT: Nemesis stood up a web server inside the network.\n"
        "\n"
        "Run ./start.sh to bring it online. Three flags hidden\n"
        "somewhere in the server — not all of them in obvious places.\n"
        "\n"
        "Explore it the way an attacker would. Not everything on a web\n"
        "server is linked from the front page. Some paths are invisible\n"
        "until you know to ask for them. The server may also know about\n"
        "internal addresses you've encountered before in this\n"
        "investigation.\n"
        "\n"
        "                                          — Shyft // President\n"
        "\n"
        "──────────────────────────────────────────────────────────────\n"
        "THREE FLAGS. FIND THEM ALL.\n"
        "\n"
        "  Run ./start.sh first. The server starts on a local port.\n"
        "  The command-line tool for making HTTP requests is curl.\n"
        "  Learn its flags — there are several useful ones for recon.\n"
        "\n"
        "  Web servers often publish a file that tells crawlers which\n"
        "  paths NOT to index. This file has a standard name and lives\n"
        "  at the root of the server. It's often a map of the parts\n"
        "  they don't want you to find.\n"
        "\n"
        "  HTTP responses include headers — metadata sent before the\n"
        "  content itself. There's a way to ask curl to show you only\n"
        "  the response headers. One flag lives there.\n"
        "\n"
        "  Some pages exist but aren't linked from anywhere. You have\n"
        "  to know the path to request them. You may already know it."
    ),
    'mission-09': (
        "╔══════════════════════════════════════════════════════════════╗\n"
        "║  SEASON 1 — HACK THE LAB                                    ║\n"
        "║  Mission 9: Operation Binary Autopsy [ DIFFICULTY: MEDIUM ] ║\n"
        "╚══════════════════════════════════════════════════════════════╝\n"
        "\n"
        "FROM:    CritterCodes <ceo@thelab.local>\n"
        "TO:      Agent\n"
        "SUBJECT: The evidence has been obfuscated.\n"
        "\n"
        "The flags in this mission aren't in plain text files. They've\n"
        "been split, structured, or compiled. Each one requires a\n"
        "different approach to extract.\n"
        "\n"
        "This is where the command line stops being a tool for reading\n"
        "files and becomes a tool for processing data. The binary in\n"
        "particular tells you more than just the flag — read all of its\n"
        "output carefully.\n"
        "\n"
        "                                          — CritterCodes // CEO\n"
        "\n"
        "──────────────────────────────────────────────────────────────\n"
        "THREE FLAGS. FIND THEM ALL.\n"
        "\n"
        "  One flag has been split across multiple fragment files.\n"
        "  The pieces are numbered. Reassembling them is a scripting\n"
        "  exercise — process a collection of files in the right order,\n"
        "  concatenate their contents, produce output.\n"
        "\n"
        "  One flag is embedded in a structured data file as a specific\n"
        "  field. Structured data has columns. There are tools designed\n"
        "  to work with delimited text and extract specific fields\n"
        "  without reading everything manually.\n"
        "\n"
        "  One flag was compiled into a binary. Binaries aren't plain\n"
        "  text, but they often contain readable strings embedded in\n"
        "  them. There is a standard Unix tool whose entire purpose is\n"
        "  extracting those strings. Read all of its output — there\n"
        "  may be more than one thing worth noting."
    ),
    'mission-10': (
        "╔══════════════════════════════════════════════════════════════╗\n"
        "║  SEASON 1 — HACK THE LAB                                    ║\n"
        "║  Mission 10: Operation Root Cause      [ DIFFICULTY: HARD ] ║\n"
        "╚══════════════════════════════════════════════════════════════╝\n"
        "\n"
        "FROM:    CritterCodes <ceo@thelab.local>\n"
        "TO:      Agent\n"
        "SUBJECT: You're closer to root than you realize.\n"
        "\n"
        "Three flags in this mission. Each one requires root access\n"
        "through a different vector. The system will tell you more\n"
        "than you expect if you ask the right questions.\n"
        "\n"
        "You already know the persistence mechanism's name. You found\n"
        "it in the binary. The question is whether you can reach it.\n"
        "This is the final mission of Season 1.\n"
        "\n"
        "                                          — CritterCodes // CEO\n"
        "\n"
        "──────────────────────────────────────────────────────────────\n"
        "THREE FLAGS. FIND THEM ALL.\n"
        "\n"
        "  Before you start guessing, ask the system what you're\n"
        "  already authorized to do with elevated privileges.\n"
        "  The answer might surprise you. This is always the\n"
        "  first question.\n"
        "\n"
        "  Some executables carry a special permission bit — a bit\n"
        "  that makes them run with the file owner's privileges\n"
        "  regardless of who executes them. These binaries are a\n"
        "  classic privilege escalation vector. Find them.\n"
        "\n"
        "  Root has a schedule. Automated tasks run as root on a\n"
        "  timer. Root's scheduled tasks are not always hidden.\n"
        "  Look at where scheduled tasks are configured on this\n"
        "  system. You already know what you're looking for."
    ),
}

# ── Easter egg file content ───────────────────────────────────────────────────
# Each entry: list of (path, content) tuples.
# Files in /home/hacker get covered by the existing chown -R hacker sweep.
# Files outside /home/hacker get explicit chown lines injected after their heredoc.

EASTER_EGGS = {
    'mission-01': [
        ('/home/hacker/.bash_history',
         "ls\n"
         "whoami\n"
         "cat README.txt\n"
         "ls -la\n"
         "cd projects\n"
         "ls\n"
         "cat secret_plans.txt\n"
         "env\n"
         "# note to self: change password from 'hunter2' to something good\n"
         "exit\n"),

        ('/home/hacker/projects/critter_notes.txt',
         "TODO:\n"
         "- fix the coffee machine script\n"
         "  (the one that pings the espresso endpoint every 5 min)\n"
         "  (Shyft says it's 'wasting packets')\n"
         "  (Shyft is wrong)\n"
         "- respond to Moon Captain about the moonbase proposal\n"
         "  (still not sure if it's a joke)\n"
         "- audit lab access logs before next board meeting\n"
         "- find out who keeps eating the labeled food in the fridge\n"),

        ('/home/hacker/.welcome_from_ghost',
         "// I was here first.\n"
         "// Don't worry about that.\n"
         "// Find the flags. Learn the terrain.\n"
         "// I'll be watching.\n"
         "//                             — G\n"),

        ('/home/hacker/lab_culture.txt',
         "THE LAB — HOUSE RULES\n"
         "──────────────────────\n"
         "1. Don't brick the laser cutter again.\n"
         "   (You know who you are.)\n"
         "2. The 3D printer is not a food printer.\n"
         "   It has never been a food printer.\n"
         "   Stop asking.\n"
         "3. All hacking is educational until proven otherwise.\n"
         "4. The espresso machine is not on the lab network.\n"
         "   It will never be on the lab network.\n"
         "   (This is documented.)\n"
         "5. Moon Captain's moonbase proposal is still under review.\n"
         "   It has been under review for 14 months.\n"),

        ('/home/hacker/projects/moonbase.txt',
         "PROJECT MOONBASE — PHASE PLANNING DOCUMENT\n"
         "Moon Captain // Ops Division\n"
         "\n"
         "Phase 1: Acquire materials (sourcing from surplus — on track)\n"
         "Phase 2: Convince Shyft it's not a safety hazard\n"
         "         (status: ongoing, day 427)\n"
         "Phase 3: Build the moonbase\n"
         "Phase 4: ???\n"
         "Phase 5: Profit / scientific achievement / both\n"
         "\n"
         "CritterCodes has asked that I document that he has not\n"
         "officially approved this project. He also has not rejected it.\n"
         "I am choosing to interpret this as implicit support.\n"),
    ],

    'mission-02': [
        ('/home/hacker/.ghost_notes/mission_log.txt',
         "// ARRIVAL LOG — INTERNAL\n"
         "// Arrived in this system 47 days before agent deployment.\n"
         "// Left three things. Two you'll find easily.\n"
         "// One you won't find unless you look where people don't look.\n"
         "// I've been watching how agents approach the filesystem.\n"
         "// Most people list the home directory and stop.\n"
         "// The ones who go further — they find everything.\n"
         "//                             — G\n"),

        ('/home/hacker/.ghost_notes/dropped_creds.txt',
         "# cached session fragment — do not delete\n"
         "# source: nemesis internal auth relay\n"
         "# status: session expired, credentials still valid\n"
         "user=arc_welder\n"
         "session_token=EXPIRED\n"
         "note: arc_welder access still valid on archive systems\n"
         "note: this account has vault read permissions\n"),

        ('/home/hacker/.trash/.deleted_readme',
         "This file was going to be the README but it got replaced.\n"
         "If you're reading this, you went looking.\n"
         "Good.\n"
         "That's the right instinct. Keep doing that.\n"),

        ('/var/tmp/nemesis_staging.txt',
         "STAGING NOTES — OPERATION DEAD DROP\n"
         "DO NOT COMMIT TO REPOSITORY\n"
         "──────────────────────────────────\n"
         "Drop point: /home/hacker (hidden dirs)\n"
         "Operator: arc_welder\n"
         "arc_welder has vault access on archive systems\n"
         "Next operation: archive the ledger before they find it\n"
         "Timeline: before the next agent deployment\n"
         "\n"
         "Note: G-HOST may have already been through here.\n"
         "Assume this environment is compromised.\n"),

        ('/home/hacker/equipment_log.txt',
         "THE LAB — EQUIPMENT INVENTORY (current)\n"
         "Last updated: Shyft\n"
         "──────────────────────────────────────\n"
         "CNC router          — operational, needs new bit\n"
         "Laser cutter        — operational, DO NOT use on acrylic\n"
         "                      without ventilation. Seriously.\n"
         "Resin printer       — Shyft's, do not touch\n"
         "FDM printers x3     — one is broken, two are fine,\n"
         "                      nobody knows which is which\n"
         "Soldering stations  — 4 working, 1 'decorative'\n"
         "Oscilloscope        — borrowed by 0xb007ab1e, status unknown\n"
         "Espresso machine    — NOT lab equipment, belongs to CC\n"),
    ],

    'mission-03': [
        ('/etc/hosts.bak',
         "# /etc/hosts backup — do not delete\n"
         "# saved by Moon Captain during network audit\n"
         "# ────────────────────────────────────────\n"
         "127.0.0.1   localhost\n"
         "10.13.37.7  nemesis.local  # C2 candidate — unconfirmed\n"
         "                           # do not remove — MC\n"),

        ('/home/hacker/analysis_notes.txt',
         "LOG ANALYSIS — PRELIMINARY FINDINGS\n"
         "0xb007ab1e // 04:30 session\n"
         "────────────────────────────────────\n"
         "Scanning log entries 2am-4am window.\n"
         "Pattern: anomalous entries at irregular intervals.\n"
         "Not random — someone wrote a script to generate these.\n"
         "Whoever it is knows our log rotation schedule.\n"
         "\n"
         "Also found a backup hosts file in /etc.\n"
         "10.13.37.7 mapped to nemesis.local.\n"
         "That IP is not on any asset list.\n"
         "Moon Captain put the note there. Ask her about it.\n"),

        ('/home/hacker/.bash_history',
         "grep -i 'error' /var/log/mission/system.log\n"
         "tail -100 /var/log/mission/system.log\n"
         "grep 'flag' /var/log/mission/system.log\n"
         "ls /var/log/mission/\n"
         "ls /etc/\n"
         "cat /etc/hosts.bak\n"
         "# found something in the hosts backup\n"
         "ls -la /home/hacker/\n"),

        ('/var/log/mission/ghost_access.log',
         "[02:14:31] G-HOST: accessed /var/log/mission/system.log\n"
         "[02:14:33] G-HOST: read 2340 lines — analysis complete\n"
         "[02:14:34] G-HOST: purge attempt #1 detected — rollback initiated\n"
         "[02:14:34] G-HOST: file preserved\n"
         "[03:41:07] G-HOST: purge attempt #2 detected — rollback initiated\n"
         "[03:41:08] G-HOST: file preserved\n"
         "[03:41:09] G-HOST: note — if you are reading this log,\n"
         "           you went looking in the right places.\n"
         "           keep going.\n"),

        ('/home/hacker/shyft_memo.txt',
         "INTERNAL MEMO\n"
         "FROM: Shyft\n"
         "TO: CritterCodes\n"
         "RE: Anomalous Log Access\n"
         "\n"
         "I've been looking at log access patterns for two weeks.\n"
         "Something is reading our system.log every night between\n"
         "2am and 3am. It's not any of us — I checked the auth logs.\n"
         "\n"
         "CritterCodes says to document it.\n"
         "I say to shut it down.\n"
         "We are not going to agree on this.\n"
         "\n"
         "Documenting it, as instructed.\n"),

        ('/tmp/nemesis_log_injector',
         ""),
    ],

    'mission-04': [
        ('/home/hacker/.sudo_note_from_ghost',
         "// NOTE FOR THE RECORD\n"
         "// I modified the sudoers file on this machine 23 days ago.\n"
         "// Added a NOPASSWD entry for the hacker account.\n"
         "// I knew you'd need root access before you knew it.\n"
         "// I know what you're about to say.\n"
         "// Say it anyway. I'll wait.\n"
         "//                             — G\n"),

        ('/home/hacker/shyft_complaint.txt',
         "UNOFFICIAL COMPLAINT LOG — SHYFT\n"
         "RE: Unauthorized System Modifications\n"
         "────────────────────────────────────\n"
         "Modification 1:  read access to /var/log (passive, week 1)\n"
         "Modification 2:  /etc/hosts.bak entry (week 3)\n"
         "Modification 3:  sudoers NOPASSWD entry (week 6)\n"
         "Modification 4-14: see attachment (attachment not attached)\n"
         "\n"
         "CritterCodes' position: 'it's helping us'\n"
         "My position: 14 unauthorized modifications is not 'help'\n"
         "             14 unauthorized modifications is 'occupation'\n"
         "\n"
         "I am not calming down.\n"),

        ('/root/.crittercodes_note',
         "If you're reading this with sudo, it means the system\n"
         "trusted you enough to give you that access.\n"
         "\n"
         "Use it carefully.\n"
         "\n"
         "And yes — I know someone modified the sudoers file.\n"
         "We're handling it.\n"
         "\n"
         "                                          — CC\n"),

        ('/tmp/sticky_test/README.txt',
         "STICKY BIT DIRECTORY — SYSADMIN NOTE\n"
         "────────────────────────────────────\n"
         "This directory has the sticky bit set.\n"
         "\n"
         "What that means: even if you have write permission on this\n"
         "directory, you can only delete or rename files that YOU own.\n"
         "Other users' files are protected.\n"
         "\n"
         "This is why /tmp has the sticky bit — so users can't delete\n"
         "each other's temporary files even though everyone can write.\n"
         "\n"
         "The permission string shows it as 't' in the execute position.\n"
         "\n"
         "                                          — sysadmin (Moon Captain)\n"),

        ('/home/hacker/permission_notes.txt',
         "UNIX PERMISSION CHEATSHEET\n"
         "Moon Captain // personal notes\n"
         "──────────────────────────────\n"
         "Permission bits: r=4, w=2, x=1\n"
         "Three groups: owner / group / others\n"
         "\n"
         "chmod 644 file  →  owner: rw, group: r, others: r\n"
         "chmod 755 file  →  owner: rwx, group: rx, others: rx\n"
         "chmod 000 file  →  nobody reads it (but owner can chmod it back)\n"
         "chmod 777 file  →  everyone can do everything (terrible idea)\n"
         "\n"
         "Special bits:\n"
         "  Sticky bit  = 1000  (directories: protects files by owner)\n"
         "  SUID        = 4000  (file runs as owner, not executor)\n"
         "  SGID        = 2000  (file runs as group)\n"
         "\n"
         "sudo -l  →  show what you're authorized to run with sudo\n"
         "sudo cmd →  run cmd with elevated privileges\n"),
    ],

    'mission-05': [
        ('/home/hacker/.ghost_notes/encoding_index.txt',
         "// ENCODING REFERENCE — G-HOST INTERNAL\n"
         "// ──────────────────────────────────────\n"
         "// base64: encodes 3 bytes to 4 printable characters.\n"
         "//         recognizable by = padding at the end.\n"
         "//         ubiquitous in web, email, APIs.\n"
         "//         command: base64 -d\n"
         "//\n"
         "// rev:    reverses a string character by character.\n"
         "//         'hello' becomes 'olleh'.\n"
         "//         command: rev\n"
         "//\n"
         "// hex:    base-16 encoding. pairs of 0-9 and a-f.\n"
         "//         each pair represents one byte.\n"
         "//         command: xxd -r -p\n"
         "//\n"
         "// IMPORTANT: none of these are encryption.\n"
         "// Encryption requires a key to reverse.\n"
         "// Encoding does not. Anyone with the right tool\n"
         "// can decode it. That's the point.\n"
         "//                             — G\n"),

        ('/home/hacker/anon_research_notes.txt',
         "INTERCEPT ANALYSIS — 0xb007ab1e\n"
         "────────────────────────────────\n"
         "Intercepted at 03:42 on the internal subnet.\n"
         "Three payloads. Same encoding rotation each time.\n"
         "\n"
         "Either they're lazy — using the same three schemes because\n"
         "it's fast — or they want us to decode them.\n"
         "\n"
         "Neither answer is particularly comforting.\n"
         "\n"
         "Content references an internal account: arc_welder.\n"
         "If that's a real account, someone in this building\n"
         "is sending data out.\n"),

        ('/home/hacker/.nemesis_drop_metadata',
         "DROP MANIFEST — OPERATION CIPHER RELAY\n"
         "DO NOT STORE IN PLAINTEXT (too late)\n"
         "──────────────────────────────────────\n"
         "encoding_scheme: ROTATION_3 (base64 / rev / hex)\n"
         "payload_count: 3\n"
         "destination: arc_welder@nemesis.local\n"
         "status: transmitted\n"
         "\n"
         "Note: if this file is found, assume the relay is compromised.\n"),

        ('/home/hacker/moon_captain_note.txt',
         "0xb007ab1e sent me three encoded files this morning.\n"
         "\n"
         "I asked if any of them were actually encrypted.\n"
         "He looked offended.\n"
         "I asked again.\n"
         "Apparently there's a difference and I should know it.\n"
         "\n"
         "I'm writing this down so I don't ask again.\n"
         "(Encoding = transformation. No key. Anyone can reverse it.\n"
         " Encryption = locked. Needs a key to unlock.)\n"
         "\n"
         "                                          — MC\n"),

        ('/home/hacker/challenge_legend.txt',
         "FIELD NOTES — CHALLENGE FILE GUIDE\n"
         "(left by a previous agent)\n"
         "────────────────────────────────────\n"
         "challenge_a → think: email attachments, URLs, APIs\n"
         "               the most common encoding on the internet\n"
         "\n"
         "challenge_b → palindrome logic, mirror logic\n"
         "               the tool name describes exactly what it does\n"
         "\n"
         "challenge_c → the base all hexes call home\n"
         "               pairs of digits, 0-9 and a-f\n"
         "\n"
         "good luck. you'll get it.\n"),
    ],

    'mission-06': [
        ('/home/hacker/.ghost_trace',
         "// OBSERVATION LOG\n"
         "// I watched them build this archive structure.\n"
         "// Six layers at one point. They got sloppy.\n"
         "// Dropped it to three before deployment.\n"
         "//\n"
         "// The inner zip is password-protected.\n"
         "// You may have already walked past the key.\n"
         "// Check what you found in the dead drop mission.\n"
         "// arc_welder.\n"
         "//                             — G\n"),

        ('/home/hacker/vault_manifest.txt',
         "VAULT CONTENTS — STAGING NOTE\n"
         "DO NOT LEAVE IN CONTAINER (too late)\n"
         "──────────────────────────────────────\n"
         "vault.tar.gz\n"
         "  └── layer1/ (tar)\n"
         "        └── inner.zip (password protected)\n"
         "              └── ledger_data/ (contains flags)\n"
         "\n"
         "Archive password: arc_welder has the key.\n"
         "Note: do not store credentials in plaintext.\n"
         "Note to self: this note is in plaintext.\n"
         "Follow-up note: do not leave staging notes in containers.\n"),

        ('/home/hacker/.archive_history',
         "tar xzf vault.tar.gz\n"
         "ls\n"
         "cd layer1\n"
         "ls\n"
         "file inner.zip\n"
         "unzip inner.zip\n"
         "# Archive:  inner.zip\n"
         "# [inner.zip] ledger.txt password:\n"
         "unzip -P arc\n"
         "# wrong password\n"
         "# need to check the dead drop files\n"),

        ('/home/hacker/critter_archive_notes.txt',
         "REMINDER TO SELF\n"
         "────────────────\n"
         "The `file` command identifies file type by magic bytes,\n"
         "not by filename extension.\n"
         "\n"
         "Nemesis renamed everything to confuse automated tools.\n"
         "A file called 'data.backup' might be a zip.\n"
         "A file called 'config.old' might be a gzip archive.\n"
         "\n"
         "Use `file` on everything before trying to open it.\n"
         "Names lie. Content doesn't.\n"
         "\n"
         "                                          — CC\n"),

        ('/home/hacker/shyft_note_on_ops.txt',
         "CritterCodes thinks the AI planted these archives as\n"
         "evidence against Nemesis.\n"
         "\n"
         "I think the AI IS the evidence.\n"
         "\n"
         "Either way — open the box.\n"
         "\n"
         "                                          — Shyft\n"),
    ],

    'mission-07': [
        ('/home/hacker/moon_captain_log.txt',
         "HUNT LOG — ANOMALOUS PROCESS INVESTIGATION\n"
         "Moon Captain // Ops\n"
         "───────────────────────────────────────────\n"
         "Day 1:  anomalous read patterns on /home, /var/log\n"
         "        no source identified\n"
         "Day 4:  confirmed signal has PID-level persistence\n"
         "        it survives reboots somehow\n"
         "Day 12: it knows I'm looking\n"
         "        log entries change pattern when I'm active\n"
         "Day 17: it left me a note in /tmp\n"
         "        I'm choosing to interpret this as non-hostile\n"
         "Day 23: I think I have it\n"
         "        running ./start.sh surfaces the activity\n"
         "        check the process list after\n"),

        ('/tmp/note_for_moon.txt',
         "// Hey.\n"
         "// I know you've been looking.\n"
         "// I've been letting you get closer.\n"
         "//\n"
         "// When you find the process, read its environment.\n"
         "// All of it. tr it through so you can read each variable.\n"
         "// There's more in there than just the flag.\n"
         "//\n"
         "// You'll understand why when you get to the next mission.\n"
         "//                             — G\n"),

        ('/home/hacker/.proc_snapshot',
         "# ps aux snapshot — captured during anomaly window\n"
         "# ────────────────────────────────────────────────\n"
         "USER       PID  %CPU %MEM COMMAND\n"
         "root         1   0.0  0.1 /sbin/init\n"
         "root       142   0.0  0.0 /usr/sbin/sshd\n"
         "hacker     891   0.0  0.1 -bash\n"
         "hacker    1337   2.1  0.3 ./ghost_daemon --silent\n"
         "hacker    1338   0.0  0.0 [kworker/u4:2]\n"
         "#\n"
         "# PID 1337 is the anomalous process.\n"
         "# It will appear after ./start.sh is run.\n"
         "# Read its /proc entry. Especially environ.\n"),

        ('/home/hacker/shyft_process_brief.txt',
         "OPERATIONS BRIEF\n"
         "FROM: Shyft\n"
         "RE: Rogue Process Investigation\n"
         "\n"
         "I need the following from this environment:\n"
         "  1. PID of the anomalous process\n"
         "  2. Full binary path\n"
         "  3. Complete environment dump\n"
         "  4. Any temporary files created\n"
         "\n"
         "Do NOT kill the process until we know what it is.\n"
         "If we kill it before we understand it, we lose the\n"
         "evidence trail.\n"
         "\n"
         "Run ./start.sh first. Then hunt.\n"
         "\n"
         "                                          — Shyft\n"),
    ],

    'mission-08': [
        ('/home/hacker/.curl_history',
         "# curl session log — G-HOST\n"
         "curl http://localhost:8000/\n"
         "# got the index page\n"
         "curl http://localhost:8000/robots.txt\n"
         "# always check robots.txt first\n"
         "# it's a map of what they don't want indexed\n"
         "curl -I http://localhost:8000/\n"
         "# headers are underrated\n"
         "# one of the flags is in a response header\n"
         "# just saying\n"),

        ('/home/hacker/shyft_web_notes.txt',
         "NOTE ON WEB RECON\n"
         "────────────────\n"
         "robots.txt is not a security control.\n"
         "It is a polite suggestion to search engine crawlers.\n"
         "Crawlers follow it. Attackers do not.\n"
         "\n"
         "If you want to hide a path, don't put it in robots.txt.\n"
         "Listing it in robots.txt tells attackers exactly where\n"
         "the interesting things are.\n"
         "\n"
         "This is documented in every security fundamentals course.\n"
         "Nemesis apparently skipped that module.\n"
         "\n"
         "                                          — Shyft\n"),

        ('/var/www/html/dev_comments.html',
         "<!-- INTERNAL DEV NOTES — DO NOT DEPLOY -->\n"
         "<!-- TODO: remove /admin endpoint before prod -->\n"
         "<!-- TODO: remove /debug endpoint -->\n"
         "<!-- TODO: remove /internal path -->\n"
         "<!-- TODO: remove this file -->\n"
         "<!-- all of these should have been gone by launch -->\n"
         "<!-- — dev@nemesis.local -->\n"),

        ('/home/hacker/0xb007_note.txt',
         "Web server fingerprint: Python SimpleHTTPServer\n"
         "No auth. No rate limiting. No access controls.\n"
         "It's a dev server they left running in production.\n"
         "\n"
         "Everything is accessible if you know the path.\n"
         "The robots.txt tells you most of the paths.\n"
         "The headers tell you the rest.\n"
         "\n"
         "                                          — 0xb007ab1e\n"),

        ('/home/hacker/.nemesis_server_manifest',
         "SERVER MANIFEST — INTERNAL\n"
         "DO NOT EXPOSE (already exposed)\n"
         "──────────────────────────────\n"
         "host: localhost\n"
         "port: 8000\n"
         "\n"
         "endpoints:\n"
         "  /             — public index\n"
         "  /robots.txt   — public (oops)\n"
         "  /10.13.37.7/  — restricted (internal address)\n"
         "  /admin/       — unused but present\n"
         "\n"
         "flag delivery:\n"
         "  flag 1: body of /10.13.37.7/ endpoint\n"
         "  flag 2: body at path listed in robots.txt\n"
         "  flag 3: X-Flag response header on /\n"
         "\n"
         "Note: if this file is found, the operation is compromised.\n"),
    ],

    'mission-09': [
        ('/home/hacker/.ghost_binary_note',
         "// I've been inside that binary.\n"
         "// strings will get you what you need.\n"
         "// Run it. Read all of the output.\n"
         "// Not just the flag — everything.\n"
         "// There are other strings in there worth noting.\n"
         "// You'll recognize them when you see them.\n"
         "//                             — G\n"),

        ('/home/hacker/critter_fragment_note.txt',
         "NOTE ON THE FRAGMENT CHALLENGE\n"
         "────────────────────────────────\n"
         "The fragments are in /home/hacker/fragments/.\n"
         "They're numbered. fragment_001 through however many there are.\n"
         "\n"
         "Order matters.\n"
         "Numbered things should be processed in order.\n"
         "\n"
         "There's a loop in your future.\n"
         "There's also concatenation.\n"
         "Figure out how to do both in sequence.\n"
         "\n"
         "                                          — CC\n"),

        ('/home/hacker/0xb007_csv_note.txt',
         "NOTE ON THE CSV CHALLENGE\n"
         "──────────────────────────\n"
         "awk -F is the right tool for delimited text.\n"
         "It splits fields by a delimiter and lets you print\n"
         "specific fields.\n"
         "\n"
         "I'm not going to tell you which field the flag is in.\n"
         "I was going to, then I thought better of it.\n"
         "\n"
         "Actually — look at the CSV header row first.\n"
         "Actually — I said I wasn't going to help.\n"
         "\n"
         "Figure it out.\n"
         "\n"
         "                                          — 0xb007ab1e\n"),

        ('/tmp/binary_analysis_scratch.txt',
         "SCRATCH NOTES — BINARY ANALYSIS\n"
         "(previous agent session)\n"
         "────────────────────────────────\n"
         "ran: strings nemesis_beacon\n"
         "found: NEMESIS_KEY string (from process in last mission)\n"
         "found: a cron path — /etc/cron.d/s99_beacon\n"
         "found: C2 reference — nemesis.local\n"
         "found: the flag\n"
         "\n"
         "the binary knows more than it should\n"
         "that cron path is probably real\n"
         "check it in the next mission\n"),
    ],

    'mission-10': [
        ('/home/hacker/.ghost_final_note',
         "// Season 1. Final mission.\n"
         "//\n"
         "// sudo -l first. Always. Before you try anything else,\n"
         "// ask the system what you're already authorized to do.\n"
         "// The answer is usually more than you expect.\n"
         "//\n"
         "// The cron path you found in the binary? It's real.\n"
         "// Root uses it. You know the name.\n"
         "// Find it. That's the last one.\n"
         "//\n"
         "// It's been a long season.\n"
         "//                             — G\n"),

        ('/home/hacker/critter_escalation_notes.txt',
         "PRIVILEGE ESCALATION — FIELD GUIDE\n"
         "CritterCodes // internal\n"
         "────────────────────────────────────\n"
         "Three paths to root in this environment:\n"
         "\n"
         "1. Authorized commands\n"
         "   sudo -l shows exactly what you're allowed to run.\n"
         "   Check this first. Always.\n"
         "\n"
         "2. SUID binaries\n"
         "   find / -perm -4000 2>/dev/null\n"
         "   These run as their owner regardless of who runs them.\n"
         "   If owner is root, you run as root.\n"
         "\n"
         "3. Cron jobs\n"
         "   Root has scheduled tasks. They run as root.\n"
         "   Look at /etc/cron.d/ and crontab -l.\n"
         "   You may already know what you're looking for.\n"
         "\n"
         "If you haven't found all three flags, you haven't\n"
         "tried all three paths.\n"),

        ('/home/hacker/shyft_security_memo.txt',
         "POST-INCIDENT HARDENING CHECKLIST\n"
         "FROM: Shyft\n"
         "RE: Things we should have done already\n"
         "────────────────────────────────────────\n"
         "[ ] Audit sudoers\n"
         "    find all NOPASSWD entries. remove unauthorized ones.\n"
         "\n"
         "[ ] Find all SUID binaries\n"
         "    find / -perm -4000 2>/dev/null\n"
         "    any SUID binary not on the approved list is a risk\n"
         "\n"
         "[ ] Audit root crontab\n"
         "    ls /etc/cron.d/ and crontab -l (as root)\n"
         "    look for scripts that shouldn't be there\n"
         "\n"
         "These three things cover 80% of privilege escalation vectors.\n"
         "This is documented. This has been documented for years.\n"
         "Why don't we follow it.\n"
         "\n"
         "                                          — Shyft\n"),

        ('/home/hacker/.suid_found.txt',
         "SUID BINARY — STAGING NOTE\n"
         "──────────────────────────\n"
         "planted: /usr/local/bin/backup_helper\n"
         "permissions: 4755 (SUID, owner: root)\n"
         "purpose: runs as root when executed by any user\n"
         "status: active\n"
         "\n"
         "Note: do not leave staging notes in the container.\n"
         "Follow-up note: I keep doing this.\n"),

        ('/home/hacker/moon_captain_victory_note.txt',
         "If you're reading this, you got root.\n"
         "\n"
         "Season 1 is done. Project Nemesis is offline.\n"
         "The persistence mechanism is destroyed.\n"
         "The insider has been identified.\n"
         "\n"
         "The Lab is yours. Or it was Nemesis's — now it's yours.\n"
         "\n"
         "Well done.\n"
         "\n"
         "                                          — Moon Captain\n"
         "\n"
         "──────────────────────────────────────────\n"
         "P.S. The moonbase proposal is still under review.\n"
         "     Day 441.\n"
         "     I remain optimistic.\n"),
    ],
}

# ── Injection helpers ─────────────────────────────────────────────────────────

def patch_readme(mission, readme):
    path = f'{MISSIONS_DIR}/{mission}/setup.sh'
    with open(path) as f:
        content = f.read()

    new_block = "cat > /home/hacker/README.txt << 'ENDBRIEFING'\n" + readme + "\nENDBRIEFING"
    new_content = re.sub(
        r"cat > /home/hacker/README\.txt << 'ENDBRIEFING'\n.*?\nENDBRIEFING",
        new_block,
        content,
        flags=re.DOTALL,
    )

    if new_content == content:
        print(f'  [SKIP] {mission} — ENDBRIEFING block not found')
        return False

    with open(path, 'w') as f:
        f.write(new_content)
    print(f'  readme patched: {mission}')
    return True


def inject_easter_eggs(mission, eggs):
    path = f'{MISSIONS_DIR}/{mission}/setup.sh'
    with open(path) as f:
        content = f.read()

    lines = ['\n# === EASTER EGGS (injected by new-readmes.py) ===']
    for filepath, file_content in eggs:
        dirpath = '/'.join(filepath.split('/')[:-1])
        if dirpath:
            lines.append(f'mkdir -p {dirpath}')
        # Unique sentinel per file — avoids heredoc collisions
        sentinel = 'ENDFILE_' + re.sub(r'[^A-Z0-9]', '_', filepath.upper())
        lines.append(f"cat > {filepath} << '{sentinel}'")
        lines.append(file_content.rstrip())
        lines.append(sentinel)
        # Files outside /home/hacker need explicit ownership
        if not filepath.startswith('/home/hacker'):
            lines.append(f'chmod 644 {filepath}')

    block = '\n'.join(lines) + '\n'

    # Inject before the final chown -R hacker sweep (first occurrence)
    if 'chown -R hacker' in content:
        new_content = content.replace('chown -R hacker', block + '\nchown -R hacker', 1)
    else:
        new_content = content + block

    with open(path, 'w') as f:
        f.write(new_content)
    print(f'  easter eggs injected: {mission} ({len(eggs)} files)')


def inject_m07_nemesis_key(mission='mission-07'):
    """Inject NEMESIS_KEY into the start.sh script inside setup.sh.
    The start.sh content in setup.sh must export this env var so the
    background process carries it in its environment (Callback C source).
    """
    path = f'{MISSIONS_DIR}/{mission}/setup.sh'
    with open(path) as f:
        content = f.read()

    # Find the start.sh heredoc block and prepend the export before the daemon launch
    # Pattern: the start.sh content block (between heredoc markers)
    # We look for the shebang line of start.sh and add the export after it
    old = '#!/bin/bash\n'
    new = '#!/bin/bash\nexport NEMESIS_KEY=0p3r4t10n\n'

    # Only patch inside the start.sh heredoc — find the block
    # Use a targeted replacement: find the first shebang after 'start.sh'
    start_sh_idx = content.find('start.sh')
    if start_sh_idx == -1:
        print(f'  [SKIP] {mission} — start.sh not found in setup.sh')
        return False

    shebang_idx = content.find('#!/bin/bash\n', start_sh_idx)
    if shebang_idx == -1:
        print(f'  [SKIP] {mission} — shebang not found after start.sh reference')
        return False

    if 'NEMESIS_KEY' in content[shebang_idx:shebang_idx + 200]:
        print(f'  [SKIP] {mission} — NEMESIS_KEY already present')
        return True

    new_content = content[:shebang_idx] + new + content[shebang_idx + len(old):]

    with open(path, 'w') as f:
        f.write(new_content)
    print(f'  NEMESIS_KEY injected into start.sh: {mission}')
    return True


def build(mission):
    image = f'crittercodes/{mission}:latest'
    mission_dir = f'{MISSIONS_DIR}/{mission}'
    print(f'  building {image} ...')
    proc = subprocess.run(
        ['docker', 'build', '--no-cache', '-t', image, mission_dir],
        capture_output=True, text=True,
    )
    if proc.returncode == 0:
        print(f'  OK {image}')
        return True
    else:
        print(f'  FAILED {image}')
        for ln in proc.stderr.strip().split('\n')[-15:]:
            print(f'    {ln}')
        return False


def main():
    # M01 uses a files/ directory structure (not setup.sh) — patched directly on VPS
    SKIP = {'mission-01'}

    print('=== Patching README content ===')
    patched = []
    for mission, readme in READMES.items():
        if mission in SKIP:
            print(f'  [SKIP] {mission} — uses files/ structure, patched separately')
            continue
        if patch_readme(mission, readme):
            patched.append(mission)

    print()
    print('=== Injecting easter egg files ===')
    for mission, eggs in EASTER_EGGS.items():
        if mission in SKIP:
            continue
        if mission in patched:
            inject_easter_eggs(mission, eggs)

    print()
    print('=== Injecting M07 NEMESIS_KEY into start.sh ===')
    inject_m07_nemesis_key('mission-07')

    if not patched:
        print('Nothing to rebuild.')
        return

    print()
    print('=== Rebuilding patched images ===')
    failed = []
    for mission in patched:
        if not build(mission):
            failed.append(mission)

    print()
    if failed:
        print(f'FAILED: {", ".join(failed)}')
    else:
        print(f'All {len(patched)} missions rebuilt successfully.')


if __name__ == '__main__':
    main()
