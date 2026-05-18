"use client";
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

function ImageCarousel({ images, alt, onClick }) {
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
        <div style={{ position: 'relative', width: '100%', background: 'var(--bg)' }}
            onTouchStart={e => { setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); }}
            onTouchMove={e => setTouchEnd(e.targetTouches[0].clientX)}
            onTouchEnd={onTouchEnd}>
            <img src={images[activeStep]} alt={alt} style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', cursor: 'pointer', display: 'block' }} onClick={onClick} />
            {maxSteps > 1 && (
                <>
                    <button onClick={e => { e.stopPropagation(); setActiveStep(p => p - 1); }} disabled={activeStep === 0}
                        style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: 16, padding: '4px 8px', display: activeStep === 0 ? 'none' : undefined }}>‹</button>
                    <button onClick={e => { e.stopPropagation(); setActiveStep(p => p + 1); }} disabled={activeStep === maxSteps - 1}
                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: 16, padding: '4px 8px', display: activeStep === maxSteps - 1 ? 'none' : undefined }}>›</button>
                    <div style={{ position: 'absolute', bottom: 8, width: '100%', display: 'flex', justifyContent: 'center', gap: 4 }}>
                        {images.map((_, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === activeStep ? '#fff' : 'rgba(255,255,255,0.4)' }} />)}
                    </div>
                </>
            )}
        </div>
    );
}

