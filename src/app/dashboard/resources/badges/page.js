"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Grid, Card, CardContent, Avatar, 
    Container, Paper, Chip, useTheme, CircularProgress
} from '@mui/material';

export default function BadgeDirectoryPage() {
    const theme = useTheme();
    const [badges, setBadges] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/v1/badges')
            .then(res => res.json())
            .then(data => setBadges(data.badges || []))
            .catch(err => console.error("Failed to fetch badges", err))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Box sx={{ mb: 4, textAlign: 'center' }}>
                <Typography variant="h4" gutterBottom fontWeight="bold">
                    Badge Directory
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Explore the achievements and certifications available at The Lab.
                </Typography>
            </Box>

            <Grid container spacing={3}>
                {badges.map((badge) => (
                    <Grid item xs={12} sm={6} md={4} key={badge.id}>
                        <Card 
                            sx={{ 
                                height: '100%', 
                                display: 'flex', 
                                flexDirection: 'column',
                                alignItems: 'center',
                                textAlign: 'center',
                                p: 2,
                                transition: 'transform 0.2s',
                                '&:hover': {
                                    transform: 'translateY(-4px)',
                                    boxShadow: theme.shadows[4]
                                }
                            }}
                        >
                            <Avatar 
                                src={badge.imageUrl}
                                sx={{ 
                                    width: 80, 
                                    height: 80, 
                                    bgcolor: theme.palette.primary.main,
                                    fontSize: '2.5rem',
                                    mb: 2
                                }}
                            >
                                {!badge.imageUrl && (badge.icon || '🏅')}
                            </Avatar>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    {badge.name}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    {badge.description}
                                </Typography>
                                <Chip 
                                    label={badge.id.toUpperCase().replace(/_/g, ' ')} 
                                    size="small" 
                                    variant="outlined" 
                                    sx={{ fontSize: '0.7rem' }}
                                />
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>
        </Container>
    );
}
