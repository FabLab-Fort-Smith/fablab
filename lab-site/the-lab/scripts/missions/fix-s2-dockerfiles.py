#!/usr/bin/env python3
"""
Transform S2 mission Dockerfiles to use Dockerfile 1.4 heredoc syntax,
then rebuild with the correct crittercodes/s2-mission-XX:latest image tags.
"""
import os
import re
import subprocess
import sys

MISSIONS_DIR = '/root/vps/missions'
MISSIONS = [f's2-mission-{i:02d}' for i in range(1, 11)]

# ── Mission 09 hints file ─────────────────────────────────────────────────────
# The deploy script's hints file uses 'EOF' as the outer delimiter, but the
# content also contains 'EOF' on its own line (as heredoc examples). This is a
# pre-existing bug that would truncate the file at runtime. We replace the inner
# example delimiter with 'HEREDOC' so nothing conflicts.
M09_HINTS_BLOCK = """\
RUN <<'SHELLEOF'
cat > /home/agent/hints/script_engineering.txt << 'ENDHINTS'
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
cat << HEREDOC
Target: $TARGET
Verbose: $VERBOSE
HEREDOC

# Single-quoted delimiter: no expansion (literal)
cat << 'HEREDOC'
$DOLLAR_SIGNS are literal here.
HEREDOC

# Write to a file
cat > /tmp/report.txt << HEREDOC
=== REPORT ===
Date: $(date)
Target: $TARGET
HEREDOC

── FUNCTIONS ────────────────────────────────────────────────
log() {
    local level="$1"; shift
    printf '[%s] %s: %s\\n' "$(date +%H:%M:%S)" "$level" "$*"
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
ENDHINTS
SHELLEOF"""

M09_TAIL = """\
RUN echo 'echo ""; cat ~/README.txt; echo ""' >> /home/agent/.bashrc
RUN chown -R agent:agent /home/agent
WORKDIR /home/agent
USER agent
ENTRYPOINT ["ttyd", "-W", "-p", "7681", "bash"]"""


def transform_dockerfile(content):
    """
    Convert a Dockerfile with multi-line RUN instructions (shell heredocs and
    python3 -c "..." blocks) to Dockerfile 1.4 heredoc syntax so Docker can
    actually parse them.

    We do NOT try to track nested heredocs inside the content — the outer shell
    heredoc simply collects until the first occurrence of the delimiter on its
    own line (column 0), which mirrors real shell behaviour.
    """
    lines = content.split('\n')
    result = ['# syntax=docker/dockerfile:1.4']
    i = 0

    while i < len(lines):
        line = lines[i]

        # Skip any pre-existing syntax directive
        if line.startswith('# syntax=docker/dockerfile'):
            i += 1
            continue

        # ── Pattern 1: RUN python3 -c "   (multi-line Python) ────────────────
        if re.match(r'^RUN python3 -c "\s*$', line):
            python_lines = []
            i += 1
            while i < len(lines) and not re.match(r'^\s*"\s*$', lines[i]):
                python_lines.append(lines[i])
                i += 1
            result.append("RUN <<'PYEOF' python3")
            result.extend(python_lines)
            result.append('PYEOF')
            i += 1  # skip closing '"'
            continue

        # ── Pattern 2: RUN cmd << 'DELIM'  (shell heredoc) ───────────────────
        heredoc_match = re.match(r"^(RUN\s+.+?)\s*<<\s*['\"]?(\w+)['\"]?\s*$", line)
        if heredoc_match:
            cmd_with_run = heredoc_match.group(1)
            delim = heredoc_match.group(2)
            shell_cmd = re.sub(r'^RUN\s+', '', cmd_with_run)

            # Collect until delimiter alone on a line (no nesting — mirrors shell)
            content_lines = []
            i += 1
            while i < len(lines) and lines[i].rstrip() != delim:
                content_lines.append(lines[i])
                i += 1
            # i points at the closing delimiter line

            result.append("RUN <<'SHELLEOF'")
            result.append(f"{shell_cmd} << '{delim}'")
            result.extend(content_lines)
            result.append(delim)
            result.append('SHELLEOF')
            i += 1  # skip closing delimiter
            continue

        result.append(line)
        i += 1

    return '\n'.join(result)


def fix_mission09(dockerfile_path):
    """
    The hints file in mission 09 has 'EOF' both as the outer delimiter AND
    inside the content (as heredoc usage examples).  The generic transformer
    therefore truncates the file at the first inner 'EOF'.

    This function rewrites the broken section with a version that uses
    'ENDHINTS' as the outer delimiter and 'HEREDOC' for the examples.
    It also adds python3 to the apt-get install line.
    """
    with open(dockerfile_path, 'r') as f:
        text = f.read()

    # ── 1. Add python3 to apt install ────────────────────────────────────────
    text = text.replace(
        'apt-get install -y -qq wget bash shellcheck',
        'apt-get install -y -qq wget bash shellcheck python3',
    )

    # ── 2. Replace the broken hints section ──────────────────────────────────
    # After the generic transform, the SHELLEOF for the hints file is truncated
    # at the first inner EOF, and the remaining content ends up as raw lines.
    # We find the start of that broken section and replace everything up to
    # (but not including) the tail instructions.
    broken_marker = "cat > /home/agent/hints/script_engineering.txt << 'EOF'"
    tail_marker   = "RUN echo 'echo \"\"; cat ~/README.txt; echo \"\"'"

    # Locate the SHELLEOF line that wraps the broken hints command
    shelleof_prefix = "RUN <<'SHELLEOF'\n" + broken_marker
    start = text.find(shelleof_prefix)
    end   = text.find(tail_marker)

    if start == -1 or end == -1:
        print('  [m09] Could not locate hints section — skipping patch')
        return

    fixed = text[:start] + M09_HINTS_BLOCK + '\n' + text[end:]

    with open(dockerfile_path, 'w') as f:
        f.write(fixed)


def main():
    print('=== Transforming Dockerfiles ===')
    for mission in MISSIONS:
        dockerfile = os.path.join(MISSIONS_DIR, mission, 'Dockerfile')
        if not os.path.exists(dockerfile):
            print(f'  MISSING: {dockerfile}')
            continue
        with open(dockerfile, 'r') as f:
            raw = f.read()
        transformed = transform_dockerfile(raw)
        with open(dockerfile, 'w') as f:
            f.write(transformed)
        print(f'  OK: {dockerfile}')

    # Apply targeted fix for mission 09
    m09_path = os.path.join(MISSIONS_DIR, 's2-mission-09', 'Dockerfile')
    print(f'\n=== Applying mission-09 hints patch ===')
    fix_mission09(m09_path)
    print('  done')

    print()
    print('=== Building images ===')
    failed = []
    for mission in MISSIONS:
        image = f'crittercodes/{mission}:latest'
        mission_dir = os.path.join(MISSIONS_DIR, mission)
        print(f'  Building {image} ...')
        proc = subprocess.run(
            ['docker', 'build', '--no-cache', '-t', image, mission_dir],
            capture_output=True, text=True
        )
        if proc.returncode == 0:
            print(f'  ✓ {image}')
        else:
            print(f'  ✗ {image} FAILED')
            stderr_lines = proc.stderr.strip().split('\n')
            for ln in stderr_lines[-25:]:
                print(f'    {ln}')
            failed.append(mission)

    print()
    if failed:
        print(f'FAILED: {", ".join(failed)}')
        sys.exit(1)
    else:
        print('All 10 S2 missions built successfully.')


if __name__ == '__main__':
    main()
