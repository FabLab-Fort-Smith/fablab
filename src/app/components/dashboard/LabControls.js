'use client';
import { useState, useEffect } from 'react';
import { Button, CircularProgress, Snackbar, Alert } from '@mui/material';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LoginIcon from '@mui/icons-material/Login';

// Shared logic for unlocking
const useUnlock = () => {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null);
    const [cooldown, setCooldown] = useState(0);

    useEffect(() => {
        let timer;
        if (cooldown > 0) {
            timer = setInterval(() => setCooldown(p => p - 1), 1000);
        }
        return () => clearInterval(timer);
    }, [cooldown]);

    const unlock = async (onSuccess) => {
        if (cooldown > 0) return;
        setLoading(true);
        setStatus(null);
        try {
            const res = await fetch('/api/v1/access/unlock', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setStatus({ type: 'success', message: 'Lab Unlocked! Welcome.' });
                setCooldown(10);
                if (onSuccess) onSuccess();
            } else {
                const msg = res.status === 502 ? 'Controller Online, but Device Disconnected.' : (data.error || 'Failed.');
                setStatus({ type: 'error', message: msg });
            }
        } catch (e) {
            setStatus({ type: 'error', message: 'Network error.' });
        } finally {
            setLoading(false);
        }
    };

    return { unlock, loading, status, setStatus, cooldown };
};

export function UnlockButton({ sx }) {
    const { unlock, loading, status, setStatus, cooldown } = useUnlock();
    const isSuccess = status?.type === 'success' && cooldown > 0;

    return (
        <>
            <Button
                variant="contained"
                color={isSuccess ? "success" : "warning"}
                startIcon={loading ? <CircularProgress size={20} color="inherit"/> : isSuccess ? <CheckCircleIcon/> : <LockOpenIcon/>}
                onClick={() => unlock()}
                disabled={loading || cooldown > 0}
                sx={{ fontWeight: 'bold', boxShadow: 3, whiteSpace: 'nowrap', minWidth: '140px', ...sx }}
            >
                {loading ? 'Unlocking...' : isSuccess ? `Unlocked (${cooldown})` : 'Unlock Lab'}
            </Button>
            <Snackbar open={!!status} autoHideDuration={6000} onClose={() => setStatus(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                <Alert onClose={() => setStatus(null)} severity={status?.type} sx={{ width: '100%' }}>{status?.message}</Alert>
            </Snackbar>
        </>
    );
}

export function UnlockAndCheckInButton({ onCheckIn, checkInLoading, sx }) {
    const { unlock, loading, status, setStatus, cooldown } = useUnlock();
    const isSuccess = status?.type === 'success' && cooldown > 0;

    const handleClick = () => {
        unlock(() => {
            // Only check in if unlock was successful
            if (onCheckIn) onCheckIn();
        });
    };

    return (
        <>
            <Button
                variant="contained"
                color={isSuccess ? "success" : "secondary"} 
                startIcon={loading || checkInLoading ? <CircularProgress size={20} color="inherit"/> : isSuccess ? <CheckCircleIcon/> : <LoginIcon/>}
                onClick={handleClick}
                disabled={loading || checkInLoading || cooldown > 0}
                sx={{ fontWeight: 'bold', boxShadow: 3, whiteSpace: 'nowrap', minWidth: '180px', ...sx }}
            >
                {loading ? 'Unlocking...' : checkInLoading ? 'Checking In...' : isSuccess ? `Welcome! (${cooldown})` : 'Unlock & Check In'}
            </Button>
             <Snackbar open={!!status} autoHideDuration={6000} onClose={() => setStatus(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                <Alert onClose={() => setStatus(null)} severity={status?.type} sx={{ width: '100%' }}>{status?.message}</Alert>
            </Snackbar>
        </>
    );
}

export function CheckInButton({ onCheckIn, checkInLoading, sx }) {
    return (
        <Button
            variant="contained"
            color="secondary"
            startIcon={checkInLoading ? <CircularProgress size={20} color="inherit"/> : <LoginIcon/>}
            onClick={onCheckIn}
            disabled={checkInLoading}
            sx={{ fontWeight: 'bold', boxShadow: 3, whiteSpace: 'nowrap', minWidth: '140px', ...sx }}
        >
            {checkInLoading ? 'Checking In...' : 'Check In'}
        </Button>
    );
}
