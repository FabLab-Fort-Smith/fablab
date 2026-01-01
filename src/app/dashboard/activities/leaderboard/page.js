"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Grid, Card, CardContent, Avatar, 
    Container, CircularProgress, Alert, useTheme, Chip,
    Tabs, Tab, useMediaQuery
} from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import StarIcon from '@mui/icons-material/Star';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import { useRouter } from 'next/navigation';

export default function LeaderboardPage() {
    const theme = useTheme();
    const router = useRouter();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const [activeTab, setActiveTab] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState({
        topStake: [],
        topVolunteers: [],
        topBountyHunters: []
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('/api/v1/leaderboard');
                if (!res.ok) throw new Error('Failed to fetch leaderboard data');
                const result = await res.json();
                setData(result);
            } catch (err) {
                console.error(err);
                setError('Failed to load leaderboards.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleUserClick = (userID) => {
        if (userID) {
            router.push(`/dashboard/member/${userID}`);
        }
    };

    const LeaderboardCard = ({ title, icon, users, valueKey, valueLabel, color }) => (
        <Card sx={{ 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column', 
            position: 'relative', 
            overflow: 'visible',
            mt: { xs: 3, md: 0 }
        }}>
            <Box sx={{ 
                position: 'absolute', 
                top: -20, 
                left: '50%', 
                transform: 'translateX(-50%)',
                bgcolor: color,
                color: 'white',
                borderRadius: '50%',
                p: 1.5,
                boxShadow: 3,
                zIndex: 1
            }}>
                {icon}
            </Box>
            <CardContent sx={{ pt: 4, flexGrow: 1, px: { xs: 1, md: 2 } }}>
                <Typography variant={isMobile ? "h6" : "h5"} align="center" gutterBottom fontWeight="bold" sx={{ mt: 1, mb: 3 }}>
                    {title}
                </Typography>
                
                {users.length === 0 ? (
                    <Typography align="center" color="text.secondary">No data yet.</Typography>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {users.map((user, index) => (
                            <Box 
                                key={user.userID || index} 
                                onClick={() => handleUserClick(user.userID)}
                                sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: { xs: 1, md: 2 },
                                    p: 1.5,
                                    borderRadius: 2,
                                    bgcolor: index === 0 ? `${color}15` : 'transparent',
                                    border: index === 0 ? `1px solid ${color}40` : 'none',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    '&:hover': {
                                        bgcolor: 'action.hover',
                                        transform: 'translateX(4px)'
                                    }
                                }}
                            >
                                <Typography 
                                    variant="h6" 
                                    fontWeight="bold" 
                                    color={index === 0 ? color : 'text.secondary'}
                                    sx={{ minWidth: 24, fontSize: { xs: '1rem', md: '1.25rem' } }}
                                >
                                    #{index + 1}
                                </Typography>
                                <Avatar 
                                    src={user.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.firstName)}&background=random`} 
                                    sx={{ 
                                        width: index === 0 ? { xs: 40, md: 48 } : 40, 
                                        height: index === 0 ? { xs: 40, md: 48 } : 40,
                                        border: index === 0 ? `2px solid ${color}` : 'none'
                                    }}
                                />
                                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle1" fontWeight="bold" noWrap>
                                        {user.firstName} {user.lastName}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" noWrap display="block">
                                        @{user.username || 'user'}
                                    </Typography>
                                </Box>
                                <Chip 
                                    label={isMobile ? user[valueKey] : `${user[valueKey]} ${valueLabel}`} 
                                    size="small" 
                                    sx={{ 
                                        bgcolor: index === 0 ? color : 'action.selected',
                                        color: index === 0 ? 'white' : 'text.primary',
                                        fontWeight: 'bold',
                                        minWidth: 'fit-content'
                                    }} 
                                />
                            </Box>
                        ))}
                    </Box>
                )}
            </CardContent>
        </Card>
    );

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Container maxWidth="xl" sx={{ py: 4, pb: { xs: 10, md: 4 } }}>
            <Box sx={{ mb: { xs: 3, md: 6 }, textAlign: 'center' }}>
                <Typography variant="h3" component="h1" gutterBottom fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, fontSize: { xs: '2rem', md: '3rem' } }}>
                    <EmojiEventsIcon fontSize="large" color="primary" />
                    Leaderboards
                </Typography>
                <Typography variant="h6" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
                    Celebrating our top contributors, makers, and volunteers.
                </Typography>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 4 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            {isMobile && (
                <Tabs 
                    value={activeTab} 
                    onChange={(e, v) => setActiveTab(v)} 
                    variant="fullWidth" 
                    sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
                >
                    <Tab icon={<StarIcon />} label="Stake" />
                    <Tab icon={<AccessTimeIcon />} label="Hours" />
                    <Tab icon={<GpsFixedIcon />} label="Bounties" />
                </Tabs>
            )}

            <Grid container spacing={4}>
                {/* Top Stake Holders */}
                {(!isMobile || activeTab === 0) && (
                    <Grid item xs={12} md={4}>
                        <LeaderboardCard 
                            title="Top Stake Holders" 
                            icon={<StarIcon fontSize="large" />} 
                            users={data.topStake} 
                            valueKey="stake" 
                            valueLabel="Stake"
                            color="#FFD700" // Gold
                        />
                    </Grid>
                )}

                {/* Top Volunteers */}
                {(!isMobile || activeTab === 1) && (
                    <Grid item xs={12} md={4}>
                        <LeaderboardCard 
                            title="Top Volunteers" 
                            icon={<AccessTimeIcon fontSize="large" />} 
                            users={data.topVolunteers} 
                            valueKey="totalHours" 
                            valueLabel="Hours"
                            color="#4caf50" // Green
                        />
                    </Grid>
                )}

                {/* Top Bounty Hunters */}
                {(!isMobile || activeTab === 2) && (
                    <Grid item xs={12} md={4}>
                        <LeaderboardCard 
                            title="Top Bounty Hunters" 
                            icon={<GpsFixedIcon fontSize="large" />} 
                            users={data.topBountyHunters} 
                            valueKey="count" 
                            valueLabel="Bounties"
                            color="#f44336" // Red
                        />
                    </Grid>
                )}
            </Grid>
        </Container>
    );
}
