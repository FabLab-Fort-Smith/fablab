'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoadingTerminal from '@/app/components/LoadingTerminal';
import WaysToEarnStake from '@/app/components/dashboard/WaysToEarnStake';
import Announcements from '@/app/components/dashboard/Announcements';
import { UnlockButton, UnlockAndCheckInButton, CheckInButton } from '@/app/components/dashboard/LabControls';

const LOADING_STEPS = ['initializing...', 'loading user data...', 'fetching membership...', 'connecting to database...', 'retrieving session...', 'ready.'];

const MEMBERSHIP_STEPS = [
    'account_created', 'submit_application', 'initial_contact', 'onboarding',
    'membership_subscription', 'complete_public_profile', 'volunteer_hours',
    'access_key_issued', 'full_access_granted'
];

const MENU = (uid, role) => [
    { sym: '◈', title: 'profile',       desc: 'personal details',  path: `/dashboard/${uid}/profile` },
    { sym: '⊞', title: 'membership',    desc: 'plans & billing',   path: `/dashboard/${uid}/profile?tab=1` },
    { sym: '⊡', title: 'bounties',      desc: 'earn credits',      path: '/dashboard/activities/bounties' },
    { sym: '◉', title: 'directory',     desc: 'find members',      path: '/dashboard/community/directory' },
    { sym: '◌', title: 'volunteer',     desc: 'log hours',         path: `/dashboard/${uid}/volunteer` },
    { sym: '⊠', title: 'showcase',      desc: 'member projects',   path: '/dashboard/showcase' },
    { sym: '★', title: 'badges',        desc: 'achievements',      path: '/dashboard/resources/badges' },
    { sym: '!', title: 'bug_tracker',   desc: 'report issues',     path: '/dashboard/resources/bugs' },
    { sym: '#', title: 'support',       desc: 'get help',          href: '/api/v1/discord/invite' },
    { sym: '▶', title: 'announcements', desc: 'view all',          path: '/dashboard/community/announcements' },
    ...(role === 'admin' ? [
        { sym: '⊟', title: 'bounty_ideas', desc: 'manage ideas',   path: '/dashboard/admin/bounty-ideas', admin: true },
        { sym: '≡', title: 'manage_news',  desc: 'post updates',   path: '/dashboard/admin/announcements', admin: true },
        { sym: 'Ⓟ', title: 'plans',         desc: 'manage plans',   path: '/dashboard/admin/plans', admin: true },
        { sym: '◎', title: 'sq_txns',        desc: 'sq txns',        path: '/dashboard/admin/square-transactions', admin: true },
    ] : []),
];

const STATUS_BANNERS = {
    registered: {
        msg: 'Complete your application to start the membership process.',
        label: '$ ./apply',
        color: 'var(--cyan)',
    },
    applicant: {
        msg: "Application received — we'll reach out within 3-5 business days.",
        label: '$ view status',
        color: 'var(--cyan)',
    },
    contacted: {
        msg: 'A team member has been in touch. Your next step is the in-person orientation.',
        label: '$ view status',
        color: 'var(--green)',
    },
    onboarding: {
        msg: 'Orientation done! Select a membership plan to get your access key.',
        label: '$ select plan',
        color: 'var(--green)',
    },
};

