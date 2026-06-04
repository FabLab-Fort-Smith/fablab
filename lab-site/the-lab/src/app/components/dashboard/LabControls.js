'use client';
import { useState, useEffect } from 'react';

const useUnlock = () => {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null);
    const [cooldown, setCooldown] = useState(0);

    useEffect(() => {
        let timer;
        if (cooldown > 0) timer = setInterval(() => setCooldown(p => p - 1), 1000);
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
                setStatus({ type: 'success', message: 'Lab unlocked. Welcome.' });
                setCooldown(10);
                if (onSuccess) onSuccess();
            } else {
                const msg = res.status === 502 ? 'Controller online, device disconnected.' : (data.error || 'Unlock failed.');
                setStatus({ type: 'error', message: msg });
            }
        } catch {
            setStatus({ type: 'error', message: 'Network error.' });
        } finally {
            setLoading(false);
        }
    };

    return { unlock, loading, status, setStatus, cooldown };
};

function StatusToast({ status, onClose }) {
    if (!status) return null;
    const color = status.type === 'success' ? 'var(--green)' : 'var(--red)';
    return (
        <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            border: `1px solid ${color}`, background: 'var(--bg-card)', color,
            padding: '10px 18px', fontSize: 11, fontFamily: 'var(--mono)',
            letterSpacing: '0.06em', zIndex: 200, display: 'flex', gap: 16, alignItems: 'center',
            boxShadow: `0 0 16px ${color}40`,
        }}>
            <span>[{status.type.toUpperCase()}]</span>
            <span style={{ color: 'var(--text)' }}>{status.message}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12 }}>×</button>
        </div>
    );
}

export function UnlockButton({ style }) {
    const { unlock, loading, status, setStatus, cooldown } = useUnlock();
    const ok = status?.type === 'success' && cooldown > 0;
    return (
        <>
            <button
                className={`btn ${ok ? '' : 'btn--amber'}`}
                style={{ whiteSpace: 'nowrap', ...(ok ? { borderColor: 'var(--green)', color: 'var(--green)' } : {}), ...style }}
                onClick={() => unlock()}
                disabled={loading || cooldown > 0}
            >
                {loading ? '$ unlocking...' : ok ? `$ unlocked (${cooldown}s)` : '$ unlock lab'}
            </button>
            <StatusToast status={status} onClose={() => setStatus(null)} />
        </>
    );
}

export function UnlockAndCheckInButton({ onCheckIn, checkInLoading, style }) {
    const { unlock, loading, status, setStatus, cooldown } = useUnlock();
    const ok = status?.type === 'success' && cooldown > 0;
    return (
        <>
            <button
                className={`btn ${ok ? '' : 'btn--filled'}`}
                style={{ whiteSpace: 'nowrap', ...(ok ? { borderColor: 'var(--green)', color: 'var(--green)', background: 'transparent' } : {}), ...style }}
                onClick={() => unlock(onCheckIn)}
                disabled={loading || checkInLoading || cooldown > 0}
            >
                {loading ? '$ unlocking...' : checkInLoading ? '$ checking in...' : ok ? `$ welcome! (${cooldown}s)` : '$ unlock & check in'}
            </button>
            <StatusToast status={status} onClose={() => setStatus(null)} />
        </>
    );
}

export function CheckInButton({ onCheckIn, checkInLoading, style }) {
    return (
        <button
            className="btn btn--filled"
            onClick={onCheckIn}
            disabled={checkInLoading}
            style={{ whiteSpace: 'nowrap', ...style }}
        >
            {checkInLoading ? '$ checking in...' : '$ check in'}
        </button>
    );
}
