"use client";
import React, { useState } from 'react';
import { Box, Typography, Button, Card, CardContent, CardActions, Grid, CircularProgress, Alert } from '@mui/material';
import { useSession } from 'next-auth/react';
import axios from 'axios';

const MISSIONS = [
    {
        id: 'mission-01',
        title: 'Mission 1: Hello World',
        description: 'Your first step into the Holodeck. Learn the basics of the Linux command line.',
        difficulty: 'Easy',
        cost: 0 // Free for now
    },
    {
        id: 'mission-02',
        title: 'Mission 2: File System Navigation',
        description: 'Navigate the file system and find the hidden flag.',
        difficulty: 'Easy',
        cost: 0
    }
];

const HolodeckPage = () => {
    const { data: session } = useSession();
    const [activeMission, setActiveMission] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [terminalUrl, setTerminalUrl] = useState('');

    const handleStartMission = async (missionID) => {
        setLoading(true);
        setError('');
        try {
            const response = await axios.post('/api/v1/arcade/start', {
                userID: session?.user?.userID,
                game: missionID
            });

            if (response.data.url) {
                // Construct the authenticated URL if token is separate
                // The Orchestrator returns { url, token }
                // ttyd usually accepts ?token=xyz or Basic Auth
                // Our Orchestrator setup uses ?credential=token:xyz in the Cmd, 
                // so we just need to pass the token in the URL query param if ttyd supports it,
                // OR use Basic Auth: https://token:SECRET@host
                
                // Let's assume the Orchestrator returns the base URL and we append the token
                // or the Orchestrator returns the full URL with token if configured.
                // In our index.js, we returned { url, token }.
                // ttyd with `credential` option uses Basic Auth.
                // So we construct: https://token:THE_TOKEN@host
                
                const { url, token } = response.data;
                // Remove http:// or https:// to inject auth
                const cleanUrl = url.replace(/^https?:\/\//, '');
                const authUrl = `http://token:${token}@${cleanUrl}`; // Use http for local dev
                
                setTerminalUrl(authUrl);
                setActiveMission(missionID);
            }
        } catch (err) {
            console.error("Failed to start mission:", err);
            setError(err.response?.data?.error || "Failed to start mission.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom>The Holodeck (Beta)</Typography>
            <Typography variant="body1" sx={{ mb: 4 }}>
                Welcome to the Holodeck. Here you can launch real, ephemeral Linux environments to practice your hacking skills.
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

            {!activeMission ? (
                <Grid container spacing={3}>
                    {MISSIONS.map((mission) => (
                        <Grid item xs={12} md={6} key={mission.id}>
                            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <CardContent sx={{ flexGrow: 1 }}>
                                    <Typography variant="h5" component="div">
                                        {mission.title}
                                    </Typography>
                                    <Typography sx={{ mb: 1.5 }} color="text.secondary">
                                        Difficulty: {mission.difficulty}
                                    </Typography>
                                    <Typography variant="body2">
                                        {mission.description}
                                    </Typography>
                                </CardContent>
                                <CardActions>
                                    <Button 
                                        size="small" 
                                        variant="contained" 
                                        onClick={() => handleStartMission(mission.id)}
                                        disabled={loading}
                                    >
                                        {loading ? <CircularProgress size={24} /> : 'Start Mission'}
                                    </Button>
                                </CardActions>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            ) : (
                <Box sx={{ height: '80vh', border: '1px solid #333', borderRadius: 2, overflow: 'hidden' }}>
                    <Box sx={{ p: 1, bgcolor: '#222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle2" sx={{ color: '#fff' }}>
                            {MISSIONS.find(m => m.id === activeMission)?.title}
                        </Typography>
                        <Button 
                            size="small" 
                            color="error" 
                            onClick={() => { setActiveMission(null); setTerminalUrl(''); }}
                        >
                            Close Session
                        </Button>
                    </Box>
                    <iframe 
                        src={terminalUrl} 
                        style={{ width: '100%', height: '100%', border: 'none' }} 
                        title="Terminal"
                    />
                </Box>
            )}
        </Box>
    );
};

export default HolodeckPage;
