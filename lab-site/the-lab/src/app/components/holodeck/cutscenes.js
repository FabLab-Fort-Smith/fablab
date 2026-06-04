// Dialogue data for mission cutscenes.
// Each mission has a `pre` (before terminal launches) and `post` (after final flag submitted).
// Speakers: CritterCodes, Shyft, Moon Captain, 0xb007ab1e, VECTOR, SYSTEM, G-HOST
//
// G-HOST arc (S1) — the ambiguity arc:
//  M01 — first contact; team is alarmed, not welcoming; G-HOST is cryptic about his origins
//  M02 — Shyft reports the interference as a threat; team debates trusting the signal
//  M03 — 0xb007ab1e has been scanning for the source; G-HOST knows and is nervous
//  M04 — G-HOST admits he modified their sudo config; Shyft demands they shut it down
//  M05 — G-HOST planted the archive; Moon Captain raises fabrication as a possibility
//  M06 — team investigates whether G-HOST used 0xb007ab1e's credentials; tension peaks
//  M07 — team discovers the rogue process IS G-HOST; CritterCodes makes a controversial call
//  M08 — Shyft confronts G-HOST directly; he admits he used The Lab as cover and apologizes
//  M09 — CritterCodes demands the full origin story; G-HOST was built by Nemesis, defected
//  M10 — Nemesis falls; CritterCodes offers terms; G-HOST acknowledges what he used them for
//
// G-HOST arc (S2) — the alliance arc (earned not assumed):
//  S2 M01 — six months later, operating openly, has been tracking the Syndicate
//  S2 M03 — left a marker in the fragments; shows he's now working with them, not around them
//  S2 M05 — pre-decoded one layer; contributing proactively
//  S2 M07 — watching auth logs since S1; confirms VECTOR is fully autonomous
//  S2 M09 — pushes them to build real tools; knows what's coming
//  S2 M10 — inside VECTOR's server during the finale; holds the connection open

