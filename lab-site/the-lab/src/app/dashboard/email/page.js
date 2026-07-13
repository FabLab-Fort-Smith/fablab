'use client';
// Member-facing claim UI for an @fablabfortsmith.org mailbox (member-email
// plugin). Active members choose a local part, see live availability, and claim.
// Password is set by the member directly in PurelyMail via the welcome email —
// it is never entered here.
import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function MemberEmailPage() {
  const { status } = useSession();
  const router = useRouter();
  const [mailbox, setMailbox] = useState(undefined); // undefined=loading, null=none
  const [disabled, setDisabled] = useState(false);
  const [name, setName] = useState('');
  const [avail, setAvail] = useState(null); // { available, reason }
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState('');
  const debounce = useRef(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
  }, [status, router]);

  const loadMine = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/plugins/member-email/mine');
      if (res.status === 404) { setDisabled(true); setMailbox(null); return; }
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      setMailbox((await res.json()).mailbox);
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { if (status === 'authenticated') loadMine(); }, [status, loadMine]);

  useEffect(() => {
    if (!name) { setAvail(null); return; }
    setChecking(true);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/plugins/member-email/availability?name=${encodeURIComponent(name)}`);
        if (res.status === 404) { setDisabled(true); return; }
        setAvail(res.ok ? await res.json() : { available: false, reason: 'error' });
      } catch { setAvail({ available: false, reason: 'error' }); } finally { setChecking(false); }
    }, 400);
    return () => clearTimeout(debounce.current);
  }, [name]);

  const claim = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/v1/plugins/member-email/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ localPart: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Claim failed');
      setClaimed(data.address);
      await loadMine();
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  };

  if (status !== 'authenticated') return null;

  return (
    <div style={{ padding: '20px 24px', maxWidth: 560 }}>
      <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.3rem, 3vw, 1.8rem)', color: 'var(--text-bright)', margin: 0 }}>
        your fablab email
      </h1>

      {disabled ? (
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 16 }}>
          Member email is not available right now.
        </p>
      ) : mailbox === undefined ? (
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 16 }}>loading…</p>
      ) : mailbox ? (
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>your mailbox</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 16, color: 'var(--text-bright)', marginTop: 4 }}>{mailbox.address}</div>
          <div style={{ fontSize: 12, marginTop: 8, color: mailbox.status === 'active' ? 'var(--green)' : 'var(--amber)' }}>{mailbox.status}</div>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 12 }}>
            Set or reset your password from the welcome email PurelyMail sent to your personal address.
          </p>
        </div>
      ) : claimed ? (
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <div style={{ color: 'var(--green)', fontSize: 14, fontFamily: 'var(--mono)' }}>{claimed}</div>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
            Created! Check your personal email for a PurelyMail welcome message to set your password.
          </p>
        </div>
      ) : (
        <form onSubmit={claim} style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            Choose your address. You&apos;ll set the password yourself via the welcome email.
          </p>
          <label htmlFor="localPart" style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginTop: 12, marginBottom: 4 }}>
            desired address
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              id="localPart"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              spellCheck={false}
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              aria-describedby="avail-msg"
              style={{ fontFamily: 'var(--mono)', fontSize: 14, flex: '0 1 220px' }}
            />
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>@fablabfortsmith.org</span>
          </div>
          <div id="avail-msg" aria-live="polite" style={{ fontSize: 12, marginTop: 8, minHeight: 18 }}>
            {checking ? <span style={{ color: 'var(--text-dim)' }}>checking…</span>
              : avail == null ? null
              : avail.available ? <span style={{ color: 'var(--green)' }}>available</span>
              : <span style={{ color: 'var(--amber)' }}>{reasonText(avail.reason)}</span>}
          </div>
          {error && <div role="alert" style={{ color: 'var(--red, #f66)', fontSize: 12, marginTop: 8 }}>{error}</div>}
          <button type="submit" className="btn" disabled={busy || !avail?.available} style={{ marginTop: 12 }}>
            {busy ? 'claiming…' : 'claim address'}
          </button>
        </form>
      )}
    </div>
  );
}

function reasonText(reason) {
  switch (reason) {
    case 'taken': return 'already taken';
    case 'reserved': return 'reserved — choose another';
    case 'format': return 'letters, numbers, . _ - only (3–32 chars)';
    case 'length': return 'must be 3–32 characters';
    case 'required': return 'enter an address';
    default: return 'not available';
  }
}