export default function DashboardPage({ params }) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [userData, setUserData] = useState(null);
    const [loadingUser, setLoadingUser] = useState(true);
    const [isCheckedIn, setIsCheckedIn] = useState(false);
    const [checkInLoading, setCheckInLoading] = useState(false);
    const [bannerDismissed, setBannerDismissed] = useState(false);

    useEffect(() => {
        if (!session?.user?.userID) return;
        fetch(`/api/v1/users?userID=${session.user.userID}`, { cache: 'no-store' })
            .then(r => r.ok ? r.json() : {})
            .then(data => { setUserData(data.user); setIsCheckedIn(data.user?.isCheckedIn || false); })
            .catch(() => {})
            .finally(() => setLoadingUser(false));
    }, [session]);

    const handleCheckInToggle = async () => {
        setCheckInLoading(true);
        try {
            const res = await fetch('/api/v1/checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID: session.user.userID, action: isCheckedIn ? 'checkout' : 'checkin' }),
            });
            if (res.ok) setIsCheckedIn(p => !p);
        } catch {}
        finally { setCheckInLoading(false); }
    };

    if (status === 'loading' || loadingUser) return <LoadingTerminal steps={LOADING_STEPS} />;

    const uid = session?.user?.userID || session?.user?.id;
    const role = session?.user?.role;
    const displayName = session?.user?.username || session?.user?.name || 'user';

    // Membership progress
    let activeStep = 0;
    let showProgress = false;
    let showVolunteerNag = false;
    if (userData) {
        showProgress = true;
        const m = userData.membership || {};
        const totalHours = (m.volunteerLog || []).reduce((acc, l) => acc + Number(l.hours), 0);
        const isMember = m.isWaived || (m.sponsorshipExpiresAt && new Date(m.sponsorshipExpiresAt) > new Date());
        showVolunteerNag = totalHours < 4 && (m.accessKey?.issued || m.subscriptionStatus === 'ACTIVE');
        if (!m.applicationDate) activeStep = 1;
        else if (!m.contacted) activeStep = 2;
        else if (!m.onboardingComplete) activeStep = 3;
        else if (m.status === 'onboarding' && !isMember) activeStep = 4;
        else if ((m.status === 'probation' || (m.status === 'onboarding' && isMember)) && (!userData.profileCompleted || !userData.isPublic)) activeStep = 5;
        else if (!m.accessKey?.issued) activeStep = 7;
        else if (m.status !== 'active' && m.status !== 'probation') activeStep = 8;
        else showProgress = false;
    }

    const PROGRESS_ALERTS = {
        1: { msg: 'submit your membership application to get started.', action: () => router.push(`/dashboard/${uid}/onboarding`), label: '$ ./apply' },
        2: { msg: 'application submitted. we will contact you shortly.', action: null },
        3: { msg: 'please visit the fablab for orientation and paperwork.', action: null },
        4: { msg: 'select a membership plan to continue.', action: () => router.push(`/dashboard/${uid}/profile?tab=1`), label: '$ ./plans' },
        5: { msg: 'membership active. complete your public profile.', action: () => router.push(`/dashboard/${uid}/profile?tab=2`), label: '$ ./profile' },
        7: { msg: 'subscription active. contact an admin to get your access key issued.', action: null },
    };

    const menu = MENU(uid, role);

    return (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Announcements />

            {/* Membership status banner */}
            {!bannerDismissed && userData && (() => {
                const memberStatus = userData.membership?.status;
                const applied = searchParams.get('membershipStatus') === 'applied';
                if (applied) {
                    return (
                        <div style={{ border: '1px solid var(--green)', color: 'var(--green)', background: 'rgba(57,255,20,0.05)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 12 }}>
                            <span>✓ Application submitted! We'll reach out within 3-5 business days.</span>
                            <button onClick={() => setBannerDismissed(true)} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
                        </div>
                    );
                }
                const banner = STATUS_BANNERS[memberStatus];
                if (!banner) return null;
                const ctaPath = memberStatus === 'registered'
                    ? `/dashboard/${uid}/onboarding`
                    : memberStatus === 'onboarding'
                    ? `/dashboard/${uid}/profile?tab=1`
                    : `/dashboard/${uid}/profile?tab=1`;
                return (
                    <div style={{ border: `1px solid ${banner.color}`, color: banner.color, background: `color-mix(in srgb, ${banner.color} 5%, transparent)`, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 12 }}>
                        <span>&gt; {banner.msg}</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button className="btn btn--sm" style={{ fontSize: 10, borderColor: banner.color, color: banner.color }} onClick={() => router.push(ctaPath)}>
                                {banner.label}
                            </button>
                            <button onClick={() => setBannerDismissed(true)} style={{ background: 'none', border: 'none', color: banner.color, cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
                        </div>
                    </div>
                );
            })()}

            {/* Header */}
            <div>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 4 }}>
                    <span style={{ color: 'var(--green)' }}>$</span> whoami
                </div>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                    welcome, {displayName}.
                </h1>
            </div>

            {/* Check-in card */}
            <div style={{
                border: `1px solid ${isCheckedIn ? 'var(--green)' : 'var(--bd-1)'}`,
                background: isCheckedIn ? 'rgba(57,255,20,0.04)' : 'var(--bg-card)',
                padding: '16px 20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16,
                boxShadow: isCheckedIn ? '0 0 16px rgba(57,255,20,0.1)' : 'none',
                transition: 'all 0.2s',
            }}>
                <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                        <span className="dot pulse" style={{ background: isCheckedIn ? 'var(--green)' : 'var(--text-dim)', width: 7, height: 7, borderRadius: '50%', display: 'inline-block' }} />
                        <span style={{ color: isCheckedIn ? 'var(--green)' : 'var(--text)', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em' }}>
                            {isCheckedIn ? 'CHECKED IN' : 'NOT CHECKED IN'}
                        </span>
                    </div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                        {isCheckedIn ? "don't forget to check out when you leave." : "ready to make something?"}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {isCheckedIn ? (
                        <button className="btn btn--red btn--sm" onClick={handleCheckInToggle} disabled={checkInLoading} style={{ fontSize: 10 }}>
                            {checkInLoading ? '$ checking out...' : '$ check out'}
                        </button>
                    ) : userData?.membership?.type === 'community' ? (
                        <CheckInButton onCheckIn={handleCheckInToggle} checkInLoading={checkInLoading} style={{ fontSize: 10 }} />
                    ) : (
                        <>
                            <UnlockAndCheckInButton onCheckIn={handleCheckInToggle} checkInLoading={checkInLoading} style={{ fontSize: 10 }} />
                            <UnlockButton style={{ fontSize: 10 }} />
                        </>
                    )}
                </div>
            </div>

            {/* Membership progress */}
            {showProgress && (
                <details style={{ border: '1px solid var(--bd-1)', background: 'var(--bg-card)' }}>
                    <summary style={{ padding: '12px 16px', cursor: 'pointer', color: 'var(--green)', fontSize: 11, letterSpacing: '0.08em', fontFamily: 'var(--mono)', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>CO-OP_MEMBERSHIP_PROGRESS</span>
                        <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>step {activeStep}/{MEMBERSHIP_STEPS.length - 1} ▾</span>
                    </summary>
                    <div style={{ padding: '16px', borderTop: '1px solid var(--bd)' }}>
                        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: 4 }}>
                            {MEMBERSHIP_STEPS.map((step, i) => (
                                <div key={step} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 80, padding: '0 4px' }}>
                                        <div style={{
                                            width: 22, height: 22, border: `1px solid ${i < activeStep ? 'var(--green)' : i === activeStep ? 'var(--amber)' : 'var(--bd-1)'}`,
                                            background: i < activeStep ? 'var(--green)' : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 9, color: i < activeStep ? 'var(--bg)' : i === activeStep ? 'var(--amber)' : 'var(--text-dim)',
                                        }}>{i < activeStep ? '✓' : i + 1}</div>
                                        <div style={{ fontSize: 8, color: i === activeStep ? 'var(--amber)' : i < activeStep ? 'var(--green)' : 'var(--text-dim)', textAlign: 'center', letterSpacing: '0.06em', lineHeight: 1.3 }}>
                                            {step.replace(/_/g, ' ')}
                                        </div>
                                    </div>
                                    {i < MEMBERSHIP_STEPS.length - 1 && (
                                        <div style={{ width: 24, height: 1, background: i < activeStep ? 'var(--green)' : 'var(--bd)', flexShrink: 0 }} />
                                    )}
                                </div>
                            ))}
                        </div>
                        {PROGRESS_ALERTS[activeStep] && (
                            <div style={{ marginTop: 16, border: '1px solid var(--bd-1)', background: 'var(--bg-1)', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <div style={{ color: 'var(--text-mid)', fontSize: 12 }}>
                                    <span style={{ color: 'var(--green)' }}>&gt;</span> {PROGRESS_ALERTS[activeStep].msg}
                                </div>
                                {PROGRESS_ALERTS[activeStep].action && (
                                    <button className="btn btn--sm" style={{ fontSize: 10, flexShrink: 0 }} onClick={PROGRESS_ALERTS[activeStep].action}>
                                        {PROGRESS_ALERTS[activeStep].label}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </details>
            )}

            {/* NFC card not yet paired — prompt them to do it */}
            {userData?.membership?.accessKey?.issued && !userData?.membership?.accessKey?.code && (
                <div style={{ border: '1px solid var(--green)', color: 'var(--green)', background: 'rgba(57,255,20,0.05)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 11 }}>
                    <span>&gt; your access key is approved — pair an NFC card at the door panel to start using it.</span>
                    <button className="btn btn--sm" style={{ fontSize: 10, flexShrink: 0, borderColor: 'var(--green)', color: 'var(--green)' }} onClick={() => router.push(`/dashboard/${uid}/profile?tab=1`)}>$ ./pair-card</button>
                </div>
            )}

            {showVolunteerNag && (
                <div style={{ border: '1px solid var(--amber)', color: 'var(--amber)', background: 'rgba(255,170,0,0.05)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 11 }}>
                    <span>&gt; reminder: log your volunteer hours to stay in good standing. 4h/month required.</span>
                    <button className="btn btn--sm" style={{ fontSize: 10, flexShrink: 0, borderColor: 'var(--amber)', color: 'var(--amber)' }} onClick={() => router.push(`/dashboard/${uid}/volunteer`)}>$ ./log-hours</button>
                </div>
            )}

            {/* Ways to earn stake */}
            {userData && <WaysToEarnStake user={userData} />}

            {/* Menu grid */}
            <div>
                <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 12 }}>QUICK_ACCESS</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                    {menu.map(item => (
                        <div
                            key={item.title}
                            className="card"
                            onClick={() => item.href ? window.open(item.href, '_blank') : router.push(item.path)}
                            style={{
                                padding: '16px 14px', cursor: 'pointer', textAlign: 'center',
                                border: item.admin ? '1px solid var(--amber-dim)' : '1px solid var(--bd)',
                                transition: 'border-color 0.12s, box-shadow 0.12s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = item.admin ? 'var(--amber)' : 'var(--green)'; e.currentTarget.style.boxShadow = `0 0 12px ${item.admin ? 'rgba(255,176,0,0.1)' : 'rgba(57,255,20,0.08)'}`; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = item.admin ? 'var(--amber-dim)' : 'var(--bd)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 20, color: item.admin ? 'var(--amber)' : 'var(--green)', marginBottom: 8, textShadow: `0 0 8px ${item.admin ? 'var(--amber)' : 'var(--green)'}` }}>
                                {item.sym}
                            </div>
                            <div style={{ color: 'var(--text)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 4 }}>{item.title}</div>
                            <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>{item.desc}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
