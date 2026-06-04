'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import QRCode from 'react-qr-code';

const TIERS = [
  { amount: 5,   label: 'quick_support',   desc: 'Every bit helps keep the lights on.' },
  { amount: 10,  label: 'filament_fund',   desc: 'Covers a spool of PLA for the community printer fleet.' },
  { amount: 20,  label: 'tool_maintenance',desc: 'Helps keep the laser cutter calibrated and blades sharp.' },
  { amount: 50,  label: 'workshop_sponsor',desc: 'Sponsors a free public workshop for the community.' },
];

function fmt(cents) {
  return `$${(cents / 100).toFixed(0)}`;
}

function ProgressMeter({ donationsCents, goalCents, expenses, totalExpenseCents }) {
  const pct = Math.min(100, goalCents > 0 ? Math.round((donationsCents / goalCents) * 100) : 0);
  const remaining = Math.max(0, goalCents - donationsCents);

  // bar colour: green when >= 100%, amber when >= 60%, red otherwise
  const barColor = pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : '#e05555';

  return (
    <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '28px 24px' }}>
      <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 16 }}>
        MONTHLY_GOAL
      </div>

      {/* goal + collected */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 28, color: 'var(--text-bright)', letterSpacing: '-0.04em' }}>
          {fmt(donationsCents)}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
          goal: <span style={{ color: 'var(--text-mid)' }}>{fmt(goalCents)}/mo</span>
        </span>
      </div>

      {/* track */}
      <div style={{ height: 6, background: 'var(--bg-1)', border: '1px solid var(--bd)', marginBottom: 8, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`,
          background: barColor,
          boxShadow: `0 0 8px ${barColor}`,
          transition: 'width 0.6s ease',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--mono)' }}>
        <span style={{ color: barColor }}>{pct}% funded</span>
        {remaining > 0 && (
          <span style={{ color: 'var(--text-dim)' }}>{fmt(remaining)} still needed</span>
        )}
        {remaining === 0 && (
          <span style={{ color: 'var(--green)' }}>✓ goal reached</span>
        )}
      </div>

      {/* expense breakdown — only show when non-zero */}
      {totalExpenseCents > 0 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--bd)' }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 10 }}>
            MEMBER_COSTS_THIS_MONTH
          </div>
          {expenses.filter(e => e.count > 0).map((e, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginBottom: 4 }}>
              <span>{e.count} × {e.label} <span style={{ opacity: 0.6 }}>({fmt(e.centsPerMember)}/member)</span></span>
              <span style={{ color: '#e05555' }}>−{fmt(e.totalCents)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-mid)', fontFamily: 'var(--mono)', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--bd)' }}>
            <span>total costs offset by donations</span>
            <span style={{ color: '#e05555' }}>−{fmt(totalExpenseCents)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DonateClient() {
  const { data: session } = useSession();
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [checkoutError, setCheckoutError]     = useState(null);
  const [stats, setStats]                     = useState(null);
  const [statsLoading, setStatsLoading]       = useState(true);

  const donateUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/donate`
    : 'https://fablabfortsmith.org/donate';

  useEffect(() => {
    fetch('/api/v1/donations/stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => setStats(data))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  async function handleDonate(tier) {
    setCheckoutError(null);
    setCheckoutLoading(tier.amount);
    try {
      const res = await fetch('/api/v1/donations/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: tier.amount,
          frequency: 'one-time',
          userId: session?.user?.userID || null,
          donorInfo: session?.user
            ? { name: session.user.name, email: session.user.email }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Checkout failed');
      window.location.href = data.url;
    } catch (err) {
      setCheckoutError(err.message);
      setCheckoutLoading(null);
    }
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingTop: 52 }}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ padding: '80px 24px 60px', borderBottom: '1px solid var(--bd)', background: 'var(--bg-1)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>

          {!session && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', marginBottom: 28,
              background: 'var(--bg-card)', border: '1px solid var(--bd)',
              fontSize: 11, color: 'var(--text-dim)',
            }}>
              <span>Already a member?</span>
              <Link href="/auth/signin" className="btn btn--ghost" style={{ fontSize: 10, padding: '4px 12px' }}>
                $ ./signin
              </Link>
            </div>
          )}

          <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
            <span style={{ color: 'var(--green)' }}>$</span> ./donate --help
          </div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.8rem, 4vw, 3rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 16 }}>
            support the lab
          </h1>
          <p style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 1.8, maxWidth: 580 }}>
            Fab Lab Fort Smith is a nonprofit community organization. Every dollar goes directly toward tools, materials, and programming that keeps the space open for everyone.
          </p>
        </div>
      </section>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <section style={{ padding: '48px 24px', maxWidth: 900, margin: '0 auto' }}>

        {/* ── Goal meter + QR — side by side on wide screens ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 40 }}>

          {/* Progress meter */}
          {statsLoading ? (
            <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '28px 24px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--mono)' }}>
              <span className="dot pulse" style={{ background: 'var(--green)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
              loading goal...
            </div>
          ) : stats ? (
            <ProgressMeter
              donationsCents={stats.donationsCents}
              goalCents={stats.goalCents}
              expenses={stats.expenses || []}
              totalExpenseCents={stats.totalExpenseCents || 0}
            />
          ) : null}

          {/* QR code */}
          <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', alignSelf: 'flex-start' }}>
              SCAN_TO_DONATE
            </div>
            <div style={{ padding: 12, background: '#fff', display: 'inline-block' }}>
              <QRCode value={donateUrl} size={140} level="M" />
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textAlign: 'center' }}>
              point your phone camera here<br />
              <span style={{ color: 'var(--green)' }}>$5–$20</span> makes a real difference
            </div>
          </div>
        </div>

        {/* ── Tier cards ───────────────────────────────────────────────── */}
        <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 16 }}>
          SELECT_AMOUNT
        </div>

        {checkoutError && (
          <div style={{ color: '#e05555', fontSize: 11, marginBottom: 14, fontFamily: 'var(--mono)' }}>
            ✗ {checkoutError}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 40 }}>
          {TIERS.map(t => {
            const isLoading = checkoutLoading === t.amount;
            return (
              <button
                key={t.label}
                type="button"
                onClick={() => handleDonate(t)}
                disabled={checkoutLoading !== null}
                style={{
                  display: 'block', width: '100%', padding: '22px 18px', textAlign: 'left',
                  cursor: checkoutLoading !== null ? 'wait' : 'pointer',
                  border: '1px solid var(--bd)', background: 'var(--bg-card)',
                  color: 'inherit', font: 'inherit',
                  transition: 'border-color 0.15s, opacity 0.15s',
                  opacity: checkoutLoading !== null && !isLoading ? 0.5 : 1,
                  outline: 'none',
                }}
                onMouseEnter={e => { if (!checkoutLoading) e.currentTarget.style.borderColor = 'var(--green)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bd)'; }}
              >
                <div style={{ fontFamily: 'var(--display)', fontSize: 32, color: 'var(--green)', letterSpacing: '-0.04em', marginBottom: 8, textShadow: '0 0 16px var(--green)' }}>
                  ${t.amount}
                </div>
                <div style={{ fontFamily: 'var(--mono)', color: 'var(--text-mid)', fontSize: 10, letterSpacing: '0.1em', marginBottom: 10 }}>
                  {isLoading ? 'redirecting...' : t.label}
                </div>
                <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.6, margin: 0 }}>{t.desc}</p>
              </button>
            );
          })}
        </div>

        {/* ── Payment / check ──────────────────────────────────────────── */}
        <div style={{ border: '1px solid var(--bd-1)', padding: '28px 24px', background: 'var(--bg-card)', marginBottom: 16 }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 14 }}>PAYMENT_OPTIONS</div>
          <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.7, margin: '0 0 16px' }}>
            Click any amount above for a secure Square checkout. Prefer to write a check? Make it payable to{' '}
            <strong style={{ color: 'var(--text-mid)' }}>Fab Lab Fort Smith</strong> and mail to:
          </p>
          <div style={{ color: 'var(--text-mid)', fontSize: 11, fontFamily: 'var(--mono)' }}>
            805 N Greenwood Ave · Fort Smith, AR 72901
          </div>
        </div>

        {/* ── Membership callout ───────────────────────────────────────── */}
        <div style={{ border: '1px solid var(--bd)', padding: '24px', background: 'var(--bg-card)' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 12 }}>MEMBERSHIP_VS_DONATION</div>
          <p style={{ color: 'var(--text-mid)', fontSize: 12, lineHeight: 1.7, margin: '0 0 16px' }}>
            A membership gives you 24/7 facility access. A donation supports the space without requiring access. Both matter.
          </p>
          <Link href="/dashboard/plans" style={{ color: 'var(--green)', fontSize: 12, textDecoration: 'none' }}>
            → view membership tiers
          </Link>
        </div>

      </section>
    </div>
  );
}
