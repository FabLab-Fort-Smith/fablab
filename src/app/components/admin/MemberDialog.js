'use client';
import { useState, useEffect } from 'react';
import NudgeConfirmDialog from './NudgeConfirmDialog';
import Constants from '@/lib/constants';

const STEP_DOT = ({ done, active }) => (
    <div style={{
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 2,
        background: done ? 'var(--green)' : 'var(--bg-elev)',
        border: `2px solid ${done ? 'var(--green)' : active ? 'var(--green)' : 'var(--bd)'}`,
        boxShadow: done || active ? '0 0 6px var(--green)' : 'none',
    }} />
);

function Tabs({ tabs, active, onChange }) {
    return (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--bd)', overflowX: 'auto' }}>
            {tabs.map((t, i) => (
                <button key={i} onClick={() => onChange(i)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '10px 16px',
                    fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.08em',
                    color: active === i ? 'var(--green)' : 'var(--text-dim)',
                    borderBottom: active === i ? '2px solid var(--green)' : '2px solid transparent',
                    marginBottom: -1, whiteSpace: 'nowrap',
                }}>{t}</button>
            ))}
        </div>
    );
}

export default function MemberDialog({ open, onClose, user, onUpdate }) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState(null);
    const [newLog, setNewLog] = useState({ hours: '', description: '', date: new Date().toISOString().split('T')[0] });
    const [tab, setTab] = useState(0);
    const [badges, setBadges] = useState([]);
    const [nudgeDialogOpen, setNudgeDialogOpen] = useState(false);
    const [nudgeDetails, setNudgeDetails] = useState(null);
    const [nudgeLoading, setNudgeLoading] = useState(false);
    const [awardOpen, setAwardOpen] = useState(false);
    const [awardAmount, setAwardAmount] = useState(10);
    const [awardReason, setAwardReason] = useState('');
    const [awardLoading, setAwardLoading] = useState(false);

    useEffect(() => {
        if (open) {
            fetch('/api/v1/badges').then(r => r.json()).then(d => setBadges(d.badges || [])).catch(() => {});
        }
    }, [open]);

    useEffect(() => {
        if (user) {
            setFormData({
                ...user,
                badges: user.badges || [],
                membership: { status: 'registered', volunteerLog: [], accessKey: { issued: false, type: 'limited' }, ...user.membership },
            });
        }
    }, [user]);

    if (!open || !user || !formData) return null;

    const setMem = (field, value) => setFormData(p => ({ ...p, membership: { ...p.membership, [field]: value } }));
    const setKey = (field, value) => setFormData(p => ({ ...p, membership: { ...p.membership, accessKey: { ...p.membership.accessKey, [field]: value } } }));

    const totalHours = (formData.membership.volunteerLog || []).reduce((acc, l) => acc + (l.hours || 0), 0);
    const currentMonthHours = (formData.membership.volunteerLog || [])
        .filter(l => new Date(l.date).getMonth() === new Date().getMonth())
        .reduce((acc, l) => acc + (l.hours || 0), 0);

    const activeStep = (() => {
        const m = formData.membership;
        if (!m.applicationDate) return 1;
        if (!m.contacted) return 2;
        if (!m.onboardingComplete) return 3;
        const isSponsorValid = m.sponsorshipExpiresAt && new Date(m.sponsorshipExpiresAt) > new Date();
        const isSubscribed = m.subscriptionStatus === 'ACTIVE' || m.isWaived || isSponsorValid;
        if (!isSubscribed && m.status !== 'active' && m.status !== 'probation') return 4;
        if (!formData.profileCompleted && !formData.isPublic) return 5;
        if (totalHours < 4) return 6;
        if (!m.accessKey?.issued) return 7;
        if (m.status !== 'active') return 8;
        return 9;
    })();

    const canAssignKey = (() => {
        const m = formData.membership;
        const isSponsorValid = m.sponsorshipExpiresAt && new Date(m.sponsorshipExpiresAt) > new Date();
        const isPaid = m.status === 'active' || m.status === 'probation' || m.subscriptionStatus === 'ACTIVE' || m.isWaived || isSponsorValid;
        return isPaid && m.status !== 'suspended';
    })();

    const handleAddLog = () => {
        if (!newLog.hours || !newLog.description) return;
        const log = { id: crypto.randomUUID(), date: newLog.date, hours: Number(newLog.hours), description: newLog.description, verifiedBy: 'Admin', status: 'approved' };
        setFormData(p => ({ ...p, membership: { ...p.membership, volunteerLog: [log, ...(p.membership.volunteerLog || [])] } }));
        setNewLog({ hours: '', description: '', date: new Date().toISOString().split('T')[0] });
    };

    const handleDeleteLog = (logId) => setFormData(p => ({ ...p, membership: { ...p.membership, volunteerLog: p.membership.volunteerLog.filter(l => l.id !== logId) } }));

    const handleVerifyEmail = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/users?userID=${user.userID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'verified' }) });
            if (res.ok) { const d = await res.json(); setFormData(p => ({ ...p, status: 'verified' })); if (onUpdate) onUpdate(d.user); }
        } catch {}
        finally { setLoading(false); }
    };

    const handleResendVerification = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/auth/resend-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email }) });
            if (res.ok) alert('Verification email sent!');
            else { const d = await res.json(); alert(d.error || 'Failed to send email'); }
        } catch {}
        finally { setLoading(false); }
    };

    const handlePairKey = async () => {
        if (!confirm('Using Scanner "Access Scanner 01".\n\nIs the user ready to tap their card?')) return;
        setLoading(true);
        try {
            const res = await fetch('/api/admin/pair-card', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.userID }) });
            const d = await res.json();
            if (res.ok) alert(`Pairing Mode Started!\n\nUser has 60 seconds to tap their card.\n\nMessage: ${d.message || 'Waiting...'}`);
            else alert(`Error: ${d.error}`);
        } catch { alert('Network Error'); }
        finally { setLoading(false); }
    };

    const handleNudge = async () => {
        setNudgeLoading(true);
        try {
            const res = await fetch('/api/v1/users/nudge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userID: user.userID, preview: true }) });
            const d = await res.json();
            if (!res.ok) { alert(`Failed to preview nudge: ${d.error}`); return; }
            setNudgeDetails(d.details);
            setNudgeDialogOpen(true);
        } catch { alert('Error preparing nudge.'); }
        finally { setNudgeLoading(false); }
    };

    const handleConfirmNudge = async () => {
        setNudgeLoading(true);
        try {
            const res = await fetch('/api/v1/users/nudge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userID: user.userID, preview: false }) });
            if (res.ok) { alert(`Nudge sent to ${user.firstName}!`); setNudgeDialogOpen(false); }
            else { const d = await res.json(); alert(`Failed: ${d.error}`); }
        } catch { alert('Error sending nudge.'); }
        finally { setNudgeLoading(false); }
    };

    const handleDelete = async () => {
        if (!confirm(`Permanently delete ${user.firstName} ${user.lastName} (${user.email})?\n\nThis cannot be undone.`)) return;
        if (!confirm(`Second confirmation: delete ${user.userID}?`)) return;
        try {
            const res = await fetch(`/api/v1/users?userID=${user.userID}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed');
            onClose();
            if (typeof onDelete === 'function') onDelete(user.userID);
        } catch { alert('Failed to delete user'); }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/users?userID=${user.userID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName: formData.firstName, lastName: formData.lastName, membership: formData.membership, role: formData.role, boardPosition: formData.boardPosition, squareID: formData.squareID, badges: formData.badges }),
            });
            if (!res.ok) throw new Error('Failed');
            const d = await res.json();
            onUpdate(d.user);
            onClose();
        } catch { alert('Failed to update user'); }
        finally { setLoading(false); }
    };

    const handleAwardStake = async () => {
        setAwardLoading(true);
        try {
            const res = await fetch('/api/v1/transactions/award', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiverId: user.userID, amount: parseInt(awardAmount), reason: awardReason }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
            alert(`Successfully awarded ${awardAmount} stake!`);
            setAwardOpen(false); setAwardAmount(10); setAwardReason('');
        } catch (e) { alert(e.message); }
        finally { setAwardLoading(false); }
    };

    const handleSyncSubscription = async () => {
        if (!formData.squareID) return;
        setLoading(true);
        try {
            const res = await fetch('/api/v1/square/subscriptions/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ squareID: formData.squareID, userID: user.userID }) });
            if (!res.ok) throw new Error('Failed');
            const d = await res.json();
            if (d.user) { setFormData(p => ({ ...p, ...d.user, membership: { ...p.membership, ...d.user.membership } })); alert('Subscription synced!'); }
            else alert('No active subscription found.');
        } catch { alert('Failed to sync subscription'); }
        finally { setLoading(false); }
    };

    const STEPS = [
        'account created',
        'application submitted',
        'initial contact / reviewed',
        'onboarding',
        'membership subscription',
        'complete public profile',
        'first month volunteer (4h)',
        'access key issued',
        'full active status',
    ];

    const inputStyle = { width: '100%', boxSizing: 'border-box', fontFamily: 'var(--mono)', fontSize: 12 };
    const labelStyle = { display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 };

    return (
        <>
            {/* Backdrop */}
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
                <div className="card" style={{ width: '100%', maxWidth: 800, maxHeight: '95vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                    {/* Header */}
                    <div className="card-header" style={{ flexShrink: 0 }}>
                        <div>
                            <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
                                manage: {user.firstName} {user.lastName}
                            </span>
                            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{user.email}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn--ghost btn--sm" style={{ fontSize: 9, borderColor: 'var(--amber)', color: 'var(--amber)' }} onClick={() => setAwardOpen(true)}>★ award</button>
                            <button className="btn btn--ghost btn--sm" style={{ fontSize: 9 }} onClick={handleNudge} disabled={nudgeLoading}>nudge</button>
                            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                        </div>
                    </div>

                    {/* Status pills */}
                    <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--bd)', display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                        {[
                            { label: formData.role, color: formData.role === 'admin' ? 'var(--magenta)' : 'var(--text-dim)' },
                            { label: formData.membership.status, color: 'var(--cyan)' },
                            { label: `total: ${totalHours}h`, color: 'var(--text-dim)' },
                            { label: `month: ${currentMonthHours}h`, color: currentMonthHours >= 4 ? 'var(--green)' : 'var(--amber)' },
                        ].map(({ label, color }) => (
                            <span key={label} className="pill" style={{ fontSize: 10, color, border: `1px solid ${color}` }}>{label}</span>
                        ))}
                    </div>

                    {/* Identity / audit info */}
                    <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--bd)', display: 'flex', gap: 16, flexWrap: 'wrap', flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 10 }}>
                        {[
                            { k: 'userID',    v: user.userID },
                            { k: 'provider',  v: user.provider || '—' },
                            { k: 'googleId',  v: user.googleId  ? user.googleId.slice(0, 12) + '…'  : '—' },
                            { k: 'discordId', v: user.discordId ? user.discordId.slice(0, 12) + '…' : '—' },
                            { k: 'created',    v: user.createdAt  ? new Date(user.createdAt).toLocaleDateString()  : '—' },
                            { k: 'last login', v: user.lastLogin  ? new Date(user.lastLogin).toLocaleString()      : '—' },
                            { k: 'sq customer', v: user.membership?.squareCustomerId || user.squareCustomerId || '—' },
                        ].map(({ k, v }) => (
                            <div key={k} title={v} style={{ cursor: 'pointer' }} onClick={() => navigator.clipboard?.writeText(v)}>
                                <span style={{ color: 'var(--text-dim)' }}>{k}: </span>
                                <span style={{ color: 'var(--text-mid)' }}>{v}</span>
                            </div>
                        ))}
                    </div>

                    {/* Tabs */}
                    <div style={{ flexShrink: 0 }}>
                        <Tabs tabs={['progress', 'volunteer logs', 'admin actions', 'badges']} active={tab} onChange={setTab} />
                    </div>

                    {/* Tab content (scrollable) */}
                    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>

                        {/* Tab 0: Progress / Stepper */}
                        {tab === 0 && (
                            <div>
                                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>co-op membership progress</div>
                                {STEPS.map((stepLabel, i) => {
                                    const stepNum = i + 1;
                                    const done = activeStep > stepNum;
                                    const active = activeStep === stepNum;
                                    const m = formData.membership;

                                    const renderContent = () => {
                                        if (stepNum === 1) return <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>date: {new Date(formData.createdAt).toLocaleDateString()}</div>;
                                        if (stepNum === 2) return (
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-mid)', cursor: 'pointer' }}>
                                                <input type="checkbox" checked={!!m.applicationDate} onChange={e => setMem('applicationDate', e.target.checked ? new Date().toISOString() : null)} />
                                                {m.applicationDate ? `submitted on ${new Date(m.applicationDate).toLocaleDateString()}` : 'mark application as submitted'}
                                            </label>
                                        );
                                        if (stepNum === 3) return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-mid)', cursor: 'pointer' }}>
                                                    <input type="checkbox" checked={!!m.contacted} onChange={e => setMem('contacted', e.target.checked)} />
                                                    member has been contacted
                                                    {m.reviewStatus === 'reviewed' && <span className="pill" style={{ fontSize: 9, color: 'var(--green)', border: '1px solid var(--green)' }}>reviewed</span>}
                                                </label>
                                                {!m.contacted && (
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                        <a href={`mailto:${formData.email}`} className="btn btn--ghost btn--sm" style={{ fontSize: 9 }}>email</a>
                                                        {formData.phoneNumber && <a href={`tel:${formData.phoneNumber}`} className="btn btn--ghost btn--sm" style={{ fontSize: 9 }}>call</a>}
                                                        {formData.discordHandle && <button className="btn btn--ghost btn--sm" style={{ fontSize: 9 }} onClick={() => { navigator.clipboard.writeText(formData.discordHandle); alert(`Copied: ${formData.discordHandle}`); }}>copy discord</button>}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                        if (stepNum === 4) return (
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-mid)', cursor: 'pointer' }}>
                                                <input type="checkbox" checked={!!m.onboardingComplete} onChange={e => setMem('onboardingComplete', e.target.checked)} />
                                                paperwork & orientation complete
                                            </label>
                                        );
                                        if (stepNum === 5) {
                                            const isSponsorValid = m.sponsorshipExpiresAt && new Date(m.sponsorshipExpiresAt) > new Date();
                                            const subActive = ['active', 'probation'].includes(m.status) || m.subscriptionStatus === 'ACTIVE' || m.isWaived || isSponsorValid;
                                            return (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                    <div style={{ fontSize: 11, color: subActive ? 'var(--green)' : 'var(--red)' }}>
                                                        {subActive ? '✓ subscription active' : '✕ pending payment / subscription'}
                                                    </div>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-mid)', cursor: 'pointer' }}>
                                                        <input type="checkbox" checked={!!m.isWaived} onChange={e => setMem('isWaived', e.target.checked)} />
                                                        waive membership dues (permanent)
                                                    </label>
                                                </div>
                                            );
                                        }
                                        if (stepNum === 6) return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <div style={{ fontSize: 11, color: formData.profileCompleted || formData.isPublic ? 'var(--green)' : 'var(--amber)' }}>
                                                    {formData.profileCompleted || formData.isPublic ? `✓ profile setup (${formData.isPublic ? 'public' : 'private'})` : '⚠ profile setup incomplete'}
                                                </div>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-mid)', cursor: 'pointer' }}>
                                                    <input type="checkbox" checked={!!formData.isPublic} onChange={e => setFormData(p => ({ ...p, isPublic: e.target.checked }))} />
                                                    public profile
                                                </label>
                                            </div>
                                        );
                                        if (stepNum === 7) return (
                                            <div style={{ fontSize: 11, color: totalHours >= 4 ? 'var(--green)' : 'var(--amber)' }}>
                                                {totalHours >= 4 ? '✓ requirement met' : `⚠ ${4 - totalHours} hours remaining`}
                                            </div>
                                        );
                                        if (stepNum === 8) return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-mid)', cursor: 'pointer' }}>
                                                        <input type="checkbox" checked={!!m.accessKey?.issued} onChange={e => setKey('issued', e.target.checked)} disabled={!canAssignKey && !m.accessKey?.issued} />
                                                        key issued
                                                    </label>
                                                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 9 }} disabled={!canAssignKey} onClick={() => { const k = Math.floor(100000 + Math.random() * 900000).toString(); setKey('code', k); setKey('issued', true); }}>
                                                        generate key
                                                    </button>
                                                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 9, borderColor: 'var(--cyan)', color: 'var(--cyan)' }} onClick={handlePairKey} disabled={loading}>
                                                        pair NFC
                                                    </button>
                                                </div>
                                                {m.accessKey?.code && (
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                        <input className="input" value={m.accessKey.code} readOnly style={{ flex: 1, fontSize: 12 }} />
                                                        <button className="btn btn--ghost btn--sm" style={{ fontSize: 9 }} onClick={() => navigator.clipboard.writeText(m.accessKey.code)}>copy</button>
                                                    </div>
                                                )}
                                                {m.accessKey?.issued && (
                                                    <select className="input" value={m.accessKey?.type || 'limited'} onChange={e => setKey('type', e.target.value)} style={{ fontSize: 12 }}>
                                                        <option value="limited">limited (8am - 10pm)</option>
                                                        <option value="24h">24 hour access</option>
                                                    </select>
                                                )}
                                                {!canAssignKey && !m.accessKey?.issued && (
                                                    <div style={{ fontSize: 10, color: 'var(--red)' }}>cannot assign key: user must be active/probation and not suspended.</div>
                                                )}
                                            </div>
                                        );
                                        return null;
                                    };

                                    return (
                                        <div key={stepNum} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <STEP_DOT done={done} active={active} />
                                                {stepNum < STEPS.length && <div style={{ width: 1, flex: 1, background: done ? 'var(--green)' : 'var(--bd)', marginTop: 4, minHeight: 20 }} />}
                                            </div>
                                            <div style={{ flex: 1, paddingBottom: 12 }}>
                                                <div style={{ fontSize: 11, color: done ? 'var(--green)' : active ? 'var(--text-bright)' : 'var(--text-dim)', fontWeight: active ? 600 : 400, marginBottom: 6, fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
                                                    {stepLabel}
                                                </div>
                                                {(active || done) && renderContent()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Tab 1: Volunteer Logs */}
                        {tab === 1 && (
                            <div>
                                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                    <div>
                                        <label style={labelStyle}>DATE</label>
                                        <input className="input" type="date" value={newLog.date} onChange={e => setNewLog(p => ({ ...p, date: e.target.value }))} style={{ fontSize: 12 }} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>HOURS</label>
                                        <input className="input" type="number" value={newLog.hours} onChange={e => setNewLog(p => ({ ...p, hours: e.target.value }))} style={{ width: 70, fontSize: 12 }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>DESCRIPTION</label>
                                        <input className="input" value={newLog.description} onChange={e => setNewLog(p => ({ ...p, description: e.target.value }))} placeholder="what did they do?" style={inputStyle} />
                                    </div>
                                    <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={handleAddLog}>$ add</button>
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="term-table" style={{ width: '100%' }}>
                                        <thead><tr><th>DATE</th><th>HOURS</th><th>DESCRIPTION</th><th>STATUS</th><th></th></tr></thead>
                                        <tbody>
                                            {(formData.membership.volunteerLog || []).length === 0 ? (
                                                <tr><td colSpan={5} style={{ color: 'var(--text-dim)', textAlign: 'center' }}>no logs</td></tr>
                                            ) : (formData.membership.volunteerLog || []).map(log => (
                                                <tr key={log.id}>
                                                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{new Date(log.date).toLocaleDateString()}</td>
                                                    <td style={{ color: 'var(--amber)' }}>{log.hours}</td>
                                                    <td style={{ color: 'var(--text-mid)' }}>{log.description}</td>
                                                    <td><span style={{ fontSize: 9, color: log.status === 'approved' ? 'var(--green)' : log.status === 'pending' ? 'var(--amber)' : 'var(--red)', fontFamily: 'var(--mono)' }}>{log.status || 'approved'}</span></td>
                                                    <td><button onClick={() => handleDeleteLog(log.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12 }}>✕</button></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Tab 2: Admin Actions */}
                        {tab === 2 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                                    <div>
                                        <label style={labelStyle}>ROLE</label>
                                        <select className="input" value={formData.role} onChange={e => setFormData(p => ({ ...p, role: e.target.value }))} style={inputStyle}>
                                            <option value="user">user</option>
                                            <option value="admin">admin</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>MEMBERSHIP_STATUS</label>
                                        <select className="input" value={formData.membership.status} onChange={e => setMem('status', e.target.value)} style={inputStyle}>
                                            <option value="registered">registered</option>
                                            <option value="applicant">applicant</option>
                                            <option value="onboarding">onboarding</option>
                                            <option value="probation">probation</option>
                                            <option value="active">active member</option>
                                            <option value="suspended">suspended</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>MEMBERSHIP_TYPE</label>
                                        <select className="input" value={formData.membership.type || 'community'} onChange={e => setMem('type', e.target.value)} style={inputStyle}>
                                            <option value="community">community</option>
                                            <option value="co-op">co-op</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ border: '1px solid var(--bd)', padding: '14px 16px' }}>
                                    <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 10 }}>EMAIL_VERIFICATION</div>
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span className="pill" style={{ fontSize: 10, color: formData.status === 'verified' ? 'var(--green)' : 'var(--amber)', border: `1px solid ${formData.status === 'verified' ? 'var(--green)' : 'var(--amber)'}` }}>
                                            {formData.status === 'verified' ? 'verified' : 'unverified'}
                                        </span>
                                        {formData.status !== 'verified' && (
                                            <>
                                                <button className="btn btn--ghost btn--sm" style={{ fontSize: 9 }} onClick={handleVerifyEmail} disabled={loading}>manually verify</button>
                                                <button className="btn btn--ghost btn--sm" style={{ fontSize: 9 }} onClick={handleResendVerification} disabled={loading}>resend email</button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>SQUARE_CUSTOMER_ID</label>
                                        <input className="input" value={formData.squareID || ''} onChange={e => setFormData(p => ({ ...p, squareID: e.target.value }))} placeholder="square customer id" style={inputStyle} />
                                    </div>
                                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={handleSyncSubscription} disabled={loading || !formData.squareID}>$ sync</button>
                                </div>

                                {formData.role === 'admin' && (
                                    <div>
                                        <label style={labelStyle}>BOARD_POSITION</label>
                                        <input className="input" value={formData.boardPosition || ''} onChange={e => setFormData(p => ({ ...p, boardPosition: e.target.value }))} placeholder="e.g. President, Treasurer" style={inputStyle} />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Tab 3: Badges */}
                        {tab === 3 && (
                            <div>
                                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 14 }}>select badges to assign to this member</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                                    {badges.map(badge => {
                                        const hasIt = (formData.badges || []).includes(badge.id);
                                        return (
                                            <label key={badge.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: `1px solid ${hasIt ? 'var(--green)' : 'var(--bd)'}`, cursor: 'pointer', background: hasIt ? 'rgba(57,255,20,0.04)' : 'transparent' }}>
                                                <input type="checkbox" checked={hasIt} onChange={e => {
                                                    const next = e.target.checked ? [...(formData.badges || []), badge.id] : (formData.badges || []).filter(b => b !== badge.id);
                                                    setFormData(p => ({ ...p, badges: next }));
                                                }} />
                                                {badge.imageUrl ? <img src={badge.imageUrl} alt={badge.name} style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 2 }} /> : <span style={{ fontSize: 22 }}>{badge.icon}</span>}
                                                <div>
                                                    <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{badge.name}</div>
                                                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{badge.description}</div>
                                                </div>
                                            </label>
                                        );
                                    })}
                                    {badges.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>[no badges in system]</div>}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{ padding: '12px 24px', borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <button className="btn btn--ghost btn--sm" style={{ fontSize: 10, borderColor: 'var(--red, #ff4444)', color: 'var(--red, #ff4444)' }} onClick={handleDelete}>$ delete account</button>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={onClose}>cancel</button>
                            <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={handleSave} disabled={loading}>{loading ? '$ saving...' : '$ save changes'}</button>
                        </div>
                    </div>
                </div>
            </div>

            <NudgeConfirmDialog open={nudgeDialogOpen} onClose={() => setNudgeDialogOpen(false)} onConfirm={handleConfirmNudge} nudgeDetails={nudgeDetails} loading={nudgeLoading} />

            {/* Award Stake Dialog */}
            {awardOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setAwardOpen(false)}>
                    <div className="card" style={{ maxWidth: 400, width: '100%' }} onClick={e => e.stopPropagation()}>
                        <div className="card-header">
                            <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>award stake to {user.firstName}</span>
                            <button onClick={() => setAwardOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18 }}>×</button>
                        </div>
                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>AMOUNT</label>
                                <input className="input" type="number" value={awardAmount} onChange={e => setAwardAmount(e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>REASON</label>
                                <textarea className="input" rows={2} value={awardReason} onChange={e => setAwardReason(e.target.value)} placeholder="e.g. volunteer work, workshop host" style={{ ...inputStyle, resize: 'vertical' }} />
                            </div>
                        </div>
                        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setAwardOpen(false)}>cancel</button>
                            <button className="btn btn--filled btn--sm" style={{ fontSize: 10, borderColor: 'var(--amber)', background: 'rgba(255,170,0,0.1)', color: 'var(--amber)' }} onClick={handleAwardStake} disabled={awardLoading || !awardAmount}>
                                {awardLoading ? '$ awarding...' : '$ award stake'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
