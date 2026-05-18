'use client';
import Link from 'next/link';
import QRCode from 'react-qr-code';

const LINKS = [
  {
    label: 'bounty_board',
    desc: 'View and claim open community tasks. Earn points, build reputation.',
    cmd: '$ ./bounties --list',
    href: '/board/bounties',
    accent: 'var(--green)',
  },
  {
    label: 'events_calendar',
    desc: 'Workshops, open labs, and member meetups.',
    cmd: '$ ./events --upcoming',
    href: '#',
    disabled: true,
    accent: 'var(--amber)',
  },
  {
    label: 'member_projects',
    desc: 'See what the community is building right now.',
    cmd: '$ ./projects --recent',
    href: '#',
    disabled: true,
    accent: 'var(--cyan)',
  },
];

export default function BoardPage() {
  const checkInUrl = `${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/dashboard/checkin`;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 12 }}>
            <span style={{ color: 'var(--green)' }}>$</span> ./board --dashboard
          </div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: '2.2rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 8 }}>
            community board
          </h1>

          {/* QR code check-in */}
          <div style={{ display: 'inline-block', background: '#fff', padding: 14, border: '1px solid var(--bd-1)', marginTop: 24 }}>
            <QRCode value={checkInUrl} size={140} />
          </div>
          <div style={{ color: 'var(--text-mid)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 10 }}>
            Scan to check in
          </div>
          <div style={{ marginTop: 8 }}>
            <Link href="/dashboard/checkin" style={{ color: 'var(--text-dim)', fontSize: 10, textDecoration: 'none' }}>
              or click here if on mobile
            </Link>
          </div>
        </div>

        {/* Navigation links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {LINKS.map(link => (
            <div
              key={link.label}
              className="card"
              style={{
                border: `1px solid ${link.disabled ? 'var(--bd)' : link.accent}`,
                opacity: link.disabled ? 0.5 : 1,
                transition: 'box-shadow 0.12s',
              }}
            >
              {link.disabled ? (
                <div style={{ padding: '20px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.1em', marginBottom: 6 }}>{link.label}</div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{link.desc}</div>
                  </div>
                  <span className="pill" style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0, marginLeft: 16 }}>soon</span>
                </div>
              ) : (
                <Link href={link.href} style={{ display: 'flex', padding: '20px 22px', textDecoration: 'none', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', color: link.accent, fontSize: 10, letterSpacing: '0.1em', marginBottom: 6 }}>{link.label}</div>
                    <div style={{ color: 'var(--text)', fontSize: 12 }}>{link.desc}</div>
                  </div>
                  <div style={{ color: link.accent, fontSize: 10, fontFamily: 'var(--mono)', flexShrink: 0, marginLeft: 16 }}>→</div>
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
