'use client';
// Admin management for member mailboxes (member-email plugin). UX gate only —
// real enforcement is the admin-authorized service behind the API.
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function AdminMemberEmailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mailboxes, setMailboxes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
    else if (status === 'authenticated' && session.user.role !== 'admin') router.push('/dashboard');
  }, [status, session, router]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/plugins/member-email/admin');
      if (res.status === 404) { setError('The member-email plugin is disabled.'); setMailboxes([]); return; }
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      setMailboxes((await res.json()).mailboxes || []);
      setError('');
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && session.user.role === 'admin') load();
  }, [status, session, load]);

  const act = async (userID, action) => {
    if (action === 'delete' && !confirm('Delete this mailbox in PurelyMail? This cannot be undone.')) return;
    setBusy(userID + action);
    try {
      const res = await fetch('/api/v1/plugins/member-email/admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, userID }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Action failed');
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  if (status !== 'authenticated') return null;

  return (
    <div style={{ padding: '20px 24px' }}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
          <span style={{ color: 'var(--magenta)' }}>$</span> sudo ./admin --mailboxes
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
          member email
        </h1>
      </header>

      {error && <div role="alert" style={{ color: 'var(--red, #f66)', fontSize: 12, marginBottom: 16 }}>{error}</div>}

      {mailboxes === null ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading…</div>
      ) : mailboxes.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>no mailboxes provisioned.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <caption style={{ textAlign: 'left', color: 'var(--text-dim)', fontSize: 11, marginBottom: 8 }}>
              {mailboxes.length} mailbox(es)
            </caption>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-dim)' }}>
                <th scope="col" style={{ padding: '6px 8px' }}>address</th>
                <th scope="col" style={{ padding: '6px 8px' }}>member</th>
                <th scope="col" style={{ padding: '6px 8px' }}>status</th>
                <th scope="col" style={{ padding: '6px 8px' }}>created</th>
                <th scope="col" style={{ padding: '6px 8px' }}>actions</th>
              </tr>
            </thead>
            <tbody>
              {mailboxes.map((m) => (
                <tr key={m.userID + m.localPart} style={{ borderTop: '1px solid var(--bd)' }}>
                  <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)' }}>{m.address}</td>
                  <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{m.userID}</td>
                  <td style={{ padding: '6px 8px', color: m.status === 'active' ? 'var(--green)' : m.status === 'suspended' ? 'var(--amber)' : 'var(--text-dim)' }}>{m.status}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-dim)' }}>{m.createdAt?.slice(0, 10)}</td>
                  <td style={{ padding: '6px 8px', display: 'flex', gap: 6 }}>
                    <button disabled={busy !== ''} onClick={() => act(m.userID, 'suspend')} className="btn" style={{ fontSize: 11 }}>suspend</button>
                    <button disabled={busy !== ''} onClick={() => act(m.userID, 'reset')} className="btn" style={{ fontSize: 11 }}>reset</button>
                    <button disabled={busy !== ''} onClick={() => act(m.userID, 'delete')} className="btn" style={{ fontSize: 11, color: 'var(--red, #f66)' }}>delete</button>
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
