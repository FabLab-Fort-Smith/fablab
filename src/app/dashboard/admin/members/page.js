'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import MemberDialog from '../../../components/admin/MemberDialog';

function Modal({ open, onClose, title, children, footer }) {
    if (!open) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
            <div className="card" style={{ maxWidth: 540, width: '100%', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                <div className="card-header">
                    <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>{title}</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18 }}>×</button>
                </div>
                <div style={{ padding: '20px 24px' }}>{children}</div>
                {footer && <div style={{ padding: '12px 24px', borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>{footer}</div>}
            </div>
        </div>
    );
}

const STATUS_COLOR = { active: 'var(--green)', probation: 'var(--amber)', suspended: 'var(--red)', registered: 'var(--text-dim)' };

export default function MembersPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [rowCount, setRowCount] = useState(0);
    const [error, setError] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [mergeOpen, setMergeOpen] = useState(false);
    const [sourceUser, setSourceUser] = useState(null);
    const [targetUser, setTargetUser] = useState(null);
    const [merging, setMerging] = useState(false);
    const [allUsersForMerge, setAllUsersForMerge] = useState([]);
    const [toast, setToast] = useState(null);
    const [activeTab, setActiveTab] = useState('all');
    const [dupes, setDupes] = useState([]);
    const [dupesLoading, setDupesLoading] = useState(false);
    const [dupesLoaded, setDupesLoaded] = useState(false);
    const [delinquents, setDelinquents] = useState([]);
    const [delinquentsLoading, setDelinquentsLoading] = useState(false);
    const [delinquentsLoaded, setDelinquentsLoaded] = useState(false);
    const PAGE_SIZE = 25;

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated') {
            if (session.user.role !== 'admin') router.push('/dashboard');
            else fetchUsers(page, search, activeTab);
        }
    }, [status, session, router, page]);

    // Server-side search: debounce and reset to page 1
    useEffect(() => {
        const t = setTimeout(() => { setPage(1); fetchUsers(1, search, activeTab); }, 350);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        if (mergeOpen) fetchAllUsersForMerge();
    }, [mergeOpen]);

    const showToast = (msg, color = 'var(--green)') => { setToast({ msg, color }); setTimeout(() => setToast(null), 3500); };

    const fetchUsers = async (p = 1, q = '', tab = 'all') => {
        setLoading(true);
        setError('');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const params = new URLSearchParams({ page: p, limit: PAGE_SIZE });
            if (q) params.set('search', q);
            if (tab === 'coop') params.set('memberType', 'coop');
            if (tab === 'community') params.set('memberType', 'community');
            // delinquent tab uses its own dedicated fetch — don't call users API for it
            if (tab === 'delinquent') { setLoading(false); return; }
            const res = await fetch(`/api/v1/users?${params}`, { signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users || []);
                setRowCount(data.total || 0);
            } else {
                const data = await res.json().catch(() => ({}));
                setError(data.error || `Server error (${res.status})`);
            }
        } catch (err) {
            clearTimeout(timeout);
            setError(err.name === 'AbortError' ? 'Request timed out — the server took too long to respond.' : `Failed to load members: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const fetchAllUsersForMerge = async () => {
        try {
            const res = await fetch('/api/v1/users?limit=1000');
            const data = await res.json();
            if (data.success) setAllUsersForMerge(data.users);
        } catch {}
    };

    const handleSyncMemberships = async () => {
        if (!confirm('This will recalculate Community vs Co-op status for ALL users. Continue?')) return;
        setSyncing(true);
        try {
            const res = await fetch('/api/admin/migrate-memberships', { method: 'POST' });
            const data = await res.json();
            if (res.ok) { showToast(`Migration complete! Updated ${data.updatedCount} users.`); fetchUsers(page, search); }
            else showToast(`Error: ${data.error}`, 'var(--red)');
        } catch { showToast('Failed to sync.', 'var(--red)'); }
        finally { setSyncing(false); }
    };

    const handleMergeUsers = async () => {
        if (!sourceUser || !targetUser) return;
        if (sourceUser.userID === targetUser.userID) { alert('Cannot merge a user into themselves.'); return; }
        if (!confirm(`Merge ${sourceUser.email} INTO ${targetUser.email}? This cannot be undone and ${sourceUser.email} will be deleted.`)) return;
        setMerging(true);
        try {
            const res = await fetch('/api/v1/users/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceUserID: sourceUser.userID, targetUserID: targetUser.userID }) });
            const data = await res.json();
            if (data.success) { showToast('Users merged successfully.'); setMergeOpen(false); setSourceUser(null); setTargetUser(null); fetchUsers(page, search); }
            else showToast(`Error: ${data.error}`, 'var(--red)');
        } catch { showToast('Error merging.', 'var(--red)'); }
        finally { setMerging(false); }
    };

    const handleUserUpdate = (updatedUser) => setUsers(prev => prev.map(u => u.userID === updatedUser.userID ? updatedUser : u));

    const fetchDupes = async () => {
        setDupesLoading(true);
        try {
            const res = await fetch('/api/v1/admin/duplicates');
            if (res.ok) { setDupes(await res.json()); setDupesLoaded(true); }
        } catch {}
        finally { setDupesLoading(false); }
    };

    const fetchDelinquents = async () => {
        setDelinquentsLoading(true);
        try {
            const res = await fetch('/api/v1/admin/delinquent');
            if (res.ok) { setDelinquents(await res.json()); setDelinquentsLoaded(true); }
        } catch {}
        finally { setDelinquentsLoading(false); }
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        if (tab === 'dupes' && !dupesLoaded) fetchDupes();
        if (tab === 'delinquent') fetchDelinquents();
        if (tab !== 'dupes' && tab !== 'delinquent') { setPage(1); fetchUsers(1, search, tab); }
    };

    const REASON_LABEL = { email: 'same email', google_id: 'same Google ID', discord_id: 'same Discord ID', username: 'same username', name: 'same name' };
    const REASON_COLOR = { email: 'var(--red, #ff4444)', google_id: 'var(--magenta)', discord_id: 'var(--cyan)', username: 'var(--amber)', name: 'var(--text-dim)' };

    const filtered = users; // search is server-side

    const totalPages = Math.ceil(rowCount / PAGE_SIZE);

    return (
        <div style={{ padding: '20px 24px' }}>
            {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, background: 'var(--bg-card)', border: `1px solid ${toast.color}`, color: toast.color, padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 12 }}>{toast.msg}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
                <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}><span style={{ color: 'var(--green)' }}>$</span> ./members --list</div>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>member management</h1>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={handleSyncMemberships} disabled={syncing}>{syncing ? '$ syncing...' : '$ sync types'}</button>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setMergeOpen(true)}>$ merge accounts</button>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => router.push('/dashboard/admin/checkin-log')}>$ checkin log</button>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--bd)' }}>
                {[
                    ['all',        'all members'],
                    ['coop',       'co-op'],
                    ['community',  'community'],
                    ['delinquent', 'delinquent'],
                    ['dupes',      `dupes${dupesLoaded && dupes.length ? ` (${dupes.length})` : ''}`],
                ].map(([id, label]) => {
                    const isActive = activeTab === id;
                    const accent = id === 'delinquent' ? 'var(--red, #ff4444)' : 'var(--green)';
                    return (
                        <button key={id} onClick={() => handleTabChange(id)} style={{ padding: '8px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${isActive ? accent : 'transparent'}`, color: isActive ? accent : id === 'delinquent' ? 'rgba(255,68,68,0.6)' : 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.08em', marginBottom: -1 }}>
                            {label}
                        </button>
                    );
                })}
            </div>

            {activeTab !== 'dupes' && activeTab !== 'delinquent' && <div style={{ marginBottom: 16 }}>
                <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="search by name or email..." style={{ width: '100%', maxWidth: 360, boxSizing: 'border-box', fontSize: 12 }} />
            </div>}

            {activeTab === 'dupes' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                            {dupesLoading ? 'scanning...' : dupesLoaded ? `${dupes.length} potential duplicate group${dupes.length !== 1 ? 's' : ''} found` : ''}
                        </div>
                        <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={fetchDupes} disabled={dupesLoading}>$ rescan</button>
                    </div>

                    {dupesLoading && <div style={{ color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--mono)' }}>$ scanning for duplicates...</div>}

                    {dupesLoaded && dupes.length === 0 && (
                        <div style={{ color: 'var(--green)', fontSize: 12, fontFamily: 'var(--mono)', padding: '24px 0' }}>✓ no duplicate accounts found</div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {dupes.map(group => (
                            <div key={group.key} style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '16px 20px' }}>
                                {/* Reason chips */}
                                <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                                    {group.reasons.map(r => (
                                        <span key={r} style={{ fontSize: 9, padding: '2px 8px', border: `1px solid ${REASON_COLOR[r]}`, color: REASON_COLOR[r], fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
                                            {REASON_LABEL[r]}
                                        </span>
                                    ))}
                                </div>

                                {/* Side-by-side user cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${group.users.length}, 1fr)`, gap: 12, marginBottom: 14 }}>
                                    {group.users.map(u => (
                                        <div key={u.userID} style={{ border: '1px solid var(--bd-1)', padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 11 }}>
                                            <div style={{ fontWeight: 700, color: 'var(--text-bright)', marginBottom: 6 }}>{u.firstName} {u.lastName}</div>
                                            {[
                                                ['userID',    u.userID],
                                                ['email',     u.email],
                                                ['provider',  u.provider],
                                                ['role',      u.role],
                                                ['status',    u['membership.status'] || '—'],
                                                ['sub',       u['membership.subscriptionStatus'] || '—'],
                                                ['username',  u.username || '—'],
                                                ['googleId',  u.googleId ? u.googleId.slice(0,14)+'…' : '—'],
                                                ['discordId', u.discordId ? u.discordId.slice(0,14)+'…' : '—'],
                                                ['created',   u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'],
                                            ].map(([k, v]) => (
                                                <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                                                    <span style={{ color: 'var(--text-dim)', minWidth: 70 }}>{k}:</span>
                                                    <span style={{ color: 'var(--text-mid)', wordBreak: 'break-all' }}>{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {group.users.map(u => (
                                        <button key={u.userID} className="btn btn--ghost btn--sm"
                                            style={{ fontSize: 9 }}
                                            onClick={() => { setSelectedUser(u); setDialogOpen(true); }}>
                                            manage {u.firstName}
                                        </button>
                                    ))}
                                    {group.users.length === 2 && (
                                        <button className="btn btn--ghost btn--sm"
                                            style={{ fontSize: 9, borderColor: 'var(--amber)', color: 'var(--amber)' }}
                                            onClick={() => {
                                                setSourceUser(group.users[0]);
                                                setTargetUser(group.users[1]);
                                                setMergeOpen(true);
                                            }}>
                                            $ merge →
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'delinquent' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                            {delinquentsLoading ? '$ querying Square...' : delinquentsLoaded ? `${delinquents.length} delinquent account${delinquents.length !== 1 ? 's' : ''} found` : 'click to load'}
                        </div>
                        <button className="btn btn--ghost btn--sm" style={{ fontSize: 10, borderColor: 'var(--red, #ff4444)', color: 'var(--red, #ff4444)' }} onClick={fetchDelinquents} disabled={delinquentsLoading}>$ rescan</button>
                    </div>
                    {delinquentsLoading && <div style={{ color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--mono)' }}>$ querying Square for each co-op member...</div>}
                    {delinquentsLoaded && delinquents.length === 0 && (
                        <div style={{ color: 'var(--green)', fontSize: 12, fontFamily: 'var(--mono)', padding: '24px 0' }}>✓ all co-op members are in good standing</div>
                    )}
                    <div style={{ overflowX: 'auto' }}>
                        {delinquents.length > 0 && (
                            <table className="term-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr><th>NAME</th><th>EMAIL</th><th>PHONE</th><th>DISCORD</th><th>SQ STATUS</th><th>LAST CHARGED</th><th></th></tr>
                                </thead>
                                <tbody>
                                    {delinquents.map(u => {
                                        const STATUS_C = { PAST_DUE: 'var(--amber)', CANCELED: 'var(--red, #ff4444)', DEACTIVATED: 'var(--red, #ff4444)' };
                                        const sc = STATUS_C[u.squareSubscription?.status] || 'var(--text-dim)';
                                        return (
                                            <tr key={u.userID} style={{ background: 'rgba(255,68,68,0.04)' }}>
                                                <td style={{ color: 'var(--text)', fontWeight: 600 }}>{u.firstName} {u.lastName}</td>
                                                <td><a href={`mailto:${u.email}`} style={{ color: 'var(--cyan)', textDecoration: 'none', fontSize: 11 }}>{u.email}</a></td>
                                                <td><a href={`tel:${u.phoneNumber}`} style={{ color: 'var(--green)', textDecoration: 'none', fontSize: 11 }}>{u.phoneNumber || '—'}</a></td>
                                                <td style={{ fontSize: 11, color: 'var(--magenta)' }}>{u.discordHandle || '—'}</td>
                                                <td><span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: sc, border: `1px solid ${sc}`, padding: '2px 6px' }}>{u.squareSubscription?.status}</span></td>
                                                <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{u.squareSubscription?.chargedThroughDate || '—'}</td>
                                                <td><button className="btn btn--ghost btn--sm" style={{ fontSize: 9 }} onClick={() => { setSelectedUser(u); setDialogOpen(true); }}>manage</button></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {activeTab !== 'dupes' && activeTab !== 'delinquent' && error && (
                <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '12px 16px', marginBottom: 16, fontFamily: 'var(--mono)', fontSize: 12 }}>
                    ✗ {error}
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10, marginLeft: 16, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => fetchUsers(page, search)}>retry</button>
                </div>
            )}

            {activeTab !== 'dupes' && activeTab !== 'delinquent' && (loading ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading<span className="caret-block" style={{ marginLeft: 4 }} /></div>
            ) : (
                <>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="term-table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th>NAME</th>
                                    <th>EMAIL</th>
                                    <th>ROLE</th>
                                    <th>STATUS</th>
                                    <th>TOTAL_HRS</th>
                                    <th>MONTH_HRS</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={7} style={{ color: 'var(--text-dim)', textAlign: 'center' }}>no members found</td></tr>
                                ) : filtered.map(u => {
                                    const logs = u.membership?.volunteerLog || [];
                                    const totalHrs = logs.reduce((a, l) => a + (l.hours || 0), 0);
                                    const monthHrs = logs.filter(l => new Date(l.date).getMonth() === new Date().getMonth()).reduce((a, l) => a + (l.hours || 0), 0);
                                    const ms = u.membership?.status || 'N/A';
                                    const LAPSED = ['CANCELED', 'DEACTIVATED', 'PAST_DUE', 'SUSPENDED'];
                                    const isDelinquent = LAPSED.includes(u.membership?.subscriptionStatus) && !u.membership?.isWaived;
                                    return (
                                        <tr key={u.userID} style={isDelinquent ? { background: 'rgba(255,68,68,0.05)', outline: '1px solid rgba(255,68,68,0.2)' } : {}}>
                                            <td style={{ color: 'var(--text)', fontWeight: 600 }}>{u.firstName} {u.lastName}</td>
                                            <td style={{ color: 'var(--text-mid)', fontSize: 11 }}>{u.email}</td>
                                            <td><span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: u.role === 'admin' ? 'var(--magenta)' : 'var(--text-dim)', border: `1px solid ${u.role === 'admin' ? 'var(--magenta)' : 'var(--bd)'}`, padding: '2px 6px' }}>{u.role}</span></td>
                                            <td><span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: STATUS_COLOR[ms] || 'var(--text-dim)', border: `1px solid ${STATUS_COLOR[ms] || 'var(--bd)'}`, padding: '2px 6px' }}>{ms}</span></td>
                                            <td style={{ color: 'var(--text-mid)', fontFamily: 'var(--mono)', fontSize: 11 }}>{totalHrs}</td>
                                            <td style={{ color: monthHrs >= 4 ? 'var(--green)' : 'var(--amber)', fontFamily: 'var(--mono)', fontSize: 11 }}>{monthHrs}</td>
                                            <td><button className="btn btn--ghost btn--sm" style={{ fontSize: 9 }} onClick={() => { setSelectedUser(u); setDialogOpen(true); }}>manage</button></td>
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
            ))}

            <MemberDialog open={dialogOpen} onClose={() => setDialogOpen(false)} user={selectedUser} onUpdate={handleUserUpdate} onDelete={(deletedId) => { setUsers(u => u.filter(x => x.userID !== deletedId)); setDialogOpen(false); }} />

            {/* Merge Dialog */}
            <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} title="merge user accounts"
                footer={<>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setMergeOpen(false)}>cancel</button>
                    <button className="btn btn--sm btn--sm" style={{ fontSize: 10, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={handleMergeUsers} disabled={!sourceUser || !targetUser || merging}>
                        {merging ? '$ merging...' : '$ merge --confirm'}
                    </button>
                </>}
            >
                <div style={{ border: '1px solid var(--amber)', background: 'rgba(255,170,0,0.05)', padding: '10px 14px', marginBottom: 16, fontSize: 11, color: 'var(--amber)', fontFamily: 'var(--mono)' }}>
                    ⚠ all data from source will move to target. source account will be deleted. irreversible.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {[{ label: 'SOURCE_USER (will be deleted)', val: sourceUser, set: setSourceUser }, { label: 'TARGET_USER (will keep)', val: targetUser, set: setTargetUser }].map(({ label, val, set }) => (
                        <div key={label}>
                            <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>{label}</label>
                            <select className="input" value={val?.userID || ''} onChange={e => set(allUsersForMerge.find(u => u.userID === e.target.value) || null)} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }}>
                                <option value="">-- select user --</option>
                                {allUsersForMerge.map(u => <option key={u.userID} value={u.userID}>{u.firstName} {u.lastName} ({u.email})</option>)}
                            </select>
                        </div>
                    ))}
                </div>
            </Modal>
        </div>
    );
}
