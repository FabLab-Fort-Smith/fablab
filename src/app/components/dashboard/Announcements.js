'use client';
import { useState, useEffect } from 'react';
const TYPE_COLORS = {
    error:   { border: 'var(--red)',    bg: 'rgba(255,56,56,0.05)',    label: 'ALERT' },
    warning: { border: 'var(--amber)',  bg: 'rgba(255,176,0,0.05)',    label: 'WARNING' },
    success: { border: 'var(--green)',  bg: 'rgba(57,255,20,0.05)',    label: 'INFO' },
    info:    { border: 'var(--cyan)',   bg: 'rgba(92,242,255,0.05)',   label: 'NOTICE' },
};

export default function Announcements() {
    const [announcements, setAnnouncements] = useState([]);

    useEffect(() => {
        fetch('/api/v1/announcements')
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => setAnnouncements(data))
            .catch(() => {});
    }, []);

    if (announcements.length === 0) return null;

    const dismiss = id => setAnnouncements(prev => prev.filter(a => a._id !== id));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {announcements.map(a => {
                const c = TYPE_COLORS[a.type] || TYPE_COLORS.info;
                return (
                    <div key={a._id} style={{ border: `1px solid ${c.border}`, background: c.bg, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <span style={{ color: c.border, fontSize: 9, letterSpacing: '0.14em', flexShrink: 0, marginTop: 2 }}>[{c.label}]</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: c.border, fontSize: 11, fontWeight: 600, marginBottom: 4, letterSpacing: '0.06em' }}>{a.title}</div>
                            <div style={{ color: 'var(--text-mid)', fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{a.content}</div>
                        </div>
                        <button onClick={() => dismiss(a._id)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 14, flexShrink: 0, lineHeight: 1 }}>×</button>
                    </div>
                );
            })}
        </div>
    );
}
