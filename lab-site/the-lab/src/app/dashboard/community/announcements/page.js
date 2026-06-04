'use client';
import { useState, useEffect } from 'react';
const TYPE_STYLES = {
    warning: { border: 'var(--amber)',  bg: 'rgba(255,176,0,0.05)',   label: 'WARNING' },
    alert:   { border: 'var(--red)',    bg: 'rgba(255,56,56,0.05)',   label: 'ALERT'   },
    error:   { border: 'var(--red)',    bg: 'rgba(255,56,56,0.05)',   label: 'ALERT'   },
    success: { border: 'var(--green)',  bg: 'rgba(57,255,20,0.05)',   label: 'INFO'    },
    info:    { border: 'var(--cyan)',   bg: 'rgba(92,242,255,0.05)',  label: 'NOTICE'  },
};

export default function AnnouncementsPage() {
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch('/api/v1/announcements')
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => setAnnouncements(data))
            .catch(() => setError('Failed to load announcements.'))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div style={{ padding: '20px 24px', maxWidth: 820 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                <span style={{ color: 'var(--green)' }}>$</span> ./announcements --list
            </div>
            <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 28 }}>
                announcements
            </h1>

            {loading && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-mid)', fontSize: 12 }}>
                    <span className="dot pulse" style={{ background: 'var(--green)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
                    loading...
                </div>
            )}

            {error && (
                <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '10px 14px', fontSize: 11 }}>[ERROR] {error}</div>
            )}

            {!loading && !error && announcements.length === 0 && (
                <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '20px 0' }}>
                    <span style={{ color: 'var(--green)' }}>&gt;</span> no active announcements.
                </div>
            )}

            {!loading && !error && announcements.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {announcements.map(a => {
                        const s = TYPE_STYLES[a.type] || TYPE_STYLES.info;
                        return (
                            <div key={a._id} style={{ border: `1px solid ${s.border}`, background: s.bg, padding: '18px 20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                                    <span style={{ color: s.border, fontSize: 9, letterSpacing: '0.14em', fontFamily: 'var(--mono)' }}>[{s.label}]</span>
                                    <span style={{ color: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--mono)' }}>
                                        {new Date(a.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </span>
                                </div>
                                <div style={{ color: s.border, fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', marginBottom: 8 }}>
                                    {a.title}
                                </div>
                                <div style={{ color: 'var(--text-mid)', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                                    {a.content}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
