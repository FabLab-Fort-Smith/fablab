"use client";
import React, { useRef, useEffect, useState } from 'react';

const GAME_WIDTH = 1200;
const GAME_HEIGHT = 600;
const GRAVITY = 0.6;
const JUMP_FORCE = -15;
const SPEED_INCREMENT = 0.0005;
const INITIAL_SPEED = 8;

const InfiniteLoopGame = ({ user, onGameEnd, jackpot }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [gameState, setGameState] = useState('MENU');
    const [score, setScore] = useState(0);
    const [sessionID, setSessionID] = useState(null);
    const [error, setError] = useState(null);
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [leaderboardType, setLeaderboardType] = useState('weekly');
    const [lastRebate, setLastRebate] = useState(0);

    const playerRef = useRef({ x: 100, y: 450, width: 80, height: 80, dy: 0, grounded: true, ducking: false, color: '#00ff00', invincible: false, multiplier: 1 });
    const obstaclesRef = useRef([]);
    const powerupsRef = useRef([]);
    const particlesRef = useRef([]);
    const matrixDropsRef = useRef([]);
    const gameSpeedRef = useRef(INITIAL_SPEED);
    const scoreRef = useRef(0);
    const frameIdRef = useRef(null);
    const lastTimeRef = useRef(0);
    const imagesRef = useRef({ runnerRun: null, runnerJump: null, runnerDuck: null, virus: null, firewall: null, shield: null, chip: null });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const loadImg = (src) => { const img = new Image(); img.src = `${src}?v=${Date.now()}`; return img; };
            imagesRef.current = {
                runnerRun: loadImg('/runner/sprite-run.png'),
                runnerJump: loadImg('/runner/sprite-jump.png'),
                runnerDuck: loadImg('/runner/sprite-slide.png'),
                virus: loadImg('/runner/thVirus.png'),
                firewall: loadImg('/runner/firewall.png'),
                shield: loadImg('/runner/shieldOrb.png'),
                chip: loadImg('/runner/2xPointsChip.png')
            };
        }
    }, []);

    useEffect(() => {
        const columns = Math.floor(GAME_WIDTH / 20);
        matrixDropsRef.current = Array(columns).fill(1);
    }, []);

    const startGame = async () => {
        setGameState('LOADING');
        setError(null);
        try {
            const res = await fetch('/api/v1/arcade/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID: user.userID, game: 'infinite_loop' })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to start game');
            setSessionID(data.sessionID);
            resetGame();
            setGameState('PLAYING');
        } catch (err) {
            setError(err.message);
            setGameState('MENU');
        }
    };

    const fetchLeaderboard = async (type = leaderboardType) => {
        try {
            const res = await fetch(`/api/v1/arcade/leaderboard?game=infinite_loop&type=${type}`);
            const data = await res.json();
            if (Array.isArray(data)) setLeaderboardData(data);
        } catch (error) { console.error("Failed to fetch leaderboard", error); }
    };

    useEffect(() => {
        if (gameState === 'LEADERBOARD') fetchLeaderboard(leaderboardType);
    }, [leaderboardType, gameState]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(err => console.error(err));
        } else {
            document.exitFullscreen();
        }
    };

    const resetGame = () => {
        playerRef.current = { x: 100, y: 450, width: 80, height: 80, dy: 0, grounded: true, ducking: false, color: '#00ff00', invincible: false, multiplier: 1 };
        obstaclesRef.current = [];
        powerupsRef.current = [];
        particlesRef.current = [];
        gameSpeedRef.current = INITIAL_SPEED;
        scoreRef.current = 0;
        setScore(0);
    };

    const spawnObstacle = () => {
        const type = Math.random();
        const imgs = imagesRef.current;
        let obstacle;
        if (type > 0.7) {
            let w = 60; const h = 60;
            if (imgs.virus && imgs.virus.complete && imgs.virus.naturalHeight !== 0) w = h * (imgs.virus.naturalWidth / imgs.virus.naturalHeight);
            obstacle = { type: 'VIRUS', x: GAME_WIDTH, y: 440, width: w, height: h, passed: false, color: '#ff0055', rotation: 0 };
        } else {
            let w = 40; const h = 30;
            if (imgs.firewall && imgs.firewall.complete && imgs.firewall.naturalHeight !== 0) w = h * (imgs.firewall.naturalWidth / imgs.firewall.naturalHeight);
            obstacle = { type: 'FIREWALL', x: GAME_WIDTH, y: 520, width: w, height: h, passed: false, color: '#ff3300' };
        }
        obstaclesRef.current.push(obstacle);
    };

    const spawnPowerup = () => {
        const type = Math.random() > 0.5 ? 'DATA_PACKET' : 'ENCRYPTION_KEY';
        const imgs = imagesRef.current;
        let w = 30; const h = 30;
        if (type === 'DATA_PACKET' && imgs.chip && imgs.chip.complete && imgs.chip.naturalHeight !== 0) w = h * (imgs.chip.naturalWidth / imgs.chip.naturalHeight);
        else if (type === 'ENCRYPTION_KEY' && imgs.shield && imgs.shield.complete && imgs.shield.naturalHeight !== 0) w = h * (imgs.shield.naturalWidth / imgs.shield.naturalHeight);
        powerupsRef.current.push({ type, x: GAME_WIDTH, y: 300 + Math.random() * 150, width: w, height: h, active: true });
    };

    const createParticles = (x, y, color, count = 10) => {
        for (let i = 0; i < count; i++) {
            particlesRef.current.push({ x, y, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, life: 1.0, color });
        }
    };

    const update = () => {
        const player = playerRef.current;
        const imgs = imagesRef.current;
        let currentSprite = player.ducking ? imgs.runnerDuck : (player.grounded ? imgs.runnerRun : imgs.runnerJump);
        if (currentSprite && currentSprite.complete && currentSprite.naturalHeight !== 0) {
            player.width = player.height * (currentSprite.naturalWidth / currentSprite.naturalHeight);
        }
        if (!player.grounded) player.dy += GRAVITY;
        player.y += player.dy;
        const groundLevel = 550;
        if (player.y + player.height >= groundLevel) { player.y = groundLevel - player.height; player.dy = 0; player.grounded = true; } else { player.grounded = false; }

        if (Math.random() < 0.015 && (obstaclesRef.current.length === 0 || obstaclesRef.current[obstaclesRef.current.length - 1].x < GAME_WIDTH - 250)) spawnObstacle();
        if (Math.random() < 0.005) spawnPowerup();

        obstaclesRef.current.forEach(obs => {
            obs.x -= gameSpeedRef.current;
            if (!player.invincible && player.x < obs.x + obs.width - 10 && player.x + player.width > obs.x + 10 && player.y < obs.y + obs.height - 10 && player.y + player.height > obs.y + 10) {
                createParticles(player.x, player.y, '#ff0000', 20);
                gameOver();
            }
            if (!obs.passed && obs.x + obs.width < player.x) { obs.passed = true; scoreRef.current += (10 * player.multiplier); setScore(scoreRef.current); }
        });

        powerupsRef.current.forEach(p => {
            p.x -= gameSpeedRef.current;
            if (p.active && player.x < p.x + p.width && player.x + player.width > p.x && player.y < p.y + p.height && player.y + player.height > p.y) {
                p.active = false;
                createParticles(p.x, p.y, '#ffff00', 10);
                if (p.type === 'ENCRYPTION_KEY') {
                    player.invincible = true; player.color = '#00ffff';
                    setTimeout(() => { player.invincible = false; player.color = '#00ff00'; }, 5000);
                } else if (p.type === 'DATA_PACKET') { scoreRef.current += 50; setScore(scoreRef.current); }
            }
        });

        particlesRef.current.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.05; });
        particlesRef.current = particlesRef.current.filter(p => p.life > 0);
        obstaclesRef.current = obstaclesRef.current.filter(obs => obs.x + obs.width > -100);
        powerupsRef.current = powerupsRef.current.filter(p => p.x > -100);
        gameSpeedRef.current += SPEED_INCREMENT;
    };

    const drawMatrixRain = (ctx) => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = '#0F0';
        ctx.font = '15px monospace';
        matrixDropsRef.current.forEach((y, index) => {
            const text = String.fromCharCode(0x30A0 + Math.random() * 96);
            ctx.fillText(text, index * 20, y * 20);
            if (y * 20 > GAME_HEIGHT && Math.random() > 0.975) matrixDropsRef.current[index] = 0;
            matrixDropsRef.current[index]++;
        });
    };

    const draw = (ctx) => {
        drawMatrixRain(ctx);
        ctx.shadowBlur = 10; ctx.shadowColor = '#00ff00'; ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 550); ctx.lineTo(GAME_WIDTH, 550); ctx.stroke(); ctx.shadowBlur = 0;

        const player = playerRef.current;
        const imgs = imagesRef.current;
        ctx.shadowBlur = player.invincible ? 20 : 0; ctx.shadowColor = player.color;
        let playerImg = player.ducking ? imgs.runnerDuck : (player.grounded ? imgs.runnerRun : imgs.runnerJump);
        if (playerImg && playerImg.complete && playerImg.naturalWidth !== 0) ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);
        else { ctx.fillStyle = player.color; ctx.fillRect(player.x, player.y, player.width, player.height); }
        ctx.shadowBlur = 0;

        obstaclesRef.current.forEach(obs => {
            let obsImg = obs.type === 'VIRUS' ? imgs.virus : imgs.firewall;
            if (obsImg && obsImg.complete && obsImg.naturalWidth !== 0) { ctx.drawImage(obsImg, obs.x, obs.y, obs.width, obs.height); }
            else if (obs.type === 'FIREWALL') { ctx.fillStyle = 'rgba(255,0,0,0.2)'; ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 2; ctx.fillRect(obs.x, obs.y, obs.width, obs.height); ctx.strokeRect(obs.x, obs.y, obs.width, obs.height); }
            else { ctx.save(); ctx.translate(obs.x + obs.width/2, obs.y + obs.height/2); ctx.fillStyle = '#ff0055'; ctx.beginPath(); const spikes = 8, or = 30, ir = 15; for (let i = 0; i < spikes; i++) { let a = (i/spikes)*Math.PI*2; ctx.lineTo(Math.cos(a)*or,Math.sin(a)*or); a += Math.PI/spikes; ctx.lineTo(Math.cos(a)*ir,Math.sin(a)*ir); } ctx.closePath(); ctx.fill(); ctx.restore(); }
        });

        powerupsRef.current.forEach(p => {
            if (!p.active) return;
            let pImg = p.type === 'ENCRYPTION_KEY' ? imgs.shield : imgs.chip;
            if (pImg && pImg.complete && pImg.naturalWidth !== 0) { ctx.drawImage(pImg, p.x, p.y, p.width, p.height); }
            else if (p.type === 'DATA_PACKET') { ctx.fillStyle = '#00ffff'; ctx.fillRect(p.x, p.y, p.width, p.height); }
            else { ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(p.x+p.width/2, p.y+p.height/2, p.width/2, 0, Math.PI*2); ctx.fill(); }
        });

        particlesRef.current.forEach(p => { ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.fillRect(p.x, p.y, 4, 4); ctx.globalAlpha = 1.0; });

        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, GAME_WIDTH, 60);
        ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.moveTo(0, 60); ctx.lineTo(GAME_WIDTH, 60); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 24px Roboto Mono'; ctx.fillText(`DATA: ${Math.floor(scoreRef.current)} MB`, 20, 40);
        ctx.fillStyle = '#00ff00'; ctx.textAlign = 'center'; ctx.fillText(`JACKPOT: ${jackpot} STAKE`, GAME_WIDTH/2, 32); ctx.textAlign = 'left';
        if (player.invincible) { ctx.fillStyle = '#00ffff'; ctx.fillText('SHIELD ACTIVE', GAME_WIDTH - 220, 40); }
    };

    const loop = (time) => {
        if (gameState !== 'PLAYING') return;
        lastTimeRef.current = time;
        update();
        const canvas = canvasRef.current;
        if (canvas) draw(canvas.getContext('2d'));
        frameIdRef.current = requestAnimationFrame(loop);
    };

    useEffect(() => {
        if (gameState === 'PLAYING') { lastTimeRef.current = performance.now(); frameIdRef.current = requestAnimationFrame(loop); }
        else { cancelAnimationFrame(frameIdRef.current); }
        return () => cancelAnimationFrame(frameIdRef.current);
    }, [gameState]);

    const handleKeyDown = (e) => {
        if (gameState !== 'PLAYING') return;
        if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
        const player = playerRef.current;
        if ((e.code === 'Space' || e.code === 'ArrowUp') && player.grounded) { player.dy = JUMP_FORCE; player.grounded = false; }
        if (e.code === 'ArrowDown' && !player.ducking) { player.ducking = true; player.height = 50; player.y += 30; }
    };

    const handleKeyUp = (e) => {
        if (gameState !== 'PLAYING') return;
        if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
        const player = playerRef.current;
        if (e.code === 'ArrowDown' && player.ducking) { player.ducking = false; player.y -= 30; player.height = 80; }
    };

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
    }, [gameState]);

    const gameOver = async () => {
        setGameState('GAMEOVER');
        try {
            const res = await fetch('/api/v1/arcade/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionID, score: Math.floor(scoreRef.current) }) });
            const data = await res.json();
            setLastRebate(data.rebate || 0);
            if (onGameEnd) onGameEnd();
        } catch (error) { console.error("Failed to submit score", error); }
    };

    const overlayStyle = { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 5, padding: '32px 40px', border: '1px solid #333', background: 'rgba(17,17,17,0.95)', backdropFilter: 'blur(5px)' };
    const monoGreen = { fontFamily: 'Roboto Mono, monospace', color: '#00ff00' };

    return (
        <div ref={containerRef} style={{ textAlign: 'center', position: 'relative', width: '100%', height: '100%', background: '#000' }}>
            <button onClick={toggleFullscreen} style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, background: 'none', border: 'none', color: '#00ff00', cursor: 'pointer', fontSize: 20, padding: 8 }}>⛶</button>

            {gameState === 'MENU' && (
                <div style={overlayStyle}>
                    <div style={{ ...monoGreen, fontSize: '1.8rem', marginBottom: 16, textShadow: '0 0 10px #00ff00' }}>SYSTEM BREACH PROTOCOL</div>
                    <div style={{ color: '#fff', marginBottom: 12, maxWidth: 600 }}>You are a rogue data packet in the Lab's mainframe. Collect <b>DATA SHARDS</b> to increase your score. Avoid <b>FIREWALLS</b> and <b>VIRUSES</b>.</div>
                    <div style={{ color: '#aaa', marginBottom: 28, fontFamily: 'Roboto Mono, monospace', fontSize: 13 }}>Cost: 5 Stake | Prize: Weekly Jackpot ({jackpot} STAKE)</div>
                    {error && <div style={{ color: '#ff5555', marginBottom: 16, fontFamily: 'Roboto Mono, monospace', fontSize: 12 }}>✕ {error}</div>}
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button onClick={startGame} style={{ ...monoGreen, border: '1px solid #00ff00', background: 'rgba(0,255,0,0.1)', padding: '10px 24px', cursor: 'pointer', fontSize: 14 }}>INITIATE RUN (5 STAKE)</button>
                        <button onClick={() => { fetchLeaderboard(); setGameState('LEADERBOARD'); }} style={{ ...monoGreen, border: '1px solid #00ff00', background: 'none', padding: '10px 24px', cursor: 'pointer', fontSize: 14 }}>LEADERBOARD</button>
                        <button onClick={() => setGameState('INFO')} style={{ color: '#00ffff', border: '1px solid #00ffff', background: 'none', padding: '10px 16px', cursor: 'pointer', fontSize: 14, fontFamily: 'Roboto Mono, monospace' }}>?</button>
                    </div>
                </div>
            )}

            {gameState === 'INFO' && (
                <div style={{ ...overlayStyle, width: '80%', maxWidth: 900, maxHeight: '80vh', overflowY: 'auto', textAlign: 'left' }}>
                    <div style={{ ...monoGreen, fontSize: '1.5rem', marginBottom: 32, textAlign: 'center' }}>? SYSTEM MANUAL</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
                        <div>
                            <div style={{ color: '#fff', fontFamily: 'Roboto Mono, monospace', marginBottom: 12, borderBottom: '1px solid #333', paddingBottom: 8 }}>// ECONOMICS</div>
                            <div style={{ color: '#aaa', fontFamily: 'Roboto Mono, monospace', fontSize: 12, lineHeight: 2 }}>
                                <div><span style={{ color: '#fff' }}>ENTRY COST:</span> 5 STAKE</div>
                                <div><span style={{ color: '#ffd700' }}>JACKPOT:</span> Starts at 100 STAKE every week!</div>
                                <div><span style={{ color: '#00ff00' }}>GROWTH:</span> 3.5 STAKE (70%) from every run added to pot.</div>
                                <div><span style={{ color: '#00ff00' }}>REBATE:</span> Earn 1.0 STAKE back if you beat your personal high score!</div>
                            </div>
                            <div style={{ color: '#fff', fontFamily: 'Roboto Mono, monospace', margin: '20px 0 12px', borderBottom: '1px solid #333', paddingBottom: 8 }}>// CONTROLS</div>
                            <div style={{ color: '#aaa', fontFamily: 'Roboto Mono, monospace', fontSize: 12, lineHeight: 2 }}>
                                <div><span style={{ color: '#fff' }}>JUMP:</span> Spacebar / Arrow Up</div>
                                <div><span style={{ color: '#fff' }}>DUCK/SLIDE:</span> Arrow Down</div>
                            </div>
                        </div>
                        <div>
                            <div style={{ color: '#fff', fontFamily: 'Roboto Mono, monospace', marginBottom: 12, borderBottom: '1px solid #333', paddingBottom: 8 }}>// OBJECTS</div>
                            {[
                                { icon: <div style={{ width: 30, height: 30, background: '#00ffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#000', fontWeight: 'bold' }}>DATA</div>, name: 'DATA SHARD', desc: '+50 Points. Collect these!' },
                                { icon: <div style={{ width: 30, height: 30, background: '#ffd700', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#000', fontWeight: 'bold' }}>KEY</div>, name: 'ENCRYPTION KEY', desc: 'Grants temporary invincibility.' },
                                { icon: <div style={{ width: 30, height: 30, border: '2px solid #ff0000', background: 'rgba(255,0,0,0.2)' }} />, name: 'FIREWALL', desc: 'Jump over it.', nameColor: '#ff5555' },
                                { icon: <div style={{ width: 30, height: 30, borderRadius: '50%', border: '2px dashed #ff0055' }} />, name: 'VIRUS', desc: 'Duck under it.', nameColor: '#ff0055' },
                            ].map((item, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                    {item.icon}
                                    <div>
                                        <div style={{ color: item.nameColor || '#fff', fontFamily: 'Roboto Mono, monospace', fontSize: 12 }}>{item.name}</div>
                                        <div style={{ color: '#aaa', fontFamily: 'Roboto Mono, monospace', fontSize: 11 }}>{item.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={{ textAlign: 'center', marginTop: 32 }}>
                        <button onClick={() => setGameState('MENU')} style={{ ...monoGreen, border: '1px solid #00ff00', background: 'none', padding: '8px 20px', cursor: 'pointer' }}>CLOSE MANUAL</button>
                    </div>
                </div>
            )}

            {gameState === 'LEADERBOARD' && (
                <div style={{ ...overlayStyle, width: '80%', maxWidth: 800, maxHeight: '80vh', overflowY: 'auto' }}>
                    <div style={{ ...monoGreen, fontSize: '1.5rem', marginBottom: 16, textAlign: 'center' }}>★ TOP HACKERS</div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
                        {['weekly', 'all_time'].map(type => (
                            <button key={type} onClick={() => setLeaderboardType(type)} style={{ ...monoGreen, border: '1px solid #00ff00', background: leaderboardType === type ? 'rgba(0,255,0,0.15)' : 'none', padding: '6px 16px', cursor: 'pointer', fontSize: 12 }}>
                                {type === 'weekly' ? 'WEEKLY JACKPOT' : 'ALL TIME'}
                            </button>
                        ))}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Roboto Mono, monospace' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #333' }}>
                                <th style={{ color: '#00ff00', padding: '8px 12px', textAlign: 'left', fontWeight: 400 }}>RANK</th>
                                <th style={{ color: '#00ff00', padding: '8px 12px', textAlign: 'left', fontWeight: 400 }}>USER</th>
                                <th style={{ color: '#00ff00', padding: '8px 12px', textAlign: 'right', fontWeight: 400 }}>SCORE</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leaderboardData.map((row, index) => (
                                <tr key={index} style={{ borderBottom: '1px solid #222' }}>
                                    <td style={{ color: '#fff', padding: '8px 12px' }}>{index + 1}</td>
                                    <td style={{ color: '#fff', padding: '8px 12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: row.avatar ? `url(${row.avatar}) center/cover` : '#222', border: '1px solid #444', flexShrink: 0 }} />
                                            {row.username}
                                            {row.badges?.some(b => b.id === 'top-runner') && <span style={{ fontSize: '1rem' }} title="Top Runner">👑</span>}
                                        </div>
                                    </td>
                                    <td style={{ color: '#00ff00', padding: '8px 12px', textAlign: 'right' }}>{row.score} MB</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ marginTop: 28, textAlign: 'left' }}>
                        <button onClick={() => setGameState('MENU')} style={{ ...monoGreen, border: '1px solid #00ff00', background: 'none', padding: '8px 20px', cursor: 'pointer' }}>BACK TO MENU</button>
                    </div>
                </div>
            )}

            {gameState === 'LOADING' && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#00ff00', fontFamily: 'Roboto Mono, monospace' }}>loading...</div>
            )}

            <canvas ref={canvasRef} width={GAME_WIDTH} height={GAME_HEIGHT} style={{ display: 'block', margin: '0 auto', width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />

            {gameState === 'GAMEOVER' && (
                <div style={overlayStyle}>
                    <div style={{ color: '#ff5555', fontFamily: 'Roboto Mono, monospace', fontSize: '1.2rem', marginBottom: 12, textShadow: '0 0 10px red' }}>CONNECTION TERMINATED</div>
                    <div style={{ color: '#fff', fontFamily: 'Roboto Mono, monospace', marginBottom: 12 }}>Data Uploaded: {Math.floor(score)} MB</div>
                    {lastRebate > 0 && <div style={{ ...monoGreen, marginBottom: 12 }}>PERFORMANCE REBATE: +{lastRebate} STAKE</div>}
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                        <button onClick={startGame} style={{ ...monoGreen, border: '1px solid #00ff00', background: 'rgba(0,255,0,0.1)', padding: '8px 16px', cursor: 'pointer' }}>PLAY AGAIN (5 STAKE)</button>
                        <button onClick={() => { fetchLeaderboard(); setGameState('LEADERBOARD'); }} style={{ ...monoGreen, border: '1px solid #00ff00', background: 'none', padding: '8px 16px', cursor: 'pointer' }}>LEADERBOARD</button>
                        <button onClick={() => setGameState('MENU')} style={{ ...monoGreen, border: '1px solid #00ff00', background: 'none', padding: '8px 16px', cursor: 'pointer' }}>MENU</button>
                    </div>
                </div>
            )}

            {gameState === 'PLAYING' && (
                <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', color: '#666', fontFamily: 'Roboto Mono, monospace', fontSize: 11, pointerEvents: 'none' }}>
                    [SPACE/UP] Jump | [DOWN] Duck
                </div>
            )}
        </div>
    );
};

export default InfiniteLoopGame;
