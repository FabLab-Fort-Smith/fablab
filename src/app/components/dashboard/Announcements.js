
"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Alert, AlertTitle, Collapse, IconButton, Stack
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import axios from 'axios';

export default function Announcements() {
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAnnouncements();
    }, []);

    const fetchAnnouncements = async () => {
        try {
            const response = await axios.get('/api/v1/announcements');
            setAnnouncements(response.data);
        } catch (err) {
            console.error("Error fetching announcements:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleDismiss = (id) => {
        // In a real app, we might want to persist dismissal to local storage or DB
        setAnnouncements(prev => prev.filter(a => a._id !== id));
    };

    if (loading || announcements.length === 0) return null;

    return (
        <Stack spacing={2} sx={{ mb: 3 }}>
            {announcements.map((announcement) => (
                <Collapse in={true} key={announcement._id}>
                    <Alert 
                        severity={announcement.type}
                        action={
                            <IconButton
                                aria-label="close"
                                color="inherit"
                                size="small"
                                onClick={() => handleDismiss(announcement._id)}
                            >
                                <CloseIcon fontSize="inherit" />
                            </IconButton>
                        }
                        sx={{ mb: 0 }}
                    >
                        <AlertTitle>{announcement.title}</AlertTitle>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                            {announcement.content}
                        </Typography>
                    </Alert>
                </Collapse>
            ))}
        </Stack>
    );
}
