'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Constants from '@/lib/constants';

export default function WaysToEarnStake({ user }) {
    const router = useRouter();
    const [suggestions, setSuggestions] = useState([]);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        if (!user) return;
        const s = [];

        if (user.status !== 'verified') s.push({
            id: 'verify_email', sym: '◎', title: 'verify_email',
            desc: 'Secure your account and earn stake.',
            reward: Constants.ONBOARDING_REWARDS.VERIFY_EMAIL,
            action: () => router.push('/dashboard/profile?tab=3'), label: 'verify →',
        });

        if (!user.bio || !user.image) s.push({
            id: 'complete_profile', sym: '◈', title: 'complete_profile',
            desc: 'Add a bio and profile picture.',
            reward: Constants.ONBOARDING_REWARDS.COMPLETE_PROFILE,
            action: () => router.push(`/dashboard/${user.userID}/profile`), label: 'edit →',
        });

        if (!user.membership?.applicationDate && user.membership?.status === 'registered') s.push({
            id: 'submit_application', sym: '⊡', title: 'submit_application',
            desc: 'Submit your application to join the lab.',
            reward: Constants.ONBOARDING_REWARDS.SUBMIT_APPLICATION,
            action: () => router.push(`/dashboard/${user.userID}/membership`), label: 'apply →',
        });

        if (user.membership?.status === 'probation' && user.membership?.subscriptionStatus !== 'ACTIVE' && !user.membership?.isWaived) s.push({
            id: 'subscribe', sym: '⊞', title: 'become_member',
            desc: 'Subscribe to a membership plan.',
            reward: Constants.ONBOARDING_REWARDS.SUBSCRIBE,
            action: () => router.push(`/dashboard/${user.userID}/membership`), label: 'subscribe →',
        });

        const hasShowcase = user.badges?.some(b => (typeof b === 'string' ? b : b.id) === 'showcase_pioneer');
        if (!hasShowcase) s.push({
            id: 'showcase', sym: '◉', title: 'post_project',
            desc: 'Share what you made in the Showcase.',
            reward: Constants.BADGES?.SHOWCASE_PIONEER?.stakeReward,
            action: () => router.push('/dashboard/showcase'), label: 'showcase →',
        });

        const hasTerminal = user.badges?.some(b => (typeof b === 'string' ? b : b.id) === 'script_kiddie');
        if (!hasTerminal) s.push({
            id: 'terminal', sym: '$', title: 'hack_the_lab',
            desc: 'Find the hidden terminal and capture the first flag.',
            reward: Constants.BADGES?.SCRIPT_KIDDIE?.stakeReward,
            action: () => router.push('/dashboard/terminal'), label: 'enter →',
        });

        s.push({
            id: 'bugs', sym: '!', title: 'report_bugs',
            desc: 'Found a glitch? Report it to earn stake.',
            reward: 'Var',
            action: () => router.push('/dashboard/bugs'), label: 'report →',
        });

        setSuggestions(s);
    }, [user, router]);

    const dismiss = () => {
        setExiting(true);
        setTimeout(() => { setSuggestions(prev => prev.slice(1)); setExiting(false); }, 260);
    };

    if (suggestions.length === 0) return null;
    const cur = suggestions[0];

    return (
        <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em' }}>WAYS_TO_EARN_STAKE</div>
                <span className="pill" style={{ fontSize: 9, color: 'var(--amber)', borderColor: 'var(--amber)' }}>{suggestions.length} available</span>
            </div>
            <div style={{ position: 'relative' }}>
                {suggestions.length > 1 && <div className="card" style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 60, opacity: 0.4, transform: 'scale(0.98) translateY(4px)', zIndex: 0 }} />}
                {suggestions.length > 2 && <div className="card" style={{ position: 'absolute', top: 12, left: 0, right: 0, height: 60, opacity: 0.2, transform: 'scale(0.96) translateY(8px)', zIndex: -1 }} />}
                <div className="card" style={{
                    position: 'relative', zIndex: 1, borderLeft: '3px solid var(--amber)', padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                    opacity: exiting ? 0 : 1, transform: exiting ? 'translateX(20px)' : 'none',
                    transition: 'opacity 0.26s, transform 0.26s',
                }}>
                    <span style={{ color: 'var(--amber)', fontFamily: 'var(--mono)', fontSize: 16, flexShrink: 0 }}>{cur.sym}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', marginBottom: 3 }}>{cur.title}</div>
                        <div style={{ color: 'var(--text-mid)', fontSize: 11 }}>{cur.desc}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ color: 'var(--amber)', fontSize: 10, fontFamily: 'var(--mono)', border: '1px solid var(--amber)', padding: '2px 8px' }}>+{cur.reward} stake</span>
                        <button className="btn btn--sm btn--amber" style={{ fontSize: 10 }} onClick={cur.action}>{cur.label}</button>
                        <button onClick={dismiss} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 14, lineHeight: 1 }}>×</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
