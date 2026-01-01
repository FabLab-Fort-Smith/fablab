"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Button, Container, Paper, CircularProgress, Alert, Divider 
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { UnlockButton } from '@/app/components/dashboard/LabControls';

export default function CheckInPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [isCheckedIn, setIsCheckedIn] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/signin?callbackUrl=/dashboard/checkin');
        } else if (status === 'authenticated') {
            fetchStatus();
        }
    }, [status, router]);

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/v1/checkin');
            if (res.ok) {
                const data = await res.json();
                setIsCheckedIn(data.isCheckedIn);
            }
        } catch (err) {
            console.error("Failed to fetch check-in status", err);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async () => {
        setActionLoading(true);
        setError('');
        try {
            const action = isCheckedIn ? 'checkout' : 'checkin';
            const res = await fetch('/api/v1/checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });

            if (res.ok) {
                const data = await res.json();
                setIsCheckedIn(data.isCheckedIn);
            } else {
                const data = await res.json();
                setError(data.error || "Failed to update status");
            }
        } catch (err) {
            console.error("Error toggling check-in", err);
            setError("Network error");
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Container maxWidth="sm" sx={{ py: 8 }}>
            <Paper 
                elevation={3} 
                sx={{ 
                    p: 4, 
                    textAlign: 'center', 
                    borderRadius: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3
                }}
            >
                <Box sx={{ 
                    width: 80, 
                    height: 80, 
                    borderRadius: '50%', 
                    bgcolor: isCheckedIn ? 'success.light' : 'grey.200',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    color: isCheckedIn ? 'success.dark' : 'grey.500'
                }}>
                    <LocationOnIcon sx={{ fontSize: 40 }} />
                </Box>

                <Typography variant="h4" fontWeight="bold">
                    {isCheckedIn ? "You are Checked In" : "Check In to The Lab"}
                </Typography>

                <Typography variant="body1" color="text.secondary">
                    {isCheckedIn 
                        ? "Don't forget to check out when you leave!" 
                        : "Welcome! Please check in to track your visit."}
                </Typography>

                {error && <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert>}

                <Button
                    variant="contained"
                    color={isCheckedIn ? "error" : "success"}
                    size="large"
                    fullWidth
                    onClick={handleToggle}
                    disabled={actionLoading}
                    startIcon={isCheckedIn ? <ExitToAppIcon /> : <CheckCircleIcon />}
                    sx={{ 
                        py: 2, 
                        fontSize: '1.2rem',
                        borderRadius: 2,
                        textTransform: 'none'
                    }}
                >
                    {actionLoading 
                        ? <CircularProgress size={24} color="inherit" /> 
                        : (isCheckedIn ? "Check Out" : "Check In Now")}
                </Button>

                <Divider sx={{ width: '100%', my: 1 }}>OR</Divider>

                <UnlockButton sx={{ width: '100%', py: 1.5 }} />
            </Paper>
        </Container>
    );
}
