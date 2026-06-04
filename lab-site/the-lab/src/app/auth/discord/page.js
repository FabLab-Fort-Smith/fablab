'use client';
import { useEffect } from 'react';
import { signIn } from 'next-auth/react';

export default function DiscordAuthPage() {
  useEffect(() => { signIn('discord', { callbackUrl: '/dashboard' }); }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
        <span style={{ color: 'var(--green)' }}>$</span> ./auth --discord --redirect
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-mid)', fontSize: 11 }}>
        <span className="dot pulse" style={{ background: 'var(--magenta)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
        redirecting to discord...
      </div>
    </div>
  );
}
