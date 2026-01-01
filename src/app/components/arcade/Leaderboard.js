import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Typography, Paper, List, ListItem, ListItemAvatar, Avatar, ListItemText, Divider, Button } from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

const ArcadeLeaderboard = ({ refreshTrigger }) => {
    const [scores, setScores] = useState([]);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const res = await fetch('/api/v1/arcade/leaderboard?game=infinite_loop');
                const data = await res.json();
                if (Array.isArray(data)) {
                    setScores(data);
                }
            } catch (error) {
                console.error("Failed to fetch leaderboard", error);
            }
        };

        fetchLeaderboard();
        // Refresh every minute
        const interval = setInterval(fetchLeaderboard, 60000);
        return () => clearInterval(interval);
    }, [refreshTrigger]);

    return (
        <Paper sx={{ p: 2, background: 'rgba(0,0,0,0.5)', border: '1px solid #333' }}>
            <Typography variant="h6" sx={{ color: '#00ff00', fontFamily: 'Roboto Mono, monospace', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <EmojiEventsIcon /> TOP HACKERS
            </Typography>
            <List>
                {scores.slice(0, 3).map((score, index) => (
                    <React.Fragment key={score._id}>
                        <ListItem alignItems="flex-start">
                            <ListItemAvatar>
                                <Avatar alt={score.username} src={score.avatar} sx={{ border: index < 3 ? '2px solid gold' : 'none' }} />
                            </ListItemAvatar>
                            <ListItemText
                                primary={
                                    <Typography sx={{ color: '#fff', fontFamily: 'Roboto Mono, monospace' }}>
                                        {index + 1}. {score.username}
                                    </Typography>
                                }
                                secondary={
                                    <Typography sx={{ color: '#00ff00', fontFamily: 'Roboto Mono, monospace' }}>
                                        {score.score} PTS
                                    </Typography>
                                }
                            />
                        </ListItem>
                        {index < Math.min(scores.length, 3) - 1 && <Divider variant="inset" component="li" sx={{ borderColor: '#333' }} />}
                    </React.Fragment>
                ))}
                {scores.length === 0 && (
                    <Typography sx={{ color: '#666', textAlign: 'center', py: 2 }}>
                        No scores yet. Be the first!
                    </Typography>
                )}
            </List>
            <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Link href="/dashboard/activities/leaderboard" passHref>
                    <Button 
                        variant="outlined" 
                        size="small"
                        sx={{ 
                            color: '#00ff00', 
                            borderColor: '#00ff00', 
                            fontFamily: 'Roboto Mono, monospace',
                            '&:hover': {
                                borderColor: '#fff',
                                color: '#fff',
                                backgroundColor: 'rgba(0, 255, 0, 0.1)'
                            }
                        }}
                    >
                        VIEW FULL LEADERBOARD
                    </Button>
                </Link>
            </Box>
        </Paper>
    );
};

export default ArcadeLeaderboard;
