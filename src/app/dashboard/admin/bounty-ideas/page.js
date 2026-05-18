'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

function Modal({ open, onClose, title, children, footer }) {
    if (!open) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
            <div className="card" style={{ maxWidth: 600, width: '100%', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
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

const EMPTY_IDEA = { title: '', description: '', rewardType: 'custom', rewardValue: '', stakeValue: 5, requirements: '', recurrence: 'none', isInfinite: false, imageUrl: '' };

export default function BountyIdeasPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [ideas, setIdeas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [postDialogOpen, setPostDialogOpen] = useState(false);
    const [currentIdea, setCurrentIdea] = useState(null);
    const [formData, setFormData] = useState(EMPTY_IDEA);
    const [postData, setPostData] = useState({});
    const [toast, setToast] = useState(null);

    useEffect(() => {
        if (status === 'authenticated') {
            if (session.user.role !== 'admin') router.push('/dashboard');
            else fetchIdeas();
        } else if (status === 'unauthenticated') router.push('/auth/signin');
    }, [status, session, router]);

    const showToast = (msg, color = 'var(--green)') => { setToast({ msg, color }); setTimeout(() => setToast(null), 3000); };

    const fetchIdeas = async () => {
        try {
            const res = await fetch('/api/v1/bounty-ideas');
            if (res.ok) { const data = await res.json(); setIdeas(data.ideas || []); }
        } catch {}
        finally { setLoading(false); }
    };

    const handleOpenDialog = (idea = null) => {
        if (idea) { setCurrentIdea(idea); setFormData({ ...idea, requirements: Array.isArray(idea.requirements) ? idea.requirements.join('\n') : idea.requirements || '' }); }
        else { setCurrentIdea(null); setFormData(EMPTY_IDEA); }
        setDialogOpen(true);
    };

    const handleSaveIdea = async () => {
        const payload = { ...formData, requirements: typeof formData.requirements === 'string' ? formData.requirements.split('\n').filter(r => r.trim()) : formData.requirements };
        try {
            const url = currentIdea ? `/api/v1/bounty-ideas/${currentIdea.ideaID}` : '/api/v1/bounty-ideas';
            const method = currentIdea ? 'PUT' : 'POST';
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (res.ok) { fetchIdeas(); setDialogOpen(false); showToast('Idea saved.'); }
            else showToast('Failed to save.', 'var(--red)');
        } catch { showToast('Error.', 'var(--red)'); }
    };

    const handleDeleteIdea = async (ideaID) => {
        if (!confirm('Delete this idea?')) return;
        try {
            const res = await fetch(`/api/v1/bounty-ideas/${ideaID}`, { method: 'DELETE' });
            if (res.ok) { fetchIdeas(); showToast('Deleted.'); }
            else showToast('Failed.', 'var(--red)');
        } catch { showToast('Error.', 'var(--red)'); }
    };

    const handleOpenPostDialog = (idea) => {
        setCurrentIdea(idea);
        const now = new Date();
        const nextWeek = new Date(); nextWeek.setDate(now.getDate() + 7);
        setPostData({ ...idea, creatorID: session.user.userID, startsAt: now.toISOString().slice(0, 16), endsAt: nextWeek.toISOString().slice(0, 16) });
        setPostDialogOpen(true);
    };

    const handlePostBounty = async () => {
        try {
            const res = await fetch('/api/v1/bounties', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(postData) });
            if (res.ok) { setPostDialogOpen(false); showToast('Bounty posted! Notifications sent.'); }
            else { const err = await res.json(); showToast(err.error || 'Failed.', 'var(--red)'); }
        } catch { showToast('Error.', 'var(--red)'); }
    };

    const set = field => e => setFormData(p => ({ ...p, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
    const setPost = field => e => setPostData(p => ({ ...p, [field]: e.target.value }));

    return (
        <div style={{ padding: '20px 24px', maxWidth: 1100 }}>
            {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, background: 'var(--bg-card)', border: `1px solid ${toast.color}`, color: toast.color, padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 12 }}>{toast.msg}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => router.back()}>← back</button>
                        <span style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em' }}><span style={{ color: 'var(--green)' }}>$</span> ./bounty-ideas --manage</span>
                    </div>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>bounty ideas</h1>
                </div>
                <button className="btn btn--filled" style={{ fontSize: 11 }} onClick={() => handleOpenDialog()}>$ ./new --idea</button>
            </div>

            {loading ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading<span className="caret-block" style={{ marginLeft: 4 }} /></div>
            ) : ideas.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>[no bounty ideas yet]</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                    {ideas.map(idea => (
                        <div key={idea.ideaID} className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{idea.title}</div>
                            <div style={{ color: 'var(--text-mid)', fontSize: 11, lineHeight: 1.6, marginBottom: 10, flex: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{idea.description}</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--cyan)', border: '1px solid var(--cyan)', padding: '2px 6px' }}>{idea.rewardValue} {idea.rewardType}</span>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)', border: '1px solid var(--amber)', padding: '2px 6px' }}>{idea.stakeValue} stake</span>
                                {idea.recurrence !== 'none' && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-mid)', border: '1px solid var(--bd)', padding: '2px 6px' }}>{idea.recurrence}</span>}
                                {idea.isInfinite && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)', border: '1px solid var(--green)', padding: '2px 6px' }}>∞ claims</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn--sm" style={{ fontSize: 9, borderColor: 'var(--green)', color: 'var(--green)', flex: 1 }} onClick={() => handleOpenPostDialog(idea)}>$ post live</button>
                                <button className="btn btn--ghost btn--sm" style={{ fontSize: 9 }} onClick={() => handleOpenDialog(idea)}>edit</button>
                                <button className="btn btn--sm" style={{ fontSize: 9, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => handleDeleteIdea(idea.ideaID)}>✕</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create/Edit Dialog */}
            <Modal open={dialogOpen} onClose={() => setDialogOpen(false)} title={currentIdea ? 'edit idea' : 'new bounty idea'}
                footer={<>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setDialogOpen(false)}>cancel</button>
                    <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={handleSaveIdea}>$ save</button>
                </>}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>TITLE</label>
                        <input className="input" value={formData.title} onChange={set('title')} placeholder="bounty idea title" style={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>DESCRIPTION</label>
                        <textarea className="input" rows={3} value={formData.description} onChange={set('description')} placeholder="what needs to be done?" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>REWARD_TYPE</label>
                            <select className="input" value={formData.rewardType} onChange={set('rewardType')} style={{ width: '100%', boxSizing: 'border-box' }}>
                                <option value="custom">custom</option>
                                <option value="hours">hours</option>
                                <option value="cash">cash</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>REWARD_VALUE</label>
                            <input className="input" value={formData.rewardValue} onChange={set('rewardValue')} placeholder="e.g. 5 hours" style={{ width: '100%', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>STAKE_VALUE</label>
                            <input className="input" type="number" value={formData.stakeValue} onChange={e => setFormData(p => ({ ...p, stakeValue: Number(e.target.value) }))} style={{ width: '100%', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>RECURRENCE</label>
                            <select className="input" value={formData.recurrence} onChange={set('recurrence')} style={{ width: '100%', boxSizing: 'border-box' }}>
                                <option value="none">none</option>
                                <option value="daily">daily</option>
                                <option value="weekly">weekly</option>
                                <option value="monthly">monthly</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>REQUIREMENTS (one per line)</label>
                        <textarea className="input" rows={4} value={formData.requirements} onChange={set('requirements')} placeholder="submit PR link&#10;get code review&#10;merge approved" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }} />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-mid)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={formData.isInfinite} onChange={set('isInfinite')} />
                        infinite claims (multiple users can claim)
                    </label>
                </div>
            </Modal>

            {/* Post Bounty Dialog */}
            <Modal open={postDialogOpen} onClose={() => setPostDialogOpen(false)} title="post live bounty"
                footer={<>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setPostDialogOpen(false)}>cancel</button>
                    <button className="btn btn--filled btn--sm" style={{ fontSize: 10, borderColor: 'var(--green)', background: 'rgba(57,255,20,0.1)', color: 'var(--green)' }} onClick={handlePostBounty}>$ post --live</button>
                </>}
            >
                <div style={{ border: '1px solid var(--amber)', background: 'rgba(255,170,0,0.05)', padding: '10px 14px', marginBottom: 16, fontSize: 11, color: 'var(--amber)', fontFamily: 'var(--mono)' }}>
                    ⚠ this will create a live bounty and send notifications (email, discord, in-app) immediately.
                </div>
                <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{currentIdea?.title}</div>
                <div style={{ color: 'var(--text-mid)', fontSize: 11, lineHeight: 1.6, marginBottom: 16 }}>{currentIdea?.description}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>STARTS_AT</label>
                        <input className="input" type="datetime-local" value={postData.startsAt || ''} onChange={setPost('startsAt')} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>ENDS_AT</label>
                        <input className="input" type="datetime-local" value={postData.endsAt || ''} onChange={setPost('endsAt')} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} />
                    </div>
                </div>
            </Modal>
        </div>
    );
}
