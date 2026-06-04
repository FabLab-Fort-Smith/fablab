'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

function Modal({ open, onClose, title, children, footer }) {
    if (!open) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
            <div className="card" style={{ maxWidth: 560, width: '100%', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
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

const TYPE_COLOR = { info: 'var(--cyan)', warning: 'var(--amber)', alert: 'var(--red)', success: 'var(--green)' };

const EMPTY_FORM = { title: '', content: '', type: 'info', isActive: true, postToDiscord: true };

export default function AnnouncementManagementPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [currentAnnouncement, setCurrentAnnouncement] = useState(null);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        if (status === 'authenticated') {
            if (session.user.role !== 'admin') router.push('/dashboard');
            else fetchAnnouncements();
        } else if (status === 'unauthenticated') router.push('/auth/signin');
    }, [status, session, router]);

    const showToast = (msg, color = 'var(--green)') => {
        setToast({ msg, color });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchAnnouncements = async () => {
        try {
            const res = await fetch('/api/v1/announcements?all=true');
            if (res.ok) setAnnouncements(await res.json());
        } catch {}
        finally { setLoading(false); }
    };

    const handleOpenDialog = (ann = null) => {
        if (ann) {
            setCurrentAnnouncement(ann);
            setFormData({ title: ann.title, content: ann.content, type: ann.type, isActive: ann.isActive, postToDiscord: false });
        } else {
            setCurrentAnnouncement(null);
            setFormData(EMPTY_FORM);
        }
        setDialogOpen(true);
    };

    const handleCloseDialog = () => { setDialogOpen(false); };

    const handleSave = async () => {
        setSaving(true);
        try {
            const url = currentAnnouncement ? `/api/v1/announcements/${currentAnnouncement._id}` : '/api/v1/announcements';
            const method = currentAnnouncement ? 'PUT' : 'POST';
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
            if (res.ok) { fetchAnnouncements(); handleCloseDialog(); showToast('Announcement saved.'); }
            else showToast('Failed to save.', 'var(--red)');
        } catch { showToast('Error saving.', 'var(--red)'); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this announcement?')) return;
        try {
            const res = await fetch(`/api/v1/announcements/${id}`, { method: 'DELETE' });
            if (res.ok) { fetchAnnouncements(); showToast('Deleted.'); }
            else showToast('Failed to delete.', 'var(--red)');
        } catch { showToast('Error.', 'var(--red)'); }
    };

    const set = field => e => setFormData(p => ({ ...p, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

    return (
        <div style={{ padding: '20px 24px' }}>
            {toast && (
                <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, background: 'var(--bg-card)', border: `1px solid ${toast.color}`, color: toast.color, padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {toast.msg}
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
                <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                        <span style={{ color: 'var(--green)' }}>$</span> ./announcements --manage
                    </div>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                        announcements
                    </h1>
                </div>
                <button className="btn btn--filled" style={{ fontSize: 11 }} onClick={() => handleOpenDialog()}>
                    $ ./new --announcement
                </button>
            </div>

            {loading ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading<span className="caret-block" style={{ marginLeft: 4 }} /></div>
            ) : announcements.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>[no announcements]</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                    {announcements.map(ann => (
                        <div key={ann._id} className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', color: TYPE_COLOR[ann.type] || 'var(--text-dim)', border: `1px solid ${TYPE_COLOR[ann.type] || 'var(--bd)'}`, padding: '2px 6px' }}>
                                    {ann.type?.toUpperCase()}
                                </span>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', color: ann.isActive ? 'var(--green)' : 'var(--text-dim)', border: `1px solid ${ann.isActive ? 'var(--green)' : 'var(--bd)'}`, padding: '2px 6px' }}>
                                    {ann.isActive ? 'ACTIVE' : 'INACTIVE'}
                                </span>
                            </div>
                            <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{ann.title}</div>
                            <div style={{ color: 'var(--text-mid)', fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap', flex: 1, marginBottom: 12 }}>{ann.content}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginBottom: 12 }}>
                                {new Date(ann.createdAt).toLocaleDateString()}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn--ghost btn--sm" style={{ fontSize: 9, flex: 1 }} onClick={() => handleOpenDialog(ann)}>$ edit</button>
                                <button className="btn btn--sm" style={{ fontSize: 9, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => handleDelete(ann._id)}>✕ delete</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal open={dialogOpen} onClose={handleCloseDialog} title={currentAnnouncement ? 'edit announcement' : 'new announcement'}
                footer={<>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={handleCloseDialog}>cancel</button>
                    <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={handleSave} disabled={saving}>{saving ? '$ saving...' : '$ save'}</button>
                </>}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>TITLE</label>
                        <input className="input" value={formData.title} onChange={set('title')} placeholder="announcement title" style={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>TYPE</label>
                        <select className="input" value={formData.type} onChange={set('type')} style={{ width: '100%', boxSizing: 'border-box' }}>
                            <option value="info">info</option>
                            <option value="warning">warning</option>
                            <option value="alert">alert</option>
                            <option value="success">success</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>CONTENT</label>
                        <textarea className="input" rows={5} value={formData.content} onChange={set('content')} placeholder="announcement content..." style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 20 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-mid)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={formData.isActive} onChange={set('isActive')} /> active
                        </label>
                        {!currentAnnouncement && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-mid)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={formData.postToDiscord} onChange={set('postToDiscord')} /> post to discord
                            </label>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
}
