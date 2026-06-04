"use client";
import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import StakeLedger from './tabs/StakeLedger';

const SOCIAL_ICONS = { github: '⌥', linkedin: 'in', twitter: '𝕏', instagram: '◎' };

const TABS = [
    { icon: '⊞', label: 'Showcase' },
    { icon: '◈', label: 'Bounties' },
    { icon: '★', label: 'Badges' },
    { icon: '✦', label: 'Interests' },
];

export default function UserProfileView({ user, isPublicView = false }) {
    const router = useRouter();
    const { data: session } = useSession();
    const [tabValue, setTabValue] = useState(0);
    const [showcaseItems, setShowcaseItems] = useState([]);
    const [bounties, setBounties] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [badges, setBadges] = useState({});
    const [tipModal, setTipModal] = useState(false);
    const [tipAmount, setTipAmount] = useState(10);
    const [tipLoading, setTipLoading] = useState(false);
    const [toast, setToast] = useState(null);

    const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 4000); };

    const handleTip = async () => {
        setTipLoading(true);
        try {
            const res = await fetch('/api/v1/transactions/tip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receiverId: user.userID, amount: parseInt(tipAmount) }) });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            showToast(`Successfully tipped ${tipAmount} stake!`, 'success');
            setTipModal(false);
        } catch (err) { showToast(err.message, 'error'); }
        finally { setTipLoading(false); }
    };

    useEffect(() => {
        fetch('/api/v1/badges').then(res => res.json()).then(data => {
            const map = {};
            (data.badges || []).forEach(b => { map[b.id] = b; });
            setBadges(map);
        }).catch(() => {});

        if (user?.userID) {
            fetch(`/api/v1/portfolio?userID=${user.userID}`).then(res => res.json()).then(data => setShowcaseItems(Array.isArray(data) ? data : [])).catch(() => {});
            fetch(`/api/v1/bounties?creatorID=${user.userID}`).then(res => res.json()).then(data => {
                setBounties((data.bounties || []).filter(b => b.creatorID === user.userID));
            }).catch(() => {});
        }
    }, [user]);

    if (!user) return null;

    const getBadgeDetails = (badgeEntry) => {
        const id = typeof badgeEntry === 'object' ? badgeEntry.id : badgeEntry;
        return badges[id] || null;
    };

    const isOwnProfile = session?.user?.userID === user.userID;

    const overlayStyle = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', opacity: 0, transition: 'opacity 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', gap: 8 };

    const EmptyState = ({ icon, title, desc }) => (
        <div style={{ padding: '64px 0', textAlign: 'center' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', border: '2px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24, color: 'var(--text-dim)' }}>{icon}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-bright)', marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{desc}</div>
        </div>
    );

    return (
        <div style={{ width: '100%', minHeight: '100vh', background: 'var(--bg)' }}>
            {toast && (
                <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, border: `1px solid ${toast.type === 'error' ? 'var(--red)' : 'var(--green)'}`, color: toast.type === 'error' ? 'var(--red)' : 'var(--green)', background: 'var(--bg-card)', padding: '10px 20px', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {toast.message}
                </div>
            )}

            {/* Header */}
            <div style={{ padding: '20px 24px', maxWidth: 935, margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, marginBottom: 16 }}>
                    <div style={{ width: 'clamp(77px, 15vw, 150px)', height: 'clamp(77px, 15vw, 150px)', borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--bd)', flexShrink: 0, background: 'var(--bg-1)' }}>
                        <img src={user.image || '/default-avatar.png'} alt={user.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>

                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                            <div style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)' }}>{user.username}</div>
                            {isOwnProfile ? (
                                <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => router.push(`/dashboard/${user.userID}/profile`)}>edit profile</button>
                            ) : isPublicView && session ? (
                                <button className="btn btn--sm btn--filled" style={{ fontSize: 10 }} onClick={() => setTipModal(true)}>★ tip stake</button>
                            ) : isPublicView && (
                                <a href="/login"><button className="btn btn--filled btn--sm" style={{ fontSize: 10 }}>connect</button></a>
                            )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-bright)' }}>{user.firstName} {user.lastName}</span>
                            {user.membership?.type && (
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', color: user.membership.type === 'co-op' ? 'var(--cyan)' : 'var(--text-dim)', border: `1px solid ${user.membership.type === 'co-op' ? 'var(--cyan)' : 'var(--bd)'}`, padding: '2px 6px' }}>
                                    {user.membership.type === 'co-op' ? 'CO-OP MEMBER' : 'COMMUNITY MEMBER'}
                                </span>
                            )}
                        </div>
                        {user.boardPosition && <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600, marginBottom: 6 }}>{user.boardPosition}</div>}
                        {user.bio && <div style={{ fontSize: 13, color: 'var(--text-mid)', whiteSpace: 'pre-wrap', marginBottom: 8, lineHeight: 1.6 }}>{user.bio}</div>}
                        {user.socials?.website && (
                            <a href={user.socials.website.startsWith('http') ? user.socials.website : `https://${user.socials.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)', fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                                ⊕ {user.socials.website.replace(/^https?:\/\//, '')}
                            </a>
                        )}
                    </div>
                </div>

                {/* Social icons row */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    {Object.entries(SOCIAL_ICONS).map(([platform, icon]) => {
                        const url = user.socials?.[platform];
                        if (!url) return null;
                        const href = url.startsWith('http') ? url : `https://${url}`;
                        return (
                            <a key={platform} href={href} target="_blank" rel="noopener noreferrer" style={{ width: 36, height: 36, border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-mid)', textDecoration: 'none', fontSize: 14, transition: 'color 0.2s, border-color 0.2s' }}
                                onMouseEnter={e => { e.currentTarget.style.color = 'var(--green)'; e.currentTarget.style.borderColor = 'var(--green)'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-mid)'; e.currentTarget.style.borderColor = 'var(--bd)'; }}>
                                {icon}
                            </a>
                        );
                    })}
                </div>
            </div>

            <div style={{ borderTop: '1px solid var(--bd)' }} />

            {/* Tab Nav */}
            <div style={{ maxWidth: 935, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'center', borderBottom: '1px solid var(--bd)' }}>
                    {[...TABS, ...(isOwnProfile ? [{ icon: '◑', label: 'Ledger' }] : [])].map((tab, i) => (
                        <button key={i} onClick={() => setTabValue(i)} style={{ flex: 1, background: 'none', border: 'none', borderTop: `2px solid ${tabValue === i ? 'var(--green)' : 'transparent'}`, color: tabValue === i ? 'var(--green)' : 'var(--text-dim)', padding: '12px 8px', cursor: 'pointer', fontSize: 18, transition: 'color 0.2s' }} title={tab.label}>
                            {tab.icon}
                        </button>
                    ))}
                </div>
            </div>

            {/* Showcase Grid */}
            {tabValue === 0 && (
                <div style={{ maxWidth: 935, margin: '0 auto' }}>
                    {showcaseItems.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                            {showcaseItems.map(item => (
                                <div key={item.id} style={{ aspectRatio: '1/1', position: 'relative', cursor: 'pointer', overflow: 'hidden', background: 'var(--bg-1)' }} onClick={() => { setSelectedItem(item); setActiveImageIndex(0); }}
                                    onMouseEnter={e => e.currentTarget.querySelector('.overlay').style.opacity = 1}
                                    onMouseLeave={e => e.currentTarget.querySelector('.overlay').style.opacity = 0}>
                                    {item.imageUrls?.[0] ? (
                                        <img src={item.imageUrls[0]} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 32 }}>⊞</div>
                                    )}
                                    <div className="overlay" style={{ ...overlayStyle }}><span>★ {item.likes?.length || 0}</span></div>
                                </div>
                            ))}
                        </div>
                    ) : <EmptyState icon="⊞" title="Share Photos" desc="When you share photos, they will appear on your profile." />}
                </div>
            )}

            {/* Bounties Grid */}
            {tabValue === 1 && (
                <div style={{ maxWidth: 935, margin: '0 auto' }}>
                    {bounties.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                            {bounties.map(bounty => (
                                <div key={bounty.bountyID} style={{ aspectRatio: '1/1', position: 'relative', cursor: 'pointer', overflow: 'hidden', background: 'var(--bg-1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 8 }} onClick={() => router.push(`/dashboard/activities/bounties/${bounty.bountyID}`)}
                                    onMouseEnter={e => e.currentTarget.querySelector('.overlay').style.opacity = 1}
                                    onMouseLeave={e => e.currentTarget.querySelector('.overlay').style.opacity = 0}>
                                    {bounty.imageUrl ? (
                                        <img src={bounty.imageUrl} alt={bounty.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <>
                                            <div style={{ fontSize: 28, color: 'var(--green)', marginBottom: 8, opacity: 0.8 }}>◈</div>
                                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-bright)', width: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bounty.title}</div>
                                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', border: '1px solid var(--bd)', padding: '2px 6px', marginTop: 6 }}>{bounty.rewardValue}</span>
                                        </>
                                    )}
                                    <div className="overlay" style={{ ...overlayStyle, flexDirection: 'column', gap: 6 }}>
                                        <div style={{ fontSize: 12, fontWeight: 600 }}>{bounty.title}</div>
                                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, border: `1px solid ${bounty.status === 'open' ? 'var(--green)' : 'var(--bd)'}`, color: bounty.status === 'open' ? 'var(--green)' : 'var(--text-dim)', padding: '2px 8px' }}>{bounty.status.toUpperCase()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <EmptyState icon="◈" title="No Bounties" desc="This user hasn't posted any bounties yet." />}
                </div>
            )}

            {/* Badges Grid */}
            {tabValue === 2 && (
                <div style={{ maxWidth: 935, margin: '0 auto' }}>
                    {user.badges && user.badges.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                            {user.badges.map((badgeEntry, index) => {
                                const badge = getBadgeDetails(badgeEntry);
                                if (!badge) return null;
                                const key = `${typeof badgeEntry === 'object' ? badgeEntry.id : badgeEntry}-${index}`;
                                return (
                                    <div key={key} style={{ aspectRatio: '1/1', position: 'relative', overflow: 'hidden', background: 'var(--bg-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        onMouseEnter={e => e.currentTarget.querySelector('.overlay').style.opacity = 1}
                                        onMouseLeave={e => e.currentTarget.querySelector('.overlay').style.opacity = 0}>
                                        {badge.imageUrl ? (
                                            <img src={badge.imageUrl} alt={badge.name} style={{ width: '60%', height: '60%', objectFit: 'contain' }} />
                                        ) : (
                                            <div style={{ fontSize: '4rem' }}>{badge.icon}</div>
                                        )}
                                        <div className="overlay" style={{ ...overlayStyle, flexDirection: 'column', gap: 4, padding: 8 }}>
                                            <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'center' }}>{badge.name}</div>
                                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>{badge.description}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : <EmptyState icon="★" title="No Badges Yet" desc="This user hasn't earned any badges yet." />}
                </div>
            )}

            {/* Interests Grid */}
            {tabValue === 3 && (
                <div style={{ maxWidth: 935, margin: '0 auto' }}>
                    {(user.interests || []).length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                            {(user.interests || []).map((interest, index) => (
                                <div key={index} style={{ aspectRatio: '1/1', position: 'relative', overflow: 'hidden', background: 'var(--bg-1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 8 }}
                                    onMouseEnter={e => e.currentTarget.querySelector('.overlay').style.opacity = 1}
                                    onMouseLeave={e => e.currentTarget.querySelector('.overlay').style.opacity = 0}>
                                    <div style={{ fontSize: 24, color: 'var(--text-dim)', marginBottom: 8, opacity: 0.7 }}>✦</div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-bright)', width: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{interest}</div>
                                    <div className="overlay" style={{ ...overlayStyle, flexDirection: 'column', gap: 8, background: 'rgba(0,0,0,0.8)' }}>
                                        <div style={{ fontSize: 9, letterSpacing: '0.1em', opacity: 0.8 }}>INTEREST</div>
                                        <div style={{ fontSize: 13, fontWeight: 600 }}>{interest}</div>
                                        {isPublicView && session && (
                                            <button style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px 12px', fontSize: 11 }} onClick={e => { e.stopPropagation(); setTipModal(true); }}>★ tip</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <EmptyState icon="✦" title="No Interests Yet" desc="This user hasn't added any interests yet." />}
                </div>
            )}

            {/* Ledger Tab */}
            {tabValue === 4 && isOwnProfile && (
                <StakeLedger stakeHistory={user.stakeHistory} currentStake={user.stake} />
            )}

            {/* Showcase Item Modal */}
            {selectedItem && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', maxWidth: 700, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--bd)' }}>
                            <div style={{ fontFamily: 'var(--display)', fontSize: '1rem', letterSpacing: '-0.03em', color: 'var(--text-bright)' }}>{selectedItem.title}</div>
                            <button onClick={() => setSelectedItem(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
                        </div>
                        <div style={{ padding: '20px' }}>
                            {selectedItem.imageUrls?.length > 0 ? (
                                <div style={{ position: 'relative', background: '#000', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                                    <img src={selectedItem.imageUrls[activeImageIndex]} alt={selectedItem.title} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }} />
                                    {selectedItem.imageUrls.length > 1 && (
                                        <>
                                            {activeImageIndex > 0 && (
                                                <button onClick={() => setActiveImageIndex(p => p - 1)} style={{ position: 'absolute', left: 8, background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', cursor: 'pointer', width: 36, height: 36, fontSize: 16 }}>‹</button>
                                            )}
                                            {activeImageIndex < selectedItem.imageUrls.length - 1 && (
                                                <button onClick={() => setActiveImageIndex(p => p + 1)} style={{ position: 'absolute', right: 8, background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', cursor: 'pointer', width: 36, height: 36, fontSize: 16 }}>›</button>
                                            )}
                                            <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
                                                {selectedItem.imageUrls.map((_, idx) => (
                                                    <div key={idx} onClick={() => setActiveImageIndex(idx)} style={{ width: 8, height: 8, borderRadius: '50%', background: idx === activeImageIndex ? '#fff' : 'rgba(255,255,255,0.4)', cursor: 'pointer' }} />
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-dim)', marginBottom: 16 }}>No images available</div>
                            )}
                            <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 12, lineHeight: 1.6 }}>{selectedItem.description}</div>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)', border: '1px solid var(--green)', padding: '3px 10px' }}>★ {selectedItem.likes?.length || 0} Likes</span>
                                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Posted {new Date(selectedItem.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tip Modal */}
            {tipModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '24px 28px', maxWidth: 380, width: '100%' }}>
                        <div style={{ fontFamily: 'var(--display)', fontSize: '1.1rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 8 }}>Tip Stake to {user.username}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 20 }}>Send some of your stake to show appreciation!</div>
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>STAKE AMOUNT</label>
                            <input className="input" type="number" style={{ width: '100%', boxSizing: 'border-box', fontSize: 14 }} value={tipAmount} onChange={e => setTipAmount(e.target.value)} min="1" />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => setTipModal(false)}>cancel</button>
                            <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={handleTip} disabled={tipLoading || !tipAmount || parseInt(tipAmount) <= 0}>
                                {tipLoading ? 'sending...' : `$ send ${tipAmount || 0} stake`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
