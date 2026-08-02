'use client';
import { useState, useEffect, useRef } from 'react';
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
const CYCLE_MS = 10000; // 10 seconds per panel

// Public funding meter for the kiosk: recurring dues + donations, stacked, against the
// monthly goal. Dues is the steady base the lab can count on; donations are what pushes past
// it — so the bar reads as "committed" + "given". Aggregate only; the per-tier breakdown is
// admin-only (see /dashboard/admin/donations).
//
// The two segment colours are stepped into the legible lightness band and CVD-validated
// (deutan ΔE 22.7), not the raw --green/--cyan neons which read as one colour to a
// colourblind viewer at that lightness.
function GoalMeter({ stats }) {
  const goalCents      = stats.goalCents || 0;
  const duesCents      = stats.duesCents || 0;
  const donationsCents = stats.donationsCents || 0;
  const totalCents     = stats.totalCents ?? (duesCents + donationsCents);

  const scale     = Math.max(goalCents, totalCents, 1);        // overshoot stays on-scale
  const duesW     = (duesCents / scale) * 100;
  const donW      = (donationsCents / scale) * 100;
  const goalMark  = (goalCents / scale) * 100;
  const pct       = goalCents > 0 ? Math.round((totalCents / goalCents) * 100) : 0;
  const remaining = Math.max(0, goalCents - totalCents);
  const met       = totalCents >= goalCents;

  const DUES = '#2da810';   // recurring dues — validated categorical 1
  const DON  = '#2f9fd4';   // donations      — validated categorical 2

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 36, color: 'var(--text-bright)', letterSpacing: '-0.04em', textShadow: `0 0 20px ${met ? 'var(--green)' : DUES}` }}>
          {fmt(totalCents)}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
          / <span style={{ color: 'var(--text-mid)' }}>{fmt(goalCents)}</span> goal
        </span>
      </div>

      {/* Stacked bar. 2px surface gap between the two fills so they read as distinct. */}
      <div
        role="img"
        aria-label={`${fmt(totalCents)} of a ${fmt(goalCents)} monthly goal: ${fmt(duesCents)} recurring dues and ${fmt(donationsCents)} donations.`}
        style={{ display: 'flex', height: 10, background: 'var(--bg)', border: '1px solid var(--bd)', marginBottom: 8, position: 'relative', overflow: 'hidden' }}
      >
        <div style={{ width: `${duesW}%`, background: DUES, transition: 'width 1s ease' }} />
        <div style={{ width: `${donW}%`, background: DON, borderLeft: donW > 0 && duesW > 0 ? '2px solid var(--bg)' : 'none', transition: 'width 1s ease' }} />
        {/* goal tick */}
        {goalMark < 100 && (
          <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${goalMark}%`, width: 2, background: 'var(--amber)' }} />
        )}
      </div>

      {/* Legend — identity is never colour-alone: swatch + label + value. */}
      <div style={{ display: 'flex', gap: 16, fontSize: 11, fontFamily: 'var(--mono)', marginBottom: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-mid)' }}>
          <span style={{ width: 9, height: 9, background: DUES, flex: 'none' }} /> dues {fmt(duesCents)}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-mid)' }}>
          <span style={{ width: 9, height: 9, background: DON, flex: 'none' }} /> donations {fmt(donationsCents)}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--mono)' }}>
        <span style={{ color: met ? 'var(--green)' : 'var(--text-mid)', letterSpacing: '0.06em' }}>{pct}% funded this month</span>
        {met
          ? <span style={{ color: 'var(--green)' }}>✓ goal reached!</span>
          : <span style={{ color: 'var(--text-dim)' }}>{fmt(remaining)} to go</span>
        }
      </div>
    </div>
  );
}

export default function BoardPage() {
  const baseUrl    = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
  const checkInUrl = `${baseUrl}/dashboard/checkin`;
  const donateUrl  = `${baseUrl}/donate`;

  const [panel, setPanel]           = useState(0); // 0 = check-in, 1 = donate
  const [progress, setProgress]     = useState(0); // 0–100 sweep for the timer bar
  const [stats, setStats]           = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const progressRef = useRef(null);
  const cycleRef    = useRef(null);

  const switchTo = (idx) => {
    setPanel(idx);
    setProgress(0);
  };

  // Auto-cycle + progress bar
  useEffect(() => {
    const TICK = 50; // ms
    let elapsed = 0;

    progressRef.current = setInterval(() => {
      elapsed += TICK;
      setProgress(Math.min(100, (elapsed / CYCLE_MS) * 100));
    }, TICK);

    cycleRef.current = setTimeout(() => {
      setPanel(p => (p + 1) % 2);
      setProgress(0);
    }, CYCLE_MS);

    return () => {
      clearInterval(progressRef.current);
      clearTimeout(cycleRef.current);
    };
  }, [panel]);

  // Load + refresh donation stats every 5 min
  useEffect(() => {
    const load = () => {
      fetch('/api/v1/donations/stats')
        .then(r => r.ok ? r.json() : null)
        .then(data => setStats(data))
        .catch(() => {})
        .finally(() => setStatsLoading(false));
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const PANELS = [
    { key: 'check_in',       accent: 'var(--green)' },
    { key: 'support_the_lab', accent: 'var(--amber)' },
  ];

  const accent = PANELS[panel].accent;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '48px 40px', display: 'flex', flexDirection: 'column', gap: 36 }}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
          <span style={{ color: 'var(--green)' }}>$</span> ./board --dashboard
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
          fab lab fort smith
        </h1>
      </div>

      {/* ── Panel switcher ────────────────────────────────────────────── */}
      <div style={{ border: `1px solid ${accent}`, background: 'var(--bg-card)', transition: 'border-color 0.4s' }}>

        {/* Tab row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${accent}` }}>
          {PANELS.map((p, i) => (
            <button
              key={p.key}
              type="button"
              onClick={() => switchTo(i)}
              style={{
                background: panel === i ? 'rgba(255,255,255,0.04)' : 'none',
                border: 'none',
                borderRight: i === 0 ? `1px solid ${accent}` : 'none',
                color: panel === i ? p.accent : 'var(--text-dim)',
                fontFamily: 'var(--mono)',
                fontSize: 10,
                letterSpacing: '0.14em',
                padding: '10px 0',
                cursor: 'pointer',
                transition: 'color 0.3s, background 0.3s',
              }}
            >
              {p.key.toUpperCase().replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Timer bar */}
        <div style={{ height: 2, background: 'var(--bg)', position: 'relative' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${progress}%`,
            background: accent,
            transition: 'background 0.4s',
          }} />
        </div>

        {/* Panel content */}
        <div style={{ padding: '32px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, minHeight: 280 }}>

          {panel === 0 && (
            <>
              <div style={{ padding: 14, background: '#fff' }}>
                <QRCode value={checkInUrl} size={160} level="M" />
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text-mid)', textAlign: 'center', lineHeight: 1.7 }}>
                scan to check in<br />
                <Link href="/dashboard/checkin" style={{ color: 'var(--text-dim)', fontSize: 10, textDecoration: 'none' }}>
                  or tap here on mobile
                </Link>
              </div>
            </>
          )}

          {panel === 1 && (
            <div style={{ width: '100%', display: 'flex', gap: 32, alignItems: 'flex-start' }}>
              {/* QR */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <div style={{ padding: 12, background: '#fff' }}>
                  <QRCode value={donateUrl} size={140} level="M" />
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.6 }}>
                  scan to donate<br />
                  <span style={{ color: 'var(--amber)' }}>$5–$20</span> makes a difference
                </div>
              </div>

              {/* Meter */}
              <div style={{ flex: 1, paddingTop: 8 }}>
                <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.14em', marginBottom: 16 }}>MONTHLY_FUNDING_GOAL</div>
                {statsLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--mono)' }}>
                    <span className="dot pulse" style={{ background: 'var(--amber)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
                    loading...
                  </div>
                ) : stats ? (
                  <GoalMeter stats={stats} />
                ) : (
                  <div style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--mono)' }}>stats unavailable</div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Nav links ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {LINKS.map(link => (
          <div key={link.label} className="card" style={{ border: `1px solid ${link.disabled ? 'var(--bd)' : link.accent}`, opacity: link.disabled ? 0.45 : 1 }}>
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
