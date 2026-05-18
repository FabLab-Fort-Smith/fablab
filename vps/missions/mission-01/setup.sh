#!/bin/bash
set -e

# Create directories
mkdir -p /home/hacker/projects

# README — content replaced by new-readmes.py
cat > /home/hacker/README.txt << 'ENDBRIEFING'
Welcome to The Lab. Find the flags.
ENDBRIEFING

# Flag 2: in projects subdirectory — rewards exploration
cat > /home/hacker/projects/secret_plans.txt << 'ENDPLANS'
OPERATION COLD BOOT — MISSION NOTES
Classification: Eyes Only
────────────────────────────────────
Good. You went looking.
That's the right instinct.
Keep doing that in every mission.

flag{curiosity_killed_the_cat_but_satisfaction_brought_it_back}
ENDPLANS

# Easter eggs injected by new-readmes.py before this line
chown -R hacker:hacker /home/hacker
