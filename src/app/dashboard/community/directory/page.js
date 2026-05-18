'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

function Modal({ open, onClose, title, children, footer }) {
    if (!open) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
            <div className="card" style={{ maxWidth: 480, width: '100%', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                <div className="card-header">
                    <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>{title}</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 18, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ padding: '20px 24px' }}>{children}</div>
                {footer && (
                    <div style={{ padding: '12px 24px', borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function MembersDirectory() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedInterests, setSelectedInterests] = useState([]);
    const [hasAccess, setHasAccess] = useState(false);
    const [allInterests, setAllInterests] = useState([]);
    const [sponsorDialogOpen, setSponsorDialogOpen] = useState(false);
    const [selectedRecipient, setSelectedRecipient] = useState(null);
    const [sponsorshipType, setSponsorshipType] = useState('one-time');
    const [sponsorError, setSponsorError] = useState('');

    useEffect(() => {
        if (status === 'loading') return;
        if (status === 'unauthenticated') { router.push('/auth/signin'); return; }

        fetch(`/api/v1/users?userID=${session.user.userID}`)
            .then(r => r.ok ? r.json() : {})
            .then(userData => {
                const m = userData.user?.membership;
                const access = m?.status === 'active' || m?.status === 'probation' ||
                    m?.isWaived || m?.subscriptionStatus === 'ACTIVE' ||
                    m?.type === 'community' || session.user.role === 'admin';
                setHasAccess(access);
                if (access) return fetchMembers(1);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [status, session, router]);

    const fetchMembers = async (pageNum = 1) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/users?isPublic=true&page=${pageNum}&limit=12`);
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users || []);
                setTotalPages(data.totalPages || 1);
                setPage(data.page || 1);
                const interests = new Set();
                (data.users || []).forEach(u => (u.interests || []).forEach(i => interests.add(i)));
                setAllInterests(Array.from(interests).sort());
            }
        } finally {
            setLoading(false);
        }
    };

    const handlePageChange = (newPage) => {
        fetchMembers(newPage);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSponsorClick = (user) => {
        setSelectedRecipient(user);
        setSponsorshipType('one-time');
        setSponsorError('');
        setSponsorDialogOpen(true);
    };

    const handleConfirmSponsorship = async () => {
        if (!selectedRecipient) return;
        setSponsorError('');
        try {
            const res = await fetch('/api/v1/sponsorship/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipientId: selectedRecipient.userID, donorId: session?.user?.userID, type: sponsorshipType }),
            });
            const data = await res.json();
            if (data.url) window.location.href = data.url;
            else setSponsorError('Failed to create sponsorship link.');
        } catch {
            setSponsorError('An error occurred.');
        }
    };

    const filteredUsers = users.filter(u => {
        const matchesSearch = (u.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (u.firstName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (u.lastName || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesInterests = selectedInterests.length === 0 ||
            selectedInterests.every(i => (u.interests || []).includes(i));
        return matchesSearch && matchesInterests;
    });

    if (loading) return (
        <div style={{ padding: '40px 24px', display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-mid)', fontSize: 12 }}>
            <span className="dot pulse" style={{ background: 'var(--green)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
            loading directory...
        </div>
    );

    if (!hasAccess) return (
        <div style={{ padding: '80px 24px', maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 48, color: 'var(--text-dim)', marginBottom: 16 }}>⊠</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 12 }}>ACCESS_DENIED</div>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: '1.6rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 12 }}>
                membership required
            </h2>
            <p style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 1.7, marginBottom: 24 }}>
                The member directory is exclusive to active members.
            </p>
            <Link href={`/dashboard/${session?.user?.userID}/profile?tab=1`} className="btn btn--filled" style={{ fontSize: 11 }}>
                $ ./view --membership-options
            </Link>
        </div>
    );

    return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                <span style={{ color: 'var(--green)' }}>$</span> ./directory --list --public
            </div>
            <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 8 }}>
                member directory
            </h1>
            <p style={{ color: 'var(--text-mid)', fontSize: 13, marginBottom: 28 }}>
                Connect with makers, creators, and innovators in the community.
            </p>

            {/* Filters */}
            <div style={{ border: '1px solid var(--bd-1)', background: 'var(--bg-card)', padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <input
                    className="input"
                    placeholder="$ search members..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ flex: '1 1 200px', minWidth: 0 }}
                />
                <select
                    className="input"
                    style={{ flex: '1 1 200px', minWidth: 0 }}
                    value=""
                    onChange={e => {
                        if (e.target.value && !selectedInterests.includes(e.target.value))
                            setSelectedInterests(prev => [...prev, e.target.value]);
                    }}
                >
                    <option value="">filter by interest...</option>
                    {allInterests.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
                {selectedInterests.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {selectedInterests.map(i => (
                            <span key={i} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', border: '1px solid var(--green)', padding: '2px 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
                                {i}
                                <button onClick={() => setSelectedInterests(prev => prev.filter(x => x !== i))} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0, fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1 }}>×</button>
                            </span>
                        ))}
                        <button
                            className="btn btn--ghost btn--sm"
                            style={{ fontSize: 9 }}
                            onClick={() => { setSearchTerm(''); setSelectedInterests([]); }}
                        >clear</button>
                    </div>
                )}
            </div>

            {/* Grid */}
            {filteredUsers.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '40px 0' }}>
                    <span style={{ color: 'var(--green)' }}>&gt;</span> no members match your search.
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 28 }}>
                    {filteredUsers.map(u => (
                        <div
                            key={u.userID}
                            className="card"
                            style={{ padding: '24px 18px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                            onClick={() => router.push(`/dashboard/member/${u.userID}`)}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.boxShadow = '0 0 12px rgba(57,255,20,0.08)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bd)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                            {/* Avatar */}
                            <div style={{ width: 64, height: 64, margin: '0 auto 14px', border: '1px solid var(--bd-1)', background: 'var(--bg-elev)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {u.image
                                    ? <img src={u.image} alt={u.username} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(20%)' }} />
                                    : <span style={{ fontFamily: 'var(--display)', fontSize: 22, color: 'var(--green)', letterSpacing: '-0.04em' }}>
                                        {((u.firstName || u.username || '?')[0] + (u.lastName || '')[0]).toUpperCase()}
                                      </span>
                                }
                            </div>

                            <div style={{ color: 'var(--green)', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 4 }}>
                                {u.username || `${u.firstName} ${u.lastName}`}
                            </div>

                            {/* Role / type pills */}
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                                {u.role === 'admin' && (
                                    <span className="pill" style={{ fontSize: 8, color: 'var(--amber)', borderColor: 'var(--amber)' }}>{u.boardPosition || 'admin'}</span>
                                )}
                                <span className="pill" style={{ fontSize: 8 }}>
                                    {u.membership?.type === 'co-op' ? 'co-op' : 'community'}
                                </span>
                            </div>

                            {/* Interests */}
                            {(u.interests || []).length > 0 && (
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                                    {(u.interests || []).slice(0, 3).map(i => (
                                        <span key={i} style={{ fontSize: 9, color: 'var(--text-dim)', border: '1px solid var(--bd)', padding: '1px 6px', fontFamily: 'var(--mono)' }}>{i}</span>
                                    ))}
                                    {(u.interests || []).length > 3 && (
                                        <span style={{ fontSize: 9, color: 'var(--text-dim)', border: '1px solid var(--bd)', padding: '1px 6px', fontFamily: 'var(--mono)' }}>+{u.interests.length - 3}</span>
                                    )}
                                </div>
                            )}

                            {/* Bio */}
                            <div style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.6, flex: 1, marginBottom: 14, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                                {u.bio || 'No bio provided.'}
                            </div>

                            <button
                                className="btn btn--ghost btn--sm"
                                style={{ width: '100%', justifyContent: 'center', fontSize: 10 }}
                                onClick={e => { e.stopPropagation(); handleSponsorClick(u); }}
                            >
                                $ ./sponsor
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', marginTop: 12 }}>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} disabled={page <= 1} onClick={() => handlePageChange(1)}>«</button>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>‹</button>
                    <span style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--mono)', padding: '0 8px' }}>{page} / {totalPages}</span>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}>›</button>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} disabled={page >= totalPages} onClick={() => handlePageChange(totalPages)}>»</button>
                </div>
            )}

            {/* Sponsor dialog */}
            <Modal
                open={sponsorDialogOpen}
                onClose={() => setSponsorDialogOpen(false)}
                title={`sponsor ${selectedRecipient?.firstName || selectedRecipient?.username || ''}`}
                footer={<>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setSponsorDialogOpen(false)}>cancel</button>
                    <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={handleConfirmSponsorship}>$ proceed to checkout</button>
                </>}
            >
                <p style={{ color: 'var(--text-mid)', fontSize: 12, lineHeight: 1.7, marginBottom: 16 }}>
                    Choose how you would like to sponsor this member.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    {[
                        { val: 'one-time', label: 'one-time gift', desc: '$45 for 30 days of access' },
                        { val: 'subscription', label: 'monthly sponsorship', desc: '$45/month, recurring' },
                    ].map(opt => (
                        <label key={opt.val} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', border: `1px solid ${sponsorshipType === opt.val ? 'var(--green)' : 'var(--bd)'}`, padding: '12px 14px', background: sponsorshipType === opt.val ? 'rgba(57,255,20,0.04)' : 'transparent' }}>
                            <input type="radio" name="sponsorType" value={opt.val} checked={sponsorshipType === opt.val} onChange={() => setSponsorshipType(opt.val)} style={{ marginTop: 2 }} />
                            <div>
                                <div style={{ color: sponsorshipType === opt.val ? 'var(--green)' : 'var(--text)', fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{opt.label}</div>
                                <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>{opt.desc}</div>
                            </div>
                        </label>
                    ))}
                </div>
                <div style={{ border: '1px solid var(--bd-1)', background: 'var(--bg-1)', padding: '10px 14px', fontSize: 11, color: 'var(--text-mid)', lineHeight: 1.6 }}>
                    {sponsorshipType === 'one-time'
                        ? 'Single payment. Grants the member 30 days of access.'
                        : 'You are billed $45/month. Access continues while your subscription is active.'}
                </div>
                {sponsorError && <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 10 }}>[ERROR] {sponsorError}</div>}
            </Modal>
        </div>
    );
}
