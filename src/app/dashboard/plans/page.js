'use client';
import { useEffect, useState } from 'react';

export default function PlansPage() {
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch('/api/v1/plans')
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => setPlans(data))
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

            {!loading && !error && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                    {plans.map(plan => (
                        <div key={plan.id} className="card" style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                                {plan.name}
                            </div>
                            <div style={{ fontFamily: 'var(--display)', fontSize: 32, color: 'var(--text-bright)', letterSpacing: '-0.04em', marginBottom: 4, lineHeight: 1 }}>
                                ${plan.price}<span style={{ fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>/mo</span>
                            </div>
                            <p style={{ color: 'var(--text-mid)', fontSize: 12, lineHeight: 1.6, marginBottom: 14, flex: 1 }}>
                                {plan.description}
                            </p>
                            <div style={{ border: '1px solid var(--amber)', background: 'rgba(255,176,0,0.05)', padding: '6px 10px', fontSize: 10, color: 'var(--amber)', letterSpacing: '0.08em', marginBottom: 16 }}>
                                +25 STAKE on first subscription
                            </div>
                            {/* Square embed — preserved as-is */}
                            <div dangerouslySetInnerHTML={{ __html: plan.embed }} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
