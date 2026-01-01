import React, { useRef, useEffect, useState } from 'react';
import { Box, Button, Typography, CircularProgress } from '@mui/material';

const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const SPEED_INCREMENT = 0.0005;
const INITIAL_SPEED = 6;

const InfiniteLoopGame = ({ user, onGameEnd }) => {
    const canvasRef = useRef(null);
    const [gameState, setGameState] = useState('MENU'); // MENU, PLAYING, GAMEOVER, LOADING
    const [score, setScore] = useState(0);
    const [sessionID, setSessionID] = useState(null);
    const [error, setError] = useState(null);

    // Game State Refs
    const playerRef = useRef({
        x: 50,
        y: 300,
        width: 40,
        height: 40,
        dy: 0,
        grounded: true,
        ducking: false,
        color: '#00ff00',
        invincible: false,
        multiplier: 1,
        trail: []
    });
    
    const obstaclesRef = useRef([]);
    const powerupsRef = useRef([]);
    const particlesRef = useRef([]);
    const matrixDropsRef = useRef([]); // For Matrix Rain
    const gameSpeedRef = useRef(INITIAL_SPEED);
    const scoreRef = useRef(0);
    const frameIdRef = useRef(null);
    const lastTimeRef = useRef(0);

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

    const resetGame = () => {
        playerRef.current = { 
            x: 50, 
            y: 300, 
            width: 40, 
            height: 40, 
            dy: 0, 
            grounded: true, 
            ducking: false, 
            color: '#00ff00',
            invincible: false,
            multiplier: 1,
            trail: []
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

        if (type > 0.7) {
            // "Virus" Drone (Duck under)
            obstacle = {
                type: 'VIRUS',
                x: GAME_WIDTH,
                y: 260,
                width: 40,
                height: 40,
                passed: false,
                color: '#ff0055',
                rotation: 0
            };
        } else {
            // "Firewall" (Jump over)
            obstacle = {
                type: 'FIREWALL',
                x: GAME_WIDTH,
                y: 310, // Ground is 350, height 40
                width: 30,
                height: 40,
                passed: false,
                color: '#ff3300'
            };
        }
        obstaclesRef.current.push(obstacle);
    };

    const spawnPowerup = () => {
        const type = Math.random() > 0.5 ? 'DATA_PACKET' : 'ENCRYPTION_KEY';
        const powerup = {
            type,
            x: GAME_WIDTH,
            y: 200 + Math.random() * 100,
            width: 25,
            height: 25,
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
        
        // Physics
        if (!player.grounded) {
            player.dy += GRAVITY;
        }
        player.y += player.dy;

        // Ground Collision
        const groundLevel = 350;
        if (player.y + player.height >= groundLevel) {
            player.y = groundLevel - player.height;
            player.dy = 0;
            player.grounded = true;
        } else {
            player.grounded = false;
        }

        // Player Trail
        if (gameState === 'PLAYING') {
            player.trail.push({ x: player.x, y: player.y, alpha: 0.5 });
            if (player.trail.length > 5) player.trail.shift();
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
            if (obs.type === 'VIRUS') obs.rotation += 0.1;
            
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
        ctx.moveTo(0, 350);
        ctx.lineTo(GAME_WIDTH, 350);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Player Trail
        playerRef.current.trail.forEach((pos, i) => {
            ctx.fillStyle = `rgba(0, 255, 0, ${i * 0.1})`;
            ctx.fillRect(pos.x, pos.y, playerRef.current.width, playerRef.current.height);
        });

        // Player
        const player = playerRef.current;
        ctx.fillStyle = player.color;
        ctx.shadowBlur = player.invincible ? 20 : 10;
        ctx.shadowColor = player.color;
        ctx.fillRect(player.x, player.y, player.width, player.height);
        
        // Player "Code" Texture
        ctx.fillStyle = '#000';
        ctx.font = '10px monospace';
        ctx.fillText('USER', player.x + 5, player.y + 15);
        ctx.fillText('ID:1', player.x + 5, player.y + 30);
        ctx.shadowBlur = 0;

        // Obstacles
        obstaclesRef.current.forEach(obs => {
            if (obs.type === 'FIREWALL') {
                // Firewall (Red Grid Wall)
                ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2;
                ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
                ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
                
                // Grid lines
                ctx.beginPath();
                ctx.moveTo(obs.x, obs.y + 10);
                ctx.lineTo(obs.x + obs.width, obs.y + 10);
                ctx.moveTo(obs.x, obs.y + 20);
                ctx.lineTo(obs.x + obs.width, obs.y + 20);
                ctx.moveTo(obs.x, obs.y + 30);
                ctx.lineTo(obs.x + obs.width, obs.y + 30);
                ctx.stroke();

            } else if (obs.type === 'VIRUS') {
                // Virus (Spiky Shape)
                ctx.save();
                ctx.translate(obs.x + obs.width/2, obs.y + obs.height/2);
                ctx.rotate(obs.rotation);
                ctx.fillStyle = '#ff0055';
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#ff0055';
                
                ctx.beginPath();
                const spikes = 8;
                const outerRadius = 20;
                const innerRadius = 10;
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
        });

        // Powerups
        powerupsRef.current.forEach(p => {
            if (!p.active) return;
            
            if (p.type === 'DATA_PACKET') {
                // Blue Data Cube
                ctx.fillStyle = '#00ffff';
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#00ffff';
                ctx.fillRect(p.x, p.y, p.width, p.height);
                ctx.fillStyle = '#fff';
                ctx.font = '12px monospace';
                ctx.fillText('DATA', p.x + 2, p.y + 15);
            } else {
                // Yellow Key
                ctx.fillStyle = '#ffd700';
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#ffd700';
                ctx.beginPath();
                ctx.arc(p.x + p.width/2, p.y + p.height/2, p.width/2, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#000';
                ctx.fillText('KEY', p.x + 2, p.y + 15);
            }
            ctx.shadowBlur = 0;
        });

        // Particles
        particlesRef.current.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.fillRect(p.x, p.y, 4, 4);
            ctx.globalAlpha = 1.0;
        });

        // HUD
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Roboto Mono';
        ctx.fillText(`DATA UPLOADED: ${Math.floor(scoreRef.current)} MB`, 20, 40);
        
        if (player.invincible) {
            ctx.fillStyle = '#00ffff';
            ctx.fillText(`ENCRYPTION ACTIVE`, 20, 70);
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
            player.height = 20;
            player.y += 20; // Push down instantly
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
            player.y -= 20; // Pop up
            player.height = 40;
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
            await fetch('/api/v1/arcade/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionID, score: Math.floor(scoreRef.current) })
            });
            if (onGameEnd) onGameEnd();
        } catch (error) {
            console.error("Failed to submit score", error);
        }
    };

    return (
        <Box sx={{ textAlign: 'center', mt: 4 }}>
            {gameState === 'MENU' && (
                <Box sx={{ p: 4, border: '1px solid #333', borderRadius: 2, background: '#111' }}>
                    <Typography variant="h4" sx={{ color: '#00ff00', fontFamily: 'Roboto Mono', mb: 2, textShadow: '0 0 10px #00ff00' }}>
                        SYSTEM BREACH PROTOCOL
                    </Typography>
                    <Typography sx={{ color: '#fff', mb: 2, maxWidth: '600px', mx: 'auto' }}>
                        You are a rogue data packet in the Lab's mainframe. 
                        Collect <b>DATA SHARDS</b> to increase your score. 
                        Avoid <b>FIREWALLS</b> and <b>VIRUSES</b>.
                    </Typography>
                    <Typography sx={{ color: '#aaa', mb: 4 }}>
                        Cost: 5 Stake | Prize: Weekly Jackpot
                    </Typography>
                    {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
                    <Button 
                        variant="contained" 
                        color="success" 
                        size="large"
                        onClick={startGame}
                        sx={{ fontFamily: 'Roboto Mono', fontSize: '1.2rem', px: 4, py: 1 }}
                    >
                        INITIATE RUN (5 STAKE)
                    </Button>
                </Box>
            )}

            {gameState === 'LOADING' && (
                <CircularProgress color="success" />
            )}

            <canvas
                ref={canvasRef}
                width={GAME_WIDTH}
                height={GAME_HEIGHT}
                style={{ 
                    display: gameState === 'PLAYING' || gameState === 'GAMEOVER' ? 'block' : 'none',
                    margin: '0 auto',
                    border: '4px solid #333',
                    borderRadius: '4px',
                    background: '#000',
                    boxShadow: '0 0 20px rgba(0, 255, 0, 0.2)'
                }}
            />

            {gameState === 'GAMEOVER' && (
                <Box sx={{ mt: 2 }}>
                    <Typography variant="h5" color="error" sx={{ fontFamily: 'Roboto Mono', mb: 2, textShadow: '0 0 10px red' }}>
                        CONNECTION TERMINATED
                    </Typography>
                    <Typography variant="h6" sx={{ color: '#fff', mb: 2 }}>
                        Data Uploaded: {Math.floor(score)} MB
                    </Typography>
                    <Button 
                        variant="outlined" 
                        color="success"
                        onClick={() => setGameState('MENU')}
                        sx={{ fontFamily: 'Roboto Mono' }}
                    >
                        RETURN TO ROOT
                    </Button>
                </Box>
            )}
            
            {gameState === 'PLAYING' && (
                <Typography variant="caption" sx={{ color: '#666', mt: 1, display: 'block', fontFamily: 'Roboto Mono' }}>
                    [SPACE/UP] Jump | [DOWN] Duck
                </Typography>
            )}
        </Box>
    );
};

export default InfiniteLoopGame;
