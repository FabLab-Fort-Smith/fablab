"use client";
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import InfiniteLoopGame from '@/app/components/arcade/InfiniteLoopGame';
import LoadingTerminal from '@/app/components/LoadingTerminal';

const ArcadePage = () => {
    const { data: session, status } = useSession();
    const [jackpot, setJackpot] = useState(0);
    const [refreshLeaderboard, setRefreshLeaderboard] = useState(0);

    const fetchJackpot = async () => {
        try {
            const res = await fetch('/api/v1/arcade/jackpot');
            const data = await res.json();
            if (data?.currentAmount !== undefined) setJackpot(data.currentAmount);
        } catch {}
    };

    useEffect(() => {
        fetchJackpot();
        const interval = setInterval(fetchJackpot, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleGameEnd = () => { setRefreshLeaderboard(prev => prev + 1); fetchJackpot(); };

    if (status === 'loading') return <LoadingTerminal steps={['Connecting to Arcade Server...', 'Loading Assets...']} />;
    if (!session) return (
        <div style={{ padding: '20px 24px', color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>please login to play.</div>
    );

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: 32, paddingBottom: 64 }}>
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
                <div style={{ border: '4px solid var(--bd)', background: 'var(--bg)', overflow: 'hidden', position: 'relative' }}>
                    {/* Bezel bar */}
                    <div style={{ background: 'var(--bg-1)', padding: '8px 14px', borderBottom: '2px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
                        </div>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.1em' }}>
                            TERMINAL_ID: {session.user.userID?.split('-')[1]}
                        </span>
                    </div>

                    {/* Game */}
                    <div style={{ background: 'var(--bg)', minHeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <InfiniteLoopGame user={session.user} onGameEnd={handleGameEnd} jackpot={jackpot} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ArcadePage;
