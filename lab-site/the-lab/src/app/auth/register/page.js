'use client';
import { useState, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Turnstile } from '@marsidev/react-turnstile';

// Public site key, inlined at build. NO hardcoded fallback — a shipped default is exactly the
// test-key leak SEC-21 guards against; the widget fails closed (below) if it's unset.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const STEPS = [
  { num: '01', title: 'submit_application', desc: 'Complete this form. Takes about 2 minutes.' },
  { num: '02', title: 'initial_contact', desc: 'A co-op member reaches out within one week.' },
  { num: '03', title: 'onboarding', desc: 'Meet to complete paperwork and tour the facility.' },
  { num: '04', title: 'volunteer_hours', desc: 'Contribute 4 hours in your first month.' },
  { num: '05', title: 'key_issued', desc: 'Receive fob access after onboarding and volunteer hours.' },
  { num: '06', title: 'full_access', desc: '24/7 key after 3 months in good standing.' },
];

export default function RegisterPage() {
  const [form, setForm] = useState({ firstName: '', lastName: '', username: '', email: '', password: '', phoneNumber: '' });
  const [error, setError] = useState('');
  const [status, setStatus] = useState('idle');
  const [captchaToken, setCaptchaToken] = useState('');
  const turnstileRef = useRef(null);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (!captchaToken) { setError('Please complete the captcha.'); return; }
    setStatus('submitting');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, captchaToken }),
      });
      if (res.ok) {
        window.location.href = `/auth/verify-email?registered=true&email=${encodeURIComponent(form.email)}`;
      } else {
        const data = await res.json();
        setError(data.message || 'Registration failed.');
        // a Turnstile token is single-use — reset the widget after any failed attempt.
        turnstileRef.current?.reset();
        setCaptchaToken('');
        setStatus('idle');
      }
    } catch {
      setError('Something went wrong. Please try again.');
      turnstileRef.current?.reset();
      setCaptchaToken('');
      setStatus('idle');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: 52 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px', display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 64, alignItems: 'start' }} className="register-grid">

        {/* Left: process info */}
        <div>
          <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
            <span style={{ color: 'var(--green)' }}>$</span> cat ./membership/process.md
          </div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 16 }}>
            co-op application
          </h1>
          <p style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 1.8, marginBottom: 32 }}>
            The Lab is a member-owned cooperative. Joining means becoming part of the community — not just buying access.
          </p>

          <div style={{ border: '1px solid var(--green)', background: 'rgba(57,255,20,0.04)', padding: '12px 16px', marginBottom: 28, fontSize: 11, color: 'var(--green)', lineHeight: 1.6 }}>
            <span style={{ letterSpacing: '0.1em' }}>[REWARD]</span> Earn <strong>10 Stake</strong> just for registering.
          </div>

          <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 16 }}>MEMBERSHIP_PROCESS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {STEPS.map((s, i) => (
              <div key={s.num} style={{ display: 'flex', gap: 16, paddingBottom: i < STEPS.length - 1 ? 16 : 0, paddingTop: i > 0 ? 16 : 0, borderBottom: i < STEPS.length - 1 ? '1px solid var(--bd)' : 'none' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 20, color: 'var(--text-dim)', letterSpacing: '-0.04em', flexShrink: 0, lineHeight: 1.3, minWidth: 28 }}>{s.num}</div>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontSize: 10, letterSpacing: '0.1em', marginBottom: 4 }}>{s.title}</div>
                  <div style={{ color: 'var(--text-mid)', fontSize: 12, lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: form */}
        <div>
          <div className="card" style={{ padding: '32px 28px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 20 }}>CREATE_ACCOUNT</div>

            {error && (
              <div style={{ border: '1px solid var(--red)', background: 'rgba(255,56,56,0.06)', padding: '10px 14px', fontSize: 11, color: 'var(--red)', marginBottom: 20, lineHeight: 1.5 }}>
                <span style={{ letterSpacing: '0.1em' }}>[ERROR]</span> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>FIRST_NAME</label>
                  <input className="input" name="firstName" value={form.firstName} onChange={set('firstName')} required placeholder="Ada" style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>LAST_NAME</label>
                  <input className="input" name="lastName" value={form.lastName} onChange={set('lastName')} required placeholder="Lovelace" style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>USERNAME</label>
                <input className="input" name="username" value={form.username} onChange={set('username')} required placeholder="ada_makes" style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>EMAIL</label>
                <input className="input" type="email" name="email" value={form.email} onChange={set('email')} required placeholder="ada@example.com" style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>PHONE</label>
                <input className="input" type="tel" name="phoneNumber" value={form.phoneNumber} onChange={set('phoneNumber')} required placeholder="+1 (479) 555-0000" style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>PASSWORD</label>
                <input className="input" type="password" name="password" value={form.password} onChange={set('password')} required placeholder="min. 8 characters" style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                {TURNSTILE_SITE_KEY ? (
                  <Turnstile
                    ref={turnstileRef}
                    siteKey={TURNSTILE_SITE_KEY}
                    options={{ theme: 'dark' }}
                    onSuccess={token => setCaptchaToken(token)}
                    onError={() => setCaptchaToken('')}
                    onExpire={() => setCaptchaToken('')}
                  />
                ) : (
                  <div role="alert" style={{ fontSize: 10, color: 'var(--red)', letterSpacing: '0.1em', textAlign: 'center' }}>
                    [CONFIG] captcha unavailable — NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set.
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="btn btn--filled"
                disabled={status === 'submitting'}
                style={{ width: '100%', justifyContent: 'center', fontSize: 11, marginTop: 4 }}
              >
                {status === 'submitting' ? '$ submitting...' : '$ ./register --submit'}
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--bd)' }} />
              <span style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: 'var(--bd)' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="btn btn--ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 10 }} onClick={() => signIn('google', { callbackUrl })}>
                $ ./register --google
              </button>
              <button className="btn btn--ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 10, borderColor: 'var(--magenta)', color: 'var(--magenta)' }} onClick={() => signIn('discord', { callbackUrl })}>
                $ ./register --discord
              </button>
            </div>

            <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: 'var(--text-dim)' }}>
              already a member?{' '}
              <Link href="/auth/signin" style={{ color: 'var(--green)', textDecoration: 'none' }}>sign in</Link>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 760px) { .register-grid { grid-template-columns: 1fr !important; gap: 40px !important; } }
      `}</style>
    </div>
  );
}
