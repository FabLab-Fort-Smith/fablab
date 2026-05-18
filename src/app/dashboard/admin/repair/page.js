'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import LoadingTerminal from '@/app/components/LoadingTerminal';

const STATUS_OPTIONS = ['pending', 'in_progress', 'completed', 'cancelled'];
const STATUS_COLOR = {
    pending: 'var(--amber)',
    in_progress: 'var(--cyan)',
    completed: 'var(--green)',
    cancelled: 'var(--red)',
};

export default function RepairQueuePage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [repairs, setRepairs] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [updatingId, setUpdatingId] = useState(null);
    const [selected, setSelected] = useState(null);
    const PAGE_SIZE = 25;

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated' && session.user.role !== 'admin') router.push('/dashboard');
    }, [status, session, router]);

    useEffect(() => {
        if (status !== 'authenticated' || session?.user?.role !== 'admin') return;
        fetchRepairs();
    }, [status, statusFilter, page]);

    const fetchRepairs = async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({ page, limit: PAGE_SIZE });
            if (statusFilter !== 'all') params.set('status', statusFilter);
            const res = await fetch(`/api/v1/repairs?${params}`);
            if (res.ok) {
                const data = await res.json();
                setRepairs(data.repairs || []);
                setTotal(data.total || 0);
            } else {
                setError('Failed to load repair queue.');
            }
        } catch (err) {
            setError(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const updateStatus = async (repairID, newStatus) => {
        setUpdatingId(repairID);
        try {
            const res = await fetch(`/api/v1/repairs?repairID=${repairID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                setRepairs(prev => prev.map(r => r.repairID === repairID ? { ...r, status: newStatus } : r));
                if (selected?.repairID === repairID) setSelected(s => ({ ...s, status: newStatus }));
            }
        } catch {}
        finally { setUpdatingId(null); }
    };

    if (status === 'loading') return <LoadingTerminal steps={['Loading repair queue...']} />;

    const totalPages = Math.ceil(total / PAGE_SIZE);

    return (
        <div style={{ padding: '20px 24px', maxWidth: 1100 }}>
            {/* Detail modal */}
            {selected && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setSelected(null)}>
                    <div className="card" style={{ maxWidth: 520, width: '100%' }} onClick={e => e.stopPropagation()}>
                        <div className="card-header">
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>repair · {selected.repairID}</span>
                            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18 }}>×</button>
                        </div>
                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {[
                                ['Name', selected.name],
                                ['Email', selected.email],
                                ['Phone', selected.phone || '—'],
                                ['Device', selected.deviceType],
                                ['Contact Via', selected.contactMethod || '—'],
                                ['Submitted', selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '—'],
                            ].map(([k, v]) => (
                                <div key={k} style={{ display: 'flex', gap: 12 }}>
                                    <span style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', minWidth: 80 }}>{k.toUpperCase()}</span>
                                    <span style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{v}</span>
                                </div>
                            ))}
                            <div>
                                <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>ISSUE</div>
                                <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', border: '1px solid var(--bd)', padding: '10px 12px', background: 'var(--bg)' }}>{selected.issueDescription}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 8 }}>UPDATE STATUS</div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {STATUS_OPTIONS.map(s => (
                                        <button
                                            key={s}
                                            className={`btn btn--sm ${selected.status === s ? '' : 'btn--ghost'}`}
                                            style={{ fontSize: 10, borderColor: selected.status === s ? STATUS_COLOR[s] : undefined, color: selected.status === s ? STATUS_COLOR[s] : undefined }}
                                            onClick={() => updateStatus(selected.repairID, s)}
                                            disabled={updatingId === selected.repairID}
                                        >
                                            {s.replace('_', ' ')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
                <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                        <span style={{ color: 'var(--green)' }}>$</span> ./repairs --queue
                    </div>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                        repair.queue
                    </h1>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--mono)', alignSelf: 'flex-end' }}>{total} total</div>
            </div>

            {/* Status filter */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {['all', ...STATUS_OPTIONS].map(f => (
                    <button
                        key={f}
                        onClick={() => { setStatusFilter(f); setPage(1); }}
                        className={`btn btn--sm ${statusFilter === f ? '' : 'btn--ghost'}`}
                        style={{ fontSize: 10, borderColor: statusFilter === f ? (STATUS_COLOR[f] || 'var(--green)') : undefined, color: statusFilter === f ? (STATUS_COLOR[f] || 'var(--green)') : undefined }}
                    >
                        {f.replace('_', ' ')}
                    </button>
                ))}
            </div>

            {error && <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '10px 14px', marginBottom: 16, fontFamily: 'var(--mono)', fontSize: 11 }}>✗ {error}</div>}

            {loading ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--mono)' }}>loading...</div>
            ) : repairs.length === 0 ? (
                <div style={{ border: '1px solid var(--bd)', padding: '32px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--mono)' }}>
                    no repair requests found
                </div>
            ) : (
                <>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="term-table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th>DATE</th>
                                    <th>NAME</th>
                                    <th>EMAIL</th>
                                    <th>DEVICE</th>
                                    <th>STATUS</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {repairs.map(r => {
                                    const color = STATUS_COLOR[r.status] || 'var(--text-dim)';
                                    const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
                                    return (
                                        <tr key={r.repairID}>
                                            <td style={{ color: 'var(--text-dim)', fontSize: 11, whiteSpace: 'nowrap' }}>{date}</td>
                                            <td style={{ color: 'var(--text)', fontWeight: 600 }}>{r.name}</td>
                                            <td style={{ color: 'var(--text-mid)', fontSize: 11 }}>{r.email}</td>
                                            <td style={{ color: 'var(--text-mid)', fontSize: 11 }}>{r.deviceType}</td>
                                            <td>
                                                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color, border: `1px solid ${color}`, padding: '2px 6px' }}>
                                                    {(r.status || 'pending').replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td>
                                                <button className="btn btn--ghost btn--sm" style={{ fontSize: 9 }} onClick={() => setSelected(r)}>view</button>
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
