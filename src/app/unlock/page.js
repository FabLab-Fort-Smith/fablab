"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function NFCUnlockPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [unlockStatus, setUnlockStatus] = useState('idle');
    const [message, setMessage] = useState('Initializing...');

    useEffect(() => {
        if (status === 'authenticated') {
            attemptUnlock();
        } else if (status === 'unauthenticated') {
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
                setTimeout(() => router.push('/dashboard'), 3000);
            } else {
                setUnlockStatus('error');
                setMessage(data.error || 'Failed to unlock door.');
            }
        } catch {
            setUnlockStatus('error');
            setMessage('Network error occurred.');
        }
    };

    const statusColor = unlockStatus === 'success' ? 'var(--green)' : unlockStatus === 'error' ? 'var(--red)' : 'var(--cyan)';
    const statusIcon = unlockStatus === 'success' ? '✓' : unlockStatus === 'error' ? '✕' : unlockStatus === 'unlocking' ? '◌' : '⊙';
    const statusLabel = unlockStatus === 'success' ? 'Unlocked!' : unlockStatus === 'error' ? 'Access Denied' : 'Processing Access';

    if (status === 'loading') {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
                <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 13 }}>loading<span style={{ animation: 'blink 1s step-end infinite' }}>_</span></div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
            <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '40px 48px', maxWidth: 400, width: '100%', textAlign: 'center' }}>
                <div style={{ fontSize: 72, color: statusColor, fontFamily: 'var(--mono)', lineHeight: 1, marginBottom: 24, transition: 'color 0.3s' }}>
                    {statusIcon}
                </div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 4vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 8 }}>
                    {statusLabel}
                </div>
                <div style={{ color: 'var(--text-mid)', fontFamily: 'var(--mono)', fontSize: 12, marginBottom: 28 }}>
                    {message}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {unlockStatus === 'error' && (
                        <button className="btn btn--filled" style={{ width: '100%', fontSize: 11 }} onClick={attemptUnlock}>
                            ↻ try again
                        </button>
                    )}
                    <button className="btn btn--ghost" style={{ width: '100%', fontSize: 11 }} onClick={() => router.push('/dashboard')}>
                        ← go to dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}