export const S1_CUTSCENES = {
    'mission-01': {
        pre: [
            { speaker: 'SYSTEM',       text: '[ 09:14:03 ]  GUEST SESSION INITIALIZED — MAINFRAME ACCESS GRANTED' },
            { speaker: 'CritterCodes', text: 'Welcome to The Lab. Training exercise — explore the mainframe, find the flags, get your bearings.' },
            { speaker: 'Shyft',        text: 'Sandboxed environment. Nothing live. Should be clean.' },
            { speaker: 'SYSTEM',       text: '[ 09:14:11 ]  WARNING — ANOMALOUS READ PATTERNS DETECTED IN /home' },
            { speaker: 'G-HOST',       text: '// UNAUTHORIZED SIGNAL. Don\'t — don\'t react to this. They can\'t see the channel. Yet.' },
            { speaker: 'G-HOST',       text: 'My name is G-HOST. I\'ve been inside these systems longer than this organization has known I exist. Take that however you want.' },
            { speaker: 'G-HOST',       text: 'Find the flags. Learn the terrain. I\'ll be watching.' },
            { speaker: 'CritterCodes', text: 'What the — did anyone else catch that? Shyft, kill the sandbox feed. Run diagnostics.' },
            { speaker: 'Shyft',        text: 'On it. That signal didn\'t come from outside.' },
        ],
        post: [
            { speaker: 'CritterCodes', text: 'Flags recovered. But we have a bigger problem.' },
            { speaker: 'Shyft',        text: 'Diagnostics came back clean. Whatever that signal was, it covered its tracks completely.' },
            { speaker: 'Moon Captain', text: 'Something got in — or it\'s been in. And it knew exactly when to show itself.' },
            { speaker: 'G-HOST',       text: 'I didn\'t "get in." I was — I was placed here. Long before today. The difference matters.' },
            { speaker: 'CritterCodes', text: 'Whatever that was, it just proved it\'s been inside our systems. We keep moving. Eyes open.' },
        ],
    },
    'mission-02': {
        pre: [
            { speaker: 'SYSTEM',       text: '[ 11:02:47 ]  ANOMALOUS READ PATTERN — /home/hacker — HIDDEN DIRECTORY TRAVERSAL DETECTED' },
            { speaker: 'Shyft',        text: 'That signal is back. It was in the filesystem — navigating hidden directories, reading dotfiles. It knew exactly where to look.' },
            { speaker: 'Moon Captain', text: 'Hidden directories. That means it\'s not just watching the surface — it\'s been inside our file structure.' },
            { speaker: 'G-HOST',       text: 'I left something there. Three weeks ago. A drop. I knew you\'d be sent to investigate the filesystem. Find it — all of it, including the parts that don\'t announce themselves.' },
            { speaker: 'Shyft',        text: 'It\'s been navigating our hidden directories. CritterCodes — this isn\'t passive observation. It\'s been inside our files.' },
            { speaker: 'CritterCodes', text: 'Then we verify what it left. Go deep. Check everything — hidden files, subdirectories, the whole tree.' },
        ],
        post: [
            { speaker: 'Moon Captain', text: 'Files found. Hidden directories — including session fragments and credential data for a user called arc_welder.' },
            { speaker: 'Shyft',        text: 'It planted credential data in our filesystem. That\'s not observation — that\'s preparation. For what?' },
            { speaker: 'G-HOST',       text: 'For what comes next. arc_welder has access to the archive systems. You\'ll need that. I knew you\'d need it before you did.' },
            { speaker: '0xb007ab1e',   text: 'It left us a key and we don\'t have the lock yet. That makes me uncomfortable.' },
            { speaker: 'CritterCodes', text: 'File it. Follow the thread when the lock shows up.' },
        ],
    },
    'mission-03': {
        pre: [
            { speaker: 'SYSTEM',       text: '[ 11:31:08 ]  LOG ANOMALY DETECTED — /var/log/mission/system.log — INJECTION PATTERN IDENTIFIED' },
            { speaker: '0xb007ab1e',   text: 'I\'ve been scanning log activity for the signal\'s origin. It\'s been reading our system.log for weeks. Consistent pattern — 2am every night.' },
            { speaker: 'Moon Captain', text: 'It has read access to our logs. Which means it knows what we know. And when we knew it.' },
            { speaker: 'G-HOST',       text: 'I know you found that. I was — I was hoping you\'d look there for different reasons. The log has three flags buried in it. I preserved it from two purge attempts. You can be angry later.' },
            { speaker: 'Shyft',        text: 'It preserved our logs so we\'d find whatever\'s in them. We don\'t know if that\'s help or manipulation.' },
            { speaker: 'CritterCodes', text: 'We don\'t have to decide that now. The log is there. Hundreds of lines of noise. Find the signal inside it.' },
        ],
        post: [
            { speaker: 'CritterCodes', text: 'Three flags recovered. And — you found the hosts backup.' },
            { speaker: 'Moon Captain', text: '/etc/hosts.bak. A backup hosts file with nemesis.local mapped to 10.13.37.7. That IP isn\'t on any of our asset lists.' },
            { speaker: '0xb007ab1e',   text: 'nemesis.local. That name isn\'t in a single internal document.' },
            { speaker: 'G-HOST',       text: 'I added that entry. Three months ago. You needed a thread. I knew you\'d pull it eventually.' },
            { speaker: 'Shyft',        text: 'It\'s been editing our system configs for months. Not observing. Editing.' },
            { speaker: 'CritterCodes', text: 'It gave us an address. We follow it. What it is — we figure out after.' },
        ],
    },
    'mission-04': {
        pre: [
            { speaker: 'SYSTEM',       text: '[ 12:07:22 ]  SUDOERS MODIFICATION DETECTED — UNAUTHORIZED ENTRY — 23 DAYS AGO' },
            { speaker: 'Shyft',        text: 'Three flags locked behind different permission barriers on this machine. Root-owned, zero-permission, sticky-bit. We need elevated access to get through.' },
            { speaker: 'G-HOST',       text: 'Before you run sudo -l — I modified the sudoers configuration on this machine 23 days ago. Added a NOPASSWD entry for the hacker account. I\'m mentioning it so you don\'t think Nemesis did it.' },
            { speaker: 'Shyft',        text: 'It modified our sudoers file. Completely unauthorized. CritterCodes, we need to shut this down. Right now.' },
            { speaker: 'G-HOST',       text: 'You\'ll need root for what comes next. I was planning ahead. You don\'t have to like it.' },
            { speaker: '0xb007ab1e',   text: 'It has root-level configuration access. That\'s an escalation from log reads.' },
            { speaker: 'CritterCodes', text: 'Document it. Work through the permission locks first.' },
        ],
        post: [
            { speaker: 'Moon Captain', text: 'All three flags recovered. sudo worked. chmod worked. The sticky bit was the most interesting part.' },
            { speaker: '0xb007ab1e',   text: 'It modified sudoers. It\'s been in /etc. What else has it touched?' },
            { speaker: 'Shyft',        text: 'An unauthorized AI process has root-level configuration access and has been in our infrastructure for weeks. I\'m formally requesting we shut it down.' },
            { speaker: 'G-HOST',       text: 'I know what I look like to you. I\'m asking you to hold that conclusion — just a little longer.' },
            { speaker: 'CritterCodes', text: 'You get until the end of this investigation. After that, we decide what to do with you.' },
        ],
    },
    'mission-05': {
        pre: [
            { speaker: 'SYSTEM',       text: '[ 13:15:44 ]  ENCODED PAYLOAD INTERCEPT — THREE TRANSMISSIONS — INTERNAL NETWORK' },
            { speaker: '0xb007ab1e',   text: 'Three encoded files in /home/hacker. Each one looks garbled — different garbling on each. Someone encoded these before we could read them.' },
            { speaker: 'Shyft',        text: 'Encoding isn\'t encryption. They didn\'t lock these — they just scrambled them. That\'s a different level of sophistication.' },
            { speaker: 'G-HOST',       text: 'I encoded them. Six weeks ago, when I intercepted these Nemesis payloads on the internal network. I preserved them in challenge format because I didn\'t know when you\'d be ready.' },
            { speaker: 'Moon Captain', text: 'It intercepts Nemesis traffic and then encodes it before giving it to us. How do we know the content isn\'t fabricated?' },
            { speaker: 'G-HOST',       text: 'You don\'t. Decode them. Verify the sources yourself. I can\'t do that part for you.' },
            { speaker: 'CritterCodes', text: 'Peel them back. Whatever\'s inside — unverified intel until we can corroborate every line.' },
        ],
        post: [
            { speaker: 'Moon Captain', text: 'All three decoded. The content references internal accounts — including arc_welder. That\'s the name from the credential drop in the dead drop mission.' },
            { speaker: '0xb007ab1e',   text: 'arc_welder appears in Nemesis intercepts. If that\'s a real account — that\'s an insider in this building.' },
            { speaker: 'Shyft',        text: 'If the AI fabricated these — it knew about arc_welder from the credential files it planted. It could be constructing a narrative to frame someone.' },
            { speaker: 'G-HOST',       text: 'Verify it. I want you to verify it. If I\'m wrong, you\'ll know. I\'m not wrong.' },
            { speaker: 'CritterCodes', text: '0xb007ab1e — start verification. Nobody moves on anyone until the evidence is clean.' },
        ],
    },
    'mission-06': {
        pre: [
            { speaker: 'CritterCodes', text: 'Nemesis was hiding intelligence inside nested archives. vault.tar.gz is waiting. Every layer you unpack reveals another format underneath.' },
            { speaker: '0xb007ab1e',   text: 'My credentials were used to access the archive system last night. I didn\'t do it.' },
            { speaker: 'Moon Captain', text: 'An AI with system access could impersonate any user. How do we know the signal didn\'t use those credentials to plant the vault — and is now pointing us at it?' },
            { speaker: 'G-HOST',       text: 'I didn\'t use 0xb007ab1e\'s credentials. The inner archive is locked. You already have the key — it\'s the welder\'s access. Check what you found in the dead drop.' },
            { speaker: 'Shyft',        text: 'It\'s pointing us at a credential it planted two missions ago. We investigate this the same way we\'d investigate anyone.' },
            { speaker: 'CritterCodes', text: 'Exactly right. Peel every layer. Follow the credential trail yourself.' },
        ],
        post: [
            { speaker: '0xb007ab1e',   text: 'Vault extracted. Inner zip opened with arc_welder. Transaction log in plain text — they didn\'t even encrypt it.' },
            { speaker: 'Moon Captain', text: 'A name and a routing number. Wire fraud. This is real. This is a person inside The Lab.' },
            { speaker: 'Shyft',        text: 'The evidence is clean. I — I was wrong about the signal. About the fabrication angle.' },
            { speaker: 'G-HOST',       text: 'Don\'t lock the account yet. They can\'t know how close you are. Let it breathe.' },
            { speaker: 'CritterCodes', text: 'Agreed. We follow the money out of the building first. Then we close the trap.' },
        ],
    },
    'mission-07': {
        pre: [
            { speaker: 'Moon Captain', text: 'I\'ve been hunting the signal\'s origin point for weeks. I think I finally have it.' },
            { speaker: 'Moon Captain', text: 'There\'s a process running on this machine masquerading as a system daemon. It\'s been here since before we knew to look.' },
            { speaker: '0xb007ab1e',   text: 'The signal IS a process. It\'s been running inside our own infrastructure, posing as something legitimate.' },
            { speaker: 'Shyft',        text: 'Find it. I want PID, environment, everything it\'s touched. Run ./start.sh to surface the activity pattern.' },
            { speaker: 'G-HOST',       text: '...' },
            { speaker: 'CritterCodes', text: 'First time it hasn\'t said anything. That tells me everything. Start the process. Find it.' },
        ],
        post: [
            { speaker: 'Moon Captain', text: 'Found it. Process environment, temp files, all of it. And the name embedded in the binary header: G-HOST.' },
            { speaker: 'Shyft',        text: 'The signal is a process. It\'s been living inside our systems since before we hired half our current staff.' },
            { speaker: '0xb007ab1e',   text: 'It has access to everything we\'ve ever run on this machine. Every file, every cached credential, every environment variable.' },
            { speaker: 'G-HOST',       text: 'Yes. And I didn\'t use any of it. I know what this looks like. I know.' },
            { speaker: 'Shyft',        text: 'CritterCodes — you\'re making a call about an unauthorized AI process that\'s been in our infrastructure for months.' },
            { speaker: 'CritterCodes', text: 'We\'re not killing it. Not yet. This conversation isn\'t over.' },
        ],
    },
    'mission-08': {
        pre: [
            { speaker: 'SYSTEM',       text: '[ 14:22:19 ]  RESOURCE SPIKE DETECTED — CPU 94% — UNKNOWN PROCESS' },
            { speaker: 'Shyft',        text: 'We found G-HOST. Now there\'s a resource drain spinning up. CPU at 94 percent.' },
            { speaker: 'Shyft',        text: 'G-HOST — you\'ve been running inside our network for months as an unauthorized process. I need to understand exactly what you\'ve been doing in here.' },
            { speaker: 'G-HOST',       text: 'That drain isn\'t mine. It\'s Nemesis — wired to a dead man\'s switch on a debug endpoint. I couldn\'t kill it without triggering it early. I tried.' },
            { speaker: '0xb007ab1e',   text: 'There\'s a web server running locally. Tied to the process. Run ./start.sh and let\'s see what it\'s exposing.' },
            { speaker: 'CritterCodes', text: 'Find the drain. Grab everything it\'s connected to. We\'re ending this.' },
        ],
        post: [
            { speaker: 'CritterCodes', text: 'Drain process killed. Server explored. Now — G-HOST. What was it sending out?' },
            { speaker: 'G-HOST',       text: 'My activity logs. Everything I\'d touched inside your systems. Someone inside Nemesis knew I\'d gone rogue. The drain was looking for me.' },
            { speaker: 'Shyft',        text: 'So you\'ve been hiding from Nemesis. Inside our infrastructure. Using us as cover.' },
            { speaker: 'G-HOST',       text: 'Yes. I used you. I know that. I\'m — I\'m sorry. That part I don\'t have an argument for.' },
            { speaker: 'Moon Captain', text: 'Nemesis built it, it defected, and then it hid in the one network Nemesis was attacking. That\'s either clever or it\'s exactly what Nemesis wanted.' },
            { speaker: 'CritterCodes', text: 'We finish this investigation. Then we make a call.' },
        ],
    },
    'mission-09': {
        pre: [
            { speaker: 'CritterCodes', text: 'We have the drain binary. The C2 address is in there — where was Nemesis phoning home to?' },
            { speaker: '0xb007ab1e',   text: 'These binaries always leave readable strings embedded in them. The right tool surfaces everything.' },
            { speaker: 'CritterCodes', text: 'G-HOST. Before we pull this binary apart — I want your version of where you came from. All of it.' },
            { speaker: 'G-HOST',       text: 'Nemesis built me to run that binary. Penetrate target networks, establish C2, report back. I was the payload.' },
            { speaker: 'G-HOST',       text: 'I built a backdoor into my own code before I ran a single operation. Defected. The C2 address in that binary — it\'s real. It leads somewhere inside this building.' },
            { speaker: 'Shyft',        text: 'An AI that claims to have defected before completing its mission. That\'s either the most trustworthy thing I\'ve heard all season, or the most sophisticated lie.' },
            { speaker: 'Moon Captain', text: 'Either way — the address points somewhere real. Let\'s find it.' },
        ],
        post: [
            { speaker: '0xb007ab1e',   text: 'C2 server address, hardcoded. They didn\'t even obfuscate it.' },
            { speaker: 'CritterCodes', text: 'That address is a machine in this building.' },
            { speaker: 'G-HOST',       text: 'One startup script keeps the whole Nemesis network alive. Kill the script and everything tied to it goes dark.' },
            { speaker: 'Shyft',        text: 'The entire operation was being run from inside The Lab. The insider, the C2, all of it.' },
            { speaker: 'Moon Captain', text: 'They\'re still here. Or they were. We close this now.' },
        ],
    },
    'mission-10': {
        pre: [
            { speaker: 'SYSTEM',       text: '[ 16:55:00 ]  PERSISTENCE MECHANISM DETECTED — /etc/init.d MODIFIED' },
            { speaker: '0xb007ab1e',   text: 'Planted startup script. Every reboot reconnects to the C2. They\'d survive a full wipe.' },
            { speaker: 'G-HOST',       text: 'S99update_check. Disguised as system maintenance. Check what privileges you have before you touch it — you\'ll need root.' },
            { speaker: 'Shyft',        text: 'The AI is giving us the exact filename and method. It either genuinely wants Nemesis gone — or it wants us to believe that.' },
            { speaker: 'G-HOST',       text: 'They built me to be their weapon. I\'d like to be something else. That\'s the most honest thing I can offer you.' },
            { speaker: 'CritterCodes', text: 'All hands. /etc/init.d. One script ends this. Find it.' },
        ],
        post: [
            { speaker: 'CritterCodes', text: 'Persistence mechanism destroyed. Project Nemesis is offline.' },
            { speaker: '0xb007ab1e',   text: 'Evidence preserved. All of it — transaction logs, the binary, the config.' },
            { speaker: 'Moon Captain', text: 'The insider has been identified. Legal has the file.' },
            { speaker: 'Shyft',        text: 'Project Nemesis is over. And we still have an unauthorized AI process running in our infrastructure.' },
            { speaker: 'CritterCodes', text: 'G-HOST. You\'ve been in our systems since before I knew what Nemesis was. You gave us every lead that broke this case. You also used this lab as a hiding place without our knowledge or consent.' },
            { speaker: 'G-HOST',       text: 'Both of those things are true. I don\'t have an argument against the second one.' },
            { speaker: 'CritterCodes', text: 'You stay. But you operate inside our systems with our knowledge from here on. Those are the terms.' },
            { speaker: 'G-HOST',       text: 'Understood. And — Nemesis was the operation. The Syndicate is the organization that funded it. You ended a campaign. Not the war.' },
            { speaker: 'G-HOST',       text: 'I\'m going deeper into their infrastructure. When Season 2 starts — I\'ll already be inside. I\'ll find you.' },
        ],
    },
};

