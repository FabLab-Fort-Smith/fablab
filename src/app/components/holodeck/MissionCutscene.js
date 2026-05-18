'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

const SPEAKER_COLORS = {
    'SYSTEM':       '#556655',
    'CritterCodes': '#00ff41',
    'Shyft':        '#00bcd4',
    'Moon Captain': '#9b59b6',
    '0xb007ab1e':   '#f39c12',
    'VECTOR':       '#ff0040',
    'G-HOST':       '#00ff41',
};

const SPEAKER_GLYPHS = {
    'SYSTEM':       '////',
    'CritterCodes': 'CC',
    'Shyft':        'SH',
    'Moon Captain': 'MC',
    '0xb007ab1e':   '0x',
    'VECTOR':       '!',
    'G-HOST':       'GH',
};

const TYPEWRITER_SPEED = {
    'VECTOR':  42,
    'SYSTEM':  16,
    'G-HOST':  28,
    default:   20,
};

// Frames served from /ghost/ — swap in your generated images here
const GHOST_FRAMES_IDLE = ['/ghost/idle.png'];
const GHOST_FRAMES_TALK = ['/ghost/talk-a.png', '/ghost/talk-b.png'];

const CSS = `
@keyframes cs-blink {
  0%,100%{ opacity:1 } 50%{ opacity:0 }
}
@keyframes cs-flicker {
  0%,100%{ opacity:1 }
  91%     { opacity:1 }
  92%     { opacity:0.82 }
  93%     { opacity:1 }
  97%     { opacity:0.88 }
  98%     { opacity:1 }
}
@keyframes cs-scanbeam {
  0%   { transform: translateY(-100px) }
  100% { transform: translateY(100vh) }
}
@keyframes cs-chromatic {
  0%,100%{ text-shadow: none }
  30%    { text-shadow: 3px 0 0 rgba(255,0,40,0.75), -3px 0 0 rgba(0,255,200,0.75) }
  60%    { text-shadow: -2px 0 0 rgba(255,0,40,0.5), 2px 0 0 rgba(0,200,255,0.5) }
}
@keyframes cs-avatar-glitch {
  0%  { transform: translateX(0) scaleX(1);    filter: none }
  20% { transform: translateX(-7px) scaleX(1.03); filter: hue-rotate(120deg) brightness(1.6) }
  40% { transform: translateX(5px) scaleX(0.97);  filter: none }
  60% { transform: translateX(-3px) scaleX(1);    filter: hue-rotate(-60deg) saturate(2) }
  80% { transform: translateX(2px) scaleX(1);     filter: none }
  100%{ transform: translateX(0) scaleX(1);    filter: none }
}
@keyframes cs-ghost-scan {
  0%   { transform: translateY(-100%) }
  100% { transform: translateY(400px) }
}
@keyframes cs-portrait-glitch {
  0%,100% { clip-path: inset(0 0 0 0); transform: translateX(0) }
  15%     { clip-path: inset(8% 0 72% 0); transform: translateX(-12px) }
  30%     { clip-path: inset(0 0 0 0); transform: translateX(0) }
  45%     { clip-path: inset(62% 0 18% 0); transform: translateX(10px) }
  60%     { clip-path: inset(0 0 0 0); transform: translateX(0) }
  75%     { clip-path: inset(35% 0 48% 0); transform: translateX(-8px) }
  90%     { clip-path: inset(0 0 0 0); transform: translateX(0) }
}
@keyframes cs-signal-bar {
  0%,100% { opacity: 0.3 }
  50%     { opacity: 1 }
}
`;

// ── G-HOST Portrait ──────────────────────────────────────────────────────────

