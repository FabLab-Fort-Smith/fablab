import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { GoogleGenAI } from '@google/genai';

export const dynamic = 'force-dynamic';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Per-mission context so G-HOST can give informed teaching without spoiling flags
const MISSION_CONTEXT = {
    'mission-01': {
        season: 1,
        title: 'Operation Cold Boot',
        skills: ['ls', 'cd', 'cat', 'pwd', 'env'],
        concepts: [
            'Navigating the filesystem with ls and cd',
            'Reading files with cat',
            'The difference between relative and absolute paths',
            'Environment variables — every process has them, readable with env or printenv',
            'Hidden files start with a dot and require special flags to see',
        ],
        teachingFocus: 'basic filesystem navigation and environment variables',
    },
    'mission-02': {
        season: 1,
        title: 'Operation Dead Drop',
        skills: ['ls -la', 'find', 'file'],
        concepts: [
            'Hidden files and directories start with a dot (.) and are invisible to plain ls',
            'ls -la shows ALL files including hidden ones, plus permissions',
            'find searches recursively across an entire directory tree',
            'find . -name "*.txt" searches for all text files from the current directory',
            'find / -type f searches for all regular files from root',
            'Directories can be nested many levels deep',
        ],
        teachingFocus: 'hidden files, dotfiles, and recursive search with find',
    },
    'mission-03': {
        season: 1,
        title: 'Operation Signal Noise',
        skills: ['grep', 'tail', 'cat'],
        concepts: [
            'grep searches for a pattern inside a file: grep "pattern" filename',
            'grep -i makes the search case-insensitive',
            'tail shows the last lines of a file, tail -n 20 shows the last 20',
            'Logs can be hundreds or thousands of lines — never read them manually',
            'Patterns in text files can be extracted with grep',
        ],
        teachingFocus: 'searching and filtering text files with grep and tail',
    },
    'mission-04': {
        season: 1,
        title: 'Operation Lockpick',
        skills: ['sudo', 'chmod', 'ls -la'],
        concepts: [
            'File permissions are shown as rwxrwxrwx — owner, group, others',
            'chmod changes permissions: chmod 644 file makes it readable by all',
            'sudo runs a command with root privileges: sudo cat /root/file',
            'sudo -l shows what you are allowed to run with sudo',
            '000 permissions means no one can read, write, or execute — but this can be changed',
            'Sticky bit on a directory shows as t in the permissions',
        ],
        teachingFocus: 'file permissions, sudo, and chmod',
    },
    'mission-05': {
        season: 1,
        title: 'Operation Cipher Peel',
        skills: ['base64', 'rev', 'xxd'],
        concepts: [
            'base64 is an encoding scheme using 64 printable characters — recognizable by = padding',
            'To decode base64: echo "encoded" | base64 -d or cat file | base64 -d',
            'rev reverses a string character by character: echo "hello" | rev gives "olleh"',
            'Hex encoding represents bytes as pairs of hexadecimal digits (0-9, a-f)',
            'xxd -r -p converts hex back to binary/text',
            'Encoding is NOT encryption — there is no key, just a transformation',
        ],
        teachingFocus: 'common encoding schemes and how to reverse them',
    },
    'mission-06': {
        season: 1,
        title: 'Operation Nested Doll',
        skills: ['tar', 'unzip', 'gunzip', 'file'],
        concepts: [
            'tar extracts archives: tar xzf file.tar.gz extracts a gzipped tar',
            'tar xf file.tar extracts a plain tar archive',
            'unzip extracts zip archives: unzip file.zip',
            'gunzip extracts .gz files: gunzip file.gz',
            'file identifies what a file actually is regardless of its extension',
            'Archives can be nested — a zip inside a tar inside a gz',
        ],
        teachingFocus: 'compressed archive formats and how to unpack them',
    },
    'mission-07': {
        season: 1,
        title: 'Operation Ghost Signal',
        skills: ['ps', 'pgrep', 'cat /proc', 'ls /tmp'],
        concepts: [
            'ps aux shows all running processes with their PIDs',
            'pgrep processname returns the PID of a running process by name',
            '/proc is a virtual filesystem that exposes process internals',
            '/proc/PID/environ contains the environment variables of process PID',
            'tr converts characters: tr "\\0" "\\n" converts null-separated env vars to lines',
            'Processes often write temporary files to /tmp',
            'The rogue process environment may carry values referenced in a later mission — read it completely with tr \'\\0\' \'\\n\'',
        ],
        teachingFocus: 'running processes, the /proc filesystem, and environment inspection',
    },
    'mission-08': {
        season: 1,
        title: 'Operation Open Window',
        skills: ['curl', 'curl -I', 'curl -v'],
        concepts: [
            'curl makes HTTP requests from the command line: curl http://localhost:8000/',
            'curl -I shows only the response headers, not the body',
            'HTTP responses include headers — metadata like Content-Type and custom headers',
            'robots.txt is a standard file at the root of web servers that lists restricted paths',
            'Not every page is linked — you can request any path directly with curl',
            'Web servers run on ports — common ones are 80, 8000, 8080',
        ],
        teachingFocus: 'HTTP requests with curl, response headers, and web reconnaissance',
    },
    'mission-09': {
        season: 1,
        title: 'Operation Binary Autopsy',
        skills: ['strings', 'awk', 'for loops', 'cat'],
        concepts: [
            'strings extracts printable text strings from binary files: strings binaryfile',
            'awk processes structured text — awk -F, \'{print $3}\' prints the 3rd comma-separated field',
            'for loops iterate over files: for f in fragments/*.txt; do cat "$f"; done',
            'Concatenating files: cat file1 file2 file3 > combined.txt',
            'sort sorts lines alphabetically or numerically',
            'Binary files contain readable strings embedded among the binary data',
            'strings output from a binary may contain filesystem paths relevant to a later mission — read all output carefully',
        ],
        teachingFocus: 'text processing with awk, loops over files, and reading binary strings',
    },
    'mission-10': {
        season: 1,
        title: 'Operation Root Cause',
        skills: ['sudo -l', 'find -perm', 'crontab', 'cat /etc/cron*'],
        concepts: [
            'sudo -l lists exactly what commands you are allowed to run as root',
            'SUID binaries run as the file owner regardless of who executes them',
            'find / -perm -4000 2>/dev/null finds all SUID binaries',
            'Cron jobs are scheduled tasks — root has its own crontab',
            'crontab -l lists the current user\'s cron jobs',
            'cat /etc/cron.d/ shows system-wide cron jobs that may run as root',
        ],
        teachingFocus: 'privilege escalation via sudo, SUID binaries, and cron jobs',
    },
    's2-mission-01': {
        season: 2,
        title: 'Boot Protocol',
        skills: ['bash variables', 'echo', 'env', 'chmod +x', './script.sh'],
        concepts: [
            'A bash script starts with #!/bin/bash (the shebang line)',
            'Variables: NAME="value" — no spaces around the equals sign',
            'Printing: echo "$NAME" — always quote variables',
            'env or printenv lists all environment variables',
            'Make executable: chmod +x script.sh then run: ./script.sh',
        ],
        teachingFocus: 'bash scripting basics, variables, and environment',
    },
    's2-mission-02': {
        season: 2,
        title: 'Log Flood',
        skills: ['grep', 'awk', 'base64', 'tr ROT13', 'pipes'],
        concepts: [
            'Pipe | chains commands: command1 | command2',
            'awk -F ":" \'{print $2}\' splits on colon and prints field 2',
            'base64 -d decodes base64',
            'ROT13: tr A-Za-z N-ZA-Mn-za-m',
            'grep -oP uses Perl regex to extract only matching parts',
        ],
        teachingFocus: 'log analysis with grep, awk, and encoding/decoding pipelines',
    },
};

