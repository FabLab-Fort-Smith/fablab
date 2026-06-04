'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { uploadFileToS3 } from '@/utils/s3.util';

function Modal({ open, onClose, title, children, footer }) {
    if (!open) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
            <div className="card" style={{ maxWidth: 520, width: '100%', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                <div className="card-header">
                    <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>{title}</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ padding: '20px 24px' }}>{children}</div>
                {footer && <div style={{ padding: '12px 24px', borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>{footer}</div>}
            </div>
        </div>
    );
}

const EMPTY = { id: '', name: '', description: '', icon: '🏅', imageUrl: '', type: 'admin' };
const TYPE_COLOR = { admin: 'var(--text-dim)', system: 'var(--cyan)', bounty: 'var(--magenta)' };

export default function BadgeManagementPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [badges, setBadges] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [currentBadge, setCurrentBadge] = useState(null);
    const [formData, setFormData] = useState(EMPTY);
    const [uploading, setUploading] = useState(false);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        if (status === 'authenticated') {
            if (session.user.role !== 'admin') router.push('/dashboard');
            else fetchBadges();
        }
    }, [status, session, router]);

    const showToast = (msg, color = 'var(--green)') => { setToast({ msg, color }); setTimeout(() => setToast(null), 3000); };

    const fetchBadges = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/badges');
            if (res.ok) { const data = await res.json(); setBadges(data.badges || []); }
        } catch {}
        finally { setLoading(false); }
    };

    const handleOpenDialog = (badge = null) => {
        if (badge) { setCurrentBadge(badge); setFormData({ id: badge.id, name: badge.name, description: badge.description, icon: badge.icon || '', imageUrl: badge.imageUrl || '', type: badge.type || 'admin' }); }
        else { setCurrentBadge(null); setFormData(EMPTY); }
        setDialogOpen(true);
    };

    const handleNameChange = e => {
        const name = e.target.value;
        if (!currentBadge) { const id = name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '_'); setFormData(p => ({ ...p, name, id })); }
        else setFormData(p => ({ ...p, name }));
    };

    const handleImageUpload = async e => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        try { const url = await uploadFileToS3(file, 'badges'); setFormData(p => ({ ...p, imageUrl: url })); }
        catch { showToast('Upload failed.', 'var(--red)'); }
        finally { setUploading(false); }
    };

    const handleSave = async () => {
        try {
            const url = currentBadge ? `/api/v1/badges/${currentBadge.id}` : '/api/v1/badges';
            const method = currentBadge ? 'PUT' : 'POST';
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
            if (res.ok) { fetchBadges(); setDialogOpen(false); showToast('Badge saved.'); }
            else { const d = await res.json(); showToast(d.error || 'Failed.', 'var(--red)'); }
        } catch { showToast('Error.', 'var(--red)'); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this badge? Users who have it will keep it.')) return;
        try {
            const res = await fetch(`/api/v1/badges/${id}`, { method: 'DELETE' });
            if (res.ok) { fetchBadges(); showToast('Deleted.'); }
            else showToast('Failed.', 'var(--red)');
        } catch { showToast('Error.', 'var(--red)'); }
    };

    const filtered = search.trim() ? badges.filter(b => b.name?.toLowerCase().includes(search.toLowerCase()) || b.id?.toLowerCase().includes(search.toLowerCase()) || b.description?.toLowerCase().includes(search.toLowerCase())) : badges;
    const set = field => e => setFormData(p => ({ ...p, [field]: e.target.value }));

    return (
        <div style={{ padding: '20px 24px' }}>
            {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, background: 'var(--bg-card)', border: `1px solid ${toast.color}`, color: toast.color, padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 12 }}>{toast.msg}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
                <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                        <span style={{ color: 'var(--green)' }}>$</span> ./badges --manage
                    </div>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>badges</h1>
                </div>
                <button className="btn btn--filled" style={{ fontSize: 11 }} onClick={() => handleOpenDialog()}>$ ./create --badge</button>
            </div>

            <div style={{ marginBottom: 16 }}>
                <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="search badges..." style={{ width: '100%', maxWidth: 320, boxSizing: 'border-box', fontSize: 12 }} />
            </div>

            {loading ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading<span className="caret-block" style={{ marginLeft: 4 }} /></div>
            ) : filtered.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>[no badges found]</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                    {filtered.map(badge => (
                        <div key={badge.id} className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                            <div style={{ width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, background: 'var(--bg-1)', border: '1px solid var(--bd)' }}>
                                {badge.imageUrl
                                    ? <img src={badge.imageUrl} alt={badge.name} style={{ maxWidth: 56, maxHeight: 56, objectFit: 'contain' }} />
                                    : <span style={{ fontSize: 36 }}>{badge.icon || '🏅'}</span>
                                }
                            </div>
                            <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{badge.name}</div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 6 }}>{badge.id}</div>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', color: TYPE_COLOR[badge.type] || 'var(--text-dim)', border: `1px solid ${TYPE_COLOR[badge.type] || 'var(--bd)'}`, padding: '2px 6px', marginBottom: 10 }}>
                                {badge.type?.toUpperCase()}
                            </span>
                            <div style={{ color: 'var(--text-mid)', fontSize: 11, lineHeight: 1.5, flex: 1, marginBottom: 14, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {badge.description}
                            </div>
                            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                                <button className="btn btn--ghost btn--sm" style={{ fontSize: 9, flex: 1 }} onClick={() => handleOpenDialog(badge)}>$ edit</button>
                                <button className="btn btn--sm" style={{ fontSize: 9, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => handleDelete(badge.id)}>✕</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal open={dialogOpen} onClose={() => setDialogOpen(false)} title={currentBadge ? 'edit badge' : 'create badge'}
                footer={<>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setDialogOpen(false)}>cancel</button>
                    <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={handleSave} disabled={uploading}>$ save</button>
                </>}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>NAME</label>
                        <input className="input" value={formData.name} onChange={handleNameChange} placeholder="badge name" style={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>TYPE</label>
                        <select className="input" value={formData.type} onChange={set('type')} style={{ width: '100%', boxSizing: 'border-box' }}>
                            <option value="admin">admin (manual award)</option>
                            <option value="system">system (programmatic)</option>
                            <option value="bounty">bounty (task based)</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>DESCRIPTION</label>
                        <textarea className="input" rows={3} value={formData.description} onChange={set('description')} placeholder="what does this badge mean?" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }} />
                    </div>
                    <div style={{ border: '1px solid var(--bd)', padding: '14px 16px' }}>
                        <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 12 }}>BADGE_IMAGE</div>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <div style={{ width: 64, height: 64, background: 'var(--bg-1)', border: '1px dashed var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {formData.imageUrl ? <img src={formData.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" /> : <span style={{ fontSize: 28 }}>{formData.icon || '?'}</span>}
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <label className="btn btn--ghost btn--sm" style={{ fontSize: 10, cursor: 'pointer', textAlign: 'center' }}>
                                    {uploading ? '$ uploading...' : '$ upload image'}
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} disabled={uploading} />
                                </label>
                                <input className="input" value={formData.icon} onChange={set('icon')} placeholder="or paste emoji icon" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} />
                            </div>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