export default function FeedPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sort, setSort] = useState('latest');
    const [commentText, setCommentText] = useState({});
    const [openShare, setOpenShare] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [users, setUsers] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [toast, setToast] = useState(null);
    const [tipDialogOpen, setTipDialogOpen] = useState(false);
    const [tipAmount, setTipAmount] = useState(10);
    const [tipLoading, setTipLoading] = useState(false);
    const [tipRecipient, setTipRecipient] = useState(null);
    const [menuOpen, setMenuOpen] = useState(null);

    const showToast = (msg, color = 'var(--green)') => { setToast({ msg, color }); setTimeout(() => setToast(null), 3000); };

    useEffect(() => { fetchFeed(); }, [sort]);

    useEffect(() => {
        const highlight = searchParams.get('highlight');
        if (highlight && items.length > 0 && !loading) {
            setTimeout(() => {
                const el = document.getElementById(`feed-item-${highlight}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.style.transition = 'box-shadow 0.5s';
                    el.style.boxShadow = '0 0 20px var(--green)';
                    setTimeout(() => { el.style.boxShadow = 'none'; }, 3000);
                }
            }, 500);
        }
    }, [items, loading, searchParams]);

    const fetchFeed = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/feed?limit=20&sort=${sort}`);
            if (res.ok) { const data = await res.json(); setItems(data); }
        } catch {}
        finally { setLoading(false); }
    };

    const handleLike = async (item) => {
        if (!session) return;
        const id = item.type === 'bounty' ? item.bountyID : item.id;
        const endpoint = item.type === 'bounty' ? '/api/v1/bounties' : '/api/v1/portfolio';
        const queryParam = item.type === 'bounty' ? `?bountyID=${id}&action=like` : '';
        const body = item.type === 'bounty' ? { userID: session.user.userID } : { id, userID: session.user.userID };

        setItems(prev => prev.map(i => {
            const iId = i.type === 'bounty' ? i.bountyID : i.id;
            if (iId !== id) return i;
            const isLiked = i.likes?.includes(session.user.userID);
            const newLikes = isLiked ? i.likes.filter(uid => uid !== session.user.userID) : [...(i.likes || []), session.user.userID];
            return { ...i, likes: newLikes };
        }));

        try {
            await fetch(`${endpoint}${queryParam}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        } catch { fetchFeed(); }
    };

    const handleCommentSubmit = async (item) => {
        const id = item.type === 'bounty' ? item.bountyID : item.id;
        if (!session || !commentText[id]?.trim()) return;
        const text = commentText[id];
        const endpoint = item.type === 'bounty' ? '/api/v1/bounties' : '/api/v1/portfolio';
        const queryParam = item.type === 'bounty' ? `?bountyID=${id}&action=comment` : '';
        const body = item.type === 'bounty' ? { userID: session.user.userID, text } : { id, userID: session.user.userID, action: 'comment', text };
        const newComment = { id: crypto.randomUUID(), userID: session.user.userID, text, createdAt: new Date().toISOString(), user: { firstName: session.user.firstName, lastName: session.user.lastName } };
        setItems(prev => prev.map(i => { const iId = i.type === 'bounty' ? i.bountyID : i.id; return iId === id ? { ...i, comments: [...(i.comments || []), newComment] } : i; }));
        setCommentText(prev => ({ ...prev, [id]: '' }));
        try {
            await fetch(`${endpoint}${queryParam}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        } catch { fetchFeed(); }
    };

    const handleOpenShare = (item) => {
        setSelectedItem(item);
        setOpenShare(true);
        if (users.length === 0) fetchUsers();
    };

    const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
            const res = await fetch('/api/v1/users?limit=100');
            if (res.ok) { const data = await res.json(); setUsers(data.users || []); }
        } catch {}
        finally { setLoadingUsers(false); }
    };

    const getItemUrl = (item) => {
        const id = item.type === 'bounty' ? item.bountyID : item.id;
        return item.type === 'bounty'
            ? `${window.location.origin}/dashboard/activities/bounties/${id}`
            : `${window.location.origin}/dashboard/community/feed/${id}`;
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(getItemUrl(selectedItem));
        showToast('Link copied to clipboard!');
        setOpenShare(false);
    };

    const handleNativeShare = async () => {
        if (typeof navigator !== 'undefined' && navigator.share) {
            try { await navigator.share({ title: selectedItem.title, text: `Check this out: ${selectedItem.title}`, url: getItemUrl(selectedItem) }); setOpenShare(false); } catch {}
        }
    };

    const handleShareToUser = async (recipientID) => {
        try {
            const id = selectedItem.type === 'bounty' ? selectedItem.bountyID : selectedItem.id;
            const endpoint = selectedItem.type === 'bounty' ? '/api/v1/bounties' : '/api/v1/portfolio';
            const body = selectedItem.type === 'bounty'
                ? { bountyID: id, action: 'share', senderID: session.user.userID, recipientID }
                : { id, action: 'share', senderID: session.user.userID, recipientID };
            const res = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (res.ok) { showToast('Sent to user!'); setOpenShare(false); }
            else throw new Error();
        } catch { showToast('Failed to send.', 'var(--red)'); }
    };

    const handleTip = async () => {
        if (!tipRecipient) return;
        setTipLoading(true);
        try {
            const res = await fetch('/api/v1/transactions/tip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receiverId: tipRecipient.userID, amount: parseInt(tipAmount) }) });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            showToast(`Tipped ${tipAmount} stake to ${tipRecipient.username}!`);
            setTipDialogOpen(false);
        } catch (err) { showToast(err.message || 'Failed to send tip.', 'var(--red)'); }
        finally { setTipLoading(false); }
    };

    const navigateToItem = (item) => {
        const id = item.type === 'bounty' ? item.bountyID : item.id;
        router.push(item.type === 'bounty' ? `/dashboard/activities/bounties/${id}` : `/dashboard/community/feed/${id}`);
    };

    return (
        <div style={{ padding: '20px 24px', maxWidth: 680, margin: '0 auto' }}>
            {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, background: 'var(--bg-card)', border: `1px solid ${toast.color}`, color: toast.color, padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 12 }}>{toast.msg}</div>}

            <div style={{ marginBottom: 20 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}><span style={{ color: 'var(--green)' }}>$</span> ./feed --live</div>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>the lab feed</h1>
                <p style={{ color: 'var(--text-mid)', fontSize: 12, marginTop: 6 }}>see what's happening in the community.</p>
            </div>

            {/* Sort toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {['latest', 'trending'].map(s => (
                    <button key={s} onClick={() => setSort(s)} className={`btn btn--sm ${sort === s ? '' : 'btn--ghost'}`} style={{ fontSize: 9, borderColor: sort === s ? 'var(--green)' : undefined, color: sort === s ? 'var(--green)' : undefined }}>
                        {s === 'latest' ? '◷ latest' : '↑ trending'}
                    </button>
                ))}
            </div>

            {loading ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading<span className="caret-block" style={{ marginLeft: 4 }} /></div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {items.map(item => {
                        const isBounty = item.type === 'bounty';
                        const id = isBounty ? item.bountyID : item.id;
                        const creator = item.creator || {};
                        const isLiked = item.likes?.includes(session?.user?.userID);

                        return (
                            <div key={`${item.type}-${id}`} id={`feed-item-${id}`} style={{ border: '1px solid var(--bd)', marginBottom: 24, background: 'var(--bg-card)' }}>
                                {/* Header */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--bd)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-elev)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-mid)' }}>
                                            {creator.firstName?.[0]}{creator.lastName?.[0]}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{creator.firstName} {creator.lastName}</div>
                                            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: isBounty ? 'var(--green)' : 'var(--cyan)' }}>
                                                {isBounty ? 'POSTED_BOUNTY' : 'SHARED_PROJECT'}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ position: 'relative' }}>
                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 16, padding: '4px 8px' }} onClick={() => setMenuOpen(menuOpen === id ? null : id)}>···</button>
                                        {menuOpen === id && (
                                            <div style={{ position: 'absolute', right: 0, top: '100%', background: 'var(--bg-card)', border: '1px solid var(--bd)', zIndex: 100, minWidth: 120 }}>
                                                <button style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 14px', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }} onClick={() => { navigateToItem(item); setMenuOpen(null); }}>view post</button>
                                                <button style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 14px', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }} onClick={() => { navigator.clipboard.writeText(getItemUrl(item)); showToast('Link copied!'); setMenuOpen(null); }}>copy link</button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Content */}
                                {isBounty ? (
                                    <div style={{ width: '100%', aspectRatio: '16/9', background: 'rgba(57,255,20,0.03)', border: '1px dashed var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 16, position: 'relative' }}
                                        onClick={() => router.push(`/dashboard/activities/bounties/${id}`)}>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)', textAlign: 'center', wordBreak: 'break-word' }}>{item.title}</div>
                                        <span style={{ position: 'absolute', bottom: 12, right: 12, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)', border: '1px solid var(--green)', padding: '2px 6px' }}>{item.rewardValue} {item.rewardType}</span>
                                    </div>
                                ) : (
                                    <ImageCarousel images={item.imageUrls} alt={item.title} onClick={() => router.push(`/dashboard/community/feed/${id}`)} />
                                )}

                                {/* Actions */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px' }}>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: isLiked ? 'var(--red)' : 'var(--text-dim)', fontSize: 16, padding: '4px 6px' }} onClick={() => handleLike(item)}>
                                            {isLiked ? '♥' : '♡'}
                                        </button>
                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, padding: '4px 6px' }}>💬</button>
                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, padding: '4px 6px' }} onClick={() => handleOpenShare(item)}>↗</button>
                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber)', fontSize: 14, padding: '4px 6px' }} onClick={() => { setTipRecipient(creator); setTipAmount(10); setTipDialogOpen(true); }}>★</button>
                                    </div>
                                    {isBounty && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)', border: '1px solid var(--green)', padding: '2px 6px' }}>{item.rewardValue} {item.rewardType}</span>}
                                </div>

                                {/* Likes + caption + comments */}
                                <div style={{ padding: '0 14px 12px' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{item.likes?.length || 0} likes</div>
                                    <div style={{ fontSize: 12, marginBottom: 6 }}>
                                        <span style={{ fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>{creator.firstName} {creator.lastName}</span>
                                        <span style={{ color: 'var(--text-mid)' }}>{isBounty ? item.description : `${item.title} — ${item.description}`}</span>
                                    </div>
                                    {(item.comments || []).length > 2 && (
                                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, cursor: 'pointer' }}>view all {item.comments.length} comments</div>
                                    )}
                                    {(item.comments || []).slice(-2).map(c => (
                                        <div key={c.id} style={{ fontSize: 12, marginBottom: 3 }}>
                                            <span style={{ fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>{c.user?.firstName}</span>
                                            <span style={{ color: 'var(--text-mid)' }}>{c.text}</span>
                                        </div>
                                    ))}
                                    <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginBottom: 8 }}>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }).toUpperCase()}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid var(--bd)', paddingTop: 8, gap: 8 }}>
                                        <input className="input" placeholder="Add a comment..." style={{ flex: 1, fontSize: 11, padding: '4px 8px' }} value={commentText[id] || ''} onChange={e => setCommentText(p => ({ ...p, [id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleCommentSubmit(item)} />
                                        {commentText[id] && <button className="btn btn--sm" style={{ fontSize: 9 }} onClick={() => handleCommentSubmit(item)}>post</button>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Share modal */}
            {openShare && selectedItem && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setOpenShare(false)}>
                    <div className="card" style={{ maxWidth: 400, width: '100%' }} onClick={e => e.stopPropagation()}>
                        <div className="card-header">
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>SHARE_{selectedItem.type === 'bounty' ? 'BOUNTY' : 'PROJECT'}</span>
                            <button onClick={() => setOpenShare(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18 }}>×</button>
                        </div>
                        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <button className="btn btn--ghost" style={{ justifyContent: 'flex-start', gap: 10, fontSize: 12 }} onClick={handleCopyLink}><span style={{ color: 'var(--green)' }}>⊞</span> Copy Link</button>
                            {typeof navigator !== 'undefined' && navigator.share && (
                                <button className="btn btn--ghost" style={{ justifyContent: 'flex-start', gap: 10, fontSize: 12 }} onClick={handleNativeShare}><span style={{ color: 'var(--cyan)' }}>↗</span> Share via...</button>
                            )}
                            <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-dim)', marginTop: 8, marginBottom: 4 }}>SEND_TO_MEMBER</div>
                            {loadingUsers ? (
                                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading<span className="caret-block" style={{ marginLeft: 4 }} /></div>
                            ) : users.filter(u => u.userID !== session?.user?.userID).map(u => (
                                <button key={u.userID} className="btn btn--ghost" style={{ justifyContent: 'flex-start', gap: 10, fontSize: 12 }} onClick={() => handleShareToUser(u.userID)}>
                                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--bg-elev)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, flexShrink: 0 }}>{u.firstName?.[0]}</div>
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
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>TIP_STAKE — {tipRecipient?.username}</span>
                            <button onClick={() => setTipDialogOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18 }}>×</button>
                        </div>
                        <div style={{ padding: '16px 20px' }}>
                            <p style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 12 }}>Send some of your stake to show appreciation!</p>
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
