"use client";
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';

function ImageCarousel({ images, alt }) {
    const [activeStep, setActiveStep] = useState(0);
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);
    const maxSteps = images?.length || 0;
    if (!images || images.length === 0) return null;
    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        if (distance > 50 && activeStep < maxSteps - 1) setActiveStep(p => p + 1);
        if (distance < -50 && activeStep > 0) setActiveStep(p => p - 1);
    };
    return (
        <div style={{ position: 'relative', background: 'var(--bg)' }}
            onTouchStart={e => { setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); }}
            onTouchMove={e => setTouchEnd(e.targetTouches[0].clientX)}
            onTouchEnd={onTouchEnd}>
            <img src={images[activeStep]} alt={alt} style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block' }} />
            {maxSteps > 1 && (
                <>
                    <button onClick={e => { e.stopPropagation(); setActiveStep(p => p - 1); }} disabled={activeStep === 0}
                        style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: 18, padding: '4px 8px', display: activeStep === 0 ? 'none' : undefined }}>‹</button>
                    <button onClick={e => { e.stopPropagation(); setActiveStep(p => p + 1); }} disabled={activeStep === maxSteps - 1}
                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: 18, padding: '4px 8px', display: activeStep === maxSteps - 1 ? 'none' : undefined }}>›</button>
                    <div style={{ position: 'absolute', bottom: 8, width: '100%', display: 'flex', justifyContent: 'center', gap: 4 }}>
                        {images.map((_, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === activeStep ? '#fff' : 'rgba(255,255,255,0.4)' }} />)}
                    </div>
                </>
            )}
        </div>
    );
}

