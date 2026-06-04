'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const isRegistered = searchParams.get('registered');
  const email = searchParams.get('email');
  const [steps, setSteps] = useState([]);
  const [done, setDone] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState('');

  const addStep = msg => setSteps(s => [...s, msg]);

  useEffect(() => {
    if (!token && isRegistered) {
      setSteps(['verification email sent to your inbox.', 'click the link in the email to verify your account.']);
      setDone(true);
      return;
    }
    if (!token) {
      setSteps(['[ERROR] verification token is missing.']);
      setDone(true);
      return;
    }
    addStep('retrieving token...');
    setTimeout(() => {
      addStep('sending token to server...');
      (async () => {
        try {
          const res = await fetch(`/api/auth/verify-email?token=${token}`);
          const data = await res.json();
          if (res.ok) {
            addStep('email verified successfully.');
            addStep('+10 stake added to your account.');
            setSuccess(true);
          } else {
            addStep(`[ERROR] ${data.error || 'verification failed.'}`);
          }
        } catch {
          addStep('[ERROR] network error during verification.');
        }
        setDone(true);
      })();
    }, 1000);
  }, [token, isRegistered]);

  useEffect(() => {
    if (success) {
      const id = setTimeout(() => router.push('/auth/signin'), 3000);
      return () => clearTimeout(id);
    }
  }, [success, router]);

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    setResendStatus('');
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setResendStatus(res.ok ? 'sent' : (data.error || 'failed'));
    } catch {
      setResendStatus('network error');
    }
    setResending(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        <div className="card" style={{ padding: '32px 28px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 20 }}>
            <span style={{ color: 'var(--green)' }}>$</span> ./auth verify-email
          </div>

          {/* Terminal output */}
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
            {steps.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: line.includes('[ERROR]') ? 'var(--red)' : line.includes('successfully') || line.includes('stake') ? 'var(--green)' : 'var(--text-mid)' }}>
                <span style={{ color: 'var(--green)', flexShrink: 0 }}>&gt;</span>
                {line}
              </div>
            ))}
            {!done && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-dim)' }}>
                <span style={{ color: 'var(--green)' }}>&gt;</span>
                <span className="dot pulse" style={{ background: 'var(--green)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
                processing...
              </div>
            )}
            {success && (
              <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 4 }}>
                redirecting to login in 3s...
              </div>
            )}
          </div>

          {/* Resend button */}
          {isRegistered && email && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn btn--ghost"
                onClick={handleResend}
                disabled={resending}
                style={{ fontSize: 10 }}
              >
                {resending ? '$ sending...' : '$ ./resend --verification-email'}
              </button>
              {resendStatus === 'sent' && (
                <div style={{ fontSize: 11, color: 'var(--green)', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="dot pulse" style={{ background: 'var(--green)', width: 5, height: 5, borderRadius: '50%', display: 'inline-block' }} />
                  email sent — check your inbox
                </div>
              )}
              {resendStatus && resendStatus !== 'sent' && (
                <div style={{ fontSize: 11, color: 'var(--red)' }}>[ERROR] {resendStatus}</div>
              )}
            </div>
          )}

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--bd)', fontSize: 11, color: 'var(--text-dim)' }}>
            <Link href="/auth/signin" style={{ color: 'var(--text-mid)', textDecoration: 'none' }}>← back to login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
