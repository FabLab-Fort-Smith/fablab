'use client';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

const RESOURCES = [
    {
        sym: '◈',
        title: 'badges',
        desc: 'View all available badges and your earned achievements.',
        path: '/dashboard/resources/badges',
        color: 'var(--green)',
    },
    {
        sym: '⚠',
        title: 'bug.board',
        desc: 'Report issues, track bugs, and view known problems with lab equipment.',
        path: '/dashboard/resources/bugs',
        color: 'var(--amber)',
    },
    {
        sym: '§',
        title: 'conduct.md',
        desc: 'Read the community code of conduct and lab rules.',
        path: '/dashboard/community/code-of-conduct',
        color: 'var(--cyan)',
    },
    {
        sym: '⚒',
        title: 'computer.repair',
        desc: 'Submit a computer repair request for lab equipment or personal devices.',
        path: '/services/computer-repair',
        color: 'var(--magenta)',
    },
    {
        sym: '⌬',
        title: 'announcements',
        desc: 'Stay up to date with community news and lab announcements.',
        path: '/dashboard/community/announcements',
        color: 'var(--green)',
    },
    {
        sym: '$',
        title: 'discord.server',
        desc: 'Join the community Discord for real-time support and collaboration.',
        href: '/api/v1/discord/invite',
        color: 'var(--magenta)',
    },
];

export default function ResourcesPage() {
    const router = useRouter();
    const { data: session } = useSession();

    return (
        <div style={{ padding: '20px 24px', maxWidth: 900 }}>
            <div style={{ marginBottom: 28 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                    <span style={{ color: 'var(--green)' }}>$</span> ls ./resources
                </div>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                    docs.tree
                </h1>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
                    member resources, guides, and community tools
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {RESOURCES.map(item => (
                    <div
                        key={item.title}
                        className="card"
                        onClick={() => item.href ? window.open(item.href, '_blank') : router.push(item.path)}
                        style={{ padding: '20px', cursor: 'pointer', transition: 'border-color 0.12s, box-shadow 0.12s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = item.color; e.currentTarget.style.boxShadow = `0 0 12px color-mix(in oklab, ${item.color} 20%, transparent)`; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bd)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 24, color: item.color, marginBottom: 12, textShadow: `0 0 8px ${item.color}` }}>
                            {item.sym}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-bright)', marginBottom: 6, fontFamily: 'var(--mono)' }}>
                            {item.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                            {item.desc}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