export default function PostPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const params = useParams();
    const { postID } = params;

    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [commentText, setCommentText] = useState('');
    const [openShare, setOpenShare] = useState(false);
    const [users, setUsers] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [toast, setToast] = useState(null);
    const [tipDialogOpen, setTipDialogOpen] = useState(false);
    const [tipAmount, setTipAmount] = useState(10);
    const [tipLoading, setTipLoading] = useState(false);
    const [tipRecipient, setTipRecipient] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);

    const showToast = (msg, color = 'var(--green)') => { setToast({ msg, color }); setTimeout(() => setToast(null), 3000); };

    useEffect(() => { if (postID) fetchPost(); }, [postID]);

    const fetchPost = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/portfolio?id=${postID}`);
            if (res.ok) { const data = await res.json(); setItem(Array.isArray(data) && data.length > 0 ? data[0] : null); }
        } catch {}
        finally { setLoading(false); }
    };

    const handleLike = async () => {
        if (!session || !item) return;
        const isLiked = item.likes?.includes(session.user.userID);
        const newLikes = isLiked ? item.likes.filter(uid => uid !== session.user.userID) : [...(item.likes || []), session.user.userID];
        setItem(prev => ({ ...prev, likes: newLikes }));
        try { await fetch('/api/v1/portfolio', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, userID: session.user.userID }) }); }
        catch { fetchPost(); }
    };

    const handleCommentSubmit = async () => {
        if (!session || !commentText.trim() || !item) return;
        const text = commentText;
        const newComment = { id: crypto.randomUUID(), userID: session.user.userID, text, createdAt: new Date().toISOString(), user: { firstName: session.user.firstName, lastName: session.user.lastName } };
        setItem(prev => ({ ...prev, comments: [...(prev.comments || []), newComment] }));
        setCommentText('');
        try { await fetch('/api/v1/portfolio?action=comment', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, userID: session.user.userID, action: 'comment', text }) }); }
        catch { fetchPost(); }
    };

    const fetchUsers = async () => {
        if (users.length > 0) return;
        setLoadingUsers(true);
        try { const res = await fetch('/api/v1/users?limit=100'); if (res.ok) { const data = await res.json(); setUsers(data.users || []); } } catch {}
        finally { setLoadingUsers(false); }
    };

    const handleCopyLink = () => { navigator.clipboard.writeText(`${window.location.origin}/dashboard/community/feed/${item.id}`); showToast('Link copied!'); setOpenShare(false); };

    const handleNativeShare = async () => {
        if (typeof navigator !== 'undefined' && navigator.share && item) {
            try { await navigator.share({ title: item.title, text: `Check this out: ${item.title}`, url: `${window.location.origin}/dashboard/community/feed/${item.id}` }); setOpenShare(false); } catch {}
        }
    };

    const handleShareToUser = async (recipientID) => {
        try {
            const res = await fetch('/api/v1/portfolio', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, action: 'share', senderID: session.user.userID, recipientID }) });
            if (res.ok) { showToast('Sent!'); setOpenShare(false); }
        } catch { showToast('Failed to send.', 'var(--red)'); }
    };

    const handleTip = async () => {
        if (!tipRecipient) return;
        setTipLoading(true);
        try {
            const res = await fetch('/api/v1/transactions/tip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receiverId: tipRecipient.userID, amount: parseInt(tipAmount) }) });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            showToast(`Sent ${tipAmount} stake!`);
            setTipDialogOpen(false);
        } catch (err) { showToast(err.message || 'Failed.', 'var(--red)'); }
        finally { setTipLoading(false); }
    };

    if (loading) return (
        <div style={{ padding: '20px 24px' }}><div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading<span className="caret-block" style={{ marginLeft: 4 }} /></div></div>
    );

    if (!item) return (
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 12 }}>[post not found]</div>
            <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => router.push('/dashboard/community/feed')}>← back to feed</button>
        </div>
    );

    const creator = item.creator || {};
    const isLiked = item.likes?.includes(session?.user?.userID);

    return (
        <div style={{ padding: '20px 24px', maxWidth: 680, margin: '0 auto' }}>
            {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, background: 'var(--bg-card)', border: `1px solid ${toast.color}`, color: toast.color, padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 12 }}>{toast.msg}</div>}

            <button className="btn btn--ghost btn--sm" style={{ fontSize: 9, marginBottom: 16 }} onClick={() => router.push('/dashboard/community/feed')}>← back to feed</button>

            <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--bd)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-elev)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-mid)' }}>
                            {creator.firstName?.[0]}{creator.lastName?.[0]}
                        </div>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{creator.firstName} {creator.lastName}</div>
                            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--cyan)' }}>SHARED_PROJECT</div>
                        </div>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 16, padding: '4px 8px' }} onClick={() => setMenuOpen(o => !o)}>···</button>
                        {menuOpen && (
                            <div style={{ position: 'absolute', right: 0, top: '100%', background: 'var(--bg-card)', border: '1px solid var(--bd)', zIndex: 100, minWidth: 110 }}>
                                <button style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 14px', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }} onClick={() => { handleCopyLink(); setMenuOpen(false); }}>copy link</button>
                            </div>
                        )}
                    </div>
                </div>

                <ImageCarousel images={item.imageUrls} alt={item.title} />

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: isLiked ? 'var(--red)' : 'var(--text-dim)', fontSize: 18, padding: '4px 6px' }} onClick={handleLike}>{isLiked ? '♥' : '♡'}</button>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, padding: '4px 6px' }}>💬</button>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, padding: '4px 6px' }} onClick={() => { setOpenShare(true); fetchUsers(); }}>↗</button>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber)', fontSize: 14, padding: '4px 6px' }} onClick={() => { setTipRecipient(creator); setTipAmount(10); setTipDialogOpen(true); }}>★</button>
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--cyan)', border: '1px solid var(--cyan)', padding: '2px 6px' }}>project showcase</span>
                </div>

                {/* Details */}
                <div style={{ padding: '0 16px 12px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{item.likes?.length || 0} likes</div>
                    <div style={{ fontSize: 13 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>{creator.firstName} {creator.lastName}</span>
                        <span style={{ color: 'var(--text-mid)' }}>{item.title} — {item.description}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginTop: 6 }}>
                        {new Date(item.createdAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                </div>

                {/* Full comments */}
                <div style={{ borderTop: '1px solid var(--bd)', padding: '16px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: '0.1em', marginBottom: 12 }}>COMMENTS ({item.comments?.length || 0})</div>
                    {(item.comments || []).map(c => (
                        <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-elev)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, flexShrink: 0 }}>
                                {c.user?.firstName?.[0]}
                            </div>
                            <div>
                                <div style={{ fontSize: 12, marginBottom: 2 }}>
                                    <span style={{ fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>{c.user?.firstName} {c.user?.lastName}</span>
                                    <span style={{ color: 'var(--text-mid)' }}>{c.text}</span>
                                </div>
                                <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{new Date(c.createdAt).toLocaleDateString()}</div>
                            </div>
                        </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <textarea className="input" rows={2} style={{ flex: 1, resize: 'vertical', fontSize: 12 }} placeholder="Add a comment..." value={commentText} onChange={e => setCommentText(e.target.value)} />
                        <button className="btn btn--sm" style={{ fontSize: 10, alignSelf: 'flex-end' }} onClick={handleCommentSubmit} disabled={!commentText.trim()}>post</button>
                    </div>
                </div>
            </div>

            {/* Share modal */}
            {openShare && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setOpenShare(false)}>
                    <div className="card" style={{ maxWidth: 400, width: '100%' }} onClick={e => e.stopPropagation()}>
                        <div className="card-header">
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>SHARE_PROJECT</span>
                            <button onClick={() => setOpenShare(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18 }}>×</button>
                        </div>
                        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <button className="btn btn--ghost" style={{ justifyContent: 'flex-start', gap: 10, fontSize: 12 }} onClick={handleCopyLink}><span style={{ color: 'var(--green)' }}>⊞</span> Copy Link</button>
                            {typeof navigator !== 'undefined' && navigator.share && (
                                <button className="btn btn--ghost" style={{ justifyContent: 'flex-start', gap: 10, fontSize: 12 }} onClick={handleNativeShare}><span style={{ color: 'var(--cyan)' }}>↗</span> Share via...</button>
                            )}
                            <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-dim)', marginTop: 8, marginBottom: 4 }}>SEND_TO_MEMBER</div>
                            {loadingUsers ? <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading...</div> : users.filter(u => u.userID !== session?.user?.userID).map(u => (
                                <button key={u.userID} className="btn btn--ghost" style={{ justifyContent: 'flex-start', gap: 10, fontSize: 12 }} onClick={() => handleShareToUser(u.userID)}>
                                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--bg-elev)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>{u.firstName?.[0]}</div>
                                    {u.firstName} {u.lastName}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Tip modal */}
            {tipDialogOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setTipDialogOpen(false)}>
                    <div className="card" style={{ maxWidth: 380, width: '100%' }} onClick={e => e.stopPropagation()}>
                        <div className="card-header">
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>TIP_STAKE</span>
                            <button onClick={() => setTipDialogOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18 }}>×</button>
                        </div>
                        <div style={{ padding: '16px 20px' }}>
                            <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>STAKE_AMOUNT</label>
                            <input className="input" type="number" min={1} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={tipAmount} onChange={e => setTipAmount(e.target.value)} autoFocus />
                        </div>
                        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setTipDialogOpen(false)}>cancel</button>
                            <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--amber)', color: 'var(--amber)' }} onClick={handleTip} disabled={tipLoading || !tipAmount || parseInt(tipAmount) <= 0}>
                                {tipLoading ? '$ sending...' : `★ send ${tipAmount || 0} stake`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
