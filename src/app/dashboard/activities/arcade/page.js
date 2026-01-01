"use client";

import React, { useEffect, useState } from 'react';
import { Box, Grid, Typography, useTheme, Container } from '@mui/material';
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
            background: '#0a0a0a', 
            backgroundImage: 'radial-gradient(circle at 50% 50%, #1a1a1a 0%, #000000 100%)',
            color: '#fff',
            pt: 4,
            pb: 8
        }}>
            <Container maxWidth="lg">
                <Typography variant="h3" sx={{ 
                    textAlign: 'center', 
                    fontFamily: 'Roboto Mono, monospace', 
                    color: '#00ff00',
                    textShadow: '0 0 20px rgba(0, 255, 0, 0.5)',
                    mb: 4
                }}>
                    THE GLITCH ARCADE
                </Typography>

                <Grid container spacing={4}>
                    <Grid item xs={12} md={8}>
                        <InfiniteLoopGame user={session.user} onGameEnd={handleGameEnd} />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <JackpotDisplay amount={jackpot} />
                            <ArcadeLeaderboard refreshTrigger={refreshLeaderboard} />
                        </Box>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
};

export default ArcadePage;
