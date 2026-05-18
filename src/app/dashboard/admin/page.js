'use client';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const ADMIN_LINKS = [
    { sym: '∷', label: 'members', desc: 'manage all users', path: '/dashboard/admin/members', color: 'var(--green)' },
    { sym: '◊', label: 'onboarding', desc: 'review applications', path: '/dashboard/admin/onboarding-reviews', color: 'var(--amber)' },
    { sym: '⟁', label: 'checkin log', desc: 'attendance records', path: '/dashboard/admin/checkin-log', color: 'var(--cyan)' },
    { sym: '⚑', label: 'bounty ideas', desc: 'manage suggestions', path: '/dashboard/admin/bounty-ideas', color: 'var(--magenta)' },
    { sym: '✦', label: 'volunteers', desc: 'approve hours', path: '/dashboard/admin/volunteers', color: 'var(--green)' },
    { sym: '⌬', label: 'announcements', desc: 'post news', path: '/dashboard/admin/announcements', color: 'var(--cyan)' },
    { sym: '◈', label: 'badges', desc: 'badge registry', path: '/dashboard/admin/badges', color: 'var(--green)' },
    { sym: '✉', label: 'contact inbox', desc: 'form submissions', path: '/dashboard/admin/contact', color: 'var(--amber)' },
    { sym: '$', label: 'donations', desc: 'transaction log', path: '/dashboard/admin/donations', color: 'var(--green)' },
    { sym: '▤', label: 'analytics', desc: 'usage stats', path: '/dashboard/admin/analytics', color: 'var(--cyan)' },
    { sym: '⚒', label: 'repair queue', desc: 'device requests', path: '/dashboard/admin/repair', color: 'var(--amber)' },
    { sym: '✉', label: 'email templates', desc: 'notification types', path: '/dashboard/admin/emails', color: 'var(--magenta)' },
    { sym: '◉', label: 'membership plans', desc: 'manage square plans', path: '/dashboard/admin/plans', color: 'var(--cyan)' },
    { sym: '⟁', label: 'square txns', desc: 'payment history', path: '/dashboard/admin/square-transactions', color: 'var(--green)' },
];

export default function AdminHomePage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated' && session.user.role !== 'admin') router.push('/dashboard');
    }, [status, session, router]);

    if (status !== 'authenticated') return null;

    return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{ marginBottom: 28 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                    <span style={{ color: 'var(--magenta)' }}>$</span> sudo ./admin --panel
                </div>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                    admin.home
                </h1>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
                    logged in as <span style={{ color: 'var(--magenta)', fontFamily: 'var(--mono)' }}>root · {session.user.username || session.user.name}</span>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                {ADMIN_LINKS.map(item => (
                    <Link
                        key={item.path}
                        href={item.path}
                        style={{ textDecoration: 'none' }}
                    >
                        <div
                            className="card"
                            style={{ padding: '18px 16px', cursor: 'pointer', transition: 'border-color 0.12s, box-shadow 0.12s', height: '100%', boxSizing: 'border-box' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = item.color; e.currentTarget.style.boxShadow = `0 0 12px color-mix(in oklab, ${item.color} 20%, transparent)`; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bd)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 22, color: item.color, marginBottom: 10, textShadow: `0 0 8px ${item.color}` }}>
                                {item.sym}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-bright)', marginBottom: 4, fontFamily: 'var(--mono)' }}>
                                {item.label}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{item.desc}</div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
