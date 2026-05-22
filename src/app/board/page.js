'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import QRCode from 'react-qr-code';

const LINKS = [
  {
    label: 'bounty_board',
    desc: 'View and claim open community tasks. Earn points, build reputation.',
    href: '/board/bounties',
    accent: 'var(--green)',
  },
  {
    label: 'events_calendar',
    desc: 'Workshops, open labs, and member meetups.',
    href: '#',
    disabled: true,
    accent: 'var(--amber)',
  },
  {
    label: 'member_projects',
    desc: 'See what the community is building right now.',
    href: '#',
    disabled: true,
    accent: 'var(--cyan)',
  },
];

const fmt = cents => `$${(cents / 100).toFixed(0)}`;

function GoalMeter({ stats }) {
  const { donationsCents, goalCents } = stats;
  const pct     = Math.min(100, goalCents > 0 ? Math.round((donationsCents / goalCents) * 100) : 0);
  const remaining = Math.max(0, goalCents - donationsCents);
  const barColor  = pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : '#e05555';

  return (
    <div>
      {/* collected / goal */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 36, color: 'var(--text-bright)', letterSpacing: '-0.04em', textShadow: `0 0 20px ${barColor}` }}>
          {fmt(donationsCents)}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
          / <span style={{ color: 'var(--text-mid)' }}>{fmt(goalCents)}</span> goal
        </span>
      </div>

      {/* bar */}
      <div style={{ height: 8, background: 'var(--bg)', border: '1px solid var(--bd)', marginBottom: 8, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`,
          background: barColor,
          boxShadow: `0 0 12px ${barColor}`,
          transition: 'width 1s ease',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--mono)' }}>
        <span style={{ color: barColor, letterSpacing: '0.06em' }}>{pct}% funded this month</span>
        {remaining > 0
          ? <span style={{ color: 'var(--text-dim)' }}>{fmt(remaining)} to go</span>
          : <span style={{ color: 'var(--green)' }}>✓ goal reached!</span>
        }
      </div>
    </div>
  );
}

export default function BoardPage() {
  const baseUrl    = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
  const checkInUrl = `${baseUrl}/dashboard/checkin`;
  const donateUrl  = `${baseUrl}/donate`;

  const [stats, setStats]           = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadStats = () => {
    fetch('/api/v1/donations/stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => setStats(data))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  };

  useEffect(() => {
    loadStats();
    // Refresh every 5 minutes so the meter stays live on the signage screen
    const id = setInterval(loadStats, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '48px 40px', display: 'flex', flexDirection: 'column', gap: 40 }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
          <span style={{ color: 'var(--green)' }}>$</span> ./board --dashboard
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
          fab lab fort smith
        </h1>
      </div>

      {/* ── QR codes row ────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Check-in */}
        <div style={{ border: '1px solid var(--green)', background: 'var(--bg-card)', padding: '28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <div style={{ fontSize: 9, color: 'var(--green)', letterSpacing: '0.18em', alignSelf: 'flex-start' }}>CHECK_IN</div>
          <div style={{ padding: 14, background: '#fff' }}>
            <QRCode value={checkInUrl} size={150} level="M" />
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)', textAlign: 'center', lineHeight: 1.7 }}>
            scan to check in<br />
            <Link href="/dashboard/checkin" style={{ color: 'var(--text-dim)', fontSize: 10, textDecoration: 'none' }}>
              or tap here on mobile
            </Link>
          </div>
        </div>

        {/* Donate + goal meter */}
        <div style={{ border: '1px solid var(--amber)', background: 'var(--bg-card)', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 9, color: 'var(--amber)', letterSpacing: '0.18em' }}>SUPPORT_THE_LAB · $5–$20</div>

          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            {/* QR */}
            <div style={{ padding: 12, background: '#fff', flexShrink: 0 }}>
              <QRCode value={donateUrl} size={120} level="M" />
            </div>

            {/* meter */}
            <div style={{ flex: 1, paddingTop: 4 }}>
              {statsLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--mono)' }}>
                  <span className="dot pulse" style={{ background: 'var(--amber)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
                  loading...
                </div>
              ) : stats ? (
                <GoalMeter stats={stats} />
              ) : (
                <div style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--mono)' }}>stats unavailable</div>
              )}
            </div>
          </div>

          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
            scan to donate · every dollar goes to tools &amp; programming
          </div>
        </div>
      </div>

      {/* ── Nav links ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {LINKS.map(link => (
          <div
            key={link.label}
            className="card"
            style={{
              border: `1px solid ${link.disabled ? 'var(--bd)' : link.accent}`,
              opacity: link.disabled ? 0.45 : 1,
            }}
          >
            {link.disabled ? (
              <div style={{ padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.1em', marginBottom: 5 }}>{link.label}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{link.desc}</div>
                </div>
                <span style={{ fontSize: 9, color: 'var(--text-dim)', border: '1px solid var(--bd)', padding: '2px 8px', fontFamily: 'var(--mono)', letterSpacing: '0.1em', flexShrink: 0, marginLeft: 16 }}>soon</span>
              </div>
            ) : (
              <Link href={link.href} style={{ display: 'flex', padding: '18px 22px', textDecoration: 'none', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', color: link.accent, fontSize: 10, letterSpacing: '0.1em', marginBottom: 5 }}>{link.label}</div>
                  <div style={{ color: 'var(--text)', fontSize: 12 }}>{link.desc}</div>
                </div>
                <div style={{ color: link.accent, fontSize: 10, fontFamily: 'var(--mono)', flexShrink: 0, marginLeft: 16 }}>→</div>
              </Link>
            )}
          </div>
        ))}
      </div>

    </div>
  );
}
