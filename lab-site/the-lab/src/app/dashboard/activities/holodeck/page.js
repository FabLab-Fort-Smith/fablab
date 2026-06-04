"use client";
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import MissionCutscene from '@/app/components/holodeck/MissionCutscene';
import GHostChat from '@/app/components/holodeck/GHostChat';
import { S1_CUTSCENES, S2_CUTSCENES } from '@/app/components/holodeck/cutscenes';

const S1_MISSIONS = [
    {
        id: 'mission-01',
        title: 'Mission 1: Operation Cold Boot',
        description: 'First login. Three flags scattered across the filesystem — in plain sight, in hidden config, and in a subdirectory. Read the README. Explore everything. Something was here before you.',
        difficulty: 'Easy',
        skills: ['ls', 'cd', 'cat', 'pwd', 'env'],
        flagCount: 3,
    },
    {
        id: 'mission-02',
        title: 'Mission 2: Operation Dead Drop',
        description: 'A drop was left in this filesystem weeks before you arrived. Three flags — some hidden, some buried, one deep in a directory tree. The default listing won\'t show you everything.',
        difficulty: 'Easy',
        skills: ['ls -la', 'find', 'file'],
        flagCount: 3,
    },
    {
        id: 'mission-03',
        title: 'Mission 3: Operation Signal Noise',
        description: 'Hundreds of log entries generated overnight. Three flags buried in /var/log/mission/system.log. Something left more than just noise in this machine — explore beyond the log file.',
        difficulty: 'Easy',
        skills: ['grep', 'tail', 'cat'],
        flagCount: 3,
    },
    {
        id: 'mission-04',
        title: 'Mission 4: Operation Lockpick',
        description: 'Three flags behind three different locks — a root-owned file, a zero-permission file, and a sticky-bit directory. The sudo configuration was modified to let you in. Use it.',
        difficulty: 'Easy',
        skills: ['ls -la', 'sudo', 'chmod', 'sudo -l'],
        flagCount: 3,
    },
    {
        id: 'mission-05',
        title: 'Mission 5: Operation Cipher Peel',
        description: 'Three intercepted Nemesis payloads, three different encodings. None of them are encrypted. Identify the transformation, find the reversal tool, peel it back.',
        difficulty: 'Medium',
        skills: ['base64', 'rev', 'xxd', 'file'],
        flagCount: 3,
    },
    {
        id: 'mission-06',
        title: 'Mission 6: Operation Nested Doll',
        description: 'Intelligence hidden inside vault.tar.gz — but what\'s inside isn\'t the end. Nested archives, multiple formats, layers all the way down. You may already have the key to the inner lock.',
        difficulty: 'Medium',
        skills: ['tar', 'unzip', 'gunzip', 'file'],
        flagCount: 3,
    },
    {
        id: 'mission-07',
        title: 'Mission 7: Operation Ghost Signal',
        description: 'A rogue process is running on this machine. Run ./start.sh to surface it, then hunt through process environments, /proc, and temp files. Read its environment carefully.',
        difficulty: 'Medium',
        skills: ['ps', 'pgrep', '/proc', 'env'],
        flagCount: 3,
    },
    {
        id: 'mission-08',
        title: 'Mission 8: Operation Open Window',
        description: 'A web server is running locally. Run ./start.sh to bring it online. Explore it the way an attacker would — not everything is linked, and the server knows about internal addresses.',
        difficulty: 'Hard',
        skills: ['curl', 'curl -I', 'curl -v'],
        flagCount: 3,
    },
    {
        id: 'mission-09',
        title: 'Mission 9: Operation Binary Autopsy',
        description: 'Three flags — split across fragments, structured in a CSV, compiled into a binary. The binary tells you more than just the flag. Read its strings carefully.',
        difficulty: 'Medium',
        skills: ['strings', 'awk', 'for loop', 'cat'],
        flagCount: 3,
    },
    {
        id: 'mission-10',
        title: 'Mission 10: Operation Root Cause',
        description: 'Three flags, all behind root. Three paths: authorized commands, SUID binaries, scheduled tasks. You already know the persistence mechanism\'s name. Find it.',
        difficulty: 'Hard',
        skills: ['sudo -l', 'find -perm', 'crontab'],
        flagCount: 3,
    },
];