function GHostPortrait({ isSpeaking, isGlitching, glitchKey }) {
    const [talkFrame, setTalkFrame]   = useState(0);
    const [hasImages, setHasImages]   = useState(false);
    const [showGlitch, setShowGlitch] = useState(false);

    // Detect if /ghost/idle.png exists
    useEffect(() => {
        const img = new window.Image();
        img.onload  = () => setHasImages(true);
        img.onerror = () => setHasImages(false);
        img.src = '/ghost/idle.png';
    }, []);

    // Flipbook while speaking
    useEffect(() => {
        if (!isSpeaking || !hasImages) { setTalkFrame(0); return; }
        const t = setInterval(() => setTalkFrame(f => (f + 1) % GHOST_FRAMES_TALK.length), 135);
        return () => clearInterval(t);
    }, [isSpeaking, hasImages]);

    // Portrait-specific glitch (more intense than the global one)
    useEffect(() => {
        if (!isGlitching) { setShowGlitch(false); return; }
        setShowGlitch(true);
        const t = setTimeout(() => setShowGlitch(false), 180);
        return () => clearTimeout(t);
    }, [isGlitching, glitchKey]);

    const frameSrc = hasImages
        ? (isSpeaking ? GHOST_FRAMES_TALK[talkFrame] : GHOST_FRAMES_IDLE[0])
        : null;

    return (
        <div style={{
            width: 200, flexShrink: 0,
            display: 'flex', flexDirection: 'column',
            gap: 0,
        }}>
            {/* Monitor header */}
            <div style={{
                background: 'rgba(0,255,65,0.06)',
                border: '1px solid rgba(0,255,65,0.3)',
                borderBottom: 'none',
                padding: '5px 10px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '0.2em', color: 'rgba(0,255,65,0.6)' }}>
                    G-HOST
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                    {[0,1,2].map(i => (
                        <div key={i} style={{
                            width: 4, height: 4, borderRadius: '50%',
                            background: isSpeaking ? 'var(--green)' : 'rgba(0,255,65,0.25)',
                            animation: isSpeaking ? `cs-signal-bar ${0.4 + i * 0.15}s ease-in-out infinite alternate` : 'none',
                        }} />
                    ))}
                </div>
            </div>

            {/* Portrait frame */}
            <div style={{
                border: '1px solid rgba(0,255,65,0.3)',
                background: '#000',
                position: 'relative',
                overflow: 'hidden',
                aspectRatio: '3/4',
                boxShadow: isSpeaking
                    ? '0 0 24px rgba(0,255,65,0.2), inset 0 0 24px rgba(0,0,0,0.8)'
                    : '0 0 8px rgba(0,255,65,0.06), inset 0 0 24px rgba(0,0,0,0.8)',
            }}>
                {frameSrc ? (
                    // Real image with chromatic aberration
                    <ChromaticPortrait src={frameSrc} isGlitching={showGlitch} isSpeaking={isSpeaking} />
                ) : (
                    // CSS placeholder until images are generated
                    <PlaceholderPortrait isSpeaking={isSpeaking} isGlitching={showGlitch} />
                )}

                {/* Portrait glitch layer */}
                {showGlitch && (
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 10,
                        background: frameSrc ? `url(${frameSrc}) center/cover` : 'transparent',
                        animation: 'cs-portrait-glitch 0.2s steps(6) forwards',
                        mixBlendMode: 'screen',
                        filter: 'hue-rotate(90deg) brightness(1.4)',
                    }} />
                )}

                {/* Scanline overlay */}
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 8, pointerEvents: 'none',
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 4px)',
                }} />

                {/* Moving scan beam */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 40,
                    background: 'linear-gradient(0deg, transparent, rgba(0,255,65,0.06), transparent)',
                    pointerEvents: 'none', zIndex: 9,
                    animation: 'cs-ghost-scan 3s linear infinite',
                }} />

                {/* Corner brackets */}
                {[
                    { top: 6, left: 6, borderTop: '1px solid rgba(0,255,65,0.6)', borderLeft: '1px solid rgba(0,255,65,0.6)' },
                    { top: 6, right: 6, borderTop: '1px solid rgba(0,255,65,0.6)', borderRight: '1px solid rgba(0,255,65,0.6)' },
                    { bottom: 6, left: 6, borderBottom: '1px solid rgba(0,255,65,0.6)', borderLeft: '1px solid rgba(0,255,65,0.6)' },
                    { bottom: 6, right: 6, borderBottom: '1px solid rgba(0,255,65,0.6)', borderRight: '1px solid rgba(0,255,65,0.6)' },
                ].map((s, i) => (
                    <div key={i} style={{ position: 'absolute', width: 10, height: 10, zIndex: 11, ...s }} />
                ))}

                {/* Speaking indicator */}
                {isSpeaking && (
                    <div style={{
                        position: 'absolute', bottom: 8, left: 0, right: 0, zIndex: 12,
                        display: 'flex', justifyContent: 'center', gap: 4,
                    }}>
                        {[0,1,2,3,4].map(i => (
                            <div key={i} style={{
                                width: 3,
                                height: 4 + (i % 3) * 4,
                                background: 'var(--green)',
                                opacity: 0.8,
                                animation: `cs-signal-bar ${0.3 + i * 0.08}s ease-in-out infinite alternate`,
                            }} />
                        ))}
                    </div>
                )}
            </div>

            {/* Monitor footer */}
            <div style={{
                background: 'rgba(0,255,65,0.04)',
                border: '1px solid rgba(0,255,65,0.3)',
                borderTop: 'none',
                padding: '4px 10px',
                display: 'flex', justifyContent: 'space-between',
            }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'rgba(0,255,65,0.4)', letterSpacing: '0.15em' }}>
                    {isSpeaking ? '▶ TRANSMITTING' : '■ STANDBY'}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'rgba(0,255,65,0.25)' }}>
                    {isGlitching ? 'ERR' : 'SIG OK'}
                </span>
            </div>
        </div>
    );
}

