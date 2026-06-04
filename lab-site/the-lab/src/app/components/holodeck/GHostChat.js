"use client";
import { useState, useEffect, useRef } from 'react';

// ── Animation frames (same paths as MissionCutscene) ─────────────────────────
const IDLE  = ['/ghost/idle.png'];
const TALK  = ['/ghost/talk-a.png', '/ghost/talk-b.png'];

// ── Compact chromatic portrait (image path) ───────────────────────────────────
function ChromaticPortrait({ src, glitching, speaking }) {
    const off = glitching ? 5 : 2;
    return (
        <div style={{ position: 'absolute', inset: 0 }}>
            <img src={src} alt="" style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                filter: 'sepia(1) saturate(10) hue-rotate(160deg) brightness(0.65)',
                mixBlendMode: 'screen', transform: `translateX(${-off}px)`, opacity: 0.5,
            }} />
            <img src={src} alt="" style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                filter: `sepia(1) saturate(5) hue-rotate(80deg) brightness(${speaking ? 0.95 : 0.75})`,
            }} />
            <img src={src} alt="" style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                filter: 'sepia(1) saturate(10) hue-rotate(300deg) brightness(0.65)',
                mixBlendMode: 'screen', transform: `translateX(${off}px)`, opacity: 0.5,
            }} />
        </div>
    );
}

// ── CSS placeholder face (no images yet) ─────────────────────────────────────
function PlaceholderPortrait({ speaking, glitching }) {
    const rows = speaking
        ? ['╔═══╗', '║◉ ◉║', '║ ─ ║', '╚═══╝', '/███\\']
        : ['╔═══╗', '║◈ ◈║', '║   ║', '╚═══╝', '/███\\'];
    return (
        <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 2,
            filter: glitching ? 'hue-rotate(90deg) brightness(1.5)' : 'none',
            transition: 'filter 0.05s',
        }}>
            <div style={{
                fontFamily: 'var(--mono)', fontSize: 14, lineHeight: 1.4,
                color: 'var(--green)', textShadow: '0 0 10px rgba(0,255,65,0.6)',
                textAlign: 'center',
            }}>
                {rows.map((r, i) => <div key={i}>{r}</div>)}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'rgba(0,255,65,0.3)', letterSpacing: '0.2em', marginTop: 6 }}>
                [ NO SIGNAL ]
            </div>
        </div>
    );
}

