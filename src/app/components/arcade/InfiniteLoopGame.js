import React, { useRef, useEffect, useState } from 'react';
import { Box, Button, Typography, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Avatar, Grid, Tooltip } from '@mui/material';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

const GAME_WIDTH = 1200;
const GAME_HEIGHT = 600;
const GRAVITY = 0.6;
const JUMP_FORCE = -15; // Increased for larger scale
const SPEED_INCREMENT = 0.0005;
const INITIAL_SPEED = 8; // Increased for larger scale

const InfiniteLoopGame = ({ user, onGameEnd, jackpot }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [gameState, setGameState] = useState('MENU'); // MENU, PLAYING, GAMEOVER, LOADING, LEADERBOARD, INFO
    const [score, setScore] = useState(0);
    const [sessionID, setSessionID] = useState(null);
    const [error, setError] = useState(null);
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [leaderboardType, setLeaderboardType] = useState('weekly'); // 'weekly' or 'all_time'
    const [lastRebate, setLastRebate] = useState(0);

    // Game State Refs
    const playerRef = useRef({
        x: 100,
        y: 450,
        width: 80,
        height: 80,
        dy: 0,
        grounded: true,
        ducking: false,
        color: '#00ff00',
        invincible: false,
        multiplier: 1
    });
    
    const obstaclesRef = useRef([]);
    const powerupsRef = useRef([]);
    const particlesRef = useRef([]);
    const matrixDropsRef = useRef([]); // For Matrix Rain
    const gameSpeedRef = useRef(INITIAL_SPEED);
    const scoreRef = useRef(0);
    const frameIdRef = useRef(null);
    const lastTimeRef = useRef(0);

    // Image Assets Refs
    const imagesRef = useRef({
        runnerRun: null,
        runnerJump: null,
        runnerDuck: null, // Renamed from runnerSlide to force update
        virus: null,
        firewall: null,
        shield: null,
        chip: null
    });

    // Load Images
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const loadImg = (src) => {
                const img = new Image();
                // Add timestamp to bust cache
                img.src = `${src}?v=${Date.now()}`;
                return img;
            };

            // Force reset to ensure clean state
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

    // Initialize Matrix Rain
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
            if (Array.isArray(data)) {
                setLeaderboardData(data);
            }
        } catch (error) {
            console.error("Failed to fetch leaderboard", error);
        }
    };

    useEffect(() => {
        if (gameState === 'LEADERBOARD') {
            fetchLeaderboard(leaderboardType);
        }
    }, [leaderboardType, gameState]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
            document.exitFullscreen();
        }
    };

    const resetGame = () => {
        playerRef.current = { 
            x: 100, 
            y: 450, 
            width: 80, 
            height: 80, 
            dy: 0, 
            grounded: true, 
            ducking: false, 
            color: '#00ff00',
            invincible: false,
            multiplier: 1
        };
        obstaclesRef.current = [];
        powerupsRef.current = [];
        particlesRef.current = [];
        gameSpeedRef.current = INITIAL_SPEED;
        scoreRef.current = 0;
        setScore(0);
    };

    const spawnObstacle = () => {
        const type = Math.random();
        let obstacle;
        const imgs = imagesRef.current;

        if (type > 0.7) {
            // "Virus" Drone (Duck under)
            let w = 60;
            const h = 60;
            if (imgs.virus && imgs.virus.complete && imgs.virus.naturalHeight !== 0) {
                w = h * (imgs.virus.naturalWidth / imgs.virus.naturalHeight);
            }

            obstacle = {
                type: 'VIRUS',
                x: GAME_WIDTH,
                y: 440, // Adjusted for new height
                width: w,
                height: h,
                passed: false,
                color: '#ff0055',
                rotation: 0
            };
        } else {
            // "Firewall" (Jump over)
            let w = 40;
            const h = 30;
            if (imgs.firewall && imgs.firewall.complete && imgs.firewall.naturalHeight !== 0) {
                w = h * (imgs.firewall.naturalWidth / imgs.firewall.naturalHeight);
            }

            obstacle = {
                type: 'FIREWALL',
                x: GAME_WIDTH,
                y: 520, // Ground is 550, height 30
                width: w,
                height: h,
                passed: false,
                color: '#ff3300'
            };
        }
        obstaclesRef.current.push(obstacle);
    };

    const spawnPowerup = () => {
        const type = Math.random() > 0.5 ? 'DATA_PACKET' : 'ENCRYPTION_KEY';
        const imgs = imagesRef.current;
        
        let w = 30;
        const h = 30;
        
        if (type === 'DATA_PACKET' && imgs.chip && imgs.chip.complete && imgs.chip.naturalHeight !== 0) {
            w = h * (imgs.chip.naturalWidth / imgs.chip.naturalHeight);
        } else if (type === 'ENCRYPTION_KEY' && imgs.shield && imgs.shield.complete && imgs.shield.naturalHeight !== 0) {
            w = h * (imgs.shield.naturalWidth / imgs.shield.naturalHeight);
        }

        const powerup = {
            type,
            x: GAME_WIDTH,
            y: 300 + Math.random() * 150, // Adjusted for new height
            width: w,
            height: h,
            active: true
        };
        powerupsRef.current.push(powerup);
    };

    const createParticles = (x, y, color, count = 10) => {
        for (let i = 0; i < count; i++) {
            particlesRef.current.push({
                x, y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.0,
                color
            });
        }
    };

    const update = (deltaTime) => {
        const player = playerRef.current;
        const imgs = imagesRef.current;

        // Update Player Width based on sprite aspect ratio
        let currentSprite;
        if (player.ducking) {
            currentSprite = imgs.runnerDuck;
        } else {
            currentSprite = player.grounded ? imgs.runnerRun : imgs.runnerJump;
        }

        if (currentSprite && currentSprite.complete && currentSprite.naturalHeight !== 0) {
             const ratio = currentSprite.naturalWidth / currentSprite.naturalHeight;
             // Base width on the current height (80 standing, 40 ducking)
             player.width = player.height * ratio;
        }
        
        // Physics
        if (!player.grounded) {
            player.dy += GRAVITY;
        }
        player.y += player.dy;

        // Ground Collision
        const groundLevel = 550;
        if (player.y + player.height >= groundLevel) {
            player.y = groundLevel - player.height;
            player.dy = 0;
            player.grounded = true;
        } else {
            player.grounded = false;
        }

        // Spawning
        if (Math.random() < 0.015) {
            if (obstaclesRef.current.length === 0 || obstaclesRef.current[obstaclesRef.current.length - 1].x < GAME_WIDTH - 250) {
                spawnObstacle();
            }
        }
        if (Math.random() < 0.005) { // Increased spawn rate for "Data"
            spawnPowerup();
        }

        // Obstacles Logic
        obstaclesRef.current.forEach(obs => {
            obs.x -= gameSpeedRef.current;
            
            // Collision
            if (
                !player.invincible &&
                player.x < obs.x + obs.width - 10 &&
                player.x + player.width > obs.x + 10 &&
                player.y < obs.y + obs.height - 10 &&
                player.y + player.height > obs.y + 10
            ) {
                createParticles(player.x, player.y, '#ff0000', 20);
                gameOver();
            }

            // Score (Distance)
            if (!obs.passed && obs.x + obs.width < player.x) {
                obs.passed = true;
                scoreRef.current += (10 * player.multiplier);
                setScore(scoreRef.current);
            }
        });

        // Powerups Logic
        powerupsRef.current.forEach(p => {
            p.x -= gameSpeedRef.current;
            
            // Collision
            if (
                p.active &&
                player.x < p.x + p.width &&
                player.x + player.width > p.x &&
                player.y < p.y + p.height &&
                player.y + player.height > p.y
            ) {
                p.active = false;
                createParticles(p.x, p.y, '#ffff00', 10);
                if (p.type === 'ENCRYPTION_KEY') {
                    // Shield
                    player.invincible = true;
                    player.color = '#00ffff';
                    setTimeout(() => {
                        player.invincible = false;
                        player.color = '#00ff00';
                    }, 5000);
                } else if (p.type === 'DATA_PACKET') {
                    // Bonus Score
                    scoreRef.current += 50;
                    setScore(scoreRef.current);
                }
            }
        });

        // Particles Logic
        particlesRef.current.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.05;
        });
        particlesRef.current = particlesRef.current.filter(p => p.life > 0);

        // Cleanup
        obstaclesRef.current = obstaclesRef.current.filter(obs => obs.x + obs.width > -100);
        powerupsRef.current = powerupsRef.current.filter(p => p.x > -100);

        // Speed up
        gameSpeedRef.current += SPEED_INCREMENT;
    };

    const drawMatrixRain = (ctx) => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        
        ctx.fillStyle = '#0F0'; // Green text
        ctx.font = '15px monospace';

        matrixDropsRef.current.forEach((y, index) => {
            const text = String.fromCharCode(0x30A0 + Math.random() * 96);
            const x = index * 20;
            ctx.fillText(text, x, y * 20);

            if (y * 20 > GAME_HEIGHT && Math.random() > 0.975) {
                matrixDropsRef.current[index] = 0;
            }
            matrixDropsRef.current[index]++;
        });
    };

    const draw = (ctx) => {
        // Background (Matrix Rain)
        drawMatrixRain(ctx);

        // Ground
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00ff00';
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 550);
        ctx.lineTo(GAME_WIDTH, 550);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Player
        const player = playerRef.current;
        const imgs = imagesRef.current;
        
        ctx.shadowBlur = player.invincible ? 20 : 0;
        ctx.shadowColor = player.color;

        let playerImg;
        if (player.ducking) {
            playerImg = imgs.runnerDuck;
        } else {
            playerImg = player.grounded ? imgs.runnerRun : imgs.runnerJump;
        }

        if (playerImg && playerImg.complete && playerImg.naturalWidth !== 0) {
             ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);
        } else {
            ctx.fillStyle = player.color;
            ctx.fillRect(player.x, player.y, player.width, player.height);
        }
        
        // Player "Code" Texture (Overlay)
        if (!playerImg || !playerImg.complete) {
            ctx.fillStyle = '#000';
            ctx.font = '10px monospace';
            ctx.fillText('USER', player.x + 5, player.y + 15);
            ctx.fillText('ID:1', player.x + 5, player.y + 30);
        }
        ctx.shadowBlur = 0;

        // Obstacles
        obstaclesRef.current.forEach(obs => {
            let obsImg = obs.type === 'VIRUS' ? imgs.virus : imgs.firewall;
            
            if (obsImg && obsImg.complete && obsImg.naturalWidth !== 0) {
                ctx.drawImage(obsImg, obs.x, obs.y, obs.width, obs.height);
            } else {
                // Fallback drawing
                if (obs.type === 'FIREWALL') {
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                    ctx.strokeStyle = '#ff0000';
                    ctx.lineWidth = 2;
                    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
                    ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
                } else if (obs.type === 'VIRUS') {
                    ctx.save();
                    ctx.translate(obs.x + obs.width/2, obs.y + obs.height/2);
                    ctx.fillStyle = '#ff0055';
                    ctx.beginPath();
                    const spikes = 8;
                    const outerRadius = 30;
                    const innerRadius = 15;
                    for (let i = 0; i < spikes; i++) {
                        let angle = (i / spikes) * Math.PI * 2;
                        ctx.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius);
                        angle += Math.PI / spikes;
                        ctx.lineTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
            }
        });

        // Powerups
        powerupsRef.current.forEach(p => {
            if (!p.active) return;
            
            let pImg = p.type === 'ENCRYPTION_KEY' ? imgs.shield : imgs.chip;
            
            if (pImg && pImg.complete && pImg.naturalWidth !== 0) {
                ctx.drawImage(pImg, p.x, p.y, p.width, p.height);
            } else {
                // Fallback
                if (p.type === 'DATA_PACKET') {
                    ctx.fillStyle = '#00ffff';
                    ctx.fillRect(p.x, p.y, p.width, p.height);
                    ctx.fillStyle = '#fff';
                    ctx.font = '12px monospace';
                    ctx.fillText('DATA', p.x + 2, p.y + 15);
                } else {
                    ctx.fillStyle = '#ffd700';
                    ctx.beginPath();
                    ctx.arc(p.x + p.width/2, p.y + p.height/2, p.width/2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#000';
                    ctx.fillText('KEY', p.x + 2, p.y + 15);
                }
            }
        });

        // Particles
        particlesRef.current.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.fillRect(p.x, p.y, 4, 4);
            ctx.globalAlpha = 1.0;
        });

        // HUD
        // Background Bar
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, GAME_WIDTH, 60);
        ctx.strokeStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(0, 60);
        ctx.lineTo(GAME_WIDTH, 60);
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Roboto Mono';
        ctx.fillText(`DATA: ${Math.floor(scoreRef.current)} MB`, 20, 40);
        
        // Jackpot Display
        ctx.fillStyle = '#00ff00';
        ctx.textAlign = 'center';
        ctx.fillText(`JACKPOT: ${jackpot} STAKE`, GAME_WIDTH / 2, 32);
        ctx.textAlign = 'left';

        if (player.invincible) {
            ctx.fillStyle = '#00ffff';
            ctx.fillText(`SHIELD ACTIVE`, GAME_WIDTH - 220, 40);
        }
    };

    const loop = (time) => {
        if (gameState !== 'PLAYING') return;
        
        const deltaTime = time - lastTimeRef.current;
        lastTimeRef.current = time;

        update(deltaTime);
        
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            draw(ctx);
        }

        frameIdRef.current = requestAnimationFrame(loop);
    };

    useEffect(() => {
        if (gameState === 'PLAYING') {
            lastTimeRef.current = performance.now();
            frameIdRef.current = requestAnimationFrame(loop);
        } else {
            cancelAnimationFrame(frameIdRef.current);
        }
        return () => cancelAnimationFrame(frameIdRef.current);
    }, [gameState]);

    const handleKeyDown = (e) => {
        if (gameState !== 'PLAYING') return;

        if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
            e.preventDefault();
        }
        
        const player = playerRef.current;

        if ((e.code === 'Space' || e.code === 'ArrowUp') && player.grounded) {
            player.dy = JUMP_FORCE;
            player.grounded = false;
        }

        if (e.code === 'ArrowDown' && !player.ducking) {
            player.ducking = true;
            player.height = 50;
            player.y += 30; // Push down (80 - 50 = 30)
        }
    };

    const handleKeyUp = (e) => {
        if (gameState !== 'PLAYING') return;

        if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
            e.preventDefault();
        }

        const player = playerRef.current;

        if (e.code === 'ArrowDown' && player.ducking) {
            player.ducking = false;
            player.y -= 30; // Pop up
            player.height = 80;
        }
    };

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [gameState]);

    const gameOver = async () => {
        setGameState('GAMEOVER');
        try {
            const res = await fetch('/api/v1/arcade/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionID, score: Math.floor(scoreRef.current) })
            });
            const data = await res.json();
            if (data.rebate) {
                setLastRebate(data.rebate);
            } else {
                setLastRebate(0);
            }
            if (onGameEnd) onGameEnd();
        } catch (error) {
            console.error("Failed to submit score", error);
        }
    };

    return (
        <Box ref={containerRef} sx={{ textAlign: 'center', position: 'relative', width: '100%', height: '100%', background: '#000' }}>
            {/* Fullscreen Toggle */}
            <Button 
                onClick={toggleFullscreen}
                sx={{ 
                    position: 'absolute', 
                    top: 10, 
                    right: 10, 
                    zIndex: 10, 
                    color: '#00ff00',
                    minWidth: 'auto',
                    p: 1
                }}
            >
                <FullscreenIcon />
            </Button>

            {gameState === 'MENU' && (
                <Box sx={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '50%', 
                    transform: 'translate(-50%, -50%)', 
                    zIndex: 5,
                    p: 4, 
                    border: '1px solid #333', 
                    borderRadius: 2, 
                    background: 'rgba(17, 17, 17, 0.9)',
                    backdropFilter: 'blur(5px)'
                }}>
                    <Typography variant="h4" sx={{ color: '#00ff00', fontFamily: 'Roboto Mono', mb: 2, textShadow: '0 0 10px #00ff00' }}>
                        SYSTEM BREACH PROTOCOL
                    </Typography>
                    <Typography sx={{ color: '#fff', mb: 2, maxWidth: '600px', mx: 'auto' }}>
                        You are a rogue data packet in the Lab's mainframe. 
                        Collect <b>DATA SHARDS</b> to increase your score. 
                        Avoid <b>FIREWALLS</b> and <b>VIRUSES</b>.
                    </Typography>
                    <Typography sx={{ color: '#aaa', mb: 4 }}>
                        Cost: 5 Stake | Prize: Weekly Jackpot ({jackpot} STAKE)
                    </Typography>
                    {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Button 
                            variant="contained" 
                            color="success" 
                            size="large"
                            onClick={startGame}
                            sx={{ fontFamily: 'Roboto Mono', fontSize: '1.2rem', px: 4, py: 1 }}
                        >
                            INITIATE RUN (5 STAKE)
                        </Button>
                        <Button 
                            variant="outlined" 
                            color="success" 
                            size="large"
                            onClick={() => {
                                fetchLeaderboard();
                                setGameState('LEADERBOARD');
                            }}
                            sx={{ fontFamily: 'Roboto Mono', fontSize: '1.2rem', px: 4, py: 1 }}
                        >
                            LEADERBOARD
                        </Button>
                        <Button 
                            variant="outlined" 
                            color="info" 
                            size="large"
                            onClick={() => setGameState('INFO')}
                            sx={{ fontFamily: 'Roboto Mono', fontSize: '1.2rem', px: 2, py: 1, minWidth: 'auto' }}
                        >
                            <HelpOutlineIcon />
                        </Button>
                    </Box>
                </Box>
            )}

            {gameState === 'INFO' && (
                <Box sx={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '50%', 
                    transform: 'translate(-50%, -50%)', 
                    zIndex: 5,
                    p: 4, 
                    border: '1px solid #333', 
                    borderRadius: 2, 
                    background: 'rgba(17, 17, 17, 0.95)',
                    backdropFilter: 'blur(5px)',
                    width: '80%',
                    maxWidth: '900px',
                    maxHeight: '80vh',
                    overflowY: 'auto',
                    textAlign: 'left'
                }}>
                    <Typography variant="h4" sx={{ color: '#00ff00', fontFamily: 'Roboto Mono', mb: 4, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                        <HelpOutlineIcon fontSize="large" /> SYSTEM MANUAL
                    </Typography>

                    <Grid container spacing={4}>
                        <Grid item xs={12} md={6}>
                            <Typography variant="h6" sx={{ color: '#fff', fontFamily: 'Roboto Mono', mb: 2, borderBottom: '1px solid #333', pb: 1 }}>
                                // ECONOMICS
                            </Typography>
                            <Box sx={{ mb: 3 }}>
                                <Typography sx={{ color: '#aaa', fontFamily: 'Roboto Mono', mb: 1 }}>
                                    <span style={{ color: '#fff' }}>ENTRY COST:</span> 5 STAKE
                                </Typography>
                                <Typography sx={{ color: '#aaa', fontFamily: 'Roboto Mono', mb: 1 }}>
                                    <span style={{ color: '#ffd700' }}>JACKPOT:</span> Starts at <b>100 STAKE</b> every week!
                                </Typography>
                                <Typography sx={{ color: '#aaa', fontFamily: 'Roboto Mono', mb: 1 }}>
                                    <span style={{ color: '#00ff00' }}>GROWTH:</span> Once the base jackpot is funded, 3.5 STAKE (70%) from every run is added to the pot.
                                </Typography>
                                <Typography sx={{ color: '#aaa', fontFamily: 'Roboto Mono', mb: 1 }}>
                                    <span style={{ color: '#00ff00' }}>REBATE:</span> Earn up to 1.0 STAKE back based on your score.
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#666', fontFamily: 'Roboto Mono', display: 'block', mt: 1 }}>
                                    * Score 500+ points to earn the maximum rebate.
                                </Typography>
                            </Box>

                            <Typography variant="h6" sx={{ color: '#fff', fontFamily: 'Roboto Mono', mb: 2, borderBottom: '1px solid #333', pb: 1 }}>
                                // REWARDS
                            </Typography>
                            <Box sx={{ mb: 3 }}>
                                <Typography sx={{ color: '#aaa', fontFamily: 'Roboto Mono', mb: 1 }}>
                                    <span style={{ color: '#ffd700' }}>WEEKLY JACKPOT:</span> The player with the highest score at the end of the week wins the entire accumulated Jackpot.
                                </Typography>
                                <Typography sx={{ color: '#aaa', fontFamily: 'Roboto Mono', mb: 1 }}>
                                    <span style={{ color: '#00ff00' }}>TOP RUNNER BADGE:</span> The weekly champion earns the exclusive 👑 <b>Top Runner</b> badge and Discord Role until they are dethroned.
                                </Typography>
                            </Box>

                            <Typography variant="h6" sx={{ color: '#fff', fontFamily: 'Roboto Mono', mb: 2, borderBottom: '1px solid #333', pb: 1 }}>
                                // CONTROLS
                            </Typography>
                            <Box sx={{ mb: 3 }}>
                                <Typography sx={{ color: '#aaa', fontFamily: 'Roboto Mono', mb: 1 }}>
                                    <span style={{ color: '#fff' }}>JUMP:</span> Spacebar / Arrow Up
                                </Typography>
                                <Typography sx={{ color: '#aaa', fontFamily: 'Roboto Mono', mb: 1 }}>
                                    <span style={{ color: '#fff' }}>DUCK/SLIDE:</span> Arrow Down
                                </Typography>
                            </Box>
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <Typography variant="h6" sx={{ color: '#fff', fontFamily: 'Roboto Mono', mb: 2, borderBottom: '1px solid #333', pb: 1 }}>
                                // OBJECTS
                            </Typography>
                            
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                <Box sx={{ width: 30, height: 30, background: '#00ffff', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#000', fontWeight: 'bold' }}>DATA</Box>
                                <Box>
                                    <Typography sx={{ color: '#fff', fontFamily: 'Roboto Mono' }}>DATA SHARD</Typography>
                                    <Typography variant="caption" sx={{ color: '#aaa', fontFamily: 'Roboto Mono' }}>+50 Points. Collect these!</Typography>
                                </Box>
                            </Box>

                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                <Box sx={{ width: 30, height: 30, background: '#ffd700', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#000', fontWeight: 'bold' }}>KEY</Box>
                                <Box>
                                    <Typography sx={{ color: '#fff', fontFamily: 'Roboto Mono' }}>ENCRYPTION KEY</Typography>
                                    <Typography variant="caption" sx={{ color: '#aaa', fontFamily: 'Roboto Mono' }}>Grants temporary invincibility.</Typography>
                                </Box>
                            </Box>

                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                <Box sx={{ width: 30, height: 30, border: '2px solid #ff0000', background: 'rgba(255,0,0,0.2)' }} />
                                <Box>
                                    <Typography sx={{ color: '#ff5555', fontFamily: 'Roboto Mono' }}>FIREWALL</Typography>
                                    <Typography variant="caption" sx={{ color: '#aaa', fontFamily: 'Roboto Mono' }}>Jump over it.</Typography>
                                </Box>
                            </Box>

                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                <Box sx={{ width: 30, height: 30, borderRadius: '50%', border: '2px dashed #ff0055' }} />
                                <Box>
                                    <Typography sx={{ color: '#ff0055', fontFamily: 'Roboto Mono' }}>VIRUS</Typography>
                                    <Typography variant="caption" sx={{ color: '#aaa', fontFamily: 'Roboto Mono' }}>Duck under it.</Typography>
                                </Box>
                            </Box>
                        </Grid>
                    </Grid>

                    <Box sx={{ textAlign: 'center', mt: 4 }}>
                        <Button 
                            variant="outlined" 
                            color="success" 
                            onClick={() => setGameState('MENU')}
                            sx={{ fontFamily: 'Roboto Mono' }}
                        >
                            CLOSE MANUAL
                        </Button>
                    </Box>
                </Box>
            )}

            {gameState === 'LEADERBOARD' && (
                <Box sx={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '50%', 
                    transform: 'translate(-50%, -50%)', 
                    zIndex: 5,
                    p: 4, 
                    border: '1px solid #333', 
                    borderRadius: 2, 
                    background: 'rgba(17, 17, 17, 0.95)',
                    backdropFilter: 'blur(5px)',
                    width: '80%',
                    maxWidth: '800px',
                    maxHeight: '80vh',
                    overflowY: 'auto'
                }}>
                    <Typography variant="h4" sx={{ color: '#00ff00', fontFamily: 'Roboto Mono', mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                        <EmojiEventsIcon fontSize="large" /> TOP HACKERS
                    </Typography>

                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 4 }}>
                        <Button 
                            variant={leaderboardType === 'weekly' ? 'contained' : 'outlined'} 
                            color="success"
                            onClick={() => setLeaderboardType('weekly')}
                            sx={{ fontFamily: 'Roboto Mono' }}
                        >
                            WEEKLY JACKPOT
                        </Button>
                        <Button 
                            variant={leaderboardType === 'all_time' ? 'contained' : 'outlined'} 
                            color="success"
                            onClick={() => setLeaderboardType('all_time')}
                            sx={{ fontFamily: 'Roboto Mono' }}
                        >
                            ALL TIME
                        </Button>
                    </Box>
                    
                    <TableContainer component={Paper} sx={{ background: 'transparent', boxShadow: 'none' }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ color: '#00ff00', fontFamily: 'Roboto Mono', borderBottom: '1px solid #333' }}>RANK</TableCell>
                                    <TableCell sx={{ color: '#00ff00', fontFamily: 'Roboto Mono', borderBottom: '1px solid #333' }}>USER</TableCell>
                                    <TableCell align="right" sx={{ color: '#00ff00', fontFamily: 'Roboto Mono', borderBottom: '1px solid #333' }}>SCORE</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {leaderboardData.map((row, index) => (
                                    <TableRow key={index} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                        <TableCell component="th" scope="row" sx={{ color: '#fff', fontFamily: 'Roboto Mono', borderBottom: '1px solid #222' }}>
                                            {index + 1}
                                        </TableCell>
                                        <TableCell sx={{ color: '#fff', fontFamily: 'Roboto Mono', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Avatar src={row.avatar} sx={{ width: 30, height: 30 }} />
                                            {row.username}
                                            {row.badges && row.badges.some(b => b.id === 'top-runner') && (
                                                <Tooltip title="Top Runner">
                                                    <span style={{ fontSize: '1.2rem', cursor: 'help' }}>👑</span>
                                                </Tooltip>
                                            )}
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: '#00ff00', fontFamily: 'Roboto Mono', borderBottom: '1px solid #222' }}>
                                            {row.score} MB
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <Button 
                        variant="outlined" 
                        color="success" 
                        onClick={() => setGameState('MENU')}
                        sx={{ fontFamily: 'Roboto Mono', mt: 4 }}
                    >
                        BACK TO MENU
                    </Button>
                </Box>
            )}

            {gameState === 'LOADING' && (
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                    <CircularProgress color="success" />
                </Box>
            )}

            <canvas
                ref={canvasRef}
                width={GAME_WIDTH}
                height={GAME_HEIGHT}
                style={{ 
                    display: 'block',
                    margin: '0 auto',
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    background: '#000',
                }}
            />

            {gameState === 'GAMEOVER' && (
                <Box sx={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '50%', 
                    transform: 'translate(-50%, -50%)', 
                    zIndex: 5,
                    p: 4, 
                    border: '1px solid #333', 
                    borderRadius: 2, 
                    background: 'rgba(17, 17, 17, 0.9)',
                    backdropFilter: 'blur(5px)'
                }}>
                    <Typography variant="h5" color="error" sx={{ fontFamily: 'Roboto Mono', mb: 2, textShadow: '0 0 10px red' }}>
                        CONNECTION TERMINATED
                    </Typography>
                    <Typography variant="h6" sx={{ color: '#fff', mb: 2 }}>
                        Data Uploaded: {Math.floor(score)} MB
                    </Typography>
                    {lastRebate > 0 && (
                        <Typography variant="subtitle1" sx={{ color: '#00ff00', mb: 2, fontFamily: 'Roboto Mono' }}>
                            PERFORMANCE REBATE: +{lastRebate} STAKE
                        </Typography>
                    )}
                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                        <Button 
                            variant="contained" 
                            color="success"
                            onClick={startGame}
                            sx={{ fontFamily: 'Roboto Mono' }}
                        >
                            PLAY AGAIN (5 STAKE)
                        </Button>
                        <Button 
                            variant="outlined" 
                            color="success"
                            onClick={() => {
                                fetchLeaderboard();
                                setGameState('LEADERBOARD');
                            }}
                            sx={{ fontFamily: 'Roboto Mono' }}
                        >
                            LEADERBOARD
                        </Button>
                        <Button 
                            variant="outlined" 
                            color="success"
                            onClick={() => setGameState('MENU')}
                            sx={{ fontFamily: 'Roboto Mono' }}
                        >
                            MENU
                        </Button>
                    </Box>
                </Box>
            )}
            
            {gameState === 'PLAYING' && (
                <Typography variant="caption" sx={{ 
                    position: 'absolute', 
                    bottom: 10, 
                    left: '50%', 
                    transform: 'translateX(-50%)', 
                    color: '#666', 
                    fontFamily: 'Roboto Mono',
                    pointerEvents: 'none'
                }}>
                    [SPACE/UP] Jump | [DOWN] Duck
                </Typography>
            )}
        </Box>
    );
};

export default InfiniteLoopGame;
