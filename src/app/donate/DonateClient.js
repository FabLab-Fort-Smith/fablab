'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

const TIERS = [
  { amount: 10,  label: 'filament_fund',    desc: 'Covers a spool of PLA for the community printer fleet.' },
  { amount: 25,  label: 'tool_maintenance', desc: 'Helps keep the laser cutter calibrated and blades sharp.' },
  { amount: 50,  label: 'workshop_sponsor', desc: 'Sponsors a free public workshop for the community.' },
  { amount: 100, label: 'equipment_fund',   desc: 'Goes directly toward new or replacement equipment.' },
];

export default function DonateClient() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(null); // tier amount currently loading
  const [error, setError]   = useState(null);

  async function handleDonate(tier) {
    setError(null);
    setLoading(tier.amount);
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
      setError(err.message);
      setLoading(null);
    }
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingTop: 52 }}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ padding: '80px 24px 60px', borderBottom: '1px solid var(--bd)', background: 'var(--bg-1)' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>

          {/* Login nudge — only shown to unauthenticated visitors */}
          {!session && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', marginBottom: 28,
              background: 'var(--bg-card)', border: '1px solid var(--bd)',
              fontSize: 11, color: 'var(--text-dim)',
            }}>
              <span>Already a member?</span>
              <Link
                href="/auth/signin"
                className="btn btn--ghost"
                style={{ fontSize: 10, padding: '4px 12px' }}
              >
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

      {/* ── Tier cards ───────────────────────────────────────────────────── */}
      <section style={{ padding: '60px 24px', maxWidth: 860, margin: '0 auto' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 24 }}>SELECT_AMOUNT</div>

        {error && (
          <div style={{ color: 'var(--red, #e05555)', fontSize: 11, marginBottom: 16, fontFamily: 'var(--mono)' }}>
            ✗ {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 48 }}>
          {TIERS.map(t => {
            const isLoading = loading === t.amount;
            return (
              <button
                key={t.label}
                type="button"
                onClick={() => handleDonate(t)}
                disabled={loading !== null}
                className="card donate-tier-btn"
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '22px 18px',
                  textAlign: 'left',
                  cursor: loading !== null ? 'wait' : 'pointer',
                  border: '1px solid var(--bd)',
                  background: 'var(--bg-card)',
                  color: 'inherit',
                  font: 'inherit',
                  transition: 'border-color 0.15s, opacity 0.15s',
                  opacity: loading !== null && !isLoading ? 0.5 : 1,
                  outline: 'none',
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.borderColor = 'var(--green)'; }}
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

        {/* ── Payment options ───────────────────────────────────────────── */}
        <div style={{ border: '1px solid var(--bd-1)', padding: '32px 28px', background: 'var(--bg-card)', marginBottom: 24 }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 16 }}>PAYMENT_OPTIONS</div>
          <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.7, margin: '0 0 20px' }}>
            Click any amount above to be taken to a secure Square checkout page. You can also write a check payable to <strong style={{ color: 'var(--text-mid)' }}>Fab Lab Fort Smith</strong> and mail it to:
          </p>
          <div style={{ color: 'var(--text-mid)', fontSize: 11, fontFamily: 'var(--mono)' }}>
            805 N Greenwood Ave · Fort Smith, AR 72901
          </div>
        </div>

        {/* ── Membership callout ────────────────────────────────────────── */}
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
