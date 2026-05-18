'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

const OAUTH_LABELS = { discord: '$ ./signin --discord', google: '$ ./signin --google', github: '$ ./signin --github' };

export default function SignInClient({ providers }) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const oauthProviders = providers ? Object.values(providers).filter(p => p.id !== 'credentials') : [];

  const handleSubmit = async e => {
    e.preventDefault();
    setStatus('submitting');
    setError('');
    try {
      const res = await signIn('credentials', {
        redirect: false,
        identifier: form.identifier,
        password: form.password,
        callbackUrl,
      });
      if (res?.error) {
        setError(res.error === 'CredentialsSignin'
          ? 'Invalid email/username or password.'
          : res.error);
        setStatus('idle');
      } else {
        window.location.href = res?.url || callbackUrl;
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setStatus('idle');
    }
  };

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', flexDirection: 'column', gap: 16 }}>

      {/* Account-cleanup notice */}
      <div style={{ maxWidth: 400, width: '100%', border: '1px solid var(--amber)', background: 'rgba(255,176,0,0.06)', padding: '12px 16px', fontSize: 11, color: 'var(--amber)', lineHeight: 1.6 }}>
        <span style={{ letterSpacing: '0.1em' }}>[NOTICE]</span> Inactive accounts without an active membership have been removed. If you cannot sign in, <Link href="/auth/register" style={{ color: 'var(--amber)' }}>create a new account</Link>.
      </div>

      <div style={{ maxWidth: 400, width: '100%' }}>
        <div className="card" style={{ padding: '32px 28px' }}>
          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
              <span style={{ color: 'var(--green)' }}>$</span> ./auth signin
            </div>
            <h1 style={{ fontFamily: 'var(--display)', fontSize: '1.6rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
              login
            </h1>
          </div>

          {error && (
            <div style={{ border: '1px solid var(--red)', background: 'rgba(255,56,56,0.06)', padding: '10px 14px', fontSize: 11, color: 'var(--red)', marginBottom: 20, lineHeight: 1.5 }}>
              <span style={{ letterSpacing: '0.1em' }}>[ERROR]</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>EMAIL_OR_USERNAME</label>
              <input
                className="input"
                type="text"
                name="identifier"
                value={form.identifier}
                onChange={set('identifier')}
                required
                autoFocus
                placeholder="you@example.com"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>PASSWORD</label>
                <Link href="/auth/forgot-password" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em', textDecoration: 'none' }}
                  onMouseEnter={e => e.target.style.color = 'var(--green)'}
                  onMouseLeave={e => e.target.style.color = 'var(--text-dim)'}
                >forgot?</Link>
              </div>
              <input
                className="input"
                type="password"
                name="password"
                value={form.password}
                onChange={set('password')}
                required
                placeholder="••••••••"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <button
              type="submit"
              className="btn btn--filled"
              disabled={status === 'submitting'}
              style={{ width: '100%', justifyContent: 'center', fontSize: 11, marginTop: 4 }}
            >
              {status === 'submitting' ? '$ authenticating...' : '$ ./login --submit'}
            </button>
          </form>

          {oauthProviders.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--bd)' }} />
                <span style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em' }}>OR</span>
                <div style={{ flex: 1, height: 1, background: 'var(--bd)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {oauthProviders.map(p => (
                  <button
                    key={p.id}
                    className="btn btn--ghost"
                    style={{ width: '100%', justifyContent: 'center', fontSize: 10 }}
                    onClick={() => signIn(p.id, { callbackUrl })}
                  >
                    {OAUTH_LABELS[p.id] || `$ ./signin --${p.id}`}
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: 'var(--text-dim)' }}>
            no account?{' '}
            <Link href={`/auth/register?callbackUrl=${encodeURIComponent(callbackUrl)}`} style={{ color: 'var(--green)', textDecoration: 'none' }}>
              register
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
