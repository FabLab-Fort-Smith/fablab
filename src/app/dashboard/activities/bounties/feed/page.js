"use client";
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function BountiesFeedPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sort, setSort] = useState('latest');
    const [commentText, setCommentText] = useState({});
    const [openShare, setOpenShare] = useState(false);
    const [selectedBounty, setSelectedBounty] = useState(null);
    const [users, setUsers] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [toast, setToast] = useState(null);

    const showToast = (msg, color = 'var(--green)') => { setToast({ msg, color }); setTimeout(() => setToast(null), 3000); };

    useEffect(() => { fetchItems(); }, [sort]);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/bounties?limit=20');
            if (res.ok) {
                const data = await res.json();
                let bounties = data.bounties || [];
                if (sort === 'trending') bounties.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));
                else bounties.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                setItems(bounties);
            }
        } catch {}
        finally { setLoading(false); }
    };

    const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
            const res = await fetch('/api/v1/users');
            if (res.ok) { const data = await res.json(); setUsers((data.users || []).filter(u => u.userID !== session?.user?.userID)); }
        } catch {}
        finally { setLoadingUsers(false); }
    };

    const handleOpenShare = (bounty) => {
        setSelectedBounty(bounty);
        setOpenShare(true);
        if (users.length === 0) fetchUsers();
    };

    const handleCopyLink = () => {
        const link = `${window.location.origin}/dashboard/activities/bounties?highlight=${selectedBounty.bountyID}`;
        navigator.clipboard.writeText(link);
        showToast('Link copied to clipboard!');
        setOpenShare(false);
    };

    const handleShareToUser = async (recipientID) => {
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${selectedBounty.bountyID}&action=share`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ senderID: session.user.userID, recipientID }),
            });
            if (res.ok) { showToast('Bounty shared successfully!'); setOpenShare(false); }
            else throw new Error();
        } catch { showToast('Failed to share bounty.', 'var(--red)'); }
    };

    const handleNativeShare = async () => {
        if (typeof navigator !== 'undefined' && navigator.share) {
            try {
                await navigator.share({ title: selectedBounty.title, text: `Check out this bounty: ${selectedBounty.title}`, url: `${window.location.origin}/dashboard/activities/bounties?highlight=${selectedBounty.bountyID}` });
                setOpenShare(false);
            } catch {}
        }
    };

    const handleLike = async (id) => {
        if (!session) return;
        setItems(prev => prev.map(item => {
            if (item.bountyID !== id) return item;
            const isLiked = item.likes?.includes(session.user.userID);
            const newLikes = isLiked ? item.likes.filter(uid => uid !== session.user.userID) : [...(item.likes || []), session.user.userID];
            return { ...item, likes: newLikes };
        }));
        try {
            await fetch(`/api/v1/bounties?bountyID=${id}&action=like`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userID: session.user.userID }) });
        } catch { fetchItems(); }
    };

    const handleCommentSubmit = async (id) => {
        if (!session || !commentText[id]?.trim()) return;
        const text = commentText[id];
        const newComment = { id: crypto.randomUUID(), userID: session.user.userID, text, createdAt: new Date().toISOString(), user: { firstName: session.user.firstName, lastName: session.user.lastName } };
        setItems(prev => prev.map(item => item.bountyID === id ? { ...item, comments: [...(item.comments || []), newComment] } : item));
        setCommentText(prev => ({ ...prev, [id]: '' }));
        try {
            await fetch(`/api/v1/bounties?bountyID=${id}&action=comment`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userID: session.user.userID, text }) });
        } catch { fetchItems(); }
    };

    return (
        <div style={{ padding: '20px 24px', maxWidth: 600, margin: '0 auto' }}>
            {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, background: 'var(--bg-card)', border: `1px solid ${toast.color}`, color: toast.color, padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 12 }}>{toast.msg}</div>}

            <div style={{ marginBottom: 20 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}><span style={{ color: 'var(--green)' }}>$</span> ./bounties --feed</div>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>bounty feed</h1>
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
                        const isLiked = item.likes?.includes(session?.user?.userID);
                        return (
                            <div key={item.bountyID} style={{ border: '1px solid var(--bd)', marginBottom: 24, background: 'var(--bg-card)' }}>
                                {/* Header */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--bd)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-elev)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-mid)' }}>
                                            {item.creatorUsername?.[0]?.toUpperCase() || '?'}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{item.creatorUsername || 'Unknown'}</div>
                                            <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{item.isInfinite ? 'INFINITE_BOUNTY' : 'SINGLE_CLAIM'}</div>
                                        </div>
                                    </div>
                                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 9 }} onClick={() => router.push(`/dashboard/activities/bounties/${item.bountyID}`)}>···</button>
                                </div>

                                {/* Image or title card */}
                                {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.title} style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', background: 'var(--bg)', cursor: 'pointer', display: 'block' }} onClick={() => router.push(`/dashboard/activities/bounties/${item.bountyID}`)} />
                                ) : (
                                    <div style={{ width: '100%', aspectRatio: '16/9', background: 'rgba(57,255,20,0.03)', border: '1px dashed var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 16 }} onClick={() => router.push(`/dashboard/activities/bounties/${item.bountyID}`)}>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)', textAlign: 'center', wordBreak: 'break-word' }}>{item.title}</div>
                                    </div>
                                )}

                                {/* Actions row */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px' }}>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: isLiked ? 'var(--red)' : 'var(--text-dim)', fontSize: 16, padding: '4px 6px' }} onClick={() => handleLike(item.bountyID)}>
                                            {isLiked ? '♥' : '♡'}
                                        </button>
                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, padding: '4px 6px' }}>💬</button>
                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, padding: '4px 6px' }} onClick={() => handleOpenShare(item)}>↗</button>
                                    </div>
                                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', border: '1px solid var(--green)', padding: '2px 8px' }}>
                                        {item.rewardValue} {item.rewardType}
                                    </span>
                                </div>

                                {/* Likes count */}
                                <div style={{ padding: '0 14px 6px', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{item.likes?.length || 0} likes</div>

                                {/* Caption */}
                                <div style={{ padding: '0 14px 8px', fontSize: 12 }}>
                                    <span style={{ fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>{item.creatorUsername}</span>
                                    <span style={{ color: 'var(--text-mid)' }}>{item.description}</span>
                                </div>

                                {/* Comments */}
                                <div style={{ padding: '0 14px 8px' }}>
                                    {(item.comments || []).length > 2 && (
                                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, cursor: 'pointer' }}>view all {item.comments.length} comments</div>
                                    )}
                                    {(item.comments || []).slice(-2).map(c => (
                                        <div key={c.id} style={{ fontSize: 12, marginBottom: 3 }}>
                                            <span style={{ fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>{c.user?.firstName}</span>
                                            <span style={{ color: 'var(--text-mid)' }}>{c.text}</span>
                                        </div>
                                    ))}
                                    <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginTop: 4 }}>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }).toUpperCase()}</div>

                                    {/* Add comment */}
                                    <div style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid var(--bd)', paddingTop: 10, marginTop: 8, gap: 8 }}>
                                        <input
                                            className="input"
                                            placeholder="Add a comment..."
                                            style={{ flex: 1, fontSize: 11, padding: '4px 8px' }}
                                            value={commentText[item.bountyID] || ''}
                                            onChange={e => setCommentText(p => ({ ...p, [item.bountyID]: e.target.value }))}
                                            onKeyDown={e => e.key === 'Enter' && handleCommentSubmit(item.bountyID)}
                                        />
                                        {commentText[item.bountyID] && (
                                            <button className="btn btn--sm" style={{ fontSize: 9 }} onClick={() => handleCommentSubmit(item.bountyID)}>post</button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Share modal */}
            {openShare && selectedBounty && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setOpenShare(false)}>
                    <div className="card" style={{ maxWidth: 400, width: '100%' }} onClick={e => e.stopPropagation()}>
                        <div className="card-header">
                            <span style={{ color: 'var(--text)', fontSize: 12, fontFamily: 'var(--mono)' }}>SHARE_BOUNTY</span>
                            <button onClick={() => setOpenShare(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18 }}>×</button>
                        </div>
                        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <button className="btn btn--ghost" style={{ justifyContent: 'flex-start', gap: 10, fontSize: 12 }} onClick={handleCopyLink}>
                                <span style={{ color: 'var(--green)' }}>⊞</span> Copy Link
                            </button>
                            {typeof navigator !== 'undefined' && navigator.share && (
                                <button className="btn btn--ghost" style={{ justifyContent: 'flex-start', gap: 10, fontSize: 12 }} onClick={handleNativeShare}>
                                    <span style={{ color: 'var(--cyan)' }}>↗</span> Share via...
                                </button>
                            )}
                            <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-dim)', marginTop: 8, marginBottom: 4 }}>SEND_TO_MEMBER</div>
                            {loadingUsers ? (
                                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading<span className="caret-block" style={{ marginLeft: 4 }} /></div>
                            ) : users.map(u => (
                                <button key={u.userID} className="btn btn--ghost" style={{ justifyContent: 'flex-start', gap: 10, fontSize: 12 }} onClick={() => handleShareToUser(u.userID)}>
                                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-elev)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>{u.firstName?.[0]}</div>
                                    {u.firstName} {u.lastName}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
