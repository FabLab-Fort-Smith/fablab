'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { uploadFileToS3 } from '@/utils/s3.util';

function Modal({ open, onClose, title, children, footer }) {
    if (!open) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
            <div className="card" style={{ maxWidth: 560, width: '100%', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                <div className="card-header">
                    <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>{title}</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 18, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ padding: '20px 24px' }}>{children}</div>
                {footer && <div style={{ padding: '12px 24px', borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>{footer}</div>}
            </div>
        </div>
    );
}

const STATUS_COLOR = { open: 'var(--green)', assigned: 'var(--amber)', completed: 'var(--cyan)', verified: 'var(--green)' };

const BOUNTY_DEFAULTS = { title: '', description: '', rewardType: 'custom', rewardValue: '', stakeValue: 0, recurrence: 'none', isInfinite: false, endsAt: '', imageUrl: '' };

export default function BountiesPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const highlightId = searchParams.get('highlight');
    const action = searchParams.get('action');

    const [bounties, setBounties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [userMembership, setUserMembership] = useState(null);
    const [tab, setTab] = useState(0);
    const [openCreate, setOpenCreate] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editingBountyId, setEditingBountyId] = useState(null);
    const [openSubmit, setOpenSubmit] = useState(false);
    const [submissionNote, setSubmissionNote] = useState('');
    const [submittingBountyId, setSubmittingBountyId] = useState(null);
    const [openClaims, setOpenClaims] = useState(false);
    const [selectedBountyForClaims, setSelectedBountyForClaims] = useState(null);
    const [newBounty, setNewBounty] = useState(BOUNTY_DEFAULTS);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (action === 'new') { setEditMode(false); setNewBounty(BOUNTY_DEFAULTS); setOpenCreate(true); }
    }, [action]);

    useEffect(() => {
        if (highlightId && bounties.length > 0) {
            setTimeout(() => document.getElementById(`bounty-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
        }
    }, [highlightId, bounties]);

    useEffect(() => {
        const init = async () => {
            if (session?.user?.userID) {
                try {
                    const r = await fetch(`/api/v1/users?userID=${session.user.userID}`);
                    if (r.ok) { const d = await r.json(); setUserMembership(d.user?.membership); }
                } catch {}
            }
            fetchBounties(1);
        };
        init();
    }, [session]);

    const fetchBounties = async (pageNum = 1) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/bounties?page=${pageNum}&limit=9`);
            if (res.ok) {
                const data = await res.json();
                setBounties(data.bounties || []);
                setTotalPages(data.totalPages || 1);
                setPage(data.page || 1);
            }
        } finally { setLoading(false); }
    };

    const hasAccess = session?.user?.role === 'admin' ||
        (userMembership && (userMembership.status === 'active' || userMembership.status === 'probation' || userMembership.type === 'community'));

    const isAdmin = session?.user?.role === 'admin';

    const handleOpenEdit = (bounty) => {
        setEditMode(true);
        setEditingBountyId(bounty.bountyID);
        setNewBounty({ title: bounty.title, description: bounty.description, rewardType: bounty.rewardType, rewardValue: bounty.rewardValue, stakeValue: bounty.stakeValue, recurrence: bounty.recurrence || 'none', isInfinite: bounty.isInfinite || false, endsAt: bounty.endsAt ? new Date(bounty.endsAt).toISOString().split('T')[0] : '', imageUrl: bounty.imageUrl || '' });
        setOpenCreate(true);
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        try {
            const url = await uploadFileToS3(file);
            if (url) setNewBounty(p => ({ ...p, imageUrl: url }));
        } finally { setUploading(false); }
    };

    const handleSubmitBounty = async () => {
        try {
            const url = editMode ? `/api/v1/bounties?bountyID=${editingBountyId}&action=edit` : '/api/v1/bounties';
            const method = editMode ? 'PUT' : 'POST';
            const body = editMode ? { userID: session.user.userID, updateData: newBounty } : { ...newBounty, creatorID: session.user.userID };
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (res.ok) { setOpenCreate(false); setNewBounty(BOUNTY_DEFAULTS); fetchBounties(); }
        } catch {}
    };

    const handleClaim = async (bountyID) => {
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=assign`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userID: session.user.userID }) });
            if (res.ok) fetchBounties();
        } catch {}
    };

    const handleClawback = async (bountyID) => {
        if (!confirm("Unassign this bounty? It will be set back to 'Open'.")) return;
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=clawback`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userID: session.user.userID }) });
            if (res.ok) fetchBounties();
        } catch {}
    };

    const handleSubmitWork = async () => {
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${submittingBountyId}&action=submit`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userID: session.user.userID, submission: { note: submissionNote } }) });
            if (res.ok) { setOpenSubmit(false); fetchBounties(); }
        } catch {}
    };

    const handleVerify = async (bountyID, claimUserID = null) => {
        try {
            const body = { verifierID: session.user.userID };
            if (claimUserID) body.claimUserID = claimUserID;
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=verify`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (res.ok) { fetchBounties(); if (selectedBountyForClaims?.bountyID === bountyID) setOpenClaims(false); }
        } catch {}
    };

    const handleClawbackClaim = async (bountyID, claimUserID) => {
        if (!confirm("Remove this claim?")) return;
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=clawback`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userID: session.user.userID, claimUserID }) });
            if (res.ok) { fetchBounties(); setOpenClaims(false); }
        } catch {}
    };

    const handleDeleteBounty = async (bountyID) => {
        if (!confirm("Delete this bounty? This cannot be undone.")) return;
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&userID=${session.user.userID}`, { method: 'DELETE' });
            if (res.ok) setBounties(prev => prev.filter(b => b.bountyID !== bountyID));
        } catch {}
    };

    const getUserClaim = (bounty) => bounty.isInfinite && bounty.claims ? bounty.claims.find(c => c.userID === session?.user?.userID) : null;

    const filteredBounties = bounties.filter(b => {
        if (tab === 3) return b.status === 'completed' || b.status === 'verified';
        if (b.status === 'completed' || b.status === 'verified') return false;
        if (tab === 1) return b.rewardType === 'hours';
        if (tab === 2) return b.rewardType !== 'hours';
        return true;
    });

    if (loading && bounties.length === 0) return (
        <div style={{ padding: '40px 24px', display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-mid)', fontSize: 12 }}>
            <span className="dot pulse" style={{ background: 'var(--green)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
            loading bounties...
        </div>
    );

    if (!hasAccess) return (
        <div style={{ padding: '80px 24px', maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 48, color: 'var(--text-dim)', marginBottom: 16 }}>⊠</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 12 }}>ACCESS_DENIED</div>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: '1.6rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 12 }}>membership required</h2>
            <p style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 1.7, marginBottom: 24 }}>You need an active membership to access the bounty board.</p>
            <Link href={`/dashboard/${session?.user?.userID}/profile?tab=1`} className="btn btn--filled" style={{ fontSize: 11 }}>$ ./view --membership-options</Link>
        </div>
    );

    return (
        <div style={{ padding: '20px 24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                        <span style={{ color: 'var(--green)' }}>$</span> ./bounties --list
                    </div>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>bounty board</h1>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <Link href="/dashboard/activities/bounties/feed" className="btn btn--ghost" style={{ fontSize: 10 }}>$ feed view</Link>
                    <button className="btn btn--filled" style={{ fontSize: 10 }} onClick={() => { setEditMode(false); setEditingBountyId(null); setNewBounty(BOUNTY_DEFAULTS); setOpenCreate(true); }}>
                        $ ./create --bounty
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--bd)', marginBottom: 20, overflowX: 'auto' }}>
                {['all open', 'volunteer hours', 'community requests', 'completed'].map((label, i) => (
                    <button key={i} onClick={() => setTab(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 16px', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.08em', whiteSpace: 'nowrap', color: tab === i ? 'var(--green)' : 'var(--text-dim)', borderBottom: tab === i ? '2px solid var(--green)' : '2px solid transparent', marginBottom: -1 }}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Grid */}
            {filteredBounties.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}><span style={{ color: 'var(--green)' }}>&gt;</span> no bounties in this category.</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 24 }}>
                    {filteredBounties.map(bounty => {
                        const isCreator = bounty.creatorID === session?.user?.userID;
                        const canEdit = isCreator || isAdmin;
                        const canClawback = (isCreator || isAdmin) && bounty.status === 'assigned';
                        const isHighlighted = highlightId === bounty.bountyID;
                        const userClaim = getUserClaim(bounty);

                        return (
                            <div
                                key={bounty.bountyID}
                                id={`bounty-${bounty.bountyID}`}
                                className="card"
                                style={{
                                    padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                                    border: isHighlighted ? '1px solid var(--green)' : bounty.rewardType === 'hours' ? '1px solid rgba(57,255,20,0.3)' : '1px solid var(--bd)',
                                    boxShadow: isHighlighted ? '0 0 20px rgba(57,255,20,0.15)' : 'none',
                                    opacity: bounty.status === 'completed' ? 0.75 : 1,
                                }}
                            >
                                {bounty.imageUrl && (
                                    <img src={bounty.imageUrl} alt={bounty.title} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
                                )}
                                <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    {/* Status + stake row */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', color: STATUS_COLOR[bounty.status] || 'var(--text-dim)', border: `1px solid ${STATUS_COLOR[bounty.status] || 'var(--bd)'}`, padding: '2px 6px' }}>
                                                {bounty.status === 'completed' ? 'PENDING_VERIFY' : bounty.status?.toUpperCase()}
                                            </span>
                                            {bounty.recurrence && bounty.recurrence !== 'none' && (
                                                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--cyan)', border: '1px solid var(--cyan)', padding: '2px 6px' }}>↻ {bounty.recurrence}</span>
                                            )}
                                            {bounty.isInfinite && (
                                                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--magenta)', border: '1px solid var(--magenta)', padding: '2px 6px' }}>∞</span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)', border: '1px solid var(--amber)', padding: '2px 6px' }}>+{bounty.stakeValue} stake</span>
                                            {canEdit && (
                                                <>
                                                    <button style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 4px' }} onClick={() => handleOpenEdit(bounty)} title="Edit">✎</button>
                                                    <button style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 4px' }} onClick={() => handleDeleteBounty(bounty.bountyID)} title="Delete">✕</button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Title */}
                                    <Link href={`/dashboard/activities/bounties/${bounty.bountyID}`} style={{ textDecoration: 'none' }}>
                                        <div style={{ color: 'var(--text-bright)', fontSize: 13, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}
                                            onMouseEnter={e => e.currentTarget.style.color = 'var(--green)'}
                                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-bright)'}>
                                            {bounty.title}
                                        </div>
                                    </Link>

                                    {/* Description */}
                                    <div style={{ color: 'var(--text-mid)', fontSize: 11, lineHeight: 1.6, flex: 1, marginBottom: 12, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                                        {bounty.description}
                                    </div>

                                    {/* Reward + assignee */}
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: bounty.rewardType === 'hours' ? 'var(--green)' : 'var(--magenta)', border: `1px solid ${bounty.rewardType === 'hours' ? 'var(--green)' : 'var(--magenta)'}`, padding: '2px 6px' }}>
                                            {bounty.rewardType === 'hours' ? `⏱ ${bounty.rewardValue}h` : bounty.rewardValue}
                                        </span>
                                        {bounty.assignedTo && !bounty.isInfinite && (
                                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', border: '1px solid var(--bd)', padding: '2px 6px' }}>
                                                @ {bounty.assignedToUsername || bounty.assignedTo}
                                            </span>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <Link href={`/dashboard/activities/bounties/${bounty.bountyID}`} className="btn btn--ghost btn--sm" style={{ fontSize: 10, textAlign: 'center', justifyContent: 'center' }}>
                                            $ view details
                                        </Link>

                                        {bounty.isInfinite ? (
                                            <>
                                                {canEdit && (
                                                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => { setSelectedBountyForClaims(bounty); setOpenClaims(true); }}>
                                                        $ view claims ({bounty.claims?.length || 0})
                                                    </button>
                                                )}
                                                {!userClaim && <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={() => handleClaim(bounty.bountyID)}>$ claim</button>}
                                                {userClaim?.status === 'assigned' && <button className="btn btn--amber btn--sm" style={{ fontSize: 10 }} onClick={() => { setSubmittingBountyId(bounty.bountyID); setSubmissionNote(''); setOpenSubmit(true); }}>$ submit work</button>}
                                                {userClaim?.status === 'completed' && <button className="btn btn--sm" style={{ fontSize: 10 }} disabled>$ pending verification</button>}
                                                {userClaim?.status === 'verified' && <button className="btn btn--sm" style={{ fontSize: 10, color: 'var(--green)', borderColor: 'var(--green)' }} disabled>✓ verified</button>}
                                            </>
                                        ) : (
                                            <>
                                                {bounty.status === 'open' && <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={() => handleClaim(bounty.bountyID)}>$ claim bounty</button>}
                                                {bounty.status === 'assigned' && bounty.assignedTo === session?.user?.userID && (
                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <button className="btn btn--amber btn--sm" style={{ fontSize: 10, flex: 1 }} onClick={() => { setSubmittingBountyId(bounty.bountyID); setSubmissionNote(''); setOpenSubmit(true); }}>$ submit work</button>
                                                        {canClawback && <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => handleClawback(bounty.bountyID)} title="Unassign">↩</button>}
                                                    </div>
                                                )}
                                                {bounty.status === 'assigned' && bounty.assignedTo !== session?.user?.userID && (
                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <button className="btn btn--ghost btn--sm" style={{ fontSize: 10, flex: 1 }} disabled>assigned</button>
                                                        {canClawback && <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => handleClawback(bounty.bountyID)} title="Unassign">↩</button>}
                                                    </div>
                                                )}
                                                {bounty.status === 'completed' && canEdit && (
                                                    <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--green)', color: 'var(--green)' }} onClick={() => handleVerify(bounty.bountyID)}>$ verify & award</button>
                                                )}
                                                {bounty.status === 'completed' && !canEdit && (
                                                    <button className="btn btn--sm" style={{ fontSize: 10 }} disabled>$ pending verification</button>
                                                )}
                                                {bounty.status === 'verified' && (
                                                    <button className="btn btn--sm" style={{ fontSize: 10, color: 'var(--green)', borderColor: 'var(--green)' }} disabled>✓ verified</button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} disabled={page <= 1} onClick={() => { fetchBounties(1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>«</button>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} disabled={page <= 1} onClick={() => { fetchBounties(page - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>‹</button>
                    <span style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--mono)', padding: '0 8px' }}>{page} / {totalPages}</span>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} disabled={page >= totalPages} onClick={() => { fetchBounties(page + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>›</button>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} disabled={page >= totalPages} onClick={() => { fetchBounties(totalPages); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>»</button>
                </div>
            )}

            {/* Mobile feed FAB */}
            <button
                className="btn btn--filled"
                style={{ position: 'fixed', bottom: 24, right: 24, fontSize: 11, display: 'none' }}
                id="bounty-feed-fab"
                onClick={() => router.push('/dashboard/activities/bounties/feed')}
            >$ feed</button>
            <style>{`@media (max-width: 768px) { #bounty-feed-fab { display: flex !important; } }`}</style>

            {/* Create / Edit dialog */}
            <Modal
                open={openCreate}
                onClose={() => setOpenCreate(false)}
                title={editMode ? 'edit bounty' : 'create bounty'}
                footer={<>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setOpenCreate(false)}>cancel</button>
                    <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={handleSubmitBounty}>{editMode ? '$ save changes' : '$ create bounty'}</button>
                </>}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>TITLE</label>
                        <input className="input" value={newBounty.title} onChange={e => setNewBounty(p => ({ ...p, title: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>DESCRIPTION</label>
                        <textarea className="input" rows={3} value={newBounty.description} onChange={e => setNewBounty(p => ({ ...p, description: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }} />
                    </div>

                    {/* Image upload */}
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>IMAGE (optional)</label>
                        <label style={{ display: 'block', cursor: 'pointer' }}>
                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                            <span className="btn btn--ghost btn--sm" style={{ fontSize: 10, display: 'inline-flex' }}>
                                {uploading ? '$ uploading...' : '$ upload image'}
                            </span>
                        </label>
                        {newBounty.imageUrl && (
                            <div style={{ position: 'relative', marginTop: 8, display: 'inline-block' }}>
                                <img src={newBounty.imageUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }} />
                                <button onClick={() => setNewBounty(p => ({ ...p, imageUrl: '' }))} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.7)', border: 'none', color: 'var(--red)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 14, lineHeight: 1, padding: '2px 6px' }}>×</button>
                            </div>
                        )}
                    </div>

                    {/* Admin-only fields */}
                    {isAdmin && (
                        <>
                            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 12, color: 'var(--text-mid)' }}>
                                <input type="checkbox" checked={newBounty.isInfinite || false} onChange={e => setNewBounty(p => ({ ...p, isInfinite: e.target.checked }))} />
                                infinite claims (multi-user)
                            </label>
                            {newBounty.isInfinite && (
                                <div>
                                    <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>END_DATE (optional)</label>
                                    <input className="input" type="date" value={newBounty.endsAt || ''} onChange={e => setNewBounty(p => ({ ...p, endsAt: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' }} />
                                </div>
                            )}
                            <div>
                                <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>RECURRENCE</label>
                                <select className="input" value={newBounty.recurrence || 'none'} onChange={e => setNewBounty(p => ({ ...p, recurrence: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' }}>
                                    <option value="none">none (one-time)</option>
                                    <option value="daily">daily</option>
                                    <option value="weekly">weekly</option>
                                    <option value="monthly">monthly</option>
                                </select>
                            </div>
                        </>
                    )}

                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>REWARD_TYPE</label>
                        <select className="input" value={newBounty.rewardType} onChange={e => setNewBounty(p => ({ ...p, rewardType: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' }}>
                            <option value="custom">custom reward</option>
                            {isAdmin && <option value="hours">volunteer hours</option>}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>
                            {newBounty.rewardType === 'hours' ? 'HOURS_AMOUNT' : 'REWARD_DESCRIPTION'}
                        </label>
                        <input className="input" type={newBounty.rewardType === 'hours' ? 'number' : 'text'} value={newBounty.rewardValue} onChange={e => setNewBounty(p => ({ ...p, rewardValue: e.target.value }))} placeholder={newBounty.rewardType === 'hours' ? '2' : 'e.g. $5 credit, lunch, high five'} style={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>ADDITIONAL_STAKE (optional)</label>
                        <input className="input" type="number" value={newBounty.stakeValue} onChange={e => setNewBounty(p => ({ ...p, stakeValue: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' }} />
                        <div style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 4 }}>base stake: 3 · total: {3 + (Number(newBounty.stakeValue) || 0)}</div>
                    </div>
                </div>
            </Modal>

            {/* Submit work dialog */}
            <Modal
                open={openSubmit}
                onClose={() => setOpenSubmit(false)}
                title="submit work"
                footer={<>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setOpenSubmit(false)}>cancel</button>
                    <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={handleSubmitWork}>$ submit for verification</button>
                </>}
            >
                <p style={{ color: 'var(--text-mid)', fontSize: 12, lineHeight: 1.7, marginBottom: 14 }}>
                    Briefly describe your work or paste a link to the PR/document.
                </p>
                <div>
                    <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>SUBMISSION_NOTES</label>
                    <textarea className="input" rows={4} value={submissionNote} onChange={e => setSubmissionNote(e.target.value)} placeholder="what did you do?" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }} />
                </div>
            </Modal>

            {/* Claims dialog (infinite bounties) */}
            <Modal
                open={openClaims}
                onClose={() => setOpenClaims(false)}
                title={`claims — ${selectedBountyForClaims?.title || ''}`}
                footer={<button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setOpenClaims(false)}>close</button>}
            >
                {(!selectedBountyForClaims?.claims || selectedBountyForClaims.claims.length === 0) ? (
                    <div style={{ color: 'var(--text-dim)', fontSize: 12 }}><span style={{ color: 'var(--green)' }}>&gt;</span> no claims yet.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {selectedBountyForClaims.claims.map(claim => (
                            <div key={claim.claimID} style={{ borderBottom: '1px solid var(--bd)', padding: '14px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ color: 'var(--text)', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{claim.username || claim.userID}</div>
                                    <div style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: claim.submission ? 8 : 0 }}>status: {claim.status}</div>
                                    {claim.submission?.note && (
                                        <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-1)', padding: '8px 10px', fontSize: 11, color: 'var(--text-mid)', lineHeight: 1.6 }}>
                                            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 4 }}>SUBMISSION</div>
                                            {claim.submission.note}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                    {claim.status === 'completed' && (
                                        <button className="btn btn--sm" style={{ fontSize: 9, borderColor: 'var(--green)', color: 'var(--green)' }} onClick={() => handleVerify(selectedBountyForClaims.bountyID, claim.userID)}>✓ verify</button>
                                    )}
                                    {claim.status === 'verified' && (
                                        <span style={{ fontSize: 9, color: 'var(--green)', fontFamily: 'var(--mono)' }}>verified</span>
                                    )}
                                    <button style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12 }} onClick={() => handleClawbackClaim(selectedBountyForClaims.bountyID, claim.userID)} title="Remove claim">✕</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Modal>
        </div>
    );
}
