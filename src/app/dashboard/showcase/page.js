'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { uploadFileToS3 } from '@/utils/s3.util';

function Modal({ open, onClose, title, children, footer }) {
    if (!open) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
            <div className="card" style={{ maxWidth: 520, width: '100%', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
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

function Toast({ msg, onClose }) {
    if (!msg) return null;
    return (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', border: '1px solid var(--green)', background: 'var(--bg-card)', color: 'var(--green)', padding: '10px 18px', fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '0.06em', zIndex: 400, display: 'flex', gap: 16, alignItems: 'center', boxShadow: '0 0 16px rgba(57,255,20,0.2)', whiteSpace: 'nowrap' }}>
            <span>{msg}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 14 }}>×</button>
        </div>
    );
}

function getImageSrc(url) {
    return url?.startsWith('http://') ? `/api/image-proxy?url=${encodeURIComponent(url)}` : url;
}

export default function ShowcasePage() {
    const { data: session } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const action = searchParams.get('action');

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [sort, setSort] = useState('latest');
    const [formData, setFormData] = useState({ title: '', description: '', images: [] });
    const [previewUrls, setPreviewUrls] = useState([]);
    const [commentText, setCommentText] = useState({});
    const [toast, setToast] = useState('');

    // Share state
    const [openShare, setOpenShare] = useState(false);
    const [selectedShowcase, setSelectedShowcase] = useState(null);
    const [shareUsers, setShareUsers] = useState([]);
    const [loadingShareUsers, setLoadingShareUsers] = useState(false);

    useEffect(() => {
        const highlight = searchParams.get('highlight');
        if (highlight && items.length > 0 && !loading) {
            setTimeout(() => {
                const el = document.getElementById(`showcase-${highlight}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.style.transition = 'box-shadow 0.5s';
                    el.style.boxShadow = '0 0 20px rgba(57,255,20,0.4)';
                    setTimeout(() => { el.style.boxShadow = 'none'; }, 3000);
                }
            }, 500);
        }
    }, [items, loading, searchParams]);

    useEffect(() => { fetchItems(); }, [sort]);
    useEffect(() => { if (action === 'new') setOpen(true); }, [action]);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/portfolio?sort=${sort}`);
            if (res.ok) setItems(await res.json());
        } finally { setLoading(false); }
    };

    const handleOpenShare = (item) => {
        setSelectedShowcase(item);
        setOpenShare(true);
        if (shareUsers.length === 0) {
            setLoadingShareUsers(true);
            fetch('/api/v1/users?limit=100')
                .then(r => r.ok ? r.json() : {})
                .then(data => setShareUsers(data.users || []))
                .catch(() => {})
                .finally(() => setLoadingShareUsers(false));
        }
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(`${window.location.origin}/dashboard/showcase/${selectedShowcase.id}`);
        setToast('link copied to clipboard');
        setOpenShare(false);
    };

    const handleNativeShare = async () => {
        if (!navigator.share) return;
        try {
            await navigator.share({ title: selectedShowcase.title, text: `Check out this project: ${selectedShowcase.title}`, url: `${window.location.origin}/dashboard/showcase/${selectedShowcase.id}` });
            setOpenShare(false);
        } catch {}
    };

    const handleShareToUser = async (recipientID) => {
        try {
            const res = await fetch('/api/v1/portfolio', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selectedShowcase.id, userID: session.user.userID, action: 'share', senderID: session.user.userID, recipientID }),
            });
            if (res.ok) { setToast('sent!'); setOpenShare(false); }
            else setToast('failed to send.');
        } catch { setToast('failed to send.'); }
    };

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        setFormData(p => ({ ...p, images: files }));
        setPreviewUrls(prev => { prev.forEach(u => URL.revokeObjectURL(u)); return files.map(f => URL.createObjectURL(f)); });
    };

    const handleSubmit = async () => {
        if (!formData.title || formData.images.length === 0) return;
        setUploading(true);
        try {
            const imageUrls = [];
            for (const file of formData.images) {
                const url = await uploadFileToS3(file);
                if (url) imageUrls.push(url);
            }
            if (imageUrls.length === 0) throw new Error('Upload failed');
            const res = await fetch('/api/v1/portfolio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID: session.user.userID, userName: session.user.username || 'Unknown User', discordId: session.user.discordId, title: formData.title, description: formData.description, imageUrls }),
            });
            if (res.ok) { setOpen(false); setFormData({ title: '', description: '', images: [] }); setPreviewUrls([]); fetchItems(); }
        } catch { setToast('failed to create post. please try again.'); }
        finally { setUploading(false); }
    };

    const handleLike = async (id) => {
        if (!session) return;
        setItems(prev => prev.map(item => {
            if (item.id !== id) return item;
            const isLiked = item.likes?.includes(session.user.userID);
            return { ...item, likes: isLiked ? item.likes.filter(uid => uid !== session.user.userID) : [...(item.likes || []), session.user.userID] };
        }));
        try {
            await fetch('/api/v1/portfolio', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, userID: session.user.userID }) });
        } catch { fetchItems(); }
    };

    const handleCommentSubmit = async (id) => {
        if (!session || !commentText[id]?.trim()) return;
        const text = commentText[id];
        const newComment = { id: crypto.randomUUID(), userID: session.user.userID, text, createdAt: new Date().toISOString(), user: { firstName: session.user.firstName, lastName: session.user.lastName, image: session.user.image } };
        setItems(prev => prev.map(item => item.id === id ? { ...item, comments: [...(item.comments || []), newComment] } : item));
        setCommentText(prev => ({ ...prev, [id]: '' }));
        try {
            await fetch('/api/v1/portfolio', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, userID: session.user.userID, action: 'comment', text }) });
        } catch { fetchItems(); }
    };

    return (
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 0' }}>
            {/* Header */}
            <div style={{ padding: '0 16px', marginBottom: 20 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                    <span style={{ color: 'var(--green)' }}>$</span> ./showcase --feed
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>maker showcase</h1>
                    <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={() => setOpen(true)}>$ post project</button>
                </div>
            </div>

            {/* Sort toggle */}
            <div style={{ padding: '0 16px', marginBottom: 20, display: 'flex', gap: 8 }}>
                {[['latest', '⏱ latest'], ['trending', '⚡ trending']].map(([val, label]) => (
                    <button
                        key={val}
                        onClick={() => setSort(val)}
                        className={sort === val ? 'btn btn--filled btn--sm' : 'btn btn--ghost btn--sm'}
                        style={{ fontSize: 10 }}
                    >{label}</button>
                ))}
            </div>

            {/* Feed */}
            {loading ? (
                <div style={{ padding: '40px 16px', display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-mid)', fontSize: 12 }}>
                    <span className="dot pulse" style={{ background: 'var(--green)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
                    loading showcase...
                </div>
            ) : items.length === 0 ? (
                <div style={{ padding: '40px 16px', color: 'var(--text-dim)', fontSize: 12 }}>
                    <span style={{ color: 'var(--green)' }}>&gt;</span> no projects yet. be the first to post.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {items.map(item => {
                        const isLiked = item.likes?.includes(session?.user?.userID);
                        return (
                            <div key={item.id} id={`showcase-${item.id}`} style={{ borderBottom: '1px solid var(--bd-1)', paddingBottom: 12, marginBottom: 12 }}>
                                {/* Post header */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ width: 32, height: 32, border: '1px solid var(--bd-1)', background: 'var(--bg-elev)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--green)', fontFamily: 'var(--display)', overflow: 'hidden', flexShrink: 0 }}>
                                            {item.user?.image
                                                ? <img src={item.user.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(20%)' }} />
                                                : ((item.user?.firstName || '?')[0]).toUpperCase()
                                            }
                                        </div>
                                        <span style={{ color: 'var(--text)', fontSize: 12, fontWeight: 600 }}>{item.user?.firstName} {item.user?.lastName}</span>
                                    </div>
                                </div>

                                {/* Image */}
                                {item.imageUrls?.[0] && (
                                    <img
                                        src={getImageSrc(item.imageUrls[0])}
                                        alt={item.title}
                                        style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block', background: 'var(--bg-1)', cursor: 'pointer' }}
                                        onClick={() => window.open(item.imageUrls[0], '_blank')}
                                    />
                                )}

                                {/* Action row */}
                                <div style={{ display: 'flex', gap: 4, padding: '8px 12px' }}>
                                    <button
                                        onClick={() => handleLike(item.id)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 16, color: isLiked ? 'var(--red)' : 'var(--text-dim)', padding: '4px 8px' }}
                                    >{isLiked ? '♥' : '♡'}</button>
                                    <button
                                        onClick={() => handleOpenShare(item)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--text-dim)', padding: '4px 8px' }}
                                    >↗</button>
                                </div>

                                {/* Likes */}
                                <div style={{ padding: '0 16px', marginBottom: 6 }}>
                                    <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>{item.likes?.length || 0} likes</span>
                                </div>

                                {/* Caption */}
                                <div style={{ padding: '0 16px', marginBottom: 8 }}>
                                    <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, marginRight: 6 }}>{item.user?.firstName} {item.user?.lastName}</span>
                                    <span style={{ fontSize: 12, color: 'var(--text-mid)' }}>{item.title}{item.description ? ` — ${item.description}` : ''}</span>
                                </div>

                                {/* Comments */}
                                <div style={{ padding: '0 16px' }}>
                                    {(item.comments || []).length > 2 && (
                                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, cursor: 'pointer' }}>
                                            view all {item.comments.length} comments
                                        </div>
                                    )}
                                    {(item.comments || []).slice(-2).map(comment => (
                                        <div key={comment.id} style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 4 }}>
                                            <span style={{ color: 'var(--text)', fontWeight: 600, marginRight: 6 }}>{comment.user?.firstName}</span>
                                            {comment.text}
                                        </div>
                                    ))}

                                    <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: '0.1em', marginBottom: 8, marginTop: 4 }}>
                                        {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }).toUpperCase()}
                                    </div>

                                    {/* Comment input */}
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--bd)', paddingTop: 8 }}>
                                        <input
                                            className="input"
                                            placeholder="add a comment..."
                                            value={commentText[item.id] || ''}
                                            onChange={e => setCommentText(prev => ({ ...prev, [item.id]: e.target.value }))}
                                            onKeyDown={e => { if (e.key === 'Enter') handleCommentSubmit(item.id); }}
                                            style={{ flex: 1, fontSize: 11 }}
                                        />
                                        {commentText[item.id] && (
                                            <button className="btn btn--sm" style={{ fontSize: 10 }} onClick={() => handleCommentSubmit(item.id)}>post</button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Upload dialog */}
            <Modal
                open={open}
                onClose={() => setOpen(false)}
                title="share your project"
                footer={<>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setOpen(false)}>cancel</button>
                    <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={handleSubmit} disabled={uploading}>
                        {uploading ? '$ uploading...' : '$ post project'}
                    </button>
                </>}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>PROJECT_TITLE</label>
                        <input className="input" autoFocus value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>DESCRIPTION</label>
                        <textarea className="input" rows={4} value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }} />
                    </div>
                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--bd-1)', padding: '24px 16px', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 11, letterSpacing: '0.06em' }}>
                            {previewUrls.length > 0 ? `${previewUrls.length} image(s) selected` : '$ upload images'}
                            <input type="file" hidden multiple accept="image/*" onChange={handleFileChange} />
                        </label>
                    </div>
                    {previewUrls.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                            {previewUrls.map((url, i) => (
                                <img key={i} src={url} alt={`preview ${i}`} style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }} />
                            ))}
                        </div>
                    )}
                </div>
            </Modal>

            {/* Share dialog */}
            <Modal
                open={openShare}
                onClose={() => setOpenShare(false)}
                title="share project"
                footer={<button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setOpenShare(false)}>cancel</button>}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    <button
                        onClick={handleCopyLink}
                        style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--bd)', background: 'none', border: 'none', borderBottom: '1px solid var(--bd)', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                    >
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 16, color: 'var(--green)', width: 28, textAlign: 'center' }}>⎘</span>
                        <div>
                            <div style={{ color: 'var(--text)', fontSize: 12, fontWeight: 600 }}>copy link</div>
                            <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>copy link to clipboard</div>
                        </div>
                    </button>

                    {typeof navigator !== 'undefined' && navigator.share && (
                        <button
                            onClick={handleNativeShare}
                            style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--bd)', background: 'none', border: 'none', borderBottom: '1px solid var(--bd)', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                        >
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 16, color: 'var(--cyan)', width: 28, textAlign: 'center' }}>↗</span>
                            <div>
                                <div style={{ color: 'var(--text)', fontSize: 12, fontWeight: 600 }}>share via...</div>
                                <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>use native share sheet</div>
                            </div>
                        </button>
                    )}

                    <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', padding: '12px 0 8px' }}>SEND_TO_MEMBER</div>

                    {loadingShareUsers ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-mid)', fontSize: 12, padding: '12px 0' }}>
                            <span className="dot pulse" style={{ background: 'var(--green)', width: 5, height: 5, borderRadius: '50%', display: 'inline-block' }} />
                            loading members...
                        </div>
                    ) : (
                        <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                            {shareUsers.map(u => (
                                <button
                                    key={u.userID}
                                    onClick={() => handleShareToUser(u.userID)}
                                    style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', background: 'none', border: 'none', borderBottom: '1px solid var(--bd)', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                                >
                                    <div style={{ width: 28, height: 28, background: 'var(--bg-elev)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--green)', flexShrink: 0, overflow: 'hidden' }}>
                                        {u.image ? <img src={u.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (u.firstName?.[0] || '?')}
                                    </div>
                                    <div>
                                        <div style={{ color: 'var(--text)', fontSize: 12 }}>{u.firstName} {u.lastName}</div>
                                        <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>{u.discordId ? 'discord connected' : 'in-app only'}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>

            <Toast msg={toast} onClose={() => setToast('')} />
        </div>
    );
}
