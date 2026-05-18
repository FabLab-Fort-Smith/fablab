'use client';
import { useEffect, useState } from 'react';

const cadenceLabel = c => ({ MONTHLY: 'mo', ANNUAL: 'yr', WEEKLY: 'wk', DAILY: 'day', EVERY_TWO_YEARS: '2yr' }[c] || c?.toLowerCase() || '?');

export default function PlansPage() {
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch('/api/v1/plans')
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => setPlans(Array.isArray(data) ? data : []))
            .catch(() => setError('Failed to load membership plans.'))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div style={{ padding: '28px 24px', maxWidth: 1100 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                <span style={{ color: 'var(--green)' }}>$</span> ls ./membership/plans/
            </div>
            <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 8 }}>
                membership plans
            </h1>
            <p style={{ color: 'var(--text-mid)', fontSize: 13, marginBottom: 36, maxWidth: 560 }}>
                Choose the plan that fits your build cadence. All plans include Discord access and community events.
            </p>

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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, marginBottom: 18 }}>
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
