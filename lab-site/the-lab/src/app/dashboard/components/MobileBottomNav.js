"use client";
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function MobileBottomNav() {
    const router = useRouter();
    const pathname = usePathname();
    const { data: session } = useSession();
    const [openPost, setOpenPost] = useState(false);

    let active = -1;
    if (pathname.includes('/dashboard/community/feed')) active = 0;
    else if (pathname.includes('/dashboard/checkin')) active = 1;
    else if (pathname.includes('/dashboard/member/') || pathname.includes('/profile')) active = 3;
    else if (pathname.includes('/dashboard/activities/leaderboard')) active = 4;

    const NAV = [
        { label: 'Feed', icon: '⊞', idx: 0, action: () => router.push('/dashboard/community/feed') },
        { label: 'Check In', icon: '◉', idx: 1, action: () => router.push('/dashboard/checkin') },
        { label: 'Post', icon: '＋', idx: 2, action: () => setOpenPost(true) },
        { label: 'Profile', icon: '◎', idx: 3, action: () => router.push(`/dashboard/${session?.user?.userID}/profile`) },
        { label: 'Rank', icon: '▲', idx: 4, action: () => router.push('/dashboard/activities/leaderboard') },
    ];

    return (
        <>
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, display: 'none', background: 'var(--bg)', borderTop: '1px solid var(--bd)' }} className="mobile-bottom-nav">
                <div style={{ display: 'flex', height: 64 }}>
                    {NAV.map(item => (
                        <button
                            key={item.idx}
                            onClick={item.action}
                            style={{
                                flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                                color: active === item.idx ? 'var(--green)' : 'var(--text-dim)',
                                borderTop: active === item.idx ? '2px solid var(--green)' : '2px solid transparent',
                                fontFamily: 'var(--mono)',
                            }}
                        >
                            <span style={{ fontSize: item.idx === 2 ? 22 : 16, color: item.idx === 2 ? 'var(--green)' : 'inherit' }}>{item.icon}</span>
                            <span style={{ fontSize: 8, letterSpacing: '0.08em' }}>{item.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Post drawer */}
            {openPost && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={() => setOpenPost(false)}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bd)', borderBottom: 'none', padding: '20px 24px 36px', display: 'flex', flexDirection: 'column', gap: 2 }} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 14, textAlign: 'center' }}>CREATE_NEW</div>
                        <button className="btn" style={{ width: '100%', justifyContent: 'flex-start', gap: 12, padding: '14px 18px' }}
                            onClick={() => { setOpenPost(false); router.push('/dashboard/showcase?action=new'); }}>
                            <span style={{ color: 'var(--green)' }}>⊞</span>
                            <span>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>Showcase Project</div>
                                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>Share what you made</div>
                            </span>
                        </button>
                        <button className="btn" style={{ width: '100%', justifyContent: 'flex-start', gap: 12, padding: '14px 18px', marginTop: 8 }}
                            onClick={() => { setOpenPost(false); router.push('/dashboard/activities/bounties?action=new'); }}>
                            <span style={{ color: 'var(--amber)' }}>◎</span>
                            <span>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>Bounty</div>
                                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>Request help or offer a task</div>
                            </span>
                        </button>
                    </div>
                </div>
            )}

            <style>{`@media (max-width: 768px) { .mobile-bottom-nav { display: block !important; } }`}</style>
        </>
    );
}
