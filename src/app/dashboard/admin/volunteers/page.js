'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import MemberDialog from '../../../components/admin/MemberDialog';

const STATUS_COLOR = { active: 'var(--green)', probation: 'var(--amber)', suspended: 'var(--red)', registered: 'var(--text-dim)' };

export default function VolunteersPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [toast, setToast] = useState(null);

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated') {
            if (session.user.role !== 'admin') router.push('/dashboard');
            else fetchUsers();
        }
    }, [status, session, router]);

    const showToast = (msg, color = 'var(--green)') => { setToast({ msg, color }); setTimeout(() => setToast(null), 3000); };

    const fetchUsers = async () => {
        try {
            const res = await fetch('/api/v1/users');
            if (res.ok) { const data = await res.json(); setUsers(data.users || []); }
        } catch {}
        finally { setLoading(false); }
    };

    const handleUserUpdate = (updatedUser) => setUsers(prev => prev.map(u => u.userID === updatedUser.userID ? updatedUser : u));

    const handleLogAction = async (user, logId, action) => {
        const updatedLogs = user.membership.volunteerLog.map(log =>
            log.id === logId ? { ...log, status: action === 'approve' ? 'approved' : 'rejected', verifiedBy: session.user.firstName } : log
        );
        try {
            const res = await fetch(`/api/v1/users?userID=${user.userID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ membership: { ...user.membership, volunteerLog: updatedLogs } }),
            });
            if (res.ok) { const d = await res.json(); handleUserUpdate(d.user); showToast(`Log ${action}d.`); }
        } catch { showToast('Error.', 'var(--red)'); }
    };

    const getMonthlyHours = (user) => {
        const logs = user.membership?.volunteerLog || [];
        const now = new Date();
        return logs.filter(l => { const d = new Date(l.date); const ok = !l.status || l.status === 'approved'; return ok && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((a, l) => a + (l.hours || 0), 0);
    };

    const pendingLogs = users.flatMap(u => (u.membership?.volunteerLog || []).filter(l => l.status === 'pending').map(l => ({ ...l, user: u })));

    const filtered = users.filter(u =>
        !search || u.firstName?.toLowerCase().includes(search.toLowerCase()) || u.lastName?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div style={{ padding: '20px 24px', maxWidth: 1100 }}>
            {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, background: 'var(--bg-card)', border: `1px solid ${toast.color}`, color: toast.color, padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 12 }}>{toast.msg}</div>}

            <div style={{ marginBottom: 28 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}><span style={{ color: 'var(--green)' }}>$</span> ./volunteers --compliance</div>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>volunteer compliance</h1>
                <p style={{ color: 'var(--text-mid)', fontSize: 12, marginTop: 6 }}>track monthly volunteer hours. requirement: 4 hours/month.</p>
            </div>

            {pendingLogs.length > 0 && (
                <div style={{ border: '1px solid var(--amber)', background: 'rgba(255,170,0,0.05)', padding: '14px 18px', marginBottom: 24 }}>
                    <div style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--amber)', marginBottom: 12 }}>⚠ PENDING_APPROVALS ({pendingLogs.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {pendingLogs.map(item => (
                            <div key={item.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--bd)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{item.user.firstName} {item.user.lastName}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-mid)' }}>{item.hours}h on {new Date(item.date).toLocaleDateString()} — "{item.description}"</div>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn--sm" style={{ fontSize: 9, borderColor: 'var(--green)', color: 'var(--green)' }} onClick={() => handleLogAction(item.user, item.id, 'approve')}>✓ approve</button>
                                    <button className="btn btn--sm" style={{ fontSize: 9, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => handleLogAction(item.user, item.id, 'reject')}>✕ reject</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ marginBottom: 16 }}>
                <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="search members..." style={{ width: '100%', maxWidth: 320, boxSizing: 'border-box', fontSize: 12 }} />
            </div>

            {loading ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading<span className="caret-block" style={{ marginLeft: 4 }} /></div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table className="term-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>MEMBER</th>
                                <th>STATUS</th>
                                <th>MONTH_HRS</th>
                                <th>NEEDED</th>
                                <th>LAST_ACTIVE</th>
                                <th>ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={6} style={{ color: 'var(--text-dim)', textAlign: 'center' }}>no members found</td></tr>
                            ) : filtered.map(u => {
                                const monthHrs = getMonthlyHours(u);
                                const needed = Math.max(0, 4 - monthHrs);
                                const ms = u.membership?.status || 'N/A';
                                const logs = u.membership?.volunteerLog || [];
                                const sorted = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));
                                const lastActive = sorted.length > 0 ? new Date(sorted[0].date).toLocaleDateString() : 'never';
                                return (
                                    <tr key={u.userID}>
                                        <td style={{ color: 'var(--text)', fontWeight: 600 }}>{u.firstName} {u.lastName}</td>
                                        <td><span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: STATUS_COLOR[ms] || 'var(--text-dim)', border: `1px solid ${STATUS_COLOR[ms] || 'var(--bd)'}`, padding: '2px 6px' }}>{ms}</span></td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ width: 60, height: 4, background: 'var(--bg-elev)', position: 'relative', overflow: 'hidden' }}>
                                                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(100, (monthHrs / 4) * 100)}%`, background: monthHrs >= 4 ? 'var(--green)' : 'var(--amber)', transition: 'width 0.3s' }} />
                                                </div>
                                                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: monthHrs >= 4 ? 'var(--green)' : 'var(--amber)' }}>{monthHrs}/4</span>
                                            </div>
                                        </td>
                                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: needed > 0 ? 'var(--red)' : 'var(--green)' }}>
                                            {needed > 0 ? `${needed}h` : '✓'}
                                        </td>
                                        <td style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{lastActive}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <a href={`mailto:${u.email}`} className="btn btn--ghost btn--sm" style={{ fontSize: 9 }}>email</a>
                                                <button className="btn btn--ghost btn--sm" style={{ fontSize: 9 }} onClick={() => { setSelectedUser(u); setDialogOpen(true); }}>manage</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <MemberDialog open={dialogOpen} onClose={() => setDialogOpen(false)} user={selectedUser} onUpdate={handleUserUpdate} />
        </div>
    );
}
