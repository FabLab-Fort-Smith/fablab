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
    const gameSpeedRef = useRef(INITIAL_SPEED);
    const scoreRef = useRef(0);
    const frameIdRef = useRef(null);
    const lastTimeRef = useRef(0);
    const bgOffsetRef = useRef(0);

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
            // Flying Drone (Duck under)
            obstacle = {
                type: 'DRONE',
                x: GAME_WIDTH,
                y: 260,
                width: 40,
                height: 30,
                passed: false,
                color: '#ff0055'
            };
        } else {
            // Firewall (Jump over)
            obstacle = {
                type: 'WALL',
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
        const type = Math.random() > 0.5 ? 'SHIELD' : 'MULTIPLIER';
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
        if (Math.random() < 0.002) {
            spawnPowerup();
        }

        // Obstacles Logic
        obstaclesRef.current.forEach(obs => {
            obs.x -= gameSpeedRef.current;
            
            // Collision
            if (
                !player.invincible &&
                player.x < obs.x + obs.width - 5 &&
                player.x + player.width > obs.x + 5 &&
                player.y < obs.y + obs.height - 5 &&
                player.y + player.height > obs.y + 5
            ) {
                createParticles(player.x, player.y, '#ff0000', 20);
                gameOver();
            }

            // Score
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
                if (p.type === 'SHIELD') {
                    player.invincible = true;
                    player.color = '#00ffff';
                    setTimeout(() => {
                        player.invincible = false;
                        player.color = '#00ff00';
                    }, 5000);
                } else if (p.type === 'MULTIPLIER') {
                    player.multiplier = 2;
                    setTimeout(() => {
                        player.multiplier = 1;
                    }, 10000);
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
        bgOffsetRef.current = (bgOffsetRef.current + gameSpeedRef.current * 0.5) % GAME_WIDTH;
    };

    const draw = (ctx) => {
        // Clear
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        // Background Grid
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        const gridSize = 40;
        const offset = bgOffsetRef.current;
        
        for (let x = -offset; x < GAME_WIDTH; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, GAME_HEIGHT);
            ctx.stroke();
        }
        for (let y = 0; y < GAME_HEIGHT; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(GAME_WIDTH, y);
            ctx.stroke();
        }

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
        
        // Player Eye (Direction)
        ctx.fillStyle = '#000';
        ctx.fillRect(player.x + player.width - 10, player.y + 10, 5, 5);
        ctx.shadowBlur = 0;

        // Obstacles
        obstaclesRef.current.forEach(obs => {
            ctx.fillStyle = obs.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = obs.color;
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            
            // Detail
            ctx.fillStyle = '#000';
            ctx.fillRect(obs.x + 5, obs.y + 5, obs.width - 10, obs.height - 10);
            ctx.fillStyle = obs.color;
            ctx.fillRect(obs.x + 10, obs.y + 10, obs.width - 20, obs.height - 20);
            ctx.shadowBlur = 0;
        });

        // Powerups
        powerupsRef.current.forEach(p => {
            if (!p.active) return;
            ctx.fillStyle = p.type === 'SHIELD' ? '#00ffff' : '#ffd700';
            ctx.shadowBlur = 15;
            ctx.shadowColor = ctx.fillStyle;
            ctx.beginPath();
            ctx.arc(p.x + p.width/2, p.y + p.height/2, p.width/2, 0, Math.PI * 2);
            ctx.fill();
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
        ctx.fillText(`SCORE: ${Math.floor(scoreRef.current)}`, 20, 40);
        
        if (player.multiplier > 1) {
            ctx.fillStyle = '#ffd700';
            ctx.fillText(`x${player.multiplier}`, 20, 70);
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
                        THE GLITCH RUNNER
                    </Typography>
                    <Typography sx={{ color: '#fff', mb: 4 }}>
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
                        INSERT COIN (5 STAKE)
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
                    border: '2px solid #333',
                    background: '#050505',
                    boxShadow: '0 0 20px rgba(0, 255, 0, 0.2)'
                }}
            />

            {gameState === 'GAMEOVER' && (
                <Box sx={{ mt: 2 }}>
                    <Typography variant="h5" color="error" sx={{ fontFamily: 'Roboto Mono', mb: 2, textShadow: '0 0 10px red' }}>
                        CONNECTION TERMINATED
                    </Typography>
                    <Typography variant="h6" sx={{ color: '#fff', mb: 2 }}>
                        Final Score: {Math.floor(score)}
                    </Typography>
                    <Button 
                        variant="outlined" 
                        color="success"
                        onClick={() => setGameState('MENU')}
                        sx={{ fontFamily: 'Roboto Mono' }}
                    >
                        RETURN TO MENU
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
