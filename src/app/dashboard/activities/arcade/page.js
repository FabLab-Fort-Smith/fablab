"use client";

import React, { useEffect, useState } from 'react';
import { Box, Grid, Typography, useTheme, Container, Paper } from '@mui/material';
import { useSession } from 'next-auth/react';
import JackpotDisplay from '@/app/components/arcade/JackpotDisplay';
import ArcadeLeaderboard from '@/app/components/arcade/Leaderboard';
import InfiniteLoopGame from '@/app/components/arcade/InfiniteLoopGame';
import LoadingTerminal from '@/app/components/LoadingTerminal';

const ArcadePage = () => {
    const { data: session, status } = useSession();
    const theme = useTheme();
    const [jackpot, setJackpot] = useState(0);
    const [refreshLeaderboard, setRefreshLeaderboard] = useState(0);

    const fetchJackpot = async () => {
        try {
            const res = await fetch('/api/v1/arcade/jackpot');
            const data = await res.json();
            if (data && data.currentAmount !== undefined) {
                setJackpot(data.currentAmount);
            }
        } catch (error) {
            console.error("Failed to fetch jackpot", error);
        }
    };

    useEffect(() => {
        fetchJackpot();
        const interval = setInterval(fetchJackpot, 30000); // Update every 30s
        return () => clearInterval(interval);
    }, []);

    const handleGameEnd = () => {
        setRefreshLeaderboard(prev => prev + 1);
        fetchJackpot(); // Refresh jackpot as it might have grown
    };

    if (status === 'loading') return <LoadingTerminal steps={['Connecting to Arcade Server...', 'Loading Assets...']} />;
    if (!session) return <Typography>Please login to play.</Typography>;

    return (
        <Box sx={{ 
            minHeight: '100vh', 
            background: '#050505', 
            backgroundImage: `
                linear-gradient(rgba(0, 255, 0, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0, 255, 0, 0.03) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px',
            color: '#fff',
            pt: 4,
            pb: 8
        }}>
            <Container maxWidth="xl">
                {/* Header */}
                <Box sx={{ textAlign: 'center', mb: 6 }}>
                    <Typography variant="h2" sx={{ 
                        fontFamily: 'Roboto Mono, monospace', 
                        color: '#00ff00',
                        textShadow: '0 0 20px rgba(0, 255, 0, 0.8)',
                        fontWeight: 'bold',
                        letterSpacing: '0.2em'
                    }}>
                        THE GLITCH ARCADE
                    </Typography>
                    <Typography variant="subtitle1" sx={{ color: '#00aa00', fontFamily: 'Roboto Mono', mt: 1 }}>
                        // SYSTEM_STATUS: COMPROMISED //
                    </Typography>
                </Box>

                <Grid container spacing={4}>
                    {/* Left Column: Game Cabinet */}
                    <Grid item xs={12} lg={8}>
                        <Paper sx={{ 
                            p: 0, 
                            background: '#000', 
                            border: '4px solid #333',
                            borderRadius: 4,
                            boxShadow: '0 0 40px rgba(0,0,0,0.8)',
                            overflow: 'hidden',
                            position: 'relative'
                        }}>
                            {/* Monitor Bezel */}
                            <Box sx={{ 
                                background: '#1a1a1a', 
                                p: 2, 
                                borderBottom: '2px solid #333',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f56' }} />
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e' }} />
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', background: '#27c93f' }} />
                                </Box>
                                <Typography sx={{ fontFamily: 'Roboto Mono', color: '#666', fontSize: '0.8rem' }}>
                                    TERMINAL_ID: {session.user.userID.split('-')[1]}
                                </Typography>
                            </Box>
                            
                            {/* Game Screen */}
                            <Box sx={{ p: 4, background: '#000', minHeight: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <InfiniteLoopGame user={session.user} onGameEnd={handleGameEnd} />
                            </Box>
                        </Paper>
                    </Grid>

                    {/* Right Column: System Stats */}
                    <Grid item xs={12} lg={4}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {/* Jackpot Module */}
                            <Paper sx={{ 
                                p: 3, 
                                background: 'rgba(0, 20, 0, 0.9)', 
                                border: '1px solid #00ff00',
                                boxShadow: '0 0 20px rgba(0, 255, 0, 0.1)'
                            }}>
                                <JackpotDisplay amount={jackpot} />
                            </Paper>

                            {/* Leaderboard Module */}
                            <Paper sx={{ 
                                p: 0, 
                                background: 'rgba(0, 0, 0, 0.8)', 
                                border: '1px solid #333',
                                flexGrow: 1
                            }}>
                                <Box sx={{ p: 2, borderBottom: '1px solid #333', background: '#111' }}>
                                    <Typography variant="h6" sx={{ color: '#fff', fontFamily: 'Roboto Mono' }}>
                                        TOP_RUNNERS.LOG
                                    </Typography>
                                </Box>
                                <ArcadeLeaderboard refreshTrigger={refreshLeaderboard} />
                            </Paper>
                        </Box>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
};

export default ArcadePage;
