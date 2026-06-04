'use client';
import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';

const cadenceLabel = c => ({ MONTHLY: 'mo', ANNUAL: 'yr', WEEKLY: 'wk', DAILY: 'day', EVERY_TWO_YEARS: '2yr' }[c] || c?.toLowerCase() || '?');
const fmt = cents => `$${(cents / 100).toFixed(0)}`;

function GoalMeter({ stats }) {
    const { donationsCents, goalCents, expenses, totalExpenseCents } = stats;
    const pct = Math.min(100, goalCents > 0 ? Math.round((donationsCents / goalCents) * 100) : 0);
    const remaining = Math.max(0, goalCents - donationsCents);
    const barColor = pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : '#e05555';

    return (
        <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '20px' }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.14em', marginBottom: 14 }}>MONTHLY_DONATION_GOAL</div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--display)', fontSize: 26, color: 'var(--text-bright)', letterSpacing: '-0.04em' }}>
                    {fmt(donationsCents)}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                    goal: <span style={{ color: 'var(--text-mid)' }}>{fmt(goalCents)}/mo</span>
                </span>
            </div>

            {/* track */}
            <div style={{ height: 6, background: 'var(--bg-1)', border: '1px solid var(--bd)', marginBottom: 6, position: 'relative', overflow: 'hidden' }}>
                <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${pct}%`,
                    background: barColor,
                    boxShadow: `0 0 8px ${barColor}`,
                    transition: 'width 0.6s ease',
                }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--mono)', marginBottom: totalExpenseCents > 0 ? 14 : 0 }}>
                <span style={{ color: barColor }}>{pct}% funded</span>
                {remaining > 0
                    ? <span style={{ color: 'var(--text-dim)' }}>{fmt(remaining)} to go</span>
                    : <span style={{ color: 'var(--green)' }}>✓ goal reached</span>
                }
            </div>

            {totalExpenseCents > 0 && (
                <div style={{ paddingTop: 12, borderTop: '1px solid var(--bd)' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 8 }}>MEMBER_COSTS</div>
                    {(expenses || []).filter(e => e.count > 0).map((e, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginBottom: 3 }}>
                            <span>{e.count}× {e.label} <span style={{ opacity: 0.5 }}>({fmt(e.centsPerMember)}/ea)</span></span>
                            <span style={{ color: '#e05555' }}>−{fmt(e.totalCents)}</span>
                        </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-mid)', fontFamily: 'var(--mono)', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--bd)' }}>
                        <span>total monthly costs</span>
                        <span style={{ color: '#e05555' }}>−{fmt(totalExpenseCents)}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function PlansPage() {
    const [plans, setPlans]         = useState([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState('');
    const [stats, setStats]         = useState(null);
    const [statsLoading, setStatsLoading] = useState(true);

    const donateUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/donate`
        : 'https://fablabfortsmith.org/donate';

    useEffect(() => {
        fetch('/api/v1/plans')
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => setPlans(Array.isArray(data) ? data : []))
            .catch(() => setError('Failed to load membership plans.'))
            .finally(() => setLoading(false));

        fetch('/api/v1/donations/stats')
            .then(r => r.ok ? r.json() : null)
            .then(data => setStats(data))
            .catch(() => {})
            .finally(() => setStatsLoading(false));
    }, []);

    return (
        <div style={{ padding: '28px 24px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                <span style={{ color: 'var(--green)' }}>$</span> ls ./membership/plans/
            </div>
            <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 8 }}>
                membership plans
            </h1>
            <p style={{ color: 'var(--text-mid)', fontSize: 13, marginBottom: 28, maxWidth: 560 }}>
                Choose the plan that fits your build cadence. All plans include Discord access and community events.
            </p>

            {/* ── Goal meter + QR code ────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginBottom: 36 }}>

                {/* meter */}
                {statsLoading ? (
                    <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '20px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--mono)' }}>
                        <span className="dot pulse" style={{ background: 'var(--green)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
                        loading goal...
                    </div>
                ) : stats ? (
                    <GoalMeter stats={stats} />
                ) : null}

                {/* QR code */}
                <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.14em', alignSelf: 'flex-start' }}>
                        QUICK_DONATE · $5–$20
                    </div>
                    <div style={{ padding: 10, background: '#fff', display: 'inline-block' }}>
                        <QRCode value={donateUrl} size={120} level="M" />
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.6 }}>
                        scan to donate · every bit helps<br />
                        <a href="/donate" style={{ color: 'var(--green)', textDecoration: 'none' }}>fablabfortsmith.org/donate</a>
                    </div>
                </div>
            </div>

            {/* ── Plan cards ──────────────────────────────────────────────── */}
            {loading && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-mid)', fontSize: 12 }}>
                    <span className="dot pulse" style={{ background: 'var(--green)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
                    loading plans...
                </div>
            )}

            {error && (
                <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '10px 14px', fontSize: 11 }}>[ERROR] {error}</div>
            )}

            {!loading && !error && plans.length === 0 && (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>[no plans available — contact us to join]</div>
            )}

            {!loading && !error && plans.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                    {plans.map((plan, i) => (
                        <div key={plan.id || i} className="card" style={{
                            padding: '24px 20px', display: 'flex', flexDirection: 'column',
                            border: i === 0 ? '1px solid var(--green)' : '1px solid var(--bd)',
                            boxShadow: i === 0 ? '0 0 24px rgba(57,255,20,0.10)' : 'none',
                        }}>
                            <div style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
                                {plan.name}
                            </div>

                            {/* pricing rows */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                                {(plan.variations || []).map(v => (
                                    <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--bd)', paddingBottom: 6 }}>
                                        <span style={{ color: 'var(--text-mid)', fontSize: 11 }}>
                                            {v.name || cadenceLabel(v.cadence)}
                                        </span>
                                        <span>
                                            <span style={{ fontFamily: 'var(--display)', fontSize: 22, color: 'var(--text-bright)', letterSpacing: '-0.04em' }}>
                                                {v.priceCents != null ? `$${(v.priceCents / 100).toFixed(0)}` : '—'}
                                            </span>
                                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', marginLeft: 2 }}>
                                                /{cadenceLabel(v.cadence)}
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* description */}
                            {plan.description && (
                                <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.6, margin: '0 0 12px' }}>
                                    {plan.description}
                                </p>
                            )}

                            {/* benefits list */}
                            {(plan.benefits || []).length > 0 && (
                                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                                    {plan.benefits.map((b, bi) => (
                                        <li key={bi} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 11, color: 'var(--text-mid)', lineHeight: 1.45 }}>
                                            <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 10, marginTop: 1, flexShrink: 0 }}>✓</span>
                                            {b}
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <div style={{ border: '1px solid var(--amber)', background: 'rgba(255,176,0,0.05)', padding: '6px 10px', fontSize: 10, color: 'var(--amber)', letterSpacing: '0.08em', marginBottom: 16 }}>
                                +25 STAKE on first subscription
                            </div>
                            <a
                                href={`/auth/register?plan=${encodeURIComponent(plan.id || plan.name)}`}
                                className={i === 0 ? 'btn btn--filled btn--sm' : 'btn btn--ghost btn--sm'}
                                style={{ textAlign: 'center', fontSize: 10 }}
                            >
                                $ ./join --plan={plan.name?.toLowerCase().replace(/\s+/g, '-') || 'now'}
                            </a>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
