"use client";
import { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Button, Container, Paper } from '@mui/material';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LockIcon from '@mui/icons-material/Lock';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function NFCUnlockPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [unlockStatus, setUnlockStatus] = useState('idle'); // idle, unlocking, success, error
    const [message, setMessage] = useState('Initializing...');

    useEffect(() => {
        if (status === 'authenticated') {
            attemptUnlock();
        } else if (status === 'unauthenticated') {
            // Middleware handles redirect, but just in case
            router.push('/auth/signin?callbackUrl=/unlock');
        }
    }, [status]);

    const attemptUnlock = async () => {
        setUnlockStatus('unlocking');
        setMessage('Unlocking The Lab...');

        try {
            const res = await fetch('/api/v1/access/unlock', { method: 'POST' });
            const data = await res.json();
            
            if (res.ok) {
                setUnlockStatus('success');
                setMessage('Welcome to The Lab!');
                // Optional: Redirect to dashboard after a delay
                setTimeout(() => {
                    router.push('/dashboard');
                }, 3000);
            } else {
                setUnlockStatus('error');
                setMessage(data.error || 'Failed to unlock door.');
            }
        } catch (error) {
            setUnlockStatus('error');
            setMessage('Network error occurred.');
        }
    };

    if (status === 'loading') {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Container maxWidth="sm" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
            <Paper 
                elevation={3} 
                sx={{ 
                    p: 4, 
                    width: '100%', 
                    textAlign: 'center',
                    borderRadius: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3
                }}
            >
                {/* Status Icon */}
                <Box sx={{ 
                    width: 120, 
                    height: 120, 
                    borderRadius: '50%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    bgcolor: 
                        unlockStatus === 'unlocking' ? 'info.light' :
                        unlockStatus === 'success' ? 'success.light' :
                        unlockStatus === 'error' ? 'error.light' : 'grey.200',
                    color: 'white',
                    animation: unlockStatus === 'unlocking' ? 'pulse 1.5s infinite' : 'none',
                    '@keyframes pulse': {
                        '0%': { transform: 'scale(1)', opacity: 1 },
                        '50%': { transform: 'scale(1.05)', opacity: 0.8 },
                        '100%': { transform: 'scale(1)', opacity: 1 },
                    }
                }}>
                    {unlockStatus === 'unlocking' && <CircularProgress color="inherit" size={60} />}
                    {unlockStatus === 'success' && <CheckCircleIcon sx={{ fontSize: 80 }} />}
                    {unlockStatus === 'error' && <ErrorOutlineIcon sx={{ fontSize: 80 }} />}
                    {unlockStatus === 'idle' && <LockIcon sx={{ fontSize: 80 }} />}
                </Box>

                {/* Message */}
                <Box>
                    <Typography variant="h4" fontWeight="bold" gutterBottom>
                        {unlockStatus === 'success' ? 'Unlocked!' : 
                         unlockStatus === 'error' ? 'Access Denied' : 
                         'Processing Access'}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        {message}
                    </Typography>
                </Box>
                
                {/* Actions */}
                <Box sx={{ width: '100%', mt: 2 }}>
                    {unlockStatus === 'error' && (
                        <Button 
                            variant="contained" 
                            color="primary" 
                            fullWidth 
                            size="large" 
                            onClick={attemptUnlock}
                            startIcon={<LockOpenIcon />}
                            sx={{ mb: 2, borderRadius: 2 }}
                        >
                            Try Again
                        </Button>
                    )}
                    
                    <Button 
                        variant="outlined" 
                        color="inherit" 
                        fullWidth 
                        onClick={() => router.push('/dashboard')}
                        startIcon={<ArrowBackIcon />}
                        sx={{ borderRadius: 2 }}
                    >
                        Go to Dashboard
                    </Button>
                </Box>
            </Paper>
        </Container>
    );
}
