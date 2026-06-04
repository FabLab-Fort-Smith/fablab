'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function CheckInLogPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated') {
            if (session.user.role !== 'admin') router.push('/dashboard');
            else fetchLogs();
        }
    }, [status, session, router]);

    const fetchLogs = async () => {
        try {
            const res = await fetch('/api/v1/checkin?mode=log&limit=100');
            if (res.ok) { const data = await res.json(); setLogs(data.logs || []); }
        } catch {}
        finally { setLoading(false); }
    };

    const fmt = (dt) => dt ? new Date(dt).toLocaleString() : '—';
    const dur = (min) => min ? `${Math.floor(min / 60)}h ${min % 60}m` : '—';

    const filtered = logs.filter(l => !search || l.userName?.toLowerCase().includes(search.toLowerCase()));

    return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
                <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                        <span style={{ color: 'var(--green)' }}>$</span> ./checkin --log
                    </div>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                        check-in log
                    </h1>
                </div>
                <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => router.back()}>← back</button>
            </div>

            <div style={{ marginBottom: 16 }}>
                <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="search by username..." style={{ width: '100%', maxWidth: 320, boxSizing: 'border-box', fontSize: 12 }} />
            </div>

            {loading ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading<span className="caret-block" style={{ marginLeft: 4 }} /></div>
            ) : filtered.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>[no check-in logs found]</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table className="term-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>USER</th>
                                <th>CHECK_IN</th>
                                <th>CHECK_OUT</th>
                                <th>DURATION</th>
                                <th>STATUS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(log => (
                                <tr key={log.checkInID}>
                                    <td style={{ color: 'var(--text)', fontWeight: 600 }}>{log.userName}</td>
                                    <td style={{ color: 'var(--text-mid)', fontFamily: 'var(--mono)', fontSize: 11 }}>{fmt(log.checkInTime)}</td>
                                    <td style={{ color: 'var(--text-mid)', fontFamily: 'var(--mono)', fontSize: 11 }}>{fmt(log.checkOutTime)}</td>
                                    <td style={{ color: 'var(--text-mid)', fontFamily: 'var(--mono)', fontSize: 11 }}>{dur(log.durationMinutes)}</td>
                                    <td>
                                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', color: log.status === 'active' ? 'var(--green)' : 'var(--text-dim)', border: `1px solid ${log.status === 'active' ? 'var(--green)' : 'var(--bd)'}`, padding: '2px 6px' }}>
                                            {log.status?.toUpperCase()}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
