'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');

  const handleSubmit = async e => {
    e.preventDefault();
    setStatus('sending');
    // Password reset API not yet implemented — show a contact prompt
    setTimeout(() => setStatus('sent'), 800);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 400, width: '100%' }}>
        <div className="card" style={{ padding: '32px 28px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 20 }}>
            <span style={{ color: 'var(--green)' }}>$</span> ./auth forgot-password
          </div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: '1.4rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 12 }}>
            reset password
          </h1>
          <p style={{ color: 'var(--text-mid)', fontSize: 12, lineHeight: 1.7, marginBottom: 24 }}>
            Enter your email and we'll send a reset link if an account exists.
          </p>

          {status === 'sent' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ border: '1px solid var(--green)', background: 'rgba(57,255,20,0.05)', padding: '12px 16px', fontSize: 11, color: 'var(--green)', lineHeight: 1.6 }}>
                <span style={{ letterSpacing: '0.1em' }}>[OK]</span> If that email is in our system, a reset link is on its way.<br />
                <span style={{ color: 'var(--text-dim)', marginTop: 6, display: 'block' }}>
                  No email? Contact us at <a href="mailto:info@fablabfortsmith.com" style={{ color: 'var(--text-mid)' }}>info@fablabfortsmith.com</a>
                </span>
              </div>
              <Link href="/auth/signin" className="btn btn--ghost" style={{ fontSize: 10, textAlign: 'center' }}>
                ← back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>EMAIL_ADDRESS</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="you@example.com"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <button
                type="submit"
                className="btn btn--filled"
                disabled={status === 'sending'}
                style={{ width: '100%', justifyContent: 'center', fontSize: 11 }}
              >
                {status === 'sending' ? '$ sending...' : '$ ./send --reset-link'}
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