// ── Compact portrait panel ─────────────────────────────────────────────────────
function GHostPortrait({ speaking, glitching }) {
    const [frame, setFrame]     = useState(0);
    const [hasImgs, setHasImgs] = useState(false);
    const [showGlitch, setShowGlitch] = useState(false);

    useEffect(() => {
        const img = new window.Image();
        img.onload  = () => setHasImgs(true);
        img.onerror = () => setHasImgs(false);
        img.src = '/ghost/idle.png';
    }, []);

    useEffect(() => {
        if (!speaking || !hasImgs) { setFrame(0); return; }
        const t = setInterval(() => setFrame(f => (f + 1) % TALK.length), 135);
        return () => clearInterval(t);
    }, [speaking, hasImgs]);

    useEffect(() => {
        if (!glitching) { setShowGlitch(false); return; }
        setShowGlitch(true);
        const t = setTimeout(() => setShowGlitch(false), 180);
        return () => clearTimeout(t);
    }, [glitching]);

    const src = hasImgs ? (speaking ? TALK[frame] : IDLE[0]) : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Monitor header bar */}
            <div style={{
                background: 'rgba(0,255,65,0.06)',
                border: '1px solid rgba(0,255,65,0.25)',
                borderBottom: 'none',
                padding: '4px 10px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '0.2em', color: 'rgba(0,255,65,0.55)' }}>
                    G-HOST
                </span>
                <div style={{ display: 'flex', gap: 3 }}>
                    {[0,1,2].map(i => (
                        <div key={i} style={{
                            width: 4, height: 4, borderRadius: '50%',
                            background: speaking ? 'var(--green)' : 'rgba(0,255,65,0.2)',
                            animation: speaking ? `gh-signal ${0.4 + i*0.15}s ease-in-out infinite alternate` : 'none',
                        }} />
                    ))}
                </div>
            </div>

            {/* Portrait frame — landscape crop */}
            <div style={{
                border: '1px solid rgba(0,255,65,0.25)',
                background: '#000',
                position: 'relative', overflow: 'hidden',
                aspectRatio: '1 / 1',
                boxShadow: speaking
                    ? '0 0 18px rgba(0,255,65,0.18), inset 0 0 20px rgba(0,0,0,0.8)'
                    : '0 0 6px rgba(0,255,65,0.05), inset 0 0 20px rgba(0,0,0,0.8)',
            }}>
                {src
                    ? <ChromaticPortrait src={src} glitching={showGlitch} speaking={speaking} />
                    : <PlaceholderPortrait speaking={speaking} glitching={showGlitch} />
                }

                {/* Portrait glitch slice */}
                {showGlitch && src && (
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 10,
                        background: `url(${src}) center/cover`,
                        animation: 'gh-port-glitch 0.2s steps(5) forwards',
                        mixBlendMode: 'screen',
                        filter: 'hue-rotate(90deg) brightness(1.4)',
                    }} />
                )}

                {/* Scanlines */}
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 8, pointerEvents: 'none',
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.45) 2px, rgba(0,0,0,0.45) 4px)',
                }} />

                {/* Scan beam */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 30,
                    background: 'linear-gradient(0deg, transparent, rgba(0,255,65,0.05), transparent)',
                    pointerEvents: 'none', zIndex: 9,
                    animation: 'gh-scan 3s linear infinite',
                }} />

                {/* Corner brackets */}
                {[
                    { top: 5, left: 5,    borderTop: '1px solid rgba(0,255,65,0.5)', borderLeft:  '1px solid rgba(0,255,65,0.5)' },
                    { top: 5, right: 5,   borderTop: '1px solid rgba(0,255,65,0.5)', borderRight: '1px solid rgba(0,255,65,0.5)' },
                    { bottom: 5, left: 5,  borderBottom: '1px solid rgba(0,255,65,0.5)', borderLeft:  '1px solid rgba(0,255,65,0.5)' },
                    { bottom: 5, right: 5, borderBottom: '1px solid rgba(0,255,65,0.5)', borderRight: '1px solid rgba(0,255,65,0.5)' },
                ].map((s, i) => (
                    <div key={i} style={{ position: 'absolute', width: 8, height: 8, zIndex: 11, ...s }} />
                ))}

                {/* Speaking audio bars */}
                {speaking && (
                    <div style={{
                        position: 'absolute', bottom: 6, left: 0, right: 0, zIndex: 12,
                        display: 'flex', justifyContent: 'center', gap: 3,
                    }}>
                        {[0,1,2,3,4].map(i => (
                            <div key={i} style={{
                                width: 3, height: 3 + (i % 3) * 4,
                                background: 'var(--green)', opacity: 0.85,
                                animation: `gh-signal ${0.3 + i * 0.08}s ease-in-out infinite alternate`,
                            }} />
                        ))}
                    </div>
                )}
            </div>

            {/* Monitor footer */}
            <div style={{
                background: 'rgba(0,255,65,0.03)',
                border: '1px solid rgba(0,255,65,0.25)',
                borderTop: 'none',
                padding: '3px 10px',
                display: 'flex', justifyContent: 'space-between',
            }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'rgba(0,255,65,0.4)', letterSpacing: '0.15em' }}>
                    {speaking ? '▶ TRANSMITTING' : '■ STANDBY'}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'rgba(0,255,65,0.2)' }}>
                    SIG OK
                </span>
            </div>
        </div>
    );
}

// ── Per-mission command chips ─────────────────────────────────────────────────
// Labels are intentionally short — just the command name, no flags.
// Clicking sends "teach me the X command" to G-HOST.
const MISSION_CHIPS = {
    'mission-01': ['ls', 'cd', 'cat', 'pwd', 'env'],
    'mission-02': ['ls -la', 'find', 'file', 'ls -a'],
    'mission-03': ['grep', 'tail', 'cat', 'less'],
    'mission-04': ['ls -la', 'sudo', 'chmod', 'sudo -l'],
    'mission-05': ['base64', 'rev', 'xxd', 'file'],
    'mission-06': ['tar', 'unzip', 'gunzip', 'file'],
    'mission-07': ['ps', 'pgrep', '/proc', 'env', 'ls /tmp'],
    'mission-08': ['curl', 'curl -I', 'curl -v', 'robots.txt'],
    'mission-09': ['strings', 'awk', 'for loop', 'cat', 'sort'],
    'mission-10': ['sudo -l', 'find -perm', 'crontab -l', 'ls /etc/cron.d', 'ls /etc/init.d'],
    's2-mission-01': ['variables', 'echo', 'chmod +x', './script.sh', 'env'],
    's2-mission-02': ['grep -r', 'awk -F', 'base64 -d', 'tr', 'pipe |'],
    's2-mission-03': ['for loop', 'while read', 'find', 'sort', 'xargs'],
    's2-mission-04': ['bash -x', 'local', 'return', 'set -e', 'function'],
    's2-mission-05': ['sed', 'awk', 'tr', 'rev', 'pipe |'],
    's2-mission-06': ['ps aux', '/proc', 'trap', 'kill', 'fg'],
    's2-mission-07': ['sort', 'uniq', 'awk', 'arrays', 'wc'],
    's2-mission-08': ['grep -E', 'grep -P', 'sed -E', 'lookahead'],
    's2-mission-09': ['getopts', 'set -euo', 'trap ERR', 'heredoc'],
    's2-mission-10': ['curl', 'nmap', 'find', 'chmod', 'report'],
};

