import React, { useRef, useEffect, useState } from 'react';
import { Box, Button, Typography, CircularProgress } from '@mui/material';

const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const SPEED_INCREMENT = 0.001;

const InfiniteLoopGame = ({ user, onGameEnd }) => {
    const canvasRef = useRef(null);
    const [gameState, setGameState] = useState('MENU'); // MENU, PLAYING, GAMEOVER, LOADING
    const [score, setScore] = useState(0);
    const [sessionID, setSessionID] = useState(null);
    const [error, setError] = useState(null);

    // Game State Refs (for loop access)
    const playerRef = useRef({
        x: 50,
        y: 300,
        width: 30,
        height: 50,
        dy: 0,
        grounded: true,
        ducking: false,
        color: '#00ff00'
    });
    
    const obstaclesRef = useRef([]);
    const gameSpeedRef = useRef(5);
    const scoreRef = useRef(0);
    const frameIdRef = useRef(null);
    const lastTimeRef = useRef(0);

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
        playerRef.current = { x: 50, y: 300, width: 30, height: 50, dy: 0, grounded: true, ducking: false, color: '#00ff00' };
        obstaclesRef.current = [];
        gameSpeedRef.current = 5;
        scoreRef.current = 0;
        setScore(0);
    };

    const spawnObstacle = () => {
        const type = Math.random() > 0.5 ? 'WALL' : 'PIT'; // Simple types for now
        // Actually let's do Wall (Jump) and Low Wall (Duck)
        // PIT is hard to draw without a floor gap logic, let's stick to objects for now
        // Type 0: High Wall (Jump over)
        // Type 1: Low Ceiling (Duck under) - maybe later
        
        const obstacle = {
            x: GAME_WIDTH,
            y: 320, // Ground level is 350
            width: 30,
            height: 30,
            passed: false
        };
        obstaclesRef.current.push(obstacle);
    };

    const update = (deltaTime) => {
        const player = playerRef.current;
        
        // Physics
        if (!player.grounded) {
            player.dy += GRAVITY;
        }
        player.y += player.dy;

        // Ground Collision
        if (player.y + player.height >= 350) {
            player.y = 350 - player.height;
            player.dy = 0;
            player.grounded = true;
        } else {
            player.grounded = false;
        }

        // Obstacles
        if (Math.random() < 0.01 + (gameSpeedRef.current * 0.001)) {
            if (obstaclesRef.current.length === 0 || obstaclesRef.current[obstaclesRef.current.length - 1].x < GAME_WIDTH - 300) {
                spawnObstacle();
            }
        }

        obstaclesRef.current.forEach(obs => {
            obs.x -= gameSpeedRef.current;
            
            // Collision Detection
            if (
                player.x < obs.x + obs.width &&
                player.x + player.width > obs.x &&
                player.y < obs.y + obs.height &&
                player.y + player.height > obs.y
            ) {
                gameOver();
            }

            // Score
            if (!obs.passed && obs.x + obs.width < player.x) {
                obs.passed = true;
                scoreRef.current += 10;
                setScore(scoreRef.current);
            }
        });

        // Cleanup
        obstaclesRef.current = obstaclesRef.current.filter(obs => obs.x + obs.width > 0);

        // Speed up
        gameSpeedRef.current += SPEED_INCREMENT;
    };

    const draw = (ctx) => {
        // Clear
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        // Ground
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 350);
        ctx.lineTo(GAME_WIDTH, 350);
        ctx.stroke();

        // Player
        const player = playerRef.current;
        ctx.fillStyle = player.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = player.color;
        ctx.fillRect(player.x, player.y, player.width, player.height);
        ctx.shadowBlur = 0;

        // Obstacles
        ctx.fillStyle = '#ff0000';
        obstaclesRef.current.forEach(obs => {
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        });

        // HUD
        ctx.fillStyle = '#fff';
        ctx.font = '20px Roboto Mono';
        ctx.fillText(`SCORE: ${scoreRef.current}`, 20, 30);
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
        
        if ((e.code === 'Space' || e.code === 'ArrowUp') && playerRef.current.grounded) {
            playerRef.current.dy = JUMP_FORCE;
            playerRef.current.grounded = false;
        }
    };

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [gameState]);

    const gameOver = async () => {
        setGameState('GAMEOVER');
        try {
            await fetch('/api/v1/arcade/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionID, score: scoreRef.current })
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
                    <Typography variant="h4" sx={{ color: '#00ff00', fontFamily: 'Roboto Mono', mb: 2 }}>
                        INFINITE LOOP
                    </Typography>
                    <Typography sx={{ color: '#fff', mb: 4 }}>
                        Cost: 5 Stake | Prize: Weekly Jackpot
                    </Typography>
                    {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
                    <Button 
                        variant="contained" 
                        color="primary" 
                        size="large"
                        onClick={startGame}
                        sx={{ fontFamily: 'Roboto Mono' }}
                    >
                        INSERT COIN (5 STAKE)
                    </Button>
                </Box>
            )}

            {gameState === 'LOADING' && (
                <CircularProgress />
            )}

            <canvas
                ref={canvasRef}
                width={GAME_WIDTH}
                height={GAME_HEIGHT}
                style={{ 
                    display: gameState === 'PLAYING' || gameState === 'GAMEOVER' ? 'block' : 'none',
                    margin: '0 auto',
                    border: '2px solid #333',
                    background: '#000'
                }}
            />

            {gameState === 'GAMEOVER' && (
                <Box sx={{ mt: 2 }}>
                    <Typography variant="h5" color="error" sx={{ fontFamily: 'Roboto Mono', mb: 2 }}>
                        CONNECTION TERMINATED
                    </Typography>
                    <Typography variant="h6" sx={{ color: '#fff', mb: 2 }}>
                        Final Score: {score}
                    </Typography>
                    <Button 
                        variant="outlined" 
                        onClick={() => setGameState('MENU')}
                        sx={{ fontFamily: 'Roboto Mono' }}
                    >
                        RETURN TO MENU
                    </Button>
                </Box>
            )}
            
            {gameState === 'PLAYING' && (
                <Typography variant="caption" sx={{ color: '#666', mt: 1, display: 'block' }}>
                    Controls: SPACE or UP ARROW to Jump
                </Typography>
            )}
        </Box>
    );
};

export default InfiniteLoopGame;
