'use client';
import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';

const DISMISS_KEY = 'nudge.googleOnly.dismissed';

/**
 * Migration nudge for accounts whose ONLY sign-in method is Google
 * (docs/analysis/google-oauth-removal-impact.md §6, Phase 2).
 *
 * Google sign-in is being retired; these users must gain a second credential —
 * a password or a linked Discord — or they lose access. Rendered for signed-in
 * users only and shown just to the affected cohort, resolved server-side by
 * GET /api/v1/users/auth-methods (never from the 7-day JWT, so it disappears as
 * soon as the user acts).
 *
 * Dismissal is per browser session (sessionStorage), deliberately not permanent:
 * this warns about losing account access.
 *
 * @returns {JSX.Element|null} the banner, or null when it does not apply
 */
export default function AuthMethodsNudge() {
    const [show, setShow] = useState(false);
    const [retiresOn, setRetiresOn] = useState(null);
    const [linking, setLinking] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
            } catch { /* sessionStorage unavailable (private mode) — still show */ }
            try {
                const res = await fetch('/api/v1/users/auth-methods');
                if (!res.ok) return;                  // unauthenticated or error: stay silent
                const data = await res.json();
                if (!cancelled && data?.googleOnly) {
                    setRetiresOn(data.googleRetiresOn || null);
                    setShow(true);
                }
            } catch { /* offline / transient — the nudge is advisory, never block the app */ }
        })();
        return () => { cancelled = true; };
    }, []);

    const dismiss = () => {
        try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
        setShow(false);
    };

    const linkDiscord = async () => {
        setLinking(true);
        // Mark the upcoming OAuth round-trip as a LINK, not a new sign-in
        // (same contract the settings tab uses).
        try { await fetch('/api/v1/auth/link-intent', { method: 'POST' }); } catch { /* signIn still surfaces failure */ }
        signIn('discord', { callbackUrl: '/dashboard' });
    };

    if (!show) return null;

    return (
        <section
            aria-labelledby="google-retire-heading"
            style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
                margin: '12px 12px 0', padding: '10px 12px',
                border: '1px solid var(--amber)', background: 'rgba(255,176,0,0.06)',
                fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--text-bright)',
            }}
        >
            <div style={{ flex: 1, minWidth: 240 }}>
                <h2
                    id="google-retire-heading"
                    style={{ margin: 0, fontSize: 12.5, color: 'var(--amber)', fontWeight: 700 }}
                >
                    Google sign-in is being retired{retiresOn ? ` on ${retiresOn}` : ''}
                </h2>
                <p style={{ margin: '4px 0 0', color: 'var(--text-mid)' }}>
                    Google is currently your only way to sign in. Set a password or link Discord now
                    to keep access to your account.
                </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <a
                    href="/auth/forgot-password"
                    style={{
                        padding: '5px 10px', border: '1px solid var(--green)', color: 'var(--green)',
                        textDecoration: 'none', fontFamily: 'var(--mono)', fontSize: 12,
                    }}
                >
                    set a password
                </a>
                <button
                    type="button"
                    onClick={linkDiscord}
                    disabled={linking}
                    style={{
                        padding: '5px 10px', border: '1px solid var(--cyan)', color: 'var(--cyan)',
                        background: 'transparent', cursor: linking ? 'wait' : 'pointer',
                        fontFamily: 'var(--mono)', fontSize: 12,
                    }}
                >
                    {linking ? 'opening Discord…' : 'link Discord'}
                </button>
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Dismiss this notice for now"
                    style={{
                        padding: '5px 8px', border: '1px solid var(--bd-1)', color: 'var(--text-mid)',
                        background: 'transparent', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12,
                    }}
                >
                    ×
                </button>
            </div>
        </section>
    );
}
