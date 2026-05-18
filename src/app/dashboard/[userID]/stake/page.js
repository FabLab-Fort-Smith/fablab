'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import LoadingTerminal from '@/app/components/LoadingTerminal';

const TYPE_COLOR = {
    reward: 'var(--green)',
    onboarding_reward_profile: 'var(--green)',
    onboarding_reward_app: 'var(--green)',
    deposit: 'var(--cyan)',
    refund: 'var(--cyan)',
    transfer_received: 'var(--cyan)',
    tip_received: 'var(--cyan)',
    purchase: 'var(--red)',
    withdrawal: 'var(--red)',
    transfer_sent: 'var(--red)',
    tip_sent: 'var(--red)',
    fee: 'var(--red)',
};

const typeLabel = (type = '') => type.replace(/_/g, ' ');

export default function StakePage() {
    const { data: session, status } = useSession();
    const params = useParams();
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (status === 'unauthenticated') { router.push('/auth/signin'); return; }
        if (status !== 'authenticated' || !params?.userID) return;

        const isOwner = session.user.userID === params.userID;
        const isAdmin = session.user.role === 'admin';
        if (!isOwner && !isAdmin) { router.push(`/dashboard/${session.user.userID}`); return; }

        fetch(`/api/v1/users?userID=${params.userID}`)
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(data => setUser(data.user))
            .catch(e => setError(`Failed to load wallet data (${e}).`))
            .finally(() => setLoading(false));
    }, [status, session, params?.userID]);

    if (status === 'loading' || loading) return <LoadingTerminal steps={['loading wallet...']} />;

    if (error) return (
        <div style={{ padding: '40px 24px' }}>
            <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: 11 }}>✗ {error}</div>
        </div>
    );

    if (!user) return (
        <div style={{ padding: '40px 24px' }}>
            <div style={{ border: '1px solid var(--bd)', color: 'var(--text-dim)', padding: '12px 16px', fontSize: 11 }}>User not found.</div>
        </div>
    );

    const balance = user.stake || 0;
    const history = [...(user.stakeHistory || [])].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const earned = history.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const spent = history.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);

    return (
        <div style={{ padding: '20px 24px', maxWidth: 860 }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                    <span style={{ color: 'var(--green)' }}>$</span> wallet --balance
                </div>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                    stake.ledger
                </h1>
            </div>

            {/* Balance cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
                <div style={{ border: '1px solid var(--green)', background: 'rgba(57,255,20,0.04)', padding: '16px 20px' }}>
                    <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--text-dim)', marginBottom: 8 }}>CURRENT BALANCE</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 28, color: 'var(--green)', fontWeight: 700, textShadow: '0 0 12px rgba(57,255,20,0.4)' }}>
                        {balance.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>stake</div>
                </div>
                <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '16px 20px' }}>
                    <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--text-dim)', marginBottom: 8 }}>TOTAL EARNED</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 22, color: 'var(--cyan)', fontWeight: 600 }}>
                        +{earned.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>{history.filter(t => t.amount > 0).length} transactions</div>
                </div>
                <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '16px 20px' }}>
                    <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--text-dim)', marginBottom: 8 }}>TOTAL SPENT</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 22, color: spent < 0 ? 'var(--red)' : 'var(--text-dim)', fontWeight: 600 }}>
                        {spent.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>{history.filter(t => t.amount < 0).length} transactions</div>
                </div>
            </div>

            {/* Transaction history */}
            <div style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--text-dim)', marginBottom: 12 }}>TRANSACTION HISTORY</div>

            {history.length === 0 ? (
                <div style={{ border: '1px solid var(--bd)', padding: '24px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--mono)' }}>
                    no transactions yet — complete bounties and onboarding to earn stake
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table className="term-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>DATE</th>
                                <th>TYPE</th>
                                <th>REASON</th>
                                <th style={{ textAlign: 'right' }}>AMOUNT</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((tx, i) => {
                                const color = TYPE_COLOR[tx.type] || (tx.amount >= 0 ? 'var(--green)' : 'var(--red)');
                                const date = tx.timestamp ? new Date(tx.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
                                return (
                                    <tr key={i}>
                                        <td style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 11, whiteSpace: 'nowrap' }}>{date}</td>
                                        <td>
                                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color, border: `1px solid ${color}`, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                                                {typeLabel(tx.type)}
                                            </span>
                                        </td>
                                        <td style={{ color: 'var(--text-mid)', fontSize: 12 }}>{tx.reason || '—'}</td>
                                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color, whiteSpace: 'nowrap' }}>
                                            {tx.amount >= 0 ? '+' : ''}{tx.amount?.toLocaleString()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
