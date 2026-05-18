'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ReviewDialog from '../../../components/admin/ReviewDialog';
import NudgeConfirmDialog from '../../../components/admin/NudgeConfirmDialog';
import DeclineDialog from '../../../components/admin/DeclineDialog';

export default function OnboardingReviewsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState(0);
    const [nudgeDialogOpen, setNudgeDialogOpen] = useState(false);
    const [nudgeDetails, setNudgeDetails] = useState(null);
    const [nudgeLoading, setNudgeLoading] = useState(false);
    const [nudgeTargetUser, setNudgeTargetUser] = useState(null);
    const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
    const [declineTargetUser, setDeclineTargetUser] = useState(null);
    const [declineLoading, setDeclineLoading] = useState(false);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated') {
            if (session.user.role !== 'admin') router.push('/dashboard');
            else fetchApplicants();
        }
    }, [status, session, router]);

    const showToast = (msg, color = 'var(--green)') => { setToast({ msg, color }); setTimeout(() => setToast(null), 3000); };

    const fetchApplicants = async () => {
        try {
            const res = await fetch('/api/v1/users?limit=1000');
            if (res.ok) {
                const data = await res.json();
                setUsers((data.users || []).filter(u => u.membership?.applicationDate));
            }
        } catch {}
        finally { setLoading(false); }
    };

    const updateUserMembership = async (userID, membershipPatch) => {
        const res = await fetch(`/api/v1/users?userID=${userID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ membership: membershipPatch }),
        });
        return res;
    };

    const patchLocalUser = (userID, membershipPatch) => {
        setUsers(prev => prev.map(u =>
            u.userID === userID ? { ...u, membership: { ...u.membership, ...membershipPatch } } : u
        ));
        if (selectedUser?.userID === userID) {
            setSelectedUser(prev => ({ ...prev, membership: { ...prev.membership, ...membershipPatch } }));
        }
    };

    const handleMarkReviewed = async (user) => {
        try {
            const res = await updateUserMembership(user.userID, { reviewStatus: 'reviewed', status: 'applicant' });
            if (res.ok) {
                patchLocalUser(user.userID, { reviewStatus: 'reviewed', status: 'applicant' });
                showToast('Marked as reviewed.');
            }
        } catch {}
    };

    const handleMarkContacted = async (user) => {
        try {
            const res = await updateUserMembership(user.userID, { contacted: true, status: 'contacted' });
            if (res.ok) {
                patchLocalUser(user.userID, { contacted: true, status: 'contacted' });
                showToast('Marked as contacted.');
            }
        } catch {}
    };

    const handleMarkOnboardingComplete = async (user) => {
        try {
            const res = await updateUserMembership(user.userID, { onboardingComplete: true, status: 'onboarding' });
            if (res.ok) {
                patchLocalUser(user.userID, { onboardingComplete: true, status: 'onboarding' });
                showToast('Marked onboarding complete.');
            }
        } catch {}
    };

    const handleDecline = async (reason, sendEmail) => {
        if (!declineTargetUser) return;
        setDeclineLoading(true);
        try {
            const res = await updateUserMembership(declineTargetUser.userID, { status: 'declined', declineReason: reason });
            if (res.ok) {
                if (sendEmail) {
                    await fetch('/api/v1/users/decline-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userID: declineTargetUser.userID }),
                    });
                }
                patchLocalUser(declineTargetUser.userID, { status: 'declined', declineReason: reason });
                setDeclineDialogOpen(false);
                setDeclineTargetUser(null);
                setDialogOpen(false);
                showToast(`${declineTargetUser.firstName} declined.`, 'var(--red)');
            }
        } catch {}
        finally { setDeclineLoading(false); }
    };

    const openDeclineDialog = (user) => {
        setDeclineTargetUser(user);
        setDeclineDialogOpen(true);
    };

    const handleNudge = async (e, user) => {
        e.stopPropagation();
        setNudgeLoading(true);
        setNudgeTargetUser(user);
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
        if (!nudgeTargetUser) return;
        setNudgeLoading(true);
        try {
            const res = await fetch('/api/v1/users/nudge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userID: nudgeTargetUser.userID, preview: false }) });
            if (res.ok) { showToast(`Nudge sent to ${nudgeTargetUser.firstName}!`); setNudgeDialogOpen(false); setNudgeTargetUser(null); }
            else { const d = await res.json(); alert(`Failed: ${d.error}`); }
        } catch { alert('Error sending nudge.'); }
        finally { setNudgeLoading(false); }
    };

    const getDisplayUsers = () => {
        let list;
        if (tab === 0) {
            list = users.filter(u => u.membership?.reviewStatus !== 'reviewed' && u.membership?.status !== 'declined');
        } else if (tab === 1) {
            list = users.filter(u => u.membership?.reviewStatus === 'reviewed' && u.membership?.status !== 'declined');
        } else {
            list = users.filter(u => u.membership?.status === 'declined');
        }
        if (search) {
            const t = search.toLowerCase();
            list = list.filter(u => u.firstName?.toLowerCase().includes(t) || u.lastName?.toLowerCase().includes(t) || u.email?.toLowerCase().includes(t));
        }
        return list;
    };

    const displayUsers = getDisplayUsers();
    const needsReviewCount = users.filter(u => u.membership?.reviewStatus !== 'reviewed' && u.membership?.status !== 'declined').length;
    const reviewedCount = users.filter(u => u.membership?.reviewStatus === 'reviewed' && u.membership?.status !== 'declined').length;
    const declinedCount = users.filter(u => u.membership?.status === 'declined').length;

    const TABS = [
        [`needs review (${needsReviewCount})`, 0],
        [`reviewed (${reviewedCount})`, 1],
        [`declined (${declinedCount})`, 2],
    ];

    return (
        <div style={{ padding: '20px 24px', maxWidth: 1100 }}>
            {toast && (
                <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, background: 'var(--bg-card)', border: `1px solid ${toast.color}`, color: toast.color, padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {toast.msg}
                </div>
            )}

            <div style={{ marginBottom: 28 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}><span style={{ color: 'var(--green)' }}>$</span> ./onboarding --reviews</div>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>onboarding reviews</h1>
                <p style={{ color: 'var(--text-mid)', fontSize: 12, marginTop: 6 }}>review and approve new member applications</p>
            </div>

            {/* Tabs + search */}
            <div style={{ border: '1px solid var(--bd-1)', background: 'var(--bg-card)', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--bd)', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex' }}>
                        {TABS.map(([label, val]) => (
                            <button key={val} onClick={() => setTab(val)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.08em', color: tab === val ? (val === 2 ? 'var(--red)' : 'var(--green)') : 'var(--text-dim)', borderBottom: tab === val ? `2px solid ${val === 2 ? 'var(--red)' : 'var(--green)'}` : '2px solid transparent', marginBottom: -1 }}>
                                {label}
                            </button>
                        ))}
                    </div>
                    <div style={{ padding: '8px 16px' }}>
                        <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="search..." style={{ fontSize: 10, padding: '4px 8px' }} />
                    </div>
                </div>
            </div>

            {loading ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading<span className="caret-block" style={{ marginLeft: 4 }} /></div>
            ) : displayUsers.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>[no applicants found]</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table className="term-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>NAME</th>
                                <th>EMAIL</th>
                                <th>APPLIED_ON</th>
                                <th>STATUS</th>
                                <th>ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayUsers.map(u => {
                                const appDate = u.membership?.applicationDate ? new Date(u.membership.applicationDate).toLocaleDateString() : 'N/A';
                                const memberStatus = u.membership?.status || 'registered';
                                const statusColor = memberStatus === 'declined' ? 'var(--red)' : u.membership?.reviewStatus === 'reviewed' ? 'var(--green)' : 'var(--amber)';
                                const statusLabel = memberStatus === 'declined' ? 'declined' : u.membership?.reviewStatus === 'reviewed' ? 'reviewed' : 'needs review';
                                return (
                                    <tr key={u.userID}>
                                        <td style={{ color: 'var(--text)', fontWeight: 600 }}>{u.firstName} {u.lastName}</td>
                                        <td style={{ color: 'var(--text-mid)', fontSize: 11 }}>{u.email}</td>
                                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>{appDate}</td>
                                        <td>
                                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: statusColor, border: `1px solid ${statusColor}`, padding: '2px 6px' }}>
                                                {statusLabel}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button className="btn btn--ghost btn--sm" style={{ fontSize: 9 }} onClick={() => { setSelectedUser(u); setDialogOpen(true); }}>$ review</button>
                                                {tab !== 2 && (
                                                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 9, borderColor: 'var(--amber)', color: 'var(--amber)' }} onClick={e => handleNudge(e, u)} disabled={nudgeLoading}>nudge</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <ReviewDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                user={selectedUser}
                onReview={handleMarkReviewed}
                onMarkContacted={handleMarkContacted}
                onMarkOnboardingComplete={handleMarkOnboardingComplete}
                onDecline={openDeclineDialog}
            />
            <NudgeConfirmDialog
                open={nudgeDialogOpen}
                onClose={() => setNudgeDialogOpen(false)}
                onConfirm={handleConfirmNudge}
                nudgeDetails={nudgeDetails}
                loading={nudgeLoading}
            />
            <DeclineDialog
                open={declineDialogOpen}
                onClose={() => { setDeclineDialogOpen(false); setDeclineTargetUser(null); }}
                onConfirm={handleDecline}
                user={declineTargetUser}
                loading={declineLoading}
            />
        </div>
    );
}