function ChromaticPortrait({ src, isGlitching, isSpeaking }) {
    const offset = isGlitching ? 5 : 2;
    return (
        <div style={{ position: 'absolute', inset: 0 }}>
            {/* Cyan channel — left offset */}
            <img src={src} alt="" style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                filter: 'sepia(1) saturate(10) hue-rotate(160deg) brightness(0.65)',
                mixBlendMode: 'screen',
                transform: `translateX(${-offset}px)`,
                opacity: 0.5,
            }} />
            {/* Green base */}
            <img src={src} alt="" style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                filter: `sepia(1) saturate(5) hue-rotate(80deg) brightness(${isSpeaking ? 0.95 : 0.75})`,
                display: 'block',
            }} />
            {/* Red channel — right offset */}
            <img src={src} alt="" style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                filter: 'sepia(1) saturate(10) hue-rotate(300deg) brightness(0.65)',
                mixBlendMode: 'screen',
                transform: `translateX(${offset}px)`,
                opacity: 0.5,
            }} />
        </div>
    );
}

function PlaceholderPortrait({ isSpeaking, isGlitching }) {
    // ASCII-art style face placeholder until real images are generated
    const lines = isSpeaking
        ? ['  ╔═══╗  ', ' ║◉ ◉║ ', ' ║ ─ ║ ', '  ╚═══╝  ', ' /█████\\ ']
        : ['  ╔═══╗  ', ' ║◈ ◈║ ', ' ║   ║ ', '  ╚═══╝  ', ' /█████\\ '];
    return (
        <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 2,
            filter: isGlitching ? 'hue-rotate(90deg) brightness(1.5)' : 'none',
            transition: 'filter 0.05s',
        }}>
            <div style={{
                fontFamily: 'var(--mono)', fontSize: 18, lineHeight: 1.4,
                color: 'var(--green)',
                textShadow: '0 0 12px rgba(0,255,65,0.6)',
                textAlign: 'center',
                letterSpacing: '0.05em',
            }}>
                {lines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
            <div style={{
                fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(0,255,65,0.35)',
                letterSpacing: '0.2em', marginTop: 8,
            }}>
                [ NO SIGNAL ]
            </div>
            <div style={{
                fontFamily: 'var(--mono)', fontSize: 7, color: 'rgba(0,255,65,0.2)',
                letterSpacing: '0.1em',
            }}>
                drop images in /public/ghost/
            </div>
        </div>
    );
}

// ── Small speaker avatar (non-G-HOST speakers) ────────────────────────────

