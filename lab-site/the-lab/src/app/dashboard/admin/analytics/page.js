'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import LoadingTerminal from '@/app/components/LoadingTerminal';

export default function AnalyticsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('all');

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated' && session.user.role !== 'admin') router.push('/dashboard');
    }, [status, session, router]);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/analytics?timeRange=${timeRange}`);
            if (res.ok) setStats(await res.json());
        } catch {}
        finally { setLoading(false); }
    };

    useEffect(() => { if (status === 'authenticated' && session?.user?.role === 'admin') fetchStats(); }, [timeRange, status]);

    if (loading) return <LoadingTerminal steps={['Crunching numbers...', 'Analyzing data...', 'Generating report...']} />;

    const KPI = ({ label, val, sub, color }) => (
        <div className="card" style={{ padding: '20px 22px' }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.14em', marginBottom: 10 }}>{label}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 36, color: color || 'var(--green)', letterSpacing: '-0.04em', lineHeight: 1, textShadow: `0 0 16px ${color || 'var(--green)'}` }}>{val ?? '—'}</div>
            {sub && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 8 }}>{sub}</div>}
        </div>
    );

    const isAll = timeRange === 'all';

    return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
                <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                        <span style={{ color: 'var(--green)' }}>$</span> ./analytics --generate
                    </div>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                        analytics
                    </h1>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <select className="input" value={timeRange} onChange={e => setTimeRange(e.target.value)} style={{ fontSize: 11, padding: '6px 10px' }}>
                        <option value="all">all time</option>
                        <option value="30d">last 30 days</option>
                        <option value="90d">last 90 days</option>
                        <option value="1y">last year</option>
                    </select>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={fetchStats}>$ refresh</button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 32 }}>
                <KPI
                    label={isAll ? 'TOTAL_MEMBERS' : 'NEW_MEMBERS'}
                    val={isAll ? stats?.users?.total : stats?.users?.new}
                    sub={`${stats?.users?.active ?? 0} active · ${stats?.users?.probation ?? 0} probation`}
                    color="var(--green)"
                />
                <KPI
                    label={isAll ? 'TOTAL_STAKE' : 'DISTRIBUTED_STAKE'}
                    val={isAll ? stats?.stake?.total : stats?.stake?.distributed}
                    sub={isAll ? 'total distributed' : 'earned in period'}
                    color="var(--amber)"
                />
                <KPI
                    label={isAll ? 'TOTAL_HOURS' : 'HOURS_LOGGED'}
                    val={isAll ? stats?.hours?.total : stats?.hours?.logged}
                    sub={isAll ? 'total contributed' : 'logged in period'}
                    color="var(--cyan)"
                />
            </div>

            <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 12 }}>BOUNTY_PERFORMANCE</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                <KPI
                    label={isAll ? 'TOTAL_BOUNTIES' : 'CREATED_BOUNTIES'}
                    val={isAll ? stats?.bounties?.total : stats?.bounties?.created}
                    sub={`${stats?.bounties?.completed ?? 0} completed`}
                    color="var(--magenta)"
                />
                <KPI
                    label="OPEN_OPPORTUNITIES"
                    val={stats?.bounties?.open}
                    sub="available for claiming"
                    color="var(--green)"
                />
            </div>
        </div>
    );
}
