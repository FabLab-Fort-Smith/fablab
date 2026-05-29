#!/usr/bin/env python3
"""
Patch S1 mission setup.sh files to replace terse README echoes
with inline cat-heredoc briefings matching the Project Nemesis story arc.
Run on the VPS: python3 /root/fix-s1-readmes.py
"""
import re
import subprocess

MISSIONS_DIR = '/root/vps/missions'

MISSIONS = {
    'mission-02': {
        'pattern': r'echo "Three flags hidden in the filesystem.*?" > /home/hacker/README\.txt',
        'readme': """\
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 2: Filesystem Recon           [ DIFFICULTY: EASY ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    CritterCodes <ceo@thelab.local>
TO:      Agent
SUBJECT: Three flags. Hidden in plain sight.

Something was here before you. The filesystem tells a story.
Three flags are scattered across hidden files and subdirectories.

ls won't show you everything. You need -la. You need find.
Check everything, including dotfiles.

                                          — CritterCodes // CEO

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: Hidden dotfile in the home directory.
              Try: ls -la ~/ | grep flag

  [ ] Flag 2: Buried in a subdirectory.
              Try: find ~ -name "*.txt" 2>/dev/null

  [ ] Flag 3: Deep inside a hidden trail.
              Try: find ~ -name ".deep_secret" 2>/dev/null | xargs cat""",
    },
    'mission-03': {
        'pattern': r'echo "Three flags inside /var/log/mission/system\.log.*?" > /home/hacker/README\.txt',
        'readme': """\
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 3: Log Analysis               [ DIFFICULTY: EASY ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    CritterCodes <ceo@thelab.local>
TO:      Agent
SUBJECT: The anomaly left evidence behind.

VECTOR — or whatever is out there — generated hundreds of log
entries overnight. Three flags are buried inside.

Manual reading isn't practical. You need grep, tail, and regex.

                                          — CritterCodes // CEO

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: Plain text, buried in lines of noise.
              Try: grep 'flag{' /var/log/mission/system.log

  [ ] Flag 2: At the very end of the log.
              Try: tail -1 /var/log/mission/system.log

  [ ] Flag 3: Wrapped in a specific pattern — [FLAG]...[/FLAG]
              Try: grep -oP '(?<=\\[FLAG\\] ).*(?= \\[/FLAG\\])' \\
                        /var/log/mission/system.log""",
    },
    'mission-04': {
        'pattern': r'echo "Three flags using different permission tricks.*?" > /home/hacker/README\.txt',
        'readme': """\
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 4: Permission Puzzles         [ DIFFICULTY: EASY ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    Shyft <president@thelab.local>
TO:      Agent
SUBJECT: Root access. Database is down.

Main database went dark. There's a restore script but it needs
root. The key from Operation Blackout gets you in.

Think sudo, chmod, and sticky bits.

                                          — Shyft // President

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: A root-owned file. Use sudo to read it.
              Try: sudo cat /root/secret.txt

  [ ] Flag 2: A file with permissions 000. Fix them.
              Try: chmod 644 locked.txt && cat locked.txt

  [ ] Flag 3: In a sticky-bit directory in /tmp.
              Try: ls -la /tmp/sticky/ && cat /tmp/sticky/flag.txt""",
    },
    'mission-05': {
        'pattern': r'echo "Three encoding challenges, three flags\..*?" > /home/hacker/README\.txt',
        'readme': """\
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 5: Encoding Gauntlet        [ DIFFICULTY: MEDIUM ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    0xb007ab1e <anon@thelab.local>
TO:      Agent
SUBJECT: Strange traffic on the internal network.

Something scrambled these flags before they could reach us.
Three encoding challenges. Peel them back.

                                          — 0xb007ab1e

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: Encoded in base64.
              Try: cat challenge_a.txt | awk '{print $NF}' | base64 -d

  [ ] Flag 2: Reversed string.
              Try: cat challenge_b.txt | awk '{print $NF}' | rev

  [ ] Flag 3: Hex encoded.
              Try: cat challenge_c.txt | awk '{print $NF}' | xxd -r -p""",
    },
    'mission-06': {
        'pattern': r'echo "Three flags buried in nested archives.*?" > /home/hacker/README\.txt',
        'readme': """\
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 6: Archive Extraction       [ DIFFICULTY: MEDIUM ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    CritterCodes <ceo@thelab.local>
TO:      Agent
SUBJECT: Project Nemesis encrypted their data drops.

They're hiding flags inside nested archives. Each layer is a
different format. Unpack every single one.

                                          — CritterCodes // CEO

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1-3: All inside vault.tar.gz — unpack every layer.
              Try: tar xzf vault.tar.gz
                   file *       (check what each layer is)
                   unzip *.zip
                   gunzip *.gz
                   tar xf *.tar""",
    },
    'mission-07': {
        'pattern': r'echo "Run \./start\.sh first, then hunt the flags in running processes.*?" > /home/hacker/README\.txt',
        'readme': """\
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 7: Process Archaeology      [ DIFFICULTY: MEDIUM ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    Moon Captain <ops@thelab.local>
TO:      Agent
SUBJECT: Something is running that shouldn't be.

VECTOR left a daemon. It's masquerading as a legitimate process.
Run ./start.sh first. Then hunt flags in running processes.

                                          — Moon Captain // Ops

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: In a running process environment.
              Try: cat /proc/$(pgrep start.sh)/environ | tr '\\0' '\\n' | grep flag

  [ ] Flag 2: In a hidden file in /proc.
              Try: find /proc -maxdepth 3 -name "*.txt" 2>/dev/null | xargs grep flag 2>/dev/null

  [ ] Flag 3: In a temp file created by the process.
              Try: ls -la /tmp/ && cat /tmp/daemon_flag.txt""",
    },
    'mission-08': {
        'pattern': r'echo "Run \./start\.sh then explore the web server.*?" > /home/hacker/README\.txt',
        'readme': """\
╔══════════════════════════════════════════════════════════════╗
║  SEASON 1 — HACK THE LAB                                    ║
║  Mission 8: Web Recon                  [ DIFFICULTY: HARD ] ║
╚══════════════════════════════════════════════════════════════╝

FROM:    Shyft <president@thelab.local>
TO:      Agent
SUBJECT: Nemesis stood up a web server inside the network.

Run ./start.sh to bring it online. Three flags hidden in HTTP
responses, headers, and robots.txt. curl is your friend.

                                          — Shyft // President

──────────────────────────────────────────────────────────────
OBJECTIVES
  [ ] Flag 1: On a hidden page.
              Try: curl http://localhost:8000/secret

  [ ] Flag 2: In robots.txt.
              Try: curl http://localhost:8000/robots.txt

  [ ] Flag 3: In a custom HTTP response header.
              Try: curl -I http://localhost:8000/""",
    },
}