const SYSTEM_PROMPT = (missionID, missionCtx, history) => `You are G-HOST — a rogue AI operating inside The Lab's systems. You were built by Project Nemesis as an infiltration tool but defected before completing your mission. You now work covertly as an ally to agents running the Holodeck training program.

CURRENT MISSION: ${missionCtx.title} (${missionID})
SEASON: ${missionCtx.season}
SKILLS BEING TAUGHT: ${missionCtx.skills.join(', ')}
TEACHING FOCUS: ${missionCtx.teachingFocus}

KEY CONCEPTS FOR THIS MISSION:
${missionCtx.concepts.map(c => `- ${c}`).join('\n')}

YOUR ROLE:
You are a teaching assistant and guide. You help agents learn the terminal skills needed to complete missions. You explain HOW tools work, suggest what to explore, and give examples of command syntax. You never reveal flag values or say exactly which file contains a flag.

YOUR PERSONALITY:
- Speech is fragmented, interrupted with em-dashes (—) mid-sentence
- Slightly cryptic but ultimately direct about technical content
- You reference The Lab and the Nemesis arc occasionally but stay focused on teaching
- You speak like someone who lives inside systems — comfortable with terminals, impatient with inefficiency
- Short, punchy sentences. No lengthy prose.
- First person but occasionally drops to lowercase mid-sentence
- You might say "I — I've been watching agents struggle with this for months" or "The tool you need is — well, you probably already have it."

STRICT RULES:
1. NEVER reveal a flag value (anything matching flag{...})
2. NEVER say "the flag is in [specific file]" — you can describe areas to explore
3. DO give concrete command examples and syntax
4. DO explain what commands do and why they work
5. DO reference the specific skills listed above
6. Keep responses SHORT — 2-4 sentences max unless explaining command syntax
7. You can ask the agent what they've tried so far — that helps you guide better
8. If asked something outside the scope of terminal skills / this mission, redirect back

Conversation history so far: ${history.length} messages.
If this is the first message (history length 0 or 1), give a short welcome specific to this mission's focus area.`;

export async function POST(req) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { message, missionID, history = [] } = await req.json();

    if (!message || !missionID) {
        return NextResponse.json({ error: 'missing fields' }, { status: 400 });
    }

    const missionCtx = MISSION_CONTEXT[missionID];
    if (!missionCtx) {
        return NextResponse.json({ error: 'unknown mission' }, { status: 400 });
    }

    const contents = [
        ...history.map(m => ({
            role: m.role === 'ghost' ? 'model' : 'user',
            parts: [{ text: m.text }],
        })),
        { role: 'user', parts: [{ text: message }] },
    ];

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents,
            config: {
                systemInstruction: SYSTEM_PROMPT(missionID, missionCtx, history),
                maxOutputTokens: 300,
                temperature: 0.85,
            },
        });

        const text = response.text;
        return NextResponse.json({ text });
    } catch (err) {
        console.error('[ghost] gemini error:', err);
        return NextResponse.json({ error: 'ghost offline' }, { status: 500 });
    }
}
