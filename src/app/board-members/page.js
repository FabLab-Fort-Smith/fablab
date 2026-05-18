'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function BoardMembersPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/users?role=admin&isPublic=true')
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        setMembers(data.users || (Array.isArray(data) ? data : []));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingTop: 52 }}>
      <section style={{ padding: '80px 24px 60px', borderBottom: '1px solid var(--bd)', background: 'var(--bg-1)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
            <span style={{ color: 'var(--green)' }}>$</span> ./board --list --public
          </div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.8rem, 4vw, 3rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 12 }}>
            board members
          </h1>
          <p style={{ color: 'var(--text-mid)', fontSize: 13 }}>
            The humans who keep the lights on and the laser cutter calibrated.
          </p>
        </div>
      </section>

      <section style={{ padding: '60px 24px', maxWidth: 1100, margin: '0 auto' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="card" style={{ padding: '24px 20px', height: 200, opacity: 0.4 }}>
                <div style={{ width: 52, height: 52, background: 'var(--bd-1)', margin: '0 auto 16px' }} />
                <div style={{ height: 12, background: 'var(--bd-1)', marginBottom: 8, borderRadius: 0 }} />
                <div style={{ height: 10, background: 'var(--bd-1)', width: '60%', margin: '0 auto' }} />
              </div>
            ))}
          </div>
        ) : members.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '40px 0' }}>
            <span style={{ color: 'var(--green)' }}>&gt;</span> no public board members found.{' '}
            <Link href="/contact" style={{ color: 'var(--text-mid)' }}>contact us</Link> for more info.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {members.map((m, i) => (
              <div key={m._id || i} className="card" style={{ padding: '28px 20px', textAlign: 'center' }}>
                {m.image ? (
                  <img
                    src={m.image}
                    alt={m.name || m.username}
                    style={{ width: 64, height: 64, objectFit: 'cover', display: 'block', margin: '0 auto 16px', border: '1px solid var(--bd-1)', filter: 'grayscale(30%)' }}
                  />
                ) : (
                  <div style={{
                    width: 64, height: 64, background: 'var(--bg-elev)', border: '1px solid var(--bd-1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px', fontFamily: 'var(--display)',
                    fontSize: 24, color: 'var(--green)', letterSpacing: '-0.04em',
                  }}>
                    {((m.firstName || m.name || m.username || '?').slice(0, 1) + ((m.lastName || '').slice(0, 1) || (m.name || '?').slice(1, 2))).toUpperCase()}
                  </div>
                )}
                <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  {m.firstName && m.lastName ? `${m.firstName} ${m.lastName}` : (m.name || m.username)}
                </div>
                <div style={{ color: 'var(--green)', fontSize: 10, letterSpacing: '0.1em', marginBottom: 10 }}>
                  {m.boardPosition || m.title || 'board member'}
                </div>
                {m.bio && (
                  <p style={{ color: 'var(--text-mid)', fontSize: 11, lineHeight: 1.6, margin: 0 }}>
                    {m.bio}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
