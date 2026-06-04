"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const BOARDS = [
    { key: 'topStake', label: 'Top Stake Holders', valueKey: 'stake', valueLabel: 'Stake', color: 'var(--amber)' },
    { key: 'topVolunteers', label: 'Top Volunteers', valueKey: 'totalHours', valueLabel: 'Hrs', color: 'var(--green)' },
    { key: 'topBountyHunters', label: 'Top Bounty Hunters', valueKey: 'count', valueLabel: 'Bounties', color: 'var(--cyan)' },
];

export default function LeaderboardPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState({ topStake: [], topVolunteers: [], topBountyHunters: [] });

    useEffect(() => {
        fetch('/api/v1/leaderboard')
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(d => setData(d))
            .catch(() => setError('Failed to load leaderboards.'))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading<span className="caret-block" style={{ marginLeft: 4 }} /></div>
        </div>
    );

    return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{ marginBottom: 28 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}><span style={{ color: 'var(--green)' }}>$</span> ./leaderboard --all</div>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>leaderboards</h1>
                <p style={{ color: 'var(--text-mid)', fontSize: 12, marginTop: 6 }}>celebrating top contributors, makers, and volunteers.</p>
            </div>

            {error && (
                <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '10px 14px', marginBottom: 20, fontSize: 12 }}>{error}</div>
            )}

            {/* Mobile tab selector */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--bd)', marginBottom: 24 }} className="leaderboard-tabs">
                {BOARDS.map((b, i) => (
                    <button key={b.key} onClick={() => setActiveTab(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.08em', color: activeTab === i ? b.color : 'var(--text-dim)', borderBottom: activeTab === i ? `2px solid ${b.color}` : '2px solid transparent', marginBottom: -1 }}>
                        {b.label.toUpperCase()}
                    </button>
                ))}
            </div>

            {/* Desktop: show all 3 columns; Mobile: show active tab only */}
            <div style={{ display: 'grid', gap: 24 }} className="leaderboard-grid">
                {BOARDS.map((board, i) => (
                    <div key={board.key} className={`leaderboard-col${i}`} style={{ display: activeTab === i ? 'block' : 'none' }}>
                        <LeaderboardCard board={board} users={data[board.key] || []} onUserClick={uid => router.push(`/dashboard/member/${uid}`)} />
                    </div>
                ))}
            </div>

            <style>{`
                @media (min-width: 769px) {
                    .leaderboard-tabs { display: none !important; }
                    .leaderboard-grid { grid-template-columns: repeat(3, 1fr) !important; }
                    .leaderboard-col0, .leaderboard-col1, .leaderboard-col2 { display: block !important; }
                }
            `}</style>
        </div>
    );
}

function LeaderboardCard({ board, users, onUserClick }) {
    const { label, valueKey, valueLabel, color } = board;
    return (
        <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)' }}>
            <div className="card-header" style={{ borderBottom: `1px solid ${color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', color }}>{label.toUpperCase()}</span>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {users.length === 0 ? (
                    <div style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>[no data yet]</div>
                ) : users.map((user, idx) => (
                    <div
                        key={user.userID || idx}
                        onClick={() => user.userID && onUserClick(user.userID)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', cursor: user.userID ? 'pointer' : 'default', background: idx === 0 ? `${color}10` : 'transparent', border: idx === 0 ? `1px solid ${color}40` : '1px solid transparent' }}
                    >
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: idx === 0 ? color : 'var(--text-dim)', minWidth: 20 }}>#{idx + 1}</span>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-elev)', border: `1px solid ${idx === 0 ? color : 'var(--bd)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-mid)', flexShrink: 0 }}>
                            {user.firstName?.[0]}{user.lastName?.[0]}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.firstName} {user.lastName}</div>
                            <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>@{user.username || 'member'}</div>
                        </div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: idx === 0 ? color : 'var(--text-mid)', border: `1px solid ${idx === 0 ? color : 'var(--bd)'}`, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                            {user[valueKey]} {valueLabel}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
