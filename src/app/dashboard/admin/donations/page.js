'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import LoadingTerminal from '@/app/components/LoadingTerminal';

const TYPE_COLOR = {
    tip: 'var(--cyan)',
    tip_sent: 'var(--red)',
    tip_received: 'var(--cyan)',
    reward: 'var(--green)',
    award: 'var(--green)',
    sponsorship: 'var(--magenta)',
    transfer: 'var(--amber)',
    transfer_sent: 'var(--red)',
    transfer_received: 'var(--cyan)',
    refund: 'var(--amber)',
};

const FILTERS = ['all', 'tip', 'reward', 'award', 'transfer', 'sponsorship'];

export default function DonationsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [transactions, setTransactions] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 25;

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated' && session.user.role !== 'admin') router.push('/dashboard');
    }, [status, session, router]);

    useEffect(() => {
        if (status !== 'authenticated' || session?.user?.role !== 'admin') return;
        fetchTransactions();
    }, [status, typeFilter, page]);

    const fetchTransactions = async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({ page, limit: PAGE_SIZE });
            if (typeFilter !== 'all') params.set('type', typeFilter);
            const res = await fetch(`/api/v1/transactions?${params}`);
            if (res.ok) {
                const data = await res.json();
                setTransactions(data.transactions || []);
                setTotal(data.total || 0);
            } else {
                setError('Failed to load transactions.');
            }
        } catch (err) {
            setError(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    if (status === 'loading') return <LoadingTerminal steps={['Loading transactions...']} />;

    const totalPages = Math.ceil(total / PAGE_SIZE);

    return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
                <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                        <span style={{ color: 'var(--green)' }}>$</span> ./transactions --all
                    </div>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                        donations
                    </h1>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--mono)', alignSelf: 'flex-end' }}>
                    {total} total records
                </div>
            </div>

            {/* Type filter */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {FILTERS.map(f => (
                    <button
                        key={f}
                        onClick={() => { setTypeFilter(f); setPage(1); }}
                        className={`btn btn--sm ${typeFilter === f ? '' : 'btn--ghost'}`}
                        style={{ fontSize: 10, borderColor: typeFilter === f ? 'var(--green)' : undefined, color: typeFilter === f ? 'var(--green)' : undefined }}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {error && (
                <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '10px 14px', marginBottom: 16, fontFamily: 'var(--mono)', fontSize: 11 }}>
                    ✗ {error}
                </div>
            )}

            {loading ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--mono)' }}>loading...</div>
            ) : transactions.length === 0 ? (
                <div style={{ border: '1px solid var(--bd)', padding: '32px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--mono)' }}>
                    no transactions found
                </div>
            ) : (
                <>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="term-table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th>DATE</th>
                                    <th>TYPE</th>
                                    <th>FROM</th>
                                    <th>TO</th>
                                    <th>REASON</th>
                                    <th style={{ textAlign: 'right' }}>AMOUNT</th>
                                    <th>STATUS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.map((tx) => {
                                    const color = TYPE_COLOR[tx.type] || 'var(--text-dim)';
                                    const date = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
                                    return (
                                        <tr key={tx.transactionId || tx._id}>
                                            <td style={{ color: 'var(--text-dim)', fontSize: 11, whiteSpace: 'nowrap' }}>{date}</td>
                                            <td>
                                                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color, border: `1px solid ${color}`, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                                                    {tx.type || '—'}
                                                </span>
                                            </td>
                                            <td style={{ fontSize: 11, color: 'var(--text-mid)', fontFamily: 'var(--mono)' }}>{tx.senderId || tx.fromUserID || '—'}</td>
                                            <td style={{ fontSize: 11, color: 'var(--text-mid)', fontFamily: 'var(--mono)' }}>{tx.receiverId || tx.toUserID || '—'}</td>
                                            <td style={{ fontSize: 11, color: 'var(--text-mid)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.reason || '—'}</td>
                                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: (tx.amount || 0) >= 0 ? 'var(--green)' : 'var(--red)', whiteSpace: 'nowrap' }}>
                                                {(tx.amount || 0) >= 0 ? '+' : ''}{(tx.amount || 0).toLocaleString()}
                                            </td>
                                            <td>
                                                <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: tx.status === 'completed' ? 'var(--green)' : tx.status === 'pending' ? 'var(--amber)' : 'var(--text-dim)' }}>
                                                    {tx.status || '—'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, justifyContent: 'center' }}>
                            <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← prev</button>
                            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{page} / {totalPages}</span>
                            <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>next →</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