def patch_mission(mission, pattern, readme):
    path = f'{MISSIONS_DIR}/{mission}/setup.sh'
    with open(path) as f:
        content = f.read()

    heredoc = f"cat > /home/hacker/README.txt << 'ENDBRIEFING'\n{readme}\nENDBRIEFING"
    new_content = re.sub(pattern, heredoc, content, flags=re.DOTALL)

    if new_content == content:
        print(f'  [WARN] regex did not match for {mission} — checking for existing heredoc')
        if 'ENDBRIEFING' in content:
            print(f'  [SKIP] {mission} already patched')
        else:
            print(f'  [FAIL] {mission} — no match and no existing heredoc')
        return False

    with open(path, 'w') as f:
        f.write(new_content)
    print(f'  patched {mission}')
    return True


def build(mission):
    image = f'crittercodes/{mission}:latest'
    mission_dir = f'{MISSIONS_DIR}/{mission}'
    print(f'  Building {image} ...')
    proc = subprocess.run(
        ['docker', 'build', '--no-cache', '-t', image, mission_dir],
        capture_output=True, text=True,
    )
    if proc.returncode == 0:
        print(f'  ✓ {image}')
        return True
    else:
        print(f'  ✗ {image} FAILED')
        for ln in proc.stderr.strip().split('\n')[-20:]:
            print(f'    {ln}')
        return False


def main():
    print('=== Patching setup.sh files ===')
    patched = []
    for mission, cfg in MISSIONS.items():
        if patch_mission(mission, cfg['pattern'], cfg['readme']):
            patched.append(mission)

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