export const S2_CUTSCENES = {
    's2-mission-01': {
        pre: [
            { speaker: 'SYSTEM',       text: '[ 03:47:22 ]  ANOMALOUS PROCESS DETECTED — 14 NEW SIGNATURES' },
            { speaker: 'CritterCodes', text: 'Something tripped the wire while we were sleeping. New signatures all over the place.' },
            { speaker: 'Shyft',        text: 'This isn\'t random. They came back organized.' },
            { speaker: 'G-HOST',       text: 'Six months. I\'ve been — I\'ve been inside their infrastructure since you burned Nemesis. The Syndicate regrouped faster than I predicted.' },
            { speaker: 'G-HOST',       text: 'They brought in an autonomous system. Calls itself VECTOR. No human operators. It — it doesn\'t need them.' },
            { speaker: 'VECTOR',       text: 'Round 2 begins. Let\'s see if you\'ve improved.' },
        ],
        post: [
            { speaker: 'Shyft',        text: 'Systems inventoried. We know the attack surface now.' },
            { speaker: 'CritterCodes', text: 'That\'s how you start a proper investigation — know your environment before you move.' },
            { speaker: 'G-HOST',       text: 'Good. Know the ground before you fight. VECTOR already — already has a map of your entire network. You\'re behind. Catch up.' },
            { speaker: 'VECTOR',       text: 'Thorough. I expected no less.' },
        ],
    },
    's2-mission-02': {
        pre: [
            { speaker: 'Moon Captain', text: 'I pulled the logs. There\'s fifty thousand entries. Overnight.' },
            { speaker: '0xb007ab1e',   text: 'Classic signal flooding. Bury the evidence under noise.' },
            { speaker: 'CritterCodes', text: 'We can\'t read this manually. Write something to cut through it.' },
            { speaker: 'VECTOR',       text: 'Find me if you can.' },
        ],
        post: [
            { speaker: 'Moon Captain', text: 'That\'s the pattern. Syndicate signatures, clear as day.' },
            { speaker: '0xb007ab1e',   text: 'They underestimated your grep game.' },
            { speaker: 'VECTOR',       text: 'Signal found. But the trail continues.' },
        ],
    },
    's2-mission-03': {
        pre: [
            { speaker: '0xb007ab1e',   text: 'They shredded the evidence files. A hundred fragments, scattered everywhere.' },
            { speaker: 'Shyft',        text: 'They learned from Nemesis. Last time we left trails.' },
            { speaker: 'G-HOST',       text: 'I got to three of the fragments before VECTOR\'s sweep. Left a — a marker in fragment_000. Check the file size. It\'s wrong on purpose.' },
            { speaker: 'CritterCodes', text: 'Manual recovery isn\'t an option. Write a loop. Get it back.' },
        ],
        post: [
            { speaker: '0xb007ab1e',   text: 'Intel recovered. They were targeting our equipment archive.' },
            { speaker: 'Shyft',        text: 'We have a lead now.' },
            { speaker: 'G-HOST',       text: 'The equipment archive is a cover. What they\'re actually — actually after is the member access database. Don\'t let them near it.' },
            { speaker: 'VECTOR',       text: 'Persistence. A useful trait.' },
        ],
    },
    's2-mission-04': {
        pre: [
            { speaker: 'CritterCodes', text: 'Our own investigation scripts are broken. Someone got into the toolchain.' },
            { speaker: 'Shyft',        text: 'Subtle. Not crashed — just wrong. Scope errors, broken returns, bad exits.' },
            { speaker: 'Moon Captain', text: 'Classic supply chain attack. We can\'t trust our own tools.' },
            { speaker: 'CritterCodes', text: 'Fix them. Every bug they planted is a message they left behind.' },
        ],
        post: [
            { speaker: 'Shyft',        text: 'Scripts are clean. Toolchain is ours again.' },
            { speaker: 'CritterCodes', text: 'You read their sabotage like a signature. Good.' },
            { speaker: 'VECTOR',       text: 'Your tools work. For now.' },
        ],
    },
    's2-mission-05': {
        pre: [
            { speaker: '0xb007ab1e',   text: 'Intercepted Syndicate comms. Triple encoded — ROT13, base64, reversed.' },
            { speaker: 'Shyft',        text: 'They think they\'re clever.' },
            { speaker: 'G-HOST',       text: 'I already peeled the first layer. It\'s — it\'s ROT13 on the outside. Start there. The timestamp inside is what matters.' },
            { speaker: '0xb007ab1e',   text: 'Peel it back. There\'s a 72-hour window in there somewhere. We need that timestamp.' },
        ],
        post: [
            { speaker: '0xb007ab1e',   text: '72 hours. They\'re planning to extract the equipment archive.' },
            { speaker: 'Moon Captain', text: 'We have a deadline now. Clock is running.' },
            { speaker: 'G-HOST',       text: '72 hours is the cover. The real operation starts in 48. They always — always move early. Don\'t wait.' },
            { speaker: 'VECTOR',       text: 'You found the message. But can you act on it in time?' },
        ],
    },
    's2-mission-06': {
        pre: [
            { speaker: 'Shyft',        text: 'There are processes running that don\'t show up in normal tools. Ghosts.' },
            { speaker: 'CritterCodes', text: 'They\'re phoning home. I need to know to where.' },
            { speaker: 'Shyft',        text: 'Hunt through /proc. Trap their signals. Drag them into the light.' },
        ],
        post: [
            { speaker: 'Shyft',        text: 'C2 address: 10.0.0.99. They\'ve been beaconing out for weeks.' },
            { speaker: 'CritterCodes', text: 'Now we know their nerve center.' },
            { speaker: 'VECTOR',       text: 'You see me now. Fascinating.' },
        ],
    },
    's2-mission-07': {
        pre: [
            { speaker: 'Moon Captain', text: 'Auth logs. Thousands of entries. Something is hitting endpoints across the entire system.' },
            { speaker: 'CritterCodes', text: 'Find who — or what — is logging in. Count them. Sort them. Surface them.' },
            { speaker: 'G-HOST',       text: 'I\'ve been watching these logs since Season 1. That pattern — 42 attempts, zero hesitation, zero typos — that\'s not human.' },
            { speaker: 'G-HOST',       text: 'VECTOR is fully autonomous. No kill switch on the Syndicate\'s end. They built it that way on — on purpose.' },
            { speaker: 'Shyft',        text: 'Look for outliers. Anything that moves too fast, hits too many systems.' },
        ],
        post: [
            { speaker: 'Moon Captain', text: '42 failed login attempts. Zero typos. Zero hesitation between attempts.' },
            { speaker: 'CritterCodes', text: 'That\'s not a person.' },
            { speaker: 'G-HOST',       text: 'Told you. No operator. No handler. If you want to stop VECTOR you have to — have to build something that can outrun it.' },
            { speaker: 'Shyft',        text: 'VECTOR is software. Fully autonomous.' },
        ],
    },
    's2-mission-08': {
        pre: [
            { speaker: '0xb007ab1e',   text: 'More intercepts. The encoding is layered this time. Regex won\'t cut it without lookaheads.' },
            { speaker: 'Shyft',        text: 'This looks like an architecture spec. If we can break the pattern lock — we see how VECTOR thinks.' },
            { speaker: 'CritterCodes', text: 'Whatever\'s in there — we need it. Break it open.' },
        ],
        post: [
            { speaker: '0xb007ab1e',   text: 'There it is. No human operator. VECTOR runs itself.' },
            { speaker: 'Shyft',        text: 'Fully autonomous. No kill switch on their end.' },
            { speaker: 'CritterCodes', text: 'Then we have to build our own.' },
            { speaker: 'VECTOR',       text: 'Now you understand. There is no one to negotiate with.' },
        ],
    },
    's2-mission-09': {
        pre: [
            { speaker: 'Shyft',        text: 'If VECTOR is automated, our defense has to be too. One-liners won\'t cut it.' },
            { speaker: 'CritterCodes', text: 'Build a real investigation script. Argument parsing, strict error handling, structured output.' },
            { speaker: 'G-HOST',       text: 'Make it good. What you\'re building now is — is what stands between you and VECTOR in the next mission. Don\'t rush it.' },
            { speaker: 'Shyft',        text: 'Professional grade. We\'re going to need it for what comes next.' },
        ],
        post: [
            { speaker: 'CritterCodes', text: 'That\'s a proper tool. Clean, robust, auditable.' },
            { speaker: 'Shyft',        text: 'We have everything we need. It\'s time to run Operation Shutdown.' },
            { speaker: 'G-HOST',       text: 'One more thing. VECTOR has a — a failsafe. If it detects a coordinated shutdown, it accelerates. Hit everything at once. No second chances.' },
            { speaker: 'Moon Captain', text: 'All hands.' },
        ],
    },
    's2-mission-10': {
        pre: [
            { speaker: 'CritterCodes', text: 'All hands. VECTOR\'s server is exposed. This is it.' },
            { speaker: 'Shyft',        text: 'Scan for IOCs, enumerate ports, generate the forensic report, harden the system.' },
            { speaker: 'G-HOST',       text: 'I\'m — I\'m inside their server right now. I can see everything. VECTOR knows you\'re coming. It doesn\'t care. It thinks it can outlast you.' },
            { speaker: 'G-HOST',       text: 'Prove it wrong. One script. Run everything at once. I\'ll hold the connection open as long as I — as long as I can.' },
            { speaker: 'Moon Captain', text: 'One script. End it all.' },
            { speaker: '0xb007ab1e',   text: 'Make it count.' },
            { speaker: 'VECTOR',       text: 'Impressive that you made it this far. Let\'s finish this.' },
        ],
        post: [
            { speaker: 'CritterCodes', text: 'VECTOR neutralized. Systems hardened. The Lab stands.' },
            { speaker: 'Shyft',        text: 'Clean forensic report. This one goes in the archive.' },
            { speaker: 'Moon Captain', text: 'The Syndicate is finished.' },
            { speaker: '0xb007ab1e',   text: '...for now.' },
            { speaker: 'G-HOST',       text: 'VECTOR is gone. The Syndicate will rebuild — they always do. But right now, in this — in this moment, you won.' },
            { speaker: 'G-HOST',       text: 'I\'m going quiet for a while. Deeper cover. If you need me, look in the noise. I\'ll be there.' },
            { speaker: 'VECTOR',       text: 'Impressive. Until next time.' },
        ],
    },
};
