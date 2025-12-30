'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Container, Button, Box, Snackbar, Alert } from '@mui/material';
import LoadingTerminal from '../../components/LoadingTerminal';

export default function VerifyEmailPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token');
    const isRegistered = searchParams.get('registered');
    const email = searchParams.get('email');
    const [steps, setSteps] = useState([]);
    const [resending, setResending] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    useEffect(() => {
        // If coming from registration without a token, show a static message
        if (!token && isRegistered) {
            setSteps([
                'A verification email has been sent to your inbox.',
                'Please click on the link in your email to verify your account.'
            ]);
            return;
        }
        if (!token) {
            setSteps(['Verification token is missing.']);
            return;
        }
        // Start the verification process
        setSteps(prev => [...prev, 'Retrieving token...']);
        // Give a short delay to simulate process
        setTimeout(() => {
            setSteps(prev => [...prev, 'Sending token to server...']);
            (async () => {
                try {
                    const res = await fetch(`/api/auth/verify-email?token=${token}`);
                    const data = await res.json();
                    if (res.ok) {
                        setSteps(prev => [...prev, 'Email verified successfully.']);
                        setSteps(prev => [...prev, '✨ 10 Stake added to your account!']);
                    } else {
                        setSteps(prev => [...prev, data.error || 'Verification failed.']);
                    }
                } catch (error) {
                    setSteps(prev => [...prev, 'An error occurred during verification.']);
                }
            })();
        }, 1000);
    }, [token, isRegistered]);

    useEffect(() => {
        if (steps.length && steps.includes('✨ 10 Stake added to your account!')) {
            setTimeout(() => {
                router.push('/auth/signin');
            }, 3000);
        }
    }, [steps, router]);

    const handleResendEmail = async () => {
        if (!email) return;
        setResending(true);
        try {
            const res = await fetch('/api/auth/resend-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            if (res.ok) {
                setSnackbar({ open: true, message: 'Verification email sent!', severity: 'success' });
            } else {
                setSnackbar({ open: true, message: data.error || 'Failed to send email.', severity: 'error' });
            }
        } catch (error) {
            setSnackbar({ open: true, message: 'Network error.', severity: 'error' });
        } finally {
            setResending(false);
        }
    };

    return (
        <Container component="main" maxWidth="sm" sx={{ minHeight: '100vh', py: 4, position: 'relative' }}>
            <LoadingTerminal steps={steps} />
            
            {isRegistered && email && (
                <Box sx={{ 
                    position: 'absolute', 
                    bottom: 80, 
                    left: 0, 
                    right: 0, 
                    display: 'flex', 
                    justifyContent: 'center',
                    zIndex: 10
                }}>
                    <Button 
                        variant="outlined" 
                        color="success" 
                        onClick={handleResendEmail}
                        disabled={resending}
                        sx={{ 
                            borderColor: '#00ff00', 
                            color: '#00ff00',
                            '&:hover': {
                                borderColor: '#00cc00',
                                backgroundColor: 'rgba(0, 255, 0, 0.1)'
                            }
                        }}
                    >
                        {resending ? 'Sending...' : 'Resend Verification Email'}
                    </Button>
                </Box>
            )}

            <Snackbar 
                open={snackbar.open} 
                autoHideDuration={6000} 
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Container>
    );
}
