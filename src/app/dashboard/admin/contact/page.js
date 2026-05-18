'use client';
import { useState, useEffect } from 'react';

function ContactRow({ row, onStatusChange }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="card" style={{ marginBottom: 8, padding: 0, overflow: 'hidden' }}>
            <div
                style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', flexWrap: 'wrap', gap: 8 }}
                onClick={() => setExpanded(e => !e)}
            >
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                        {new Date(row.createdAt).toLocaleDateString()}
                    </span>
                    <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>{row.name}</span>
                    <a href={`mailto:${row.email}`} style={{ color: 'var(--cyan)', fontSize: 11, textDecoration: 'none' }} onClick={e => e.stopPropagation()}>{row.email}</a>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', color: row.status === 'new' ? 'var(--amber)' : 'var(--text-dim)', border: `1px solid ${row.status === 'new' ? 'var(--amber)' : 'var(--bd)'}`, padding: '2px 6px' }}>
                        {row.status?.toUpperCase()}
                    </span>
                    <span style={{ color: 'var(--text-dim)', fontSize: 14 }}>{expanded ? '▲' : '▼'}</span>
                </div>
            </div>
            {expanded && (
                <div style={{ borderTop: '1px solid var(--bd)', padding: '14px 18px' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 8 }}>MESSAGE</div>
                    <div style={{ color: 'var(--text-mid)', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 14 }}>{row.message}</div>
                    {row.status === 'new' && (
                        <button className="btn btn--ghost btn--sm" style={{ fontSize: 10, borderColor: 'var(--green)', color: 'var(--green)' }} onClick={() => onStatusChange(row._id, 'read')}>
                            $ mark as read
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default function ContactSubmissionsPage() {
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    const fetchSubmissions = async () => {
        try {
            const res = await fetch('/api/v1/contact-submissions');
            if (res.ok) setSubmissions(await res.json());
        } catch {}
        finally { setLoading(false); }
    };

    useEffect(() => { fetchSubmissions(); }, []);

    const handleStatusChange = async (id, status) => {
        try {
            await fetch('/api/v1/contact-submissions', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status }),
            });
            fetchSubmissions();
        } catch {}
    };

    const displayed = filter === 'all' ? submissions : submissions.filter(s => s.status === filter);
    const newCount = submissions.filter(s => s.status === 'new').length;

    return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
                <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                        <span style={{ color: 'var(--green)' }}>$</span> ./contact --submissions
                    </div>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                        contact submissions
                        {newCount > 0 && <span style={{ marginLeft: 12, fontSize: 14, color: 'var(--amber)', fontFamily: 'var(--mono)' }}>[{newCount} new]</span>}
                    </h1>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {['all', 'new', 'read'].map(f => (
                        <button key={f} onClick={() => setFilter(f)} className={filter === f ? 'btn btn--filled btn--sm' : 'btn btn--ghost btn--sm'} style={{ fontSize: 10 }}>{f}</button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading<span className="caret-block" style={{ marginLeft: 4 }} /></div>
            ) : displayed.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>[no submissions]</div>
            ) : (
                displayed.map(row => <ContactRow key={row._id} row={row} onStatusChange={handleStatusChange} />)
            )}
        </div>
    );
}
