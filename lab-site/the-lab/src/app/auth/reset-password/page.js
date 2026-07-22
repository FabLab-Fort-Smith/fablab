'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// #73 — Set a new password from a reset link. Reads the raw token from the URL,
// collects + confirms a new password, and POSTs to /api/auth/reset-password.
// The token is never rendered or logged; all server failures show one generic
// message (no enumeration). Terminal/phosphor UI matches the other auth pages.

const MIN_LENGTH = 8; // keep in sync with the server policy

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error | missing
  const [error, setError] = useState('');

  useEffect(() => {
    const t = searchParams.get('token');
    if (!t) {
      setStatus('missing');
    } else {
      setToken(t);
    }
  }, [searchParams]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');

    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      setStatus('error');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('success');
      } else {
        setError(data.error || 'Unable to reset password. The link may be invalid or expired.');
        setStatus('error');
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 400, width: '100%' }}>
        <div className="card" style={{ padding: '32px 28px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 20 }}>
            <span style={{ color: 'var(--green)' }}>$</span> ./auth reset-password
          </div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: '1.4rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 12 }}>
            set a new password
          </h1>

          {status === 'missing' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div role="alert" style={{ border: '1px solid var(--red)', background: 'rgba(255,56,56,0.06)', padding: '12px 16px', fontSize: 11, color: 'var(--red)', lineHeight: 1.6 }}>
                <span style={{ letterSpacing: '0.1em' }}>[ERROR]</span> This reset link is missing its token. Request a new link.
              </div>
              <Link href="/auth/forgot-password" className="btn btn--ghost" style={{ fontSize: 10, textAlign: 'center' }}>
                $ ./request --new-link
              </Link>
            </div>
          ) : status === 'success' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div role="status" style={{ border: '1px solid var(--green)', background: 'rgba(57,255,20,0.05)', padding: '12px 16px', fontSize: 11, color: 'var(--green)', lineHeight: 1.6 }}>
                <span style={{ letterSpacing: '0.1em' }}>[OK]</span> Your password has been reset. You can now sign in.
              </div>
              <Link href="/auth/signin" className="btn btn--filled" style={{ fontSize: 11, textAlign: 'center', justifyContent: 'center' }}>
                $ ./signin
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
              <p style={{ color: 'var(--text-mid)', fontSize: 12, lineHeight: 1.7, marginBottom: 4 }}>
                Enter a new password. Minimum {MIN_LENGTH} characters.
              </p>

              {error && (
                <div role="alert" style={{ border: '1px solid var(--red)', background: 'rgba(255,56,56,0.06)', padding: '10px 14px', fontSize: 11, color: 'var(--red)', lineHeight: 1.5 }}>
                  <span style={{ letterSpacing: '0.1em' }}>[ERROR]</span> {error}
                </div>
              )}

              <div>
                <label htmlFor="new-password" style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>NEW_PASSWORD</label>
                <input
                  id="new-password"
                  name="newPassword"
                  className="input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoFocus
                  minLength={MIN_LENGTH}
                  autoComplete="new-password"
                  aria-describedby="password-help"
                  placeholder="min. 8 characters"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
                <span id="password-help" style={{ display: 'block', fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>
                  Use at least {MIN_LENGTH} characters.
                </span>
              </div>

              <div>
                <label htmlFor="confirm-password" style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>CONFIRM_PASSWORD</label>
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  className="input"
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="re-enter password"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              <button
                type="submit"
                className="btn btn--filled"
                disabled={status === 'submitting'}
                style={{ width: '100%', justifyContent: 'center', fontSize: 11 }}
              >
                {status === 'submitting' ? '$ resetting...' : '$ ./set --new-password'}
              </button>
              <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)' }}>
                <Link href="/auth/signin" style={{ color: 'var(--text-mid)', textDecoration: 'none' }}>← back to login</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
