'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import LoadingTerminal from '@/app/components/LoadingTerminal';
import SettingsTab from '@/app/components/profile/tabs/settings';

export default function SettingsPage() {
    const { data: session, status } = useSession();
    const params = useParams();
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (status === 'unauthenticated') { router.push('/auth/signin'); return; }
        if (status !== 'authenticated') return;

        const isOwner = session.user.userID === params?.userID;
        const isAdmin = session.user.role === 'admin';
        if (!isOwner && !isAdmin) { router.push(`/dashboard/${session.user.userID}/settings`); return; }

        fetch(`/api/v1/users?userID=${params.userID}`)
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(data => setUser(data.user))
            .catch(e => setError(`Failed to load settings (${e}).`))
            .finally(() => setLoading(false));
    }, [status, session, params?.userID]);

    if (status === 'loading' || loading) return <LoadingTerminal steps={['loading settings...']} />;

    if (error) return (
        <div style={{ padding: '40px 24px' }}>
            <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: 11 }}>✗ {error}</div>
        </div>
    );

    if (!user) return null;

    return (
        <div style={{ padding: '20px 24px', maxWidth: 780 }}>
            <div style={{ marginBottom: 24 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                    <span style={{ color: 'var(--green)' }}>$</span> ./settings --open
                </div>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                    account.settings
                </h1>
            </div>
            <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)' }}>
                <SettingsTab user={user} />
            </div>
        </div>
    );
}