const S2_MISSIONS = [
    {
        id: 's2-mission-01',
        title: 'S2-01: Boot Protocol',
        description: 'Six months after Project Nemesis. Systems are back online but compromised. Write your first bash scripts to inventory what the Syndicate left behind.',
        difficulty: 'Easy',
        skills: ['variables', 'echo', 'env', 'chmod +x', './script.sh'],
        hints: [
            'Start with: cat README.txt',
            'Create a script: nano inventory.sh, add #!/bin/bash at the top',
            'Make it executable: chmod +x inventory.sh, then run: ./inventory.sh',
        ],
    },
    {
        id: 's2-mission-02',
        title: 'S2-02: Log Flood',
        description: 'The Syndicate generated thousands of log entries to hide their tracks. Use grep, awk, and sed to cut through the noise and surface their signatures.',
        difficulty: 'Easy',
        skills: ['grep -r', 'base64 -d', 'awk -F', 'tr ROT13', 'pipelines'],
        hints: [
            'Search all logs: grep -r "SYNDICATE" /var/log/',
            'Decode base64: cat file | base64 -d',
            'ROT13 decode: cat file | tr A-Za-z N-ZA-Mn-za-m',
        ],
    },
    {
        id: 's2-mission-03',
        title: 'S2-03: Fragment Recovery',
        description: 'Evidence files were shredded into 100 fragments and scattered across directories. Write loops to iterate through them and reassemble the intelligence.',
        difficulty: 'Easy',
        skills: ['for loops', 'while read', 'find', 'seq', 'globbing'],
        hints: [
            'Find all fragments: find . -name "fragment_*"',
            'Loop through them: for f in $(find . -name "fragment_*"); do cat "$f"; done',
            'Sort and reassemble: find . -name "fragment_*" | sort | xargs cat',
        ],
    },
    {
        id: 's2-mission-04',
        title: 'S2-04: Debug Protocol',
        description: "The Lab's own investigation scripts were sabotaged with subtle bugs. Find and fix the function scope, return-value, and syntax errors planted by the Syndicate.",
        difficulty: 'Medium',
        skills: ['bash functions', 'local vars', 'return vs exit', 'set -x', 'shellcheck'],
        hints: [
            'Debug with: bash -x script.sh',
            'Variables inside functions need: local varname=value',
            'Functions return values with echo, not return — capture with: result=$(my_func)',
        ],
    },
    {
        id: 's2-mission-05',
        title: 'S2-05: Signal Intelligence',
        description: 'Intercepted Syndicate transmissions are triple-encoded to resist analysis. Master sed, awk, and tr to peel back every layer of obfuscation.',
        difficulty: 'Medium',
        skills: ['sed -E', 'awk -F', 'tr A-Z', 'rev', 'chained pipes'],
        hints: [
            'Decode outermost layer first — check README for the order',
            'Chain decoders: cat transmission | rev | base64 -d | tr A-Za-z N-ZA-Mn-za-m',
            'Use awk -F to split fields: awk -F":" \'{print $2}\'',
        ],
    },
    {
        id: 's2-mission-06',
        title: 'S2-06: Ghost Processes',
        description: 'The Syndicate runs hidden background daemons carrying their secrets. Hunt them through /proc, intercept their signals, and master job control to drag them into the light.',
        difficulty: 'Medium',
        skills: ['ps aux', '/proc/environ', 'trap', 'kill -SIGUSR1', 'bg/fg'],
        hints: [
            'List all processes: ps aux',
            'Read a process environment: cat /proc/<PID>/environ | tr \'\\0\' \'\\n\'',
            'Send a signal: kill -SIGUSR1 <PID>',
        ],
    },
    {
        id: 's2-mission-07',
        title: 'S2-07: Data Mining',
        description: 'Thousands of access-log entries. Use bash arrays and associative arrays to identify patterns, count occurrences, and surface the Syndicate\'s agents hidden in the data.',
        difficulty: 'Medium',
        skills: ['bash arrays', 'associative arrays', 'sort | uniq -c', 'arithmetic expansion'],
        hints: [
            'Count occurrences: awk \'{print $1}\' access.log | sort | uniq -c | sort -rn',
            'Declare an associative array: declare -A counts',
            'Arithmetic: (( counts[$key]++ ))',
        ],
    },
    {
        id: 's2-mission-08',
        title: 'S2-08: Pattern Lock',
        description: 'Syndicate communications use layered encoding patterns. Master extended regex, sed capture groups, and Perl-compatible lookaheads to break their codes.',
        difficulty: 'Hard',
        skills: ['grep -E', 'sed backreferences', 'grep -P', 'lookahead', 'character classes'],
        hints: [
            'Extended regex: grep -E "[A-Z]{3}-[0-9]{4}" file',
            'Capture groups in sed: sed -E \'s/(prefix)(data)/\\2/\'',
            'Perl lookahead: grep -P \'(?<=KEY:)[A-Za-z0-9]+\'',
        ],
    },
    {
        id: 's2-mission-09',
        title: 'S2-09: The Toolkit',
        description: 'Stop hacking one-liners. Build a professional-grade investigation script with argument parsing, strict error handling, structured logging, and clean output.',
        difficulty: 'Hard',
        skills: ['getopts', 'set -euo pipefail', 'trap ERR', 'heredoc', 'printf formatting'],
        hints: [
            'Add at the top: set -euo pipefail',
            'Parse args with: while getopts "f:o:v" opt; do case $opt in ...',
            'Trap errors: trap \'echo "Error on line $LINENO"\' ERR',
        ],
    },
    {
        id: 's2-mission-10',
        title: 'S2-10: Operation Shutdown',
        description: "The Syndicate's server is exposed. Write a complete automated response: scan for IOCs, enumerate listening ports, generate a forensic report, and harden the system. One script to end it all.",
        difficulty: 'Hard',
        skills: ['find -mmin', 'arrays + loops', 'report generation', 'netstat', 'cron hardening'],
        hints: [
            'Find recent changes: find / -mmin -60 -type f 2>/dev/null',
            'List open ports: netstat -tlnp or ss -tlnp',
            'Write the report to a file: printf "%s\\n" "${findings[@]}" > report.txt',
        ],
    },
];

