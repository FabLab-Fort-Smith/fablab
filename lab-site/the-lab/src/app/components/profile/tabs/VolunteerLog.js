"use client";
import React, { useState } from 'react';

const STATUS_COLOR = { pending: 'var(--amber)', rejected: 'var(--red)', approved: 'var(--green)' };

export default function VolunteerLog({ user, onUpdate }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ date: new Date().toISOString().split('T')[0], hours: '', description: '' });

    const logs = user?.membership?.volunteerLog || [];
    const sortedLogs = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));
    const approvedHours = logs.filter(l => !l.status || l.status === 'approved').reduce((acc, l) => acc + (Number(l.hours) || 0), 0);
    const pendingHours = logs.filter(l => l.status === 'pending').reduce((acc, l) => acc + (Number(l.hours) || 0), 0);

    const handleSubmit = async () => {
        if (!formData.hours || !formData.description) return;
        setLoading(true);
        try {
            const newLog = { id: crypto.randomUUID(), date: formData.date, hours: Number(formData.hours), description: formData.description, status: 'pending', verifiedBy: null };
            const res = await fetch(`/api/v1/users?userID=${user.userID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ membership: { ...user.membership, volunteerLog: [newLog, ...logs] } })
            });
            if (res.ok) {
                const data = await res.json();
                onUpdate(data.user);
                setOpen(false);
                setFormData({ date: new Date().toISOString().split('T')[0], hours: '', description: '' });
            }
        } catch (error) { console.error("Failed to log hours", error); }
        finally { setLoading(false); }
    };

    const labelStyle = { display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 };

    return (
        <div style={{ marginTop: 32 }}>
            {/* Summary */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 120, padding: '16px 20px', background: 'var(--green)', color: '#000', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--mono)' }}>{approvedHours}</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>Approved Hours</div>
                </div>
                <div style={{ flex: 1, minWidth: 120, padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--bd)', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{pendingHours}</div>
                    <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-dim)' }}>Pending Hours</div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-bright)' }}>History</div>
                <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setOpen(true)}>+ Log Hours</button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        {['DATE', 'HOURS', 'DESCRIPTION', 'STATUS'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', borderBottom: '1px solid var(--bd)', fontWeight: 400 }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {sortedLogs.length === 0 ? (
                        <tr><td colSpan={4} style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>No volunteer hours logged.</td></tr>
                    ) : sortedLogs.map(log => (
                        <tr key={log.id} style={{ borderBottom: '1px solid var(--bg-1)' }}>
                            <td style={{ padding: '8px 12px', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text-mid)' }}>{new Date(log.date).toLocaleDateString()}</td>
                            <td style={{ padding: '8px 12px', fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text-bright)', fontWeight: 700 }}>{log.hours}</td>
                            <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text)' }}>{log.description}</td>
                            <td style={{ padding: '8px 12px' }}>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: STATUS_COLOR[log.status || 'approved'], border: `1px solid ${STATUS_COLOR[log.status || 'approved']}`, padding: '2px 8px' }}>
                                    {log.status || 'approved'}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Log Hours Modal */}
            {open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '24px 28px', maxWidth: 480, width: '100%' }}>
                        <div style={{ fontFamily: 'var(--display)', fontSize: '1.1rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 4 }}>Log Volunteer Hours</div>
                        <div style={{ border: '1px solid var(--cyan)', color: 'var(--cyan)', padding: '8px 12px', fontSize: 11, fontFamily: 'var(--mono)', marginBottom: 20 }}>
                            ℹ Hours must be approved by an admin.
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={labelStyle}>DATE</label>
                            <input className="input" type="date" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={labelStyle}>HOURS</label>
                            <input className="input" type="number" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={formData.hours} onChange={e => setFormData({ ...formData, hours: e.target.value })} min="0.5" step="0.5" />
                        </div>
                        <div style={{ marginBottom: 20 }}>
                            <label style={labelStyle}>DESCRIPTION</label>
                            <textarea className="input" rows={3} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 12 }} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="What did you work on?" />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setOpen(false)}>cancel</button>
                            <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={handleSubmit} disabled={loading}>
                                {loading ? 'submitting...' : '$ submit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
