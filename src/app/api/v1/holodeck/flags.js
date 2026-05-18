// Server-side flag registry — never sent to the client
// Each mission has an array of flags. Mission is complete when all are found.
const FLAGS = {
    // =========================================================
    // SEASON 1: Hack the Lab
    // =========================================================
    'mission-01': [
        'flag{welcome_to_the_lab}',                                    // freebie in readme.txt
        'flag{curiosity_killed_the_cat_but_satisfaction_brought_it_back}', // in ~/projects/secret_plans.txt
        'flag{hack_the_planet}',                                       // env var SYSTEM_FLAG
    ],
    'mission-02': [
        'flag{directory_spelunker}',     // deep nested dirs
        'flag{hidden_in_plain_sight}',   // in a dotdir
        'flag{find_command_master}',     // only findable with `find`
    ],
    'mission-03': [
        'flag{grep_is_your_friend}',     // embedded in log line 200
        'flag{tail_master}',             // last line of log
        'flag{regex_wizard}',            // matches a specific pattern in log
    ],
    'mission-04': [
        'flag{permission_granted}',      // sudo cat /root/secret.txt
        'flag{chmod_champion}',          // in a 000-permission file after fix
        'flag{sticky_bits}',             // in /tmp/sticky/flag.txt
    ],
    'mission-05': [
        'flag{base64_master}',           // decode challenge_a.txt
        'flag{reverse_engineer}',        // reverse challenge_b.txt
        'flag{hex_decoder}',             // hex decode challenge_c.txt
    ],
    'mission-06': [
        'flag{archive_excavator}',       // inside vault.tar.gz → zip → tar
        'flag{tar_wizard}',              // in a second tar at root of zip
        'flag{zip_bomb_survivor}',       // in a side file in the archive
    ],
    'mission-07': [
        'flag{process_detective}',       // env var on background process
        'flag{proc_filesystem}',         // in /proc/[pid]/environ
        'flag{hidden_service}',          // second background process
    ],
    'mission-08': [
        'flag{web_crawler}',             // /admin/secret.html
        'flag{robots_txt_reader}',       // in /robots.txt
        'flag{header_inspector}',        // in HTTP response header X-Flag
    ],
    'mission-09': [
        'flag{bash_wizard}',             // reassemble split fragments
        'flag{awk_master}',              // in a CSV, extract with awk
        'flag{one_liner_champion}',      // in a binary, extract with strings
    ],
    'mission-10': [
        'flag{root_access_granted}',     // sudo python3 → read /root/flag.txt
        'flag{suid_hunter}',             // SUID binary exploitation
        'flag{cron_detective}',          // in root's crontab
    ],

    // =========================================================
    // SEASON 2: The Syndicate
    // Six months after Project Nemesis. A deeper threat emerges.
    // Master bash scripting to automate the investigation.
    // =========================================================

    // Mission S2-01: Boot Protocol (Easy — Bash Basics)
    's2-mission-01': [
        'flag{s2_boot_protocol_active}',        // in ~/README.txt — cat it
        'flag{s2_environment_compromised}',      // $SYNDICATE_NOTE env var
        'flag{s2_execute_permission_granted}',   // chmod +x ~/unlock.sh && ./unlock.sh
    ],

    // Mission S2-02: Log Flood (Easy — grep / awk / sed)
    's2-mission-02': [
        'flag{s2_grep_in_the_dark}',            // base64-encoded in a log comment → base64 -d
        'flag{s2_awk_field_extracted}',          // 6th field of the BREACH line in events.csv
        'flag{s2_rot13_comms_decoded}',          // ROT13 in comms.enc → tr 'A-Za-z' 'N-ZA-Mn-za-m'
    ],

    // Mission S2-03: Fragment Recovery (Easy/Medium — Loops)
    's2-mission-03': [
        'flag{s2_fragment_042_found}',           // loop ~/fragments/, fragment_042.txt has it
        'flag{s2_while_loop_unlocked}',          // while read loop: 13th line of data.txt
        'flag{s2_find_syndicate_cache}',         // find / -name "*.syndicate" 2>/dev/null
    ],

    // Mission S2-04: Debug Protocol (Medium — Functions & Debugging)
    's2-mission-04': [
        'flag{s2_scope_bug_squashed}',           // fix local variable scope in ~/debug/script1.sh
        'flag{s2_return_code_fixed}',            // fix return vs exit in ~/debug/script2.sh
        'flag{s2_syntax_error_patched}',         // fix broken function syntax in ~/debug/script3.sh
    ],

    // Mission S2-05: Signal Intelligence (Medium — sed / awk / tr)
    's2-mission-05': [
        'flag{s2_rev_rot13_decoded}',            // rev file | tr 'A-Za-z' 'N-ZA-Mn-za-m'
        'flag{s2_awk_fields_assembled}',         // awk -F, '{print $1$3$5}' comms/message_02.csv
        'flag{s2_sed_substitution_done}',        // sed 's/SYNDICATE_/flag{s2_/;s/_END/}/g'
    ],

    // Mission S2-06: Ghost Processes (Medium — Process Management)
    's2-mission-06': [
        'flag{s2_proc_environ_read}',            // cat /proc/$(pgrep syndicate_d)/environ | tr '\0' '\n'
        'flag{s2_trap_signal_caught}',           // run ~/trap_demo.sh then kill -SIGUSR1 $PID
        'flag{s2_fg_job_retrieved}',             // fg a suspended job that writes flag to ~/output.txt
    ],

    // Mission S2-07: Data Mining (Medium/Hard — Arrays)
    's2-mission-07': [
        'flag{s2_top_ip_identified}',            // bash array + sort, most frequent IP in access.log
        'flag{s2_assoc_array_cracked}',          // assoc array user→count, find user with exactly 42 hits
        'flag{s2_sort_uniq_master}',             // sort unique.txt | uniq -c | sort -rn reveals the flag line
    ],

    // Mission S2-08: Pattern Lock (Hard — Regex)
    's2-mission-08': [
        'flag{s2_extended_regex_wins}',          // grep -E '[A-Z]{3}-[0-9]{4}' intercepts/cipher_a.txt
        'flag{s2_backreference_king}',           // sed -E 's/(flag)\{([^}]+)\}/\1{\2_verified}/' → strip _verified
        'flag{s2_perl_lookahead_used}',          // grep -P '(?<=TOKEN:)\w+' intercepts/cipher_c.txt
    ],

    // Mission S2-09: The Toolkit (Hard — Script Engineering)
    's2-mission-09': [
        'flag{s2_getopts_mastered}',             // script handles -t target -v -o outfile -h correctly
        'flag{s2_trap_err_in_play}',             // set -euo pipefail + trap ERR catches an injected error
        'flag{s2_heredoc_deployed}',             // heredoc used to write a config file in the script
    ],

    // Mission S2-10: Operation Shutdown (Hard — Full Automation)
    's2-mission-10': [
        'flag{s2_recon_script_done}',            // automated recon script produces correct report
        'flag{s2_syndicate_neutralized}',        // exploit-sim script finds all 3 listening ports
        'flag{s2_the_lab_is_secure}',            // hardening script passes all 5 validation checks
    ],
};

export function getMissionFlags(missionID) {
    return FLAGS[missionID] || [];
}

export function validateFlag(missionID, submission) {
    const flags = FLAGS[missionID];
    if (!flags) return null;
    const normalized = submission.trim().toLowerCase();
    const idx = flags.findIndex(f => f.toLowerCase() === normalized);
    return idx >= 0 ? flags[idx] : null;
}

export function getMissionTotal(missionID) {
    return (FLAGS[missionID] || []).length;
}