function SpeakerAvatar({ speaker, glitching, glitchKey }) {
    const color = SPEAKER_COLORS[speaker] ?? '#00ff41';
    const glyph = SPEAKER_GLYPHS[speaker] ?? speaker[0].toUpperCase();
    return (
        <div
            key={glitchKey}
            style={{
                width: 52, height: 52, flexShrink: 0,
                border: `1px solid ${color}50`,
                background: `${color}09`,
                position: 'relative', overflow: 'hidden',
                boxShadow: `0 0 14px ${color}28, inset 0 0 10px ${color}12`,
                animation: glitching ? 'cs-avatar-glitch 0.18s steps(4) forwards' : 'none',
            }}
        >
            <div style={{
                position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.45) 2px, rgba(0,0,0,0.45) 4px)',
            }} />
            <div style={{
                position: 'absolute', inset: 0, zIndex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--mono)', fontSize: speaker === 'SYSTEM' ? 10 : 15,
                fontWeight: 700, color,
                letterSpacing: speaker === 'SYSTEM' ? '0.05em' : '-0.03em',
                textShadow: `0 0 8px ${color}80`,
            }}>
                {glyph}
            </div>
            {[
                { top: 3, left: 3, borderTop: `1px solid ${color}`, borderLeft: `1px solid ${color}` },
                { top: 3, right: 3, borderTop: `1px solid ${color}`, borderRight: `1px solid ${color}` },
                { bottom: 3, left: 3, borderBottom: `1px solid ${color}`, borderLeft: `1px solid ${color}` },
                { bottom: 3, right: 3, borderBottom: `1px solid ${color}`, borderRight: `1px solid ${color}` },
            ].map((s, i) => (
                <div key={i} style={{ position: 'absolute', width: 6, height: 6, zIndex: 3, ...s }} />
            ))}
            <div style={{
                position: 'absolute', bottom: 4, right: 4, zIndex: 3,
                width: 3, height: 3, borderRadius: '50%',
                background: color, boxShadow: `0 0 4px ${color}`,
                animation: 'cs-blink 0.9s step-end infinite',
            }} />
        </div>
    );
}

// ── Dialogue line ──────────────────────────────────────────────────────────