const CHIP_CSS = `
@keyframes gh-scan {
    0%   { transform: translateY(-60px) }
    100% { transform: translateY(200px) }
}
@keyframes gh-signal {
    0%,100% { opacity: 0.25; transform: scaleY(0.6) }
    50%     { opacity: 1;    transform: scaleY(1.4) }
}
@keyframes gh-port-glitch {
    0%   { clip-path: inset(0 0 0 0); transform: translateX(0) }
    20%  { clip-path: inset(10% 0 70% 0); transform: translateX(-10px) }
    40%  { clip-path: inset(0 0 0 0); transform: translateX(0) }
    60%  { clip-path: inset(60% 0 20% 0); transform: translateX(8px) }
    80%  { clip-path: inset(0 0 0 0); transform: translateX(0) }
    100% { clip-path: inset(0 0 0 0); transform: translateX(0) }
}
@keyframes gh-blink {
    0%,100% { opacity: 1 } 50% { opacity: 0 }
}
`;

// ── Boot messages ─────────────────────────────────────────────────────────────
const BOOT = {
    'mission-01': 'First login. Read README.txt.\nls lists files. cd moves between directories. cat reads them.\nAsk me about any command you don\'t recognize.',
    'mission-02': 'Something was here before you.\nThe filesystem hides things that don\'t want to be found.\nls -la and find are your best tools here. Ask me how they work.',
    'mission-03': 'Hundreds of log lines. Find the pattern, not the file.\ngrep searches inside files. tail reads from the end.\nWhat are you looking for?',
    'mission-04': 'Three locks, three methods.\nCheck what you\'re already authorized to do before trying anything else.\nsudo -l is always the first question.',
    'mission-05': 'Three encodings. None of them are encryption.\nEach has a standard tool to reverse it.\nIdentify the format first. Ask me if you\'re not sure.',
    'mission-06': 'Nested archives. Every layer is a different format.\nThe file command identifies format by content, not extension.\nAlso — check your earlier work for keys.',
    'mission-07': 'Run ./start.sh first. Always.\nAfter that — something is running that shouldn\'t be.\nProcess environments carry more than you think.',
    'mission-08': 'A web server is running locally.\nrobots.txt is always worth reading — it\'s a map of what they don\'t want indexed.\nAsk me about curl if you haven\'t used it before.',
    'mission-09': 'Three problems, three tools.\nFragments need loops. CSV needs awk. Binaries need strings.\nThe binary carries information beyond the flag.',
    'mission-10': 'sudo -l first. Always check what you\'re authorized to do.\nThen find the SUID binaries. Then check the cron schedule.\nYou already know where one of these flags lives.',
};