const DIFFICULTY_COLOR = {
    Easy: 'var(--green)',
    Medium: 'var(--yellow, #f5c518)',
    Hard: 'var(--red)',
};

export default function HolodeckPage() {
    const { data: session } = useSession();
    const [season, setSeason] = useState(1);
    const [activeMission, setActiveMission] = useState(null);
    const [terminalUrl, setTerminalUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [completedMissions, setCompletedMissions] = useState([]);
    const [missionProgress, setMissionProgress] = useState({});
    const [flagInput, setFlagInput] = useState('');
    const [flagResult, setFlagResult] = useState(null);
    const [sidebarTab, setSidebarTab] = useState('mission');
    const [flagLoading, setFlagLoading] = useState(false);
    const [cutscene, setCutscene] = useState(null); // { lines, ctaLabel, onComplete }
    const [pendingMissionID, setPendingMissionID] = useState(null);
    const [primerSeen, setPrimerSeen] = useState(() => {
        try { return !!localStorage.getItem('holodeck_primer_seen'); } catch { return false; }
    });
    const missions = season === 1 ? S1_MISSIONS : S2_MISSIONS;

    const s1AllComplete = S1_MISSIONS.every(m => completedMissions.includes(m.id));

    const isMissionUnlocked = (missionID) => {
        const s1IDs = S1_MISSIONS.map(m => m.id);
        const s2IDs = S2_MISSIONS.map(m => m.id);
        if (s1IDs.includes(missionID)) {
            const idx = s1IDs.indexOf(missionID);
            return idx === 0 || completedMissions.includes(s1IDs[idx - 1]);
        }
        if (s2IDs.includes(missionID)) {
            if (!s1AllComplete) return false;
            const idx = s2IDs.indexOf(missionID);
            return idx === 0 || completedMissions.includes(s2IDs[idx - 1]);
        }
        return false;
    };

    const loadCompletions = () => {
        fetch('/api/v1/holodeck/completions')
            .then(r => r.json())
            .then(d => {
                if (d.completedMissions) setCompletedMissions(d.completedMissions);
                if (d.progress) setMissionProgress(d.progress);
            })
            .catch(() => {});
    };

    useEffect(() => { loadCompletions(); }, []);

    const launchTerminal = async (missionID) => {
        setLoading(true);
        setError('');
        setFlagInput('');
        setFlagResult(null);
        setSidebarTab('mission');
        try {
            const res = await fetch('/api/v1/arcade/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID: session?.user?.userID, game: missionID }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to start mission.');
            if (data.url) {
                setTerminalUrl(data.url);
                setActiveMission(missionID);
            }
        } catch (err) {
            setError(err.message || 'Failed to start mission.');
        } finally {
            setLoading(false);
        }
    };

    const TERMINAL_PRIMER = [
        { speaker: 'SYSTEM',  text: '[ TERMINAL ORIENTATION — NEW AGENT DETECTED ]' },
        { speaker: 'G-HOST',  text: 'Before you go in — you\'ve never used a terminal before, have you. I can tell.' },
        { speaker: 'G-HOST',  text: 'A terminal is just a text interface to a computer. You type a command, press Enter, the system responds. That\'s all it is.' },
        { speaker: 'G-HOST',  text: 'First command: ls. Type it and press Enter. It lists the files and folders in your current location. Everything starts here.' },
        { speaker: 'G-HOST',  text: 'cd foldername — move into a folder. cd .. — go back up one level. You navigate the filesystem like moving through rooms.' },
        { speaker: 'G-HOST',  text: 'cat filename — read a file. Prints the contents to the screen. Most of what you\'re looking for is inside files.' },
        { speaker: 'G-HOST',  text: 'Three commands. ls, cd, cat. That\'s — that\'s enough to find your first flags. The rest you\'ll learn as you go. I\'ll be here.' },
        { speaker: 'SYSTEM',  text: '[ TIP ] Autocomplete: press Tab to finish a filename. Up arrow recalls your last command.' },
        { speaker: 'CritterCodes', text: 'Orientation complete. The mainframe is yours. Good luck.' },
    ];

    const handleStartMission = (missionID) => {
        const cutsceneData = (S1_CUTSCENES[missionID] ?? S2_CUTSCENES[missionID]);

        // Show terminal primer before mission-01 if never seen
        if (missionID === 'mission-01' && !primerSeen) {
            setPendingMissionID(missionID);
            setCutscene({
                lines: TERMINAL_PRIMER,
                ctaLabel: 'got it — launch terminal',
                onComplete: () => {
                    try { localStorage.setItem('holodeck_primer_seen', '1'); } catch {}
                    setPrimerSeen(true);
                    setCutscene(null);
                    // Now show mission-01 pre-cutscene if it has one
                    if (cutsceneData?.pre) {
                        setCutscene({
                            lines: cutsceneData.pre,
                            ctaLabel: 'launch terminal',
                            onComplete: () => { setCutscene(null); launchTerminal(missionID); setPendingMissionID(null); },
                        });
                    } else {
                        launchTerminal(missionID);
                        setPendingMissionID(null);
                    }
                },
            });
            return;
        }

        if (cutsceneData?.pre) {
            setPendingMissionID(missionID);
            setCutscene({
                lines: cutsceneData.pre,
                ctaLabel: 'launch terminal',
                onComplete: () => {
                    setCutscene(null);
                    launchTerminal(missionID);
                    setPendingMissionID(null);
                },
            });
        } else {
            launchTerminal(missionID);
        }
    };

    const handleCloseSession = () => {
        setActiveMission(null);
        setTerminalUrl('');
        setFlagInput('');
        setFlagResult(null);
    };

    const handleSubmitFlag = async () => {
        if (!flagInput.trim() || !activeMission) return;
        setFlagLoading(true);
        setFlagResult(null);
        try {
            const res = await fetch('/api/v1/holodeck/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ missionID: activeMission, flag: flagInput.trim() }),
            });
            const data = await res.json();
            setFlagResult(data);
            if (data.correct) {
                setFlagInput('');
                loadCompletions();
                if (data.missionComplete) {
                    const activeCutscene = S1_CUTSCENES[activeMission] ?? S2_CUTSCENES[activeMission];
                    const allList = [...S1_MISSIONS, ...S2_MISSIONS];
                    const currentIdx = allList.findIndex(m => m.id === activeMission);
                    const nextMission = currentIdx >= 0 && currentIdx < allList.length - 1
                        ? allList[currentIdx + 1]
                        : null;
                    const nextID = nextMission?.id ?? null;

                    const flowToNext = () => {
                        handleCloseSession();
                        if (nextID) {
                            setTimeout(() => {
                                const nextCutscene = S1_CUTSCENES[nextID] ?? S2_CUTSCENES[nextID];
                                if (nextCutscene?.pre) {
                                    setPendingMissionID(nextID);
                                    setCutscene({
                                        lines: nextCutscene.pre,
                                        ctaLabel: 'launch terminal',
                                        onComplete: () => {
                                            setCutscene(null);
                                            launchTerminal(nextID);
                                            setPendingMissionID(null);
                                        },
                                    });
                                } else {
                                    launchTerminal(nextID);
                                }
                            }, 80);
                        }
                    };

                    if (activeCutscene?.post) {
                        setCutscene({
                            lines: activeCutscene.post,
                            ctaLabel: nextID ? `next: ${nextID.toUpperCase()}` : 'back to missions',
                            onComplete: () => {
                                setCutscene(null);
                                flowToNext();
                            },
                        });
                    } else {
                        flowToNext();
                    }
                }
            }
        } catch {
            setFlagResult({ correct: false, message: 'Submission failed. Try again.' });
        } finally {
            setFlagLoading(false);
        }
    };

    const allMissions = [...S1_MISSIONS, ...S2_MISSIONS];
    const activeMissionData = allMissions.find(m => m.id === activeMission);

    const s1Complete = S1_MISSIONS.filter(m => completedMissions.includes(m.id)).length;
    const s2Complete = S2_MISSIONS.filter(m => completedMissions.includes(m.id)).length;
    const currentComplete = season === 1 ? s1Complete : s2Complete;

    return (
        <div style={activeMission ? {
            height: 'calc(100vh - 50px)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
        } : {
            padding: '20px 24px',
            maxWidth: 960,
        }}>
            <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
            {cutscene && (
                <MissionCutscene
                    lines={cutscene.lines}
                    ctaLabel={cutscene.ctaLabel}
                    onComplete={cutscene.onComplete}
                />
            )}

            {/* Header — hidden when a mission is active */}
            {!activeMission && (
                <>
                    <div style={{ marginBottom: 28 }}>
                        <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                            <span style={{ color: 'var(--green)' }}>$</span> ./holodeck --season {season}
                        </div>
                        <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                            the holodeck
                        </h1>
                        <p style={{ color: 'var(--text-mid)', fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                            {season === 1
                                ? 'launch ephemeral linux environments to practice your hacking skills.'
                                : 'the syndicate is back. automate your way through the investigation — bash scripting or bust.'}
                            {currentComplete > 0 && (
                                <span style={{ marginLeft: 12, color: 'var(--green)' }}>
                                    {currentComplete}/{missions.length} missions complete
                                </span>
                            )}
                        </p>
                        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                            {[1, 2].map(s => (
                                <button
                                    key={s}
                                    onClick={() => { setSeason(s); setActiveMission(null); setTerminalUrl(''); setError(''); }}
                                    style={{
                                        fontFamily: 'var(--mono)',
                                        fontSize: 10,
                                        letterSpacing: '0.12em',
                                        padding: '4px 12px',
                                        border: `1px solid ${season === s ? (s === 1 ? 'var(--green)' : 'var(--cyan)') : 'var(--bd)'}`,
                                        background: season === s ? (s === 1 ? 'var(--green)' : 'var(--cyan)') : 'transparent',
                                        color: season === s ? 'var(--bg-0)' : 'var(--text-dim)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {s === 1 ? 'SEASON 1 — HACK THE LAB' : 'SEASON 2 — THE SYNDICATE'}
                                </button>
                            ))}
                            {season === 2 && (
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--cyan)', border: '1px solid var(--cyan)', padding: '4px 8px', alignSelf: 'center' }}>
                                    BASH SCRIPTING
                                </span>
                            )}
                        </div>
                    </div>

                    {season === 1 && (
                        <div style={{ border: '1px solid var(--green)', padding: '12px 16px', marginBottom: 20, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-mid)', lineHeight: 1.7 }}>
                            <span style={{ color: 'var(--green)' }}>// INTEL BRIEF</span>
                            {'  '}What began as a routine onboarding exercise has turned into something else. An unknown entity — code name G-HOST — has been inside The Lab\'s systems longer than anyone knew. Follow the breadcrumbs across ten missions. The flags are the surface. The story is underneath.
                        </div>
                    )}
                    {season === 2 && !s1AllComplete && (
                        <div style={{ border: '1px solid var(--red)', padding: '12px 16px', marginBottom: 20, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-mid)', lineHeight: 1.7 }}>
                            <span style={{ color: 'var(--red)' }}>// ACCESS DENIED</span>
                            {'  '}Season 2 is locked. Complete all 10 Season 1 missions to unlock The Syndicate arc.{' '}
                            <span style={{ color: 'var(--green)' }}>{s1Complete}/10 complete.</span>
                        </div>
                    )}
                    {season === 2 && s1AllComplete && (
                        <div style={{ border: '1px solid var(--cyan)', padding: '12px 16px', marginBottom: 20, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-mid)', lineHeight: 1.7 }}>
                            <span style={{ color: 'var(--cyan)' }}>// INTEL BRIEF</span>
                            {'  '}Six months after Project Nemesis was shut down, a new signal has emerged. The Syndicate — the collective that bankrolled Nemesis — has embedded persistent agents across Lab infrastructure. The evidence is massive in scale. Manual investigation is too slow. You need to automate everything. Write scripts or lose.
                        </div>
                    )}

                    {error && (
                        <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '10px 14px', marginBottom: 20, fontSize: 12, fontFamily: 'var(--mono)' }}>
                            ✕ {error}
                        </div>
                    )}
                </>
            )}

            {!activeMission ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                    {missions.map((mission, idx) => {
                        const done = completedMissions.includes(mission.id);
                        const unlocked = isMissionUnlocked(mission.id);
                        const locked = !unlocked;
                        const prog = missionProgress[mission.id];
                        const flagsFound = prog?.found || 0;
                        const flagsTotal = prog?.total || mission.flagCount || 1;
                        const accentColor = locked ? 'var(--text-dim)' : season === 2 ? 'var(--cyan)' : 'var(--green)';
                        const prevMission = idx > 0 ? missions[idx - 1] : null;
                        return (
                            <div key={mission.id} className="card" style={{
                                display: 'flex', flexDirection: 'column',
                                opacity: locked ? 0.42 : done ? 0.75 : 1,
                                filter: locked ? 'grayscale(0.6)' : 'none',
                            }}>
                                <div className="card-header" style={{ justifyContent: 'space-between' }}>
                                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', color: accentColor }}>
                                        {locked ? '■ ' : ''}{mission.id.toUpperCase()}
                                    </span>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        {locked && (
                                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', border: '1px solid var(--bd)', padding: '1px 6px' }}>
                                                LOCKED
                                            </span>
                                        )}
                                        {!locked && flagsFound > 0 && !done && (
                                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--yellow, #f5c518)', border: '1px solid var(--yellow, #f5c518)', padding: '1px 6px' }}>
                                                {flagsFound}/{flagsTotal} FLAGS
                                            </span>
                                        )}
                                        {done && (
                                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)', border: '1px solid var(--green)', padding: '1px 6px' }}>
                                                ✓ {flagsFound}/{flagsTotal} FLAGS
                                            </span>
                                        )}
                                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: DIFFICULTY_COLOR[mission.difficulty], border: `1px solid ${DIFFICULTY_COLOR[mission.difficulty]}`, padding: '1px 6px' }}>
                                            {mission.difficulty.toUpperCase()}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ padding: '16px 20px', flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: locked ? 'var(--text-dim)' : 'var(--text-bright)', marginBottom: 8 }}>
                                        {mission.title}
                                    </div>
                                    {locked ? (
                                        <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6, fontFamily: 'var(--mono)' }}>
                                            {prevMission
                                                ? `complete "${prevMission.title}" to unlock`
                                                : season === 2 ? 'complete all season 1 missions to unlock' : 'locked'}
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ fontSize: 11, color: 'var(--text-mid)', lineHeight: 1.6, marginBottom: 10 }}>
                                                {mission.description}
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                {mission.skills.map(skill => (
                                                    <span key={skill} style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', border: '1px solid var(--bd)', padding: '1px 5px' }}>
                                                        {skill}
                                                    </span>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bd)' }}>
                                    <button
                                        className="btn btn--filled"
                                        style={{ width: '100%', fontSize: 11, opacity: locked ? 0.5 : 1 }}
                                        onClick={() => !locked && !loading && handleStartMission(mission.id)}
                                        disabled={loading || locked}
                                    >
                                        {locked ? '■ locked' : loading ? '$ initializing...' : done ? '$ replay mission' : flagsFound > 0 ? '$ continue mission' : '$ start mission'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ display: 'flex', gap: 0, flex: 1, alignItems: 'stretch', overflow: 'hidden' }}>
                    {/* ── Terminal (left) ── */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', border: '1px solid var(--bd)' }}>
                        {/* Terminal titlebar */}
                        <div style={{ padding: '8px 14px', background: 'var(--bg-1)', borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: error ? 'var(--red)' : 'var(--green)' }}>
                                ● {error ? `✕ ${error}` : activeMissionData?.title}
                            </span>
                            <button
                                className="btn btn--sm"
                                style={{ borderColor: 'var(--red)', color: 'var(--red)', fontSize: 9 }}
                                onClick={handleCloseSession}
                            >
                                ✕ close session
                            </button>
                        </div>
                        <iframe
                            key={terminalUrl}
                            src={terminalUrl}
                            style={{ width: '100%', flex: 1, border: 'none' }}
                            title="Terminal"
                            allow="clipboard-read; clipboard-write"
                        />
                    </div>

                    {/* ── Mission panel (right) ── */}
                    <div style={{
                        width: 320, flexShrink: 0,
                        borderTop: '1px solid var(--bd)', borderRight: '1px solid var(--bd)', borderBottom: '1px solid var(--bd)',
                        background: 'var(--bg-1)',
                        display: 'flex', flexDirection: 'column',
                        fontFamily: 'var(--mono)',
                        overflow: 'hidden',
                    }}>
                        {/* Header: mission ID + difficulty */}
                        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 9, letterSpacing: '0.15em', color: season === 2 ? 'var(--cyan)' : 'var(--green)' }}>
                                {activeMissionData?.id?.toUpperCase()}
                            </span>
                            <span style={{ fontSize: 9, color: DIFFICULTY_COLOR[activeMissionData?.difficulty], border: `1px solid ${DIFFICULTY_COLOR[activeMissionData?.difficulty]}`, padding: '1px 5px' }}>
                                {activeMissionData?.difficulty?.toUpperCase()}
                            </span>
                        </div>

                        {/* Tab bar */}
                        <div style={{ display: 'flex', borderBottom: '1px solid var(--bd)', flexShrink: 0 }}>
                            {['mission', 'g-host'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setSidebarTab(tab)}
                                    style={{
                                        flex: 1, padding: '7px 0',
                                        background: 'transparent', border: 'none',
                                        borderBottom: sidebarTab === tab ? `2px solid ${tab === 'g-host' ? 'var(--green)' : 'var(--text-mid)'}` : '2px solid transparent',
                                        color: sidebarTab === tab ? (tab === 'g-host' ? 'var(--green)' : 'var(--text-bright)') : 'var(--text-dim)',
                                        fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.14em',
                                        cursor: 'pointer', transition: 'color 0.15s',
                                    }}
                                >
                                    {tab === 'g-host' ? '// G-HOST' : '// MISSION'}
                                </button>
                            ))}
                        </div>

                        {/* MISSION tab */}
                        {sidebarTab === 'mission' && (
                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ padding: '14px', borderBottom: '1px solid var(--bd)' }}>
                                    <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 8 }}>// OBJECTIVE</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-mid)', lineHeight: 1.7 }}>
                                        {activeMissionData?.description}
                                    </div>
                                </div>
                                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--bd)' }}>
                                    <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 8 }}>// TOOLS</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        {activeMissionData?.skills?.map(skill => (
                                            <span key={skill} style={{ fontSize: 9, color: 'var(--text-dim)', border: '1px solid var(--bd)', padding: '1px 5px' }}>
                                                {skill}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                {(() => {
                                    const prog = missionProgress[activeMission];
                                    const found = prog?.found || 0;
                                    const total = prog?.total || activeMissionData?.flagCount || 1;
                                    return (
                                        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--bd)' }}>
                                            <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 8 }}>// FLAGS</div>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {Array.from({ length: total }).map((_, i) => (
                                                    <div key={i} style={{
                                                        width: 10, height: 10,
                                                        background: i < found ? 'var(--green)' : 'var(--bd)',
                                                        border: `1px solid ${i < found ? 'var(--green)' : 'var(--bd)'}`,
                                                    }} />
                                                ))}
                                                <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 4 }}>{found}/{total}</span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {/* G-HOST tab */}
                        {sidebarTab === 'g-host' && (
                            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <GHostChat missionID={activeMission} />
                            </div>
                        )}

                        {/* ── Flag submission (pinned to bottom) ── */}
                        <div style={{ borderTop: '1px solid var(--bd)', padding: '12px 14px', flexShrink: 0 }}>
                            <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 8 }}>// SUBMIT FLAG</div>
                            <input
                                type="text"
                                value={flagInput}
                                onChange={e => { setFlagInput(e.target.value); setFlagResult(null); }}
                                onKeyDown={e => e.key === 'Enter' && handleSubmitFlag()}
                                placeholder="flag{...}"
                                style={{
                                    width: '100%', boxSizing: 'border-box',
                                    background: 'var(--bg-0)',
                                    border: `1px solid ${flagResult && !flagResult.correct ? 'var(--red)' : flagResult?.correct ? 'var(--green)' : 'var(--bd)'}`,
                                    color: 'var(--text-bright)', fontFamily: 'var(--mono)', fontSize: 11,
                                    padding: '6px 8px', outline: 'none', marginBottom: 6,
                                }}
                            />
                            <button
                                className="btn btn--filled btn--sm"
                                style={{ width: '100%', fontSize: 10 }}
                                onClick={handleSubmitFlag}
                                disabled={flagLoading || !flagInput.trim()}
                            >
                                {flagLoading ? 'checking...' : '$ submit flag'}
                            </button>
                            {flagResult && (
                                <div style={{ marginTop: 8, fontSize: 10, lineHeight: 1.6, color: flagResult.correct ? 'var(--green)' : 'var(--red)' }}>
                                    {flagResult.correct
                                        ? flagResult.missionComplete
                                            ? `✓ mission complete! all ${flagResult.total} flags found.`
                                            : `✓ flag ${flagResult.found}/${flagResult.total} — keep hunting!`
                                        : '✕ incorrect — keep trying'
                                    }
                                    {flagResult.correct && flagResult.missionComplete && flagResult.badgeAwarded && (
                                        <div style={{ marginTop: 4, color: 'var(--cyan)' }}>
                                            {flagResult.badgeAwarded.name} badge earned
                                            {flagResult.stakeAwarded > 0 && ` +${flagResult.stakeAwarded} stake`}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
