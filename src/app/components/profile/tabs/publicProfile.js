"use client";
import React, { useState, useEffect } from 'react';
import Constants from '@/lib/constants';

const COMMON_INTERESTS = [
    "3D Printing", "Laser Cutting", "CNC Machining", "Woodworking", "Metalworking",
    "Electronics", "Arduino", "Raspberry Pi", "Programming", "Web Development",
    "Graphic Design", "CAD/CAM", "Sewing", "Embroidery", "Vinyl Cutting",
    "Gaming", "Reading", "Hiking", "Cooking", "Traveling", "Photography",
    "Music", "Art", "Gardening", "DIY", "Robotics", "Cosplay", "Board Games"
];

const CREATOR_TYPES = ['Maker', 'Crafter', 'Artist', 'Hacker', 'Other'];

const SOCIAL_PLATFORMS = [
    { key: 'github', label: 'GitHub URL', icon: '⌥' },
    { key: 'linkedin', label: 'LinkedIn URL', icon: 'in' },
    { key: 'twitter', label: 'Twitter/X URL', icon: '𝕏' },
    { key: 'instagram', label: 'Instagram URL', icon: '◎' },
    { key: 'website', label: 'Personal Website', icon: '⊕' },
];

const PublicProfileTab = ({ user, onEdit, setActiveTab }) => {
    const [interestInput, setInterestInput] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [dbBadges, setDbBadges] = useState([]);

    useEffect(() => {
        fetch('/api/v1/badges')
            .then(res => res.ok ? res.json() : { badges: [] })
            .then(data => setDbBadges(data.badges || []))
            .catch(() => {});
    }, []);

    const getBadgeDetails = (badgeId) => {
        const dbBadge = dbBadges.find(b => b.id === badgeId);
        if (dbBadge) return dbBadge;
        const badgeKey = Object.keys(Constants.BADGES || {}).find(key => Constants.BADGES[key].id === badgeId);
        return badgeKey ? Constants.BADGES[badgeKey] : null;
    };

    const handleSocialChange = (platform, value) => {
        onEdit("socials", { ...(user.socials || {}), [platform]: value });
    };

    const toggleCreatorType = (type) => {
        const current = Array.isArray(user.creatorType) ? user.creatorType : (user.creatorType ? [user.creatorType] : []);
        onEdit("creatorType", current.includes(type) ? current.filter(t => t !== type) : [...current, type]);
    };

    const addInterest = (val) => {
        const v = val.trim();
        const current = Array.isArray(user.interests) ? user.interests : [];
        if (v && !current.includes(v)) onEdit("interests", [...current, v]);
        setInterestInput('');
        setShowSuggestions(false);
    };

    const removeInterest = (val) => {
        onEdit("interests", (user.interests || []).filter(i => i !== val));
    };

    const filteredSuggestions = COMMON_INTERESTS.filter(i => i.toLowerCase().includes(interestInput.toLowerCase()) && !(user.interests || []).includes(i));

    const labelStyle = { display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 };

    if (!user?.membership?.onboardingComplete) {
        return (
            <div style={{ padding: '20px 24px' }}>
                <div style={{ border: '1px solid var(--cyan)', color: 'var(--cyan)', padding: '12px 16px', fontSize: 12, fontFamily: 'var(--mono)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <span><strong>Onboarding Required:</strong> Complete the onboarding questionnaire before setting up your public profile.</span>
                    <a href={`/dashboard/${user.userID}/onboarding`} style={{ color: 'var(--cyan)', textDecoration: 'none', fontWeight: 700, fontSize: 11 }}>Go to Questionnaire →</a>
                </div>
            </div>
        );
    }

    const isProfileComplete = user.bio && user.image;

    return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)', marginBottom: 4 }}>
                {isProfileComplete ? "Public Profile Settings" : "Complete Your Public Profile"}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 20 }}>
                {isProfileComplete ? "Manage what information is visible to other members." : "Tell the community about yourself to get started!"}
            </div>

            {!isProfileComplete && (
                <div style={{ marginBottom: 24 }}>
                    <div style={{ border: '1px solid var(--cyan)', color: 'var(--cyan)', padding: '10px 14px', fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 12 }}>
                        ℹ Please complete the questionnaire below to set up your public profile.
                    </div>
                    {!user.image && (
                        <div style={{ border: '1px solid var(--amber)', color: 'var(--amber)', padding: '10px 14px', fontSize: 12, fontFamily: 'var(--mono)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            <span><strong>Profile Picture Required</strong> — go to User Details to upload one.</span>
                            <button className="btn btn--ghost btn--sm" style={{ fontSize: 10, borderColor: 'var(--amber)', color: 'var(--amber)' }} onClick={() => setActiveTab && setActiveTab(0)}>Go to User Details</button>
                        </div>
                    )}
                </div>
            )}

            {user.isPublic !== false && user.username && (
                <div style={{ border: '1px solid rgba(57,255,20,0.2)', background: 'rgba(57,255,20,0.03)', padding: '12px 16px', marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>YOUR PUBLIC PROFILE LINK</div>
                    <a href={`/u/${user.username}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 12, textDecoration: 'none', wordBreak: 'break-all' }}>
                        {typeof window !== 'undefined' ? `${window.location.origin}/u/${user.username}` : `/u/${user.username}`}
                    </a>
                </div>
            )}

            {isProfileComplete && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <div onClick={() => onEdit("isPublic", user.isPublic === false)} style={{ width: 36, height: 20, background: user.isPublic !== false ? 'var(--green)' : 'var(--bg-1)', border: '1px solid var(--bd)', borderRadius: 10, cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                            <div style={{ position: 'absolute', top: 2, left: user.isPublic !== false ? 18 : 2, width: 14, height: 14, background: '#fff', borderRadius: '50%', transition: 'left 0.2s' }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text)' }}>{user.isPublic !== false ? "Profile is Public" : "Profile is Private"}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 20 }}>Profiles are public by default. Toggle to keep your profile private.</div>

                    <div style={{ border: '1px solid var(--bd)', padding: '16px 20px', marginBottom: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-bright)', marginBottom: 12 }}>Earned Badges</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {user.badges && user.badges.length > 0 ? user.badges.map((badgeId) => {
                                const badge = getBadgeDetails(badgeId);
                                if (!badge) return null;
                                return (
                                    <span key={badgeId} title={badge.description} style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)', border: '1px solid var(--green)', padding: '3px 10px' }}>
                                        {badge.imageUrl ? '' : (badge.icon || '')} {badge.name}
                                    </span>
                                );
                            }) : (
                                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No badges earned yet. Complete bounties and volunteer hours to earn them!</div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Bio */}
            <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>BIO</label>
                <textarea className="input" rows={4} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 12 }} value={user.bio || ''} onChange={e => onEdit("bio", e.target.value)} />
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>Tell the community about yourself.</div>
            </div>

            {/* Interests */}
            <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>INTERESTS &amp; SKILLS</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {(user.interests || []).map(i => (
                        <span key={i} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', border: '1px solid var(--green)', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {i} <button type="button" onClick={() => removeInterest(i)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 10, padding: 0 }}>×</button>
                        </span>
                    ))}
                </div>
                <div style={{ position: 'relative' }}>
                    <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} placeholder="Add interests... (press Enter)" value={interestInput}
                        onChange={e => { setInterestInput(e.target.value); setShowSuggestions(true); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (interestInput.trim()) addInterest(interestInput); } }}
                        onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 150)} />
                    {showSuggestions && interestInput && filteredSuggestions.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--bd)', zIndex: 100, maxHeight: 180, overflowY: 'auto' }}>
                            {filteredSuggestions.slice(0, 8).map(s => (
                                <button key={s} type="button" onMouseDown={() => addInterest(s)} style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', borderBottom: '1px solid var(--bd)' }}>{s}</button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Social Links */}
            <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>SOCIAL LINKS</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {SOCIAL_PLATFORMS.map(({ key, label, icon }) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: 'var(--text-dim)', fontSize: 13, width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                            <div style={{ flex: 1 }}>
                                <label style={{ ...labelStyle, marginBottom: 4 }}>{label.toUpperCase()}</label>
                                <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 11 }} value={user.socials?.[key] || ''} onChange={e => handleSocialChange(key, e.target.value)} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Creator Type */}
            <div>
                <label style={labelStyle}>CREATOR TYPE</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {CREATOR_TYPES.map(type => (
                        <button key={type} type="button" onClick={() => toggleCreatorType(type)}
                            className={`btn btn--sm ${(user.creatorType || []).includes(type) ? '' : 'btn--ghost'}`}
                            style={{ fontSize: 10, borderColor: (user.creatorType || []).includes(type) ? 'var(--green)' : undefined, color: (user.creatorType || []).includes(type) ? 'var(--green)' : undefined }}>
                            {type}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PublicProfileTab;
