
"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Container, Stack, Chip, CircularProgress, Alert
} from '@mui/material';
import axios from 'axios';

export default function AnnouncementsPage() {
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchAnnouncements();
    }, []);

    const fetchAnnouncements = async () => {
        try {
            const response = await axios.get('/api/v1/announcements');
            setAnnouncements(response.data);
        } catch (err) {
            console.error("Error fetching announcements:", err);
            setError("Failed to load announcements");
        } finally {
            setLoading(false);
        }
    };

    const getTypeColor = (type) => {
        switch (type) {
            case 'warning': return 'warning';
            case 'alert': return 'error';
            case 'success': return 'success';
            default: return 'info';
        }
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom>
                Announcements
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Stack spacing={3}>
                {announcements.map((announcement) => (
                    <Paper key={announcement._id} sx={{ p: 3 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2}>
                            <Chip 
                                label={announcement.type.toUpperCase()} 
                                color={getTypeColor(announcement.type)} 
                                size="small" 
                            />
                            <Typography variant="caption" color="text.secondary">
                                {new Date(announcement.createdAt).toLocaleDateString()}
                            </Typography>
                        </Stack>
                        <Typography variant="h6" gutterBottom>
                            {announcement.title}
                        </Typography>
                        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                            {announcement.content}
                        </Typography>
                    </Paper>
                ))}
                
                {announcements.length === 0 && (
                    <Typography variant="body1" color="text.secondary" align="center">
                        No active announcements.
                    </Typography>
                )}
            </Stack>
        </Container>
    );
}
