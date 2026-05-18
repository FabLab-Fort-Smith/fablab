'use client';
import { useState, useEffect } from 'react';
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
        if (status === 'unauthenticated') router.push('/auth/signin?callbackUrl=/dashboard/checkin');
        else if (status === 'authenticated') {
            fetch('/api/v1/checkin')
                .then(r => r.ok ? r.json() : {})
                .then(d => setIsCheckedIn(d.isCheckedIn || false))
                .catch(() => {})
                .finally(() => setLoading(false));
        }
    }, [status, router]);

    const handleToggle = async () => {
        setActionLoading(true);
        setError('');
        try {
            const res = await fetch('/api/v1/checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: isCheckedIn ? 'checkout' : 'checkin' }),
            });
            const data = await res.json();
            if (res.ok) setIsCheckedIn(data.isCheckedIn);
            else setError(data.error || 'Failed to update status.');
        } catch { setError('Network error.'); }
        finally { setActionLoading(false); }
    };

    if (loading) return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-mid)', fontSize: 12 }}>
                <span className="dot pulse" style={{ background: 'var(--green)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
                loading...
            </div>
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ maxWidth: 440, width: '100%' }}>
                <div className="card" style={{ padding: '40px 32px', textAlign: 'center' }}>
                    {/* Status indicator */}
                    <div style={{
                        width: 72, height: 72, margin: '0 auto 24px',
                        border: `2px solid ${isCheckedIn ? 'var(--green)' : 'var(--bd-1)'}`,
                        background: isCheckedIn ? 'rgba(57,255,20,0.08)' : 'var(--bg-1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: isCheckedIn ? '0 0 24px rgba(57,255,20,0.2)' : 'none',
                        transition: 'all 0.2s',
                    }}>
                        <span style={{ fontFamily: 'var(--display)', fontSize: 28, color: isCheckedIn ? 'var(--green)' : 'var(--text-dim)', letterSpacing: '-0.04em' }}>
                            {isCheckedIn ? '◉' : '◌'}
                        </span>
                    </div>

                    <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                        <span style={{ color: 'var(--green)' }}>$</span> ./checkin --status
                    </div>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: '1.6rem', letterSpacing: '-0.04em', color: isCheckedIn ? 'var(--green)' : 'var(--text-bright)', marginBottom: 10 }}>
                        {isCheckedIn ? 'checked in' : 'not checked in'}
                    </h1>
                    <p style={{ color: 'var(--text-mid)', fontSize: 12, marginBottom: 28, lineHeight: 1.6 }}>
                        {isCheckedIn ? "don't forget to check out when you leave." : 'welcome! check in to track your visit.'}
                    </p>

                    {error && (
                        <div style={{ border: '1px solid var(--red)', color: 'var(--red)', fontSize: 11, padding: '8px 12px', marginBottom: 16 }}>
                            [ERROR] {error}
                        </div>
                    )}

                    <button
                        className={`btn ${isCheckedIn ? 'btn--red' : 'btn--filled'}`}
                        style={{ width: '100%', justifyContent: 'center', fontSize: 11, marginBottom: 16 }}
                        onClick={handleToggle}
                        disabled={actionLoading}
                    >
                        {actionLoading ? '$ processing...' : isCheckedIn ? '$ check out' : '$ check in now'}
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                        <div style={{ flex: 1, height: 1, background: 'var(--bd)' }} />
                        <span style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em' }}>OR</span>
                        <div style={{ flex: 1, height: 1, background: 'var(--bd)' }} />
                    </div>

                    <UnlockButton style={{ width: '100%', justifyContent: 'center', fontSize: 11 }} />
                </div>
            </div>
        </div>
    );
}
