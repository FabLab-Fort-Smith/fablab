'use client';
import { useState, useEffect } from 'react';

export default function BadgeDirectoryPage() {
    const [badges, setBadges] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch('/api/v1/badges')
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => setBadges(data.badges || []))
            .catch(() => setError('Failed to load badges.'))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div style={{ padding: '20px 24px', maxWidth: 1100 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                <span style={{ color: 'var(--green)' }}>$</span> ls ./badges/
            </div>
            <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 8 }}>
                badge directory
            </h1>
            <p style={{ color: 'var(--text-mid)', fontSize: 13, marginBottom: 36 }}>
                Achievements and certifications available at The Lab.
            </p>

            {loading && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-mid)', fontSize: 12 }}>
                    <span className="dot pulse" style={{ background: 'var(--green)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
                    loading badges...
                </div>
            )}

            {error && (
                <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '10px 14px', fontSize: 11 }}>[ERROR] {error}</div>
            )}

            {!loading && !error && badges.length === 0 && (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    <span style={{ color: 'var(--green)' }}>&gt;</span> no badges found.
                </div>
            )}

            {!loading && !error && badges.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                    {badges.map(badge => (
                        <div key={badge.id} className="card" style={{ padding: '24px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            {/* Badge icon / image */}
                            <div style={{
                                width: 64, height: 64, border: '1px solid var(--bd-1)',
                                background: 'var(--bg-elev)', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', marginBottom: 16,
                                fontSize: badge.imageUrl ? 0 : 28,
                                color: 'var(--green)',
                                overflow: 'hidden',
                            }}>
                                {badge.imageUrl
                                    ? <img src={badge.imageUrl} alt={badge.name} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(20%)' }} />
                                    : (badge.icon || '★')
                                }
                            </div>

                            <div style={{ color: 'var(--text)', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 6 }}>
                                {badge.name}
                            </div>
                            <div style={{ color: 'var(--text-mid)', fontSize: 11, lineHeight: 1.6, marginBottom: 12, flex: 1 }}>
                                {badge.description}
                            </div>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', border: '1px solid var(--bd)', padding: '2px 8px' }}>
                                {badge.id.toUpperCase().replace(/_/g, ' ')}
                            </span>
                            {badge.stakeReward && (
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)', letterSpacing: '0.08em', marginTop: 6 }}>
                                    +{badge.stakeReward} stake
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
