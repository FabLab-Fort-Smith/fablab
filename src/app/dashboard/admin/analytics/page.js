"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Grid, Card, CardContent, LinearProgress, 
    IconButton, Container, useTheme, FormControl, Select, MenuItem, InputLabel 
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PeopleIcon from '@mui/icons-material/People';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AssignmentIcon from '@mui/icons-material/Assignment';
import LoadingTerminal from '@/app/components/LoadingTerminal';

export default function AnalyticsPage() {
    const theme = useTheme();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('all');

    const fetchStats = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/analytics?timeRange=${timeRange}`);
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (error) {
            console.error("Failed to fetch analytics", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, [timeRange]);

    if (loading) return <LoadingTerminal steps={['Crunching numbers...', 'Analyzing data...', 'Generating report...']} />;

    const StatCard = ({ title, value, icon, color, subtitle, progress }) => (
        <Card sx={{ height: '100%', position: 'relative', overflow: 'visible' }}>
            <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            {title}
                        </Typography>
                        <Typography variant="h4" fontWeight="bold" sx={{ color: color }}>
                            {value}
                        </Typography>
                    </Box>
                    <Box sx={{ 
                        p: 1.5, 
                        borderRadius: 2, 
                        bgcolor: `${color}22`, 
                        color: color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        {icon}
                    </Box>
                </Box>
                
                {progress !== undefined && (
                    <Box sx={{ mt: 2 }}>
                        <LinearProgress 
                            variant="determinate" 
                            value={progress} 
                            sx={{ 
                                height: 6, 
                                borderRadius: 3,
                                bgcolor: `${color}22`,
                                '& .MuiLinearProgress-bar': {
                                    bgcolor: color
                                }
                            }} 
                        />
                    </Box>
                )}
                
                {subtitle && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        {subtitle}
                    </Typography>
                )}
            </CardContent>
        </Card>
    );

    return (
        <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 }, px: { xs: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 4, gap: 2 }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' } }}>
                        Analytics
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Overview of community performance
                    </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', gap: 2, width: { xs: '100%', sm: 'auto' } }}>
                    <FormControl size="small" sx={{ minWidth: 120, flex: { xs: 1, sm: 'none' } }}>
                        <InputLabel>Time Range</InputLabel>
                        <Select
                            value={timeRange}
                            label="Time Range"
                            onChange={(e) => setTimeRange(e.target.value)}
                        >
                            <MenuItem value="all">All Time</MenuItem>
                            <MenuItem value="30d">Last 30 Days</MenuItem>
                            <MenuItem value="90d">Last 90 Days</MenuItem>
                            <MenuItem value="1y">Last Year</MenuItem>
                        </Select>
                    </FormControl>
                    <IconButton onClick={fetchStats} sx={{ bgcolor: 'background.paper' }}>
                        <RefreshIcon />
                    </IconButton>
                </Box>
            </Box>

            <Grid container spacing={3}>
                {/* Membership Stats */}
                <Grid item xs={12} md={4}>
                    <StatCard 
                        title={timeRange === 'all' ? "Total Members" : "New Members"} 
                        value={timeRange === 'all' ? (stats?.users?.total || 0) : (stats?.users?.new || 0)} 
                        icon={<PeopleIcon />} 
                        color={theme.palette.primary.main}
                        subtitle={`${stats?.users?.active} Active • ${stats?.users?.probation} Probation`}
                        progress={stats?.users?.total ? (stats.users.active / stats.users.total) * 100 : 0}
                    />
                </Grid>
                <Grid item xs={12} md={4}>
                    <StatCard 
                        title={timeRange === 'all' ? "Total Stake" : "Distributed Stake"} 
                        value={timeRange === 'all' ? (stats?.stake?.total || 0) : (stats?.stake?.distributed || 0)} 
                        icon={<MonetizationOnIcon />} 
                        color={theme.palette.warning.main}
                        subtitle={timeRange === 'all' ? "Total distributed stake" : "Stake earned in period"}
                    />
                </Grid>
                <Grid item xs={12} md={4}>
                    <StatCard 
                        title={timeRange === 'all' ? "Total Hours" : "Hours Logged"} 
                        value={timeRange === 'all' ? (stats?.hours?.total || 0) : (stats?.hours?.logged || 0)} 
                        icon={<AccessTimeIcon />} 
                        color={theme.palette.success.main}
                        subtitle={timeRange === 'all' ? "Total hours contributed" : "Hours logged in period"}
                    />
                </Grid>

                {/* Bounty Stats */}
                <Grid item xs={12}>
                    <Typography variant="h6" sx={{ mb: 2, mt: 2 }}>Bounty Performance</Typography>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                    <StatCard 
                        title={timeRange === 'all' ? "Total Bounties" : "Created Bounties"} 
                        value={timeRange === 'all' ? (stats?.bounties?.total || 0) : (stats?.bounties?.created || 0)} 
                        icon={<AssignmentIcon />} 
                        color={theme.palette.info.main}
                        subtitle={`${stats?.bounties?.completed} Completed`}
                        progress={stats?.bounties?.total ? (stats.bounties.completed / stats.bounties.total) * 100 : 0}
                    />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <StatCard 
                        title="Open Opportunities" 
                        value={stats?.bounties?.open || 0} 
                        icon={<VerifiedUserIcon />} 
                        color={theme.palette.secondary.main}
                        subtitle="Available for claiming"
                    />
                </Grid>
            </Grid>
        </Container>
    );
}
