"use client";
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

const STATUS_COLOR = { open: 'var(--green)', assigned: 'var(--amber)', completed: 'var(--cyan)', verified: 'var(--green)' };

export default function BountyDetailPage() {
    const { data: session } = useSession();
    const params = useParams();
    const router = useRouter();
    const { bountyID } = params;

    const [bounty, setBounty] = useState(null);
    const [loading, setLoading] = useState(true);
    const [openSubmit, setOpenSubmit] = useState(false);
    const [submissionNote, setSubmissionNote] = useState('');
    const [openClaims, setOpenClaims] = useState(false);

    useEffect(() => { if (bountyID) fetchBounty(); }, [bountyID]);

    const fetchBounty = async () => {
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}`);
            if (res.ok) { const data = await res.json(); setBounty(data.bounty); }
        } catch {}
        finally { setLoading(false); }
    };

    const handleClaim = async () => {
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=assign`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userID: session.user.userID }) });
            if (res.ok) fetchBounty();
        } catch {}
    };

    const handleClawback = async () => {
        if (!confirm("Unassign this bounty? It will revert to 'Open'.")) return;
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=clawback`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userID: session.user.userID }) });
            if (res.ok) fetchBounty();
        } catch {}
    };

    const handleSubmitWork = async () => {
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=submit`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userID: session.user.userID, submission: { note: submissionNote } }) });
            if (res.ok) { setOpenSubmit(false); fetchBounty(); }
        } catch {}
    };

    const handleVerify = async (claimUserID = null) => {
        try {
            const body = { verifierID: session.user.userID };
            if (claimUserID) body.claimUserID = claimUserID;
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=verify`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (res.ok) fetchBounty();
        } catch {}
    };

    const handleClawbackClaim = async (claimUserID) => {
        if (!confirm('Remove this claim?')) return;
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=clawback`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userID: session.user.userID, claimUserID }) });
            if (res.ok) fetchBounty();
        } catch {}
    };

    const getUserClaim = () => {
        if (!bounty?.isInfinite || !bounty?.claims) return null;
        return bounty.claims.find(c => c.userID === session?.user?.userID);
    };

    if (loading) return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading<span className="caret-block" style={{ marginLeft: 4 }} /></div>
        </div>
    );

    if (!bounty) return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{ color: 'var(--red)', fontSize: 12, fontFamily: 'var(--mono)' }}>✕ bounty not found.</div>
            <button className="btn btn--ghost btn--sm" style={{ marginTop: 12, fontSize: 10 }} onClick={() => router.back()}>← back</button>
        </div>
    );

    const isCreator = bounty.creatorID === session?.user?.userID;
    const isAdmin = session?.user?.role === 'admin';
    const canEdit = isCreator || isAdmin;
    const canClawback = (isCreator || isAdmin) && bounty.status === 'assigned';
    const statusLabel = bounty.status === 'completed' ? 'PENDING_VERIFICATION' : bounty.status?.toUpperCase();
    const statusColor = STATUS_COLOR[bounty.status] || 'var(--text-dim)';

    return (
        <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>
            {/* Breadcrumb */}
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginBottom: 12 }}>
                <Link href="/dashboard" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>dashboard</Link>
                <span style={{ margin: '0 6px' }}>/</span>
                <Link href="/dashboard/activities/bounties" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>bounties</Link>
                <span style={{ margin: '0 6px' }}>/</span>
                <span style={{ color: 'var(--text)' }}>{bounty.title}</span>
            </div>

            <button className="btn btn--ghost btn--sm" style={{ fontSize: 9, marginBottom: 20 }} onClick={() => router.push('/dashboard/activities/bounties')}>← back to board</button>

            <div style={{ border: `1px solid ${bounty.rewardType === 'hours' ? 'var(--green)' : 'var(--magenta)'}`, background: 'var(--bg-card)' }}>
                {bounty.imageUrl && (
                    <img src={bounty.imageUrl} alt={bounty.title} style={{ width: '100%', maxHeight: 400, objectFit: 'cover', display: 'block', borderBottom: '1px solid var(--bd)' }} />
                )}

                <div style={{ padding: '20px 24px' }}>
                    {/* Status + Recurrence */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: statusColor, border: `1px solid ${statusColor}`, padding: '2px 8px', letterSpacing: '0.1em' }}>{statusLabel}</span>
                            {bounty.recurrence && bounty.recurrence !== 'none' && (
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--cyan)', border: '1px solid var(--cyan)', padding: '2px 8px' }}>↻ {bounty.recurrence}</span>
                            )}
                        </div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)', border: '1px solid var(--amber)', padding: '2px 8px' }}>★ {bounty.stakeValue} Stake</span>
                    </div>

                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: '0 0 16px' }}>{bounty.title}</h1>

                    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--bd)', padding: '14px 18px', marginBottom: 16 }}>
                        <pre style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)', whiteSpace: 'pre-wrap', margin: 0 }}>{bounty.description}</pre>
                    </div>

                    {/* Reward + meta chips */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: bounty.rewardType === 'hours' ? 'var(--green)' : 'var(--magenta)', border: `1px solid ${bounty.rewardType === 'hours' ? 'var(--green)' : 'var(--magenta)'}`, padding: '2px 8px' }}>
                            {bounty.rewardType === 'hours' ? '◷' : '$'} {bounty.rewardValue} {bounty.rewardType}
                        </span>
                        {bounty.isInfinite && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--cyan)', border: '1px solid var(--cyan)', padding: '2px 8px' }}>∞ infinite claims</span>}
                        {bounty.assignedTo && !bounty.isInfinite && (
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', border: '1px solid var(--bd)', padding: '2px 8px' }}>◎ {bounty.assignedToUsername || bounty.assignedTo}</span>
                        )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--bd)', paddingTop: 16 }}>
                        {bounty.isInfinite ? (() => {
                            const userClaim = getUserClaim();
                            return <>
                                {canEdit && <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setOpenClaims(true)}>view claims ({bounty.claims?.length || 0})</button>}
                                {!userClaim && <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={handleClaim}>$ claim bounty</button>}
                                {userClaim?.status === 'assigned' && <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--amber)', color: 'var(--amber)' }} onClick={() => { setSubmissionNote(''); setOpenSubmit(true); }}>$ submit work</button>}
                                {userClaim?.status === 'completed' && <button className="btn btn--sm" style={{ fontSize: 10 }} disabled>pending verification</button>}
                                {userClaim?.status === 'verified' && <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--green)', color: 'var(--green)' }} disabled>✓ verified</button>}
                            </>;
                        })() : <>
                            {bounty.status === 'open' && <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={handleClaim}>$ claim bounty</button>}
                            {bounty.status === 'assigned' && bounty.assignedTo === session?.user?.userID && <>
                                <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--amber)', color: 'var(--amber)' }} onClick={() => { setSubmissionNote(''); setOpenSubmit(true); }}>$ submit work</button>
                                {canClawback && <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={handleClawback}>↩ unassign</button>}
                            </>}
                            {bounty.status === 'assigned' && bounty.assignedTo !== session?.user?.userID && <>
                                <button className="btn btn--sm" style={{ fontSize: 10 }} disabled>assigned</button>
                                {canClawback && <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={handleClawback}>↩ unassign user</button>}
                            </>}
                            {bounty.status === 'completed' && (canEdit
                                ? <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--green)', color: 'var(--green)' }} onClick={() => handleVerify()}>$ verify &amp; award</button>
                                : <button className="btn btn--sm" style={{ fontSize: 10 }} disabled>pending verification</button>
                            )}
                            {bounty.status === 'verified' && <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--green)', color: 'var(--green)' }} disabled>✓ verified</button>}
                        </>}
                    </div>
                </div>
            </div>

            {/* Submit Work Modal */}
            {openSubmit && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setOpenSubmit(false)}>
                    <div className="card" style={{ maxWidth: 480, width: '100%' }} onClick={e => e.stopPropagation()}>
                        <div className="card-header">
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>SUBMIT_WORK</span>
                            <button onClick={() => setOpenSubmit(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18 }}>×</button>
                        </div>
                        <div style={{ padding: '16px 20px' }}>
                            <p style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 12 }}>Provide a description or link to your completed work.</p>
                            <textarea className="input" rows={4} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 12 }} placeholder="Submission notes / PR link..." value={submissionNote} onChange={e => setSubmissionNote(e.target.value)} />
                        </div>
                        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setOpenSubmit(false)}>cancel</button>
                            <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--green)', color: 'var(--green)' }} onClick={handleSubmitWork}>$ submit for verification</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Claims Modal */}
            {openClaims && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setOpenClaims(false)}>
                    <div className="card" style={{ maxWidth: 600, width: '100%', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div className="card-header">
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>CLAIMS — {bounty.title}</span>
                            <button onClick={() => setOpenClaims(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18 }}>×</button>
                        </div>
                        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {!bounty.claims?.length ? (
                                <div style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>[no claims yet]</div>
                            ) : bounty.claims.map(claim => {
                                const claimColor = claim.status === 'verified' ? 'var(--green)' : claim.status === 'completed' ? 'var(--cyan)' : 'var(--text-dim)';
                                return (
                                    <div key={claim.claimID} style={{ border: '1px solid var(--bd)', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{claim.username || claim.userID}</div>
                                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: claimColor, border: `1px solid ${claimColor}`, padding: '1px 5px' }}>{claim.status}</span>
                                            {claim.submission?.note && (
                                                <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg-1)', border: '1px solid var(--bd)', fontSize: 11, color: 'var(--text-mid)' }}>{claim.submission.note}</div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {claim.status === 'completed' && (
                                                <button className="btn btn--sm" style={{ fontSize: 9, borderColor: 'var(--green)', color: 'var(--green)' }} onClick={() => handleVerify(claim.userID)}>verify</button>
                                            )}
                                            <button className="btn btn--sm" style={{ fontSize: 9, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => handleClawbackClaim(claim.userID)}>✕</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
