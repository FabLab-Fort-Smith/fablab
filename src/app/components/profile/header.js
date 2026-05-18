"use client";
import React, { useState, useRef, useEffect } from 'react';

const TABS = ['User Details', 'Membership', 'Public Profile', 'Settings'];

const UserHeader = ({ onSave, hasChanges, activeTab, setActiveTab, user }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [toast, setToast] = useState(null);
    const menuRef = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleViewProfile = () => {
        if (user?.username) window.open(`/u/${user.username}`, '_blank');
    };

    const handleShareProfile = () => {
        if (user?.username) {
            navigator.clipboard.writeText(`${window.location.origin}/u/${user.username}`);
            setToast('Profile link copied!');
            setTimeout(() => setToast(null), 3000);
        }
    };

    return (
        <>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 12 }}>
                {/* Tab strip */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
                    {TABS.map((label, i) => (
                        <button
                            key={i}
                            onClick={() => setActiveTab(i)}
                            disabled={i === 2 && user?.membership?.status === 'suspended'}
                            style={{ background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === i ? 'var(--green)' : 'transparent'}`, color: activeTab === i ? 'var(--green)' : 'var(--text-dim)', padding: '10px 16px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.08em', whiteSpace: 'nowrap', transition: 'color 0.2s' }}
                        >
                            {label.toUpperCase()}
                        </button>
                    ))}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {user && (
                        <>
                            <button onClick={handleViewProfile} title="View Public Profile" style={{ background: 'none', border: '1px solid var(--bd)', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px 10px', fontSize: 12, fontFamily: 'var(--mono)' }}>↗</button>
                            <button onClick={handleShareProfile} title="Share Profile Link" style={{ background: 'none', border: '1px solid var(--bd)', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px 10px', fontSize: 12, fontFamily: 'var(--mono)' }}>⌗</button>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--amber)', border: '1px solid var(--amber)', padding: '4px 10px' }}>★ {user.stake || 0} Stake</span>
                            {user.badges?.some(b => b.id === 'top-runner') && (
                                <span title="Top Runner: Weekly Arcade Champion" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#ffd700', border: '1px solid #ffd700', padding: '4px 10px' }}>👑 Top Runner</span>
                            )}
                        </>
                    )}

                    {/* Context menu */}
                    <div ref={menuRef} style={{ position: 'relative' }}>
                        <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'none', border: '1px solid var(--bd)', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px 10px', fontSize: 16, fontFamily: 'var(--mono)' }}>⋮</button>
                        {menuOpen && (
                            <div style={{ position: 'absolute', top: '100%', right: 0, background: 'var(--bg-card)', border: '1px solid var(--bd)', zIndex: 100, minWidth: 160, marginTop: 4 }}>
                                <button onClick={() => { onSave(); setMenuOpen(false); }} disabled={!hasChanges} style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: '10px 16px', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 11, color: hasChanges ? 'var(--text)' : 'var(--text-dim)', cursor: hasChanges ? 'pointer' : 'default' }}>
                                    Save Changes
                                </button>
                                {user?.role === 'admin' && (
                                    <button onClick={() => { window.location.href = '/dashboard/admin/bounty-ideas'; setMenuOpen(false); }} style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: '10px 16px', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', cursor: 'pointer', borderTop: '1px solid var(--bd)' }}>
                                        Manage Bounty Ideas
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {toast && (
                <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, border: '1px solid var(--green)', color: 'var(--green)', background: 'var(--bg-card)', padding: '10px 20px', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    ✓ {toast}
                </div>
            )}
        </>
    );
};

export default UserHeader;