function DialogueLine({ speaker, text, dim = false, cursor = false, glitching = false, glitchKey = 0, compact = false }) {
    const color = SPEAKER_COLORS[speaker] ?? 'var(--text-bright)';
    const isGhost = speaker === 'G-HOST';
    return (
        <div style={{
            opacity: dim ? 0.28 : 1, transition: 'opacity 0.4s',
            display: 'flex', gap: compact ? 12 : 18, alignItems: 'flex-start',
        }}>
            {/* Skip avatar for G-HOST (portrait is shown separately) or dim spacer */}
            {isGhost ? (
                <div style={{ width: compact ? 0 : 0, flexShrink: 0 }} />
            ) : dim ? (
                <div style={{ width: compact ? 0 : 52, flexShrink: 0 }} />
            ) : (
                <SpeakerAvatar speaker={speaker} glitching={glitching} glitchKey={glitchKey} />
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 9, letterSpacing: '0.2em', color,
                    marginBottom: 5,
                    display: 'flex', alignItems: 'center', gap: 8,
                    animation: (!dim && glitching) ? 'cs-chromatic 0.15s ease-in-out' : 'none',
                    textShadow: !dim ? `0 0 8px ${color}50` : 'none',
                }}>
                    {speaker === 'VECTOR' && <span>⚠</span>}
                    {isGhost && !dim && <span style={{ color: 'rgba(0,255,65,0.5)' }}>{'>'}</span>}
                    {speaker.toUpperCase()}
                    {!dim && (
                        <span style={{
                            display: 'inline-block', width: 4, height: 4, borderRadius: '50%',
                            background: color, animation: 'cs-blink 1s step-end infinite',
                        }} />
                    )}
                </div>
                <div style={{
                    fontSize: 13, lineHeight: 1.78,
                    color: dim ? 'rgba(200,220,200,0.35)' : (speaker === 'VECTOR' ? color : 'rgba(220,240,220,0.92)'),
                    fontWeight: speaker === 'VECTOR' ? 500 : 400,
                    letterSpacing: isGhost ? '0.02em' : '0.01em',
                    fontStyle: isGhost ? 'italic' : 'normal',
                }}>
                    {text}
                    {cursor && (
                        <span style={{
                            display: 'inline-block', width: 8, height: 14,
                            background: 'var(--green)', marginLeft: 2,
                            verticalAlign: 'middle',
                            animation: 'cs-blink 1s step-end infinite',
                        }} />
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Main cutscene component ────────────────────────────────────────────────

export default function MissionCutscene({ lines, ctaLabel = 'Continue', onComplete }) {
    const [lineIndex, setLineIndex]         = useState(0);
    const [charIndex, setCharIndex]         = useState(0);
    const [displayedText, setDisplayedText] = useState('');
    const [allDone, setAllDone]             = useState(false);
    const [revealedLines, setRevealedLines] = useState([]);
    const [glitching, setGlitching]         = useState(false);
    const [glitchKey, setGlitchKey]         = useState(0);
    const glitchTimerRef                    = useRef(null);

    const currentLine = lines[lineIndex];
    const isLastLine  = lineIndex === lines.length - 1;
    const hasGhost    = lines.some(l => l.speaker === 'G-HOST');
    const ghostSpeaking = !allDone && currentLine?.speaker === 'G-HOST';

    // Random glitch scheduler
    useEffect(() => {
        const schedule = () => {
            const delay = 1200 + Math.random() * 3000;
            glitchTimerRef.current = setTimeout(() => {
                setGlitching(true);
                setGlitchKey(k => k + 1);
                setTimeout(() => { setGlitching(false); schedule(); }, 80 + Math.random() * 160);
            }, delay);
        };
        schedule();
        return () => clearTimeout(glitchTimerRef.current);
    }, []);

    // Typewriter tick
    useEffect(() => {
        if (allDone || lineIndex >= lines.length) return;
        const text = currentLine.text;
        if (charIndex >= text.length) return;
        const speed = TYPEWRITER_SPEED[currentLine.speaker] ?? TYPEWRITER_SPEED.default;
        const t = setTimeout(() => {
            setDisplayedText(prev => prev + text[charIndex]);
            setCharIndex(c => c + 1);
        }, speed);
        return () => clearTimeout(t);
    }, [charIndex, lineIndex, currentLine, allDone, lines.length]);

    const advance = useCallback(() => {
        const text = currentLine.text;
        if (charIndex < text.length) {
            setDisplayedText(text);
            setCharIndex(text.length);
            return;
        }
        setGlitching(true);
        setGlitchKey(k => k + 1);
        setTimeout(() => setGlitching(false), 80);

        setRevealedLines(prev => [...prev, { speaker: currentLine.speaker, text }]);
        if (isLastLine) {
            setAllDone(true);
        } else {
            setLineIndex(i => i + 1);
            setCharIndex(0);
            setDisplayedText('');
        }
    }, [charIndex, currentLine, isLastLine]);

    useEffect(() => {
        const handler = (e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !allDone) {
                e.preventDefault();
                advance();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [advance, allDone]);

    return (
        <div
            onClick={!allDone ? advance : undefined}
            style={{
                position: 'fixed', inset: 0, zIndex: 2000,
                background: '#000208',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--mono)',
                cursor: allDone ? 'default' : 'pointer',
                userSelect: 'none',
                animation: 'cs-flicker 9s ease-in-out infinite',
            }}
        >
            <style>{CSS}</style>

            {/* Base scanlines */}
            <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.38) 2px, rgba(0,0,0,0.38) 4px)',
            }} />

            {/* Moving scan beam */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 80,
                background: 'linear-gradient(0deg, transparent, rgba(0,255,65,0.03), transparent)',
                pointerEvents: 'none', zIndex: 2,
                animation: 'cs-scanbeam 7s linear infinite',
            }} />

            {/* Vignette */}
            <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
                background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.78) 100%)',
            }} />

            {/* Glitch displacement bars */}
            {glitching && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4, overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,255,65,0.04)', clipPath: 'inset(12% 0 82% 0)', transform: 'translateX(-10px)' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,0,40,0.04)', clipPath: 'inset(48% 0 44% 0)', transform: 'translateX(8px)' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,180,255,0.03)', clipPath: 'inset(72% 0 22% 0)', transform: 'translateX(-6px)' }} />
                </div>
            )}

            {/* Content */}
            <div style={{
                position: 'relative', zIndex: 10,
                width: '100%', maxWidth: hasGhost ? 860 : 720,
                padding: '0 24px',
                transition: 'max-width 0.3s ease',
            }}>
                {/* Header bar */}
                <div style={{
                    borderTop: '1px solid rgba(0,255,65,0.2)',
                    borderLeft: '1px solid rgba(0,255,65,0.2)',
                    borderRight: '1px solid rgba(0,255,65,0.2)',
                    padding: '6px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'rgba(0,0,0,0.85)',
                }}>
                    <span style={{
                        fontSize: 9, letterSpacing: '0.22em',
                        color: glitching ? 'rgba(0,255,65,0.9)' : 'rgba(0,255,65,0.45)',
                        animation: glitching ? 'cs-chromatic 0.15s ease-in-out' : 'none',
                        transition: 'color 0.05s',
                    }}>
                        {hasGhost ? '// GHOST CHANNEL — ENCRYPTED' : '// SECURE CHANNEL — THE LAB'}
                    </span>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span style={{ fontSize: 9, letterSpacing: '0.15em', color: 'rgba(0,255,65,0.25)' }}>
                            {lineIndex + 1}/{lines.length}
                        </span>
                        <span style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: glitching ? '#ff0040' : 'rgba(0,255,65,0.5)',
                            display: 'inline-block',
                            transition: 'background 0.05s',
                            boxShadow: glitching ? '0 0 6px #ff0040' : '0 0 4px rgba(0,255,65,0.4)',
                        }} />
                    </div>
                </div>

                {/* Body row */}
                <div style={{
                    border: '1px solid rgba(0,255,65,0.2)',
                    background: 'rgba(0,3,1,0.94)',
                    display: 'flex', gap: 0,
                    minHeight: 260,
                    boxShadow: '0 0 40px rgba(0,255,65,0.04), inset 0 0 40px rgba(0,0,0,0.6)',
                    transform: glitching ? 'translateX(1px)' : 'none',
                    transition: 'transform 0.05s',
                }}>
                    {/* G-HOST portrait panel */}
                    {hasGhost && (
                        <div style={{
                            padding: '16px 0 16px 16px',
                            display: 'flex', alignItems: 'center',
                            opacity: ghostSpeaking || allDone ? 1 : 0.55,
                            transition: 'opacity 0.3s',
                        }}>
                            <GHostPortrait
                                isSpeaking={ghostSpeaking}
                                isGlitching={glitching}
                                glitchKey={glitchKey}
                            />
                        </div>
                    )}

                    {/* Divider */}
                    {hasGhost && (
                        <div style={{
                            width: 1,
                            margin: '16px 0',
                            background: 'linear-gradient(to bottom, transparent, rgba(0,255,65,0.2) 20%, rgba(0,255,65,0.2) 80%, transparent)',
                            marginLeft: 16,
                        }} />
                    )}

                    {/* Dialogue pane */}
                    <div style={{
                        flex: 1, padding: '22px 24px',
                        display: 'flex', flexDirection: 'column', gap: 18,
                        overflowY: 'auto',
                    }}>
                        {revealedLines.map((line, i) => (
                            <DialogueLine
                                key={i}
                                speaker={line.speaker}
                                text={line.text}
                                dim
                                glitching={false}
                                compact={hasGhost}
                            />
                        ))}
                        {!allDone && (
                            <DialogueLine
                                speaker={currentLine.speaker}
                                text={displayedText}
                                cursor={charIndex < currentLine.text.length}
                                glitching={glitching}
                                glitchKey={glitchKey}
                                compact={hasGhost}
                            />
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    borderBottom: '1px solid rgba(0,255,65,0.2)',
                    borderLeft: '1px solid rgba(0,255,65,0.2)',
                    borderRight: '1px solid rgba(0,255,65,0.2)',
                    padding: '8px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'rgba(0,0,0,0.85)',
                }}>
                    {allDone ? (
                        <button
                            onClick={onComplete}
                            style={{
                                width: '100%',
                                fontFamily: 'var(--mono)', fontSize: 11,
                                letterSpacing: '0.18em', padding: '9px 0',
                                background: 'rgba(0,255,65,0.07)',
                                border: '1px solid rgba(0,255,65,0.55)',
                                color: 'var(--green)', cursor: 'pointer',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,65,0.14)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,255,65,0.07)'}
                        >
                            $ {ctaLabel}
                        </button>
                    ) : (
                        <>
                            <span style={{ fontSize: 9, color: 'rgba(0,255,65,0.3)', letterSpacing: '0.12em' }}>
                                click or [space] to continue
                            </span>
                            <span style={{ fontSize: 9, color: 'rgba(0,255,65,0.18)', animation: 'cs-blink 1.2s step-end infinite' }}>▶</span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