// ── Main component ─────────────────────────────────────────────────────────────
export default function GHostChat({ missionID }) {
    const [messages,  setMessages]  = useState([]);
    const [input,     setInput]     = useState('');
    const [loading,   setLoading]   = useState(false);
    const [booted,    setBooted]    = useState(false);
    const [glitching, setGlitching] = useState(false);
    const [usedChips, setUsedChips] = useState(new Set());
    const bottomRef = useRef(null);
    const inputRef  = useRef(null);

    // Boot: glitch flash → first message
    useEffect(() => {
        setMessages([]);
        setBooted(false);
        setUsedChips(new Set());
        setGlitching(true);
        const t1 = setTimeout(() => setGlitching(false), 500);
        const t2 = setTimeout(() => {
            const boot = BOOT[missionID] ?? 'Channel open. What do you need?';
            setMessages([{ role: 'ghost', text: boot, id: 0 }]);
            setBooted(true);
        }, 650);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [missionID]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    const send = async (text) => {
        const msg = (text ?? input).trim();
        if (!msg || loading || !booted) return;
        setInput('');

        const history = messages
            .filter(m => m.role === 'ghost')
            .map(m => ({ role: 'ghost', text: m.text }));

        setMessages(prev => [...prev, { role: 'user', text: msg, id: Date.now() }]);
        setLoading(true);

        try {
            const res  = await fetch('/api/v1/holodeck/ghost', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, missionID, history }),
            });
            const data = await res.json();
            setMessages(prev => [...prev, {
                role: 'ghost', text: data.text ?? '// signal lost', id: Date.now() + 1,
            }]);
        } catch {
            setMessages(prev => [...prev, {
                role: 'ghost', text: '// signal interrupted', id: Date.now() + 1,
            }]);
        } finally {
            setLoading(false);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    const sendChip = (chip) => {
        setUsedChips(prev => new Set([...prev, chip]));
        send(`teach me the ${chip} command`);
    };

    const chips = MISSION_CHIPS[missionID] ?? [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'var(--mono)' }}>
            <style>{CHIP_CSS}</style>

            {/* Portrait */}
            <div style={{ padding: '12px 14px 0', flexShrink: 0 }}>
                <GHostPortrait speaking={loading} glitching={glitching} />
            </div>

            {/* Command chips */}
            {chips.length > 0 && (
                <div style={{ padding: '10px 14px 6px', flexShrink: 0 }}>
                    <div style={{ fontSize: 8, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>
                        // ASK ABOUT
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {chips.map(chip => {
                            const used = usedChips.has(chip);
                            return (
                                <button
                                    key={chip}
                                    onClick={() => !used && !loading && sendChip(chip)}
                                    disabled={used || loading}
                                    style={{
                                        fontFamily: 'var(--mono)',
                                        fontSize: 9,
                                        letterSpacing: '0.08em',
                                        padding: '3px 7px',
                                        background: used ? 'rgba(0,255,65,0.06)' : 'transparent',
                                        border: `1px solid ${used ? 'rgba(0,255,65,0.2)' : 'var(--green)'}`,
                                        color: used ? 'var(--text-dim)' : 'var(--green)',
                                        cursor: used || loading ? 'default' : 'pointer',
                                        transition: 'all 0.15s',
                                        opacity: used ? 0.45 : 1,
                                    }}
                                >
                                    $ {chip}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--bd)', flexShrink: 0, margin: '4px 0' }} />

            {/* Chat history */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.map(msg => (
                    <div key={msg.id} style={{
                        display: 'flex',
                        flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                        gap: 6, alignItems: 'flex-start',
                    }}>
                        {msg.role === 'ghost' && (
                            <div style={{
                                width: 12, height: 12, flexShrink: 0, marginTop: 3,
                                border: '1px solid rgba(0,255,65,0.4)',
                                background: 'rgba(0,255,65,0.1)',
                            }} />
                        )}
                        <div style={{
                            maxWidth: '88%', fontSize: 10, lineHeight: 1.65,
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            ...(msg.role === 'ghost' ? {
                                color: 'var(--text-mid)',
                                borderLeft: '2px solid rgba(0,255,65,0.4)',
                                paddingLeft: 8,
                            } : {
                                color: 'var(--text-dim)',
                                borderRight: '2px solid var(--bd)',
                                paddingRight: 8,
                                textAlign: 'right',
                            }),
                        }}>
                            {msg.text}
                        </div>
                    </div>
                ))}

                {/* Typing indicator */}
                {loading && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        <div style={{
                            width: 12, height: 12, flexShrink: 0, marginTop: 3,
                            border: '1px solid rgba(0,255,65,0.4)',
                            background: 'rgba(0,255,65,0.06)',
                        }} />
                        <div style={{
                            borderLeft: '2px solid rgba(0,255,65,0.4)',
                            paddingLeft: 8, display: 'flex', gap: 4, alignItems: 'center', paddingTop: 3,
                        }}>
                            {[0,1,2].map(i => (
                                <div key={i} style={{
                                    width: 4, height: 4, background: 'var(--green)',
                                    animation: `gh-signal 0.8s ${i*0.15}s ease-in-out infinite`,
                                }} />
                            ))}
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{
                borderTop: '1px solid var(--bd)',
                padding: '8px 14px',
                flexShrink: 0,
                display: 'flex', gap: 6, alignItems: 'center',
            }}>
                <span style={{ fontSize: 9, color: 'var(--green)', flexShrink: 0, animation: booted && !loading ? 'gh-blink 1.2s step-end infinite' : 'none' }}>_</span>
                <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                    placeholder="ask g-host..."
                    disabled={!booted || loading}
                    style={{
                        flex: 1, background: 'transparent', border: 'none', outline: 'none',
                        fontFamily: 'var(--mono)', fontSize: 10,
                        color: 'var(--text-bright)', caretColor: 'var(--green)',
                    }}
                />
                <button
                    onClick={() => send()}
                    disabled={!booted || loading || !input.trim()}
                    style={{
                        background: 'transparent',
                        border: `1px solid ${input.trim() && !loading ? 'var(--green)' : 'var(--bd)'}`,
                        color: input.trim() && !loading ? 'var(--green)' : 'var(--text-dim)',
                        fontFamily: 'var(--mono)', fontSize: 9,
                        letterSpacing: '0.1em', padding: '2px 7px',
                        cursor: input.trim() && !loading ? 'pointer' : 'default',
                        transition: 'all 0.15s',
                    }}
                >
                    send
                </button>
            </div>
        </div>
    );
}
