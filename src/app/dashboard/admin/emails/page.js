'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const EMAIL_TEMPLATES = [
    {
        id: 'verification',
        name: 'Email Verification',
        trigger: 'User registers with email/password',
        subject: 'Verify Your Email Address',
        description: 'Sent automatically when a user creates a credentials account. Contains a verification link.',
        color: 'var(--cyan)',
    },
    {
        id: 'password_reset',
        name: 'Password Reset',
        trigger: 'User requests password reset',
        subject: 'Password Reset Request',
        description: 'Sent when a user clicks "forgot password". Contains a reset link valid for a limited time.',
        color: 'var(--amber)',
    },
    {
        id: 'application_received',
        name: 'Application Received',
        trigger: 'User submits membership application',
        subject: 'Membership Application Received',
        description: 'Sent to the applicant confirming their submission was received.',
        color: 'var(--green)',
    },
    {
        id: 'admin_notification',
        name: 'Admin Notification',
        trigger: 'Various admin events (new application, volunteer hours, etc.)',
        subject: 'Dynamic — set by event',
        description: 'General-purpose admin alert. Used for new applications, pending volunteer hours, and access key reminders.',
        color: 'var(--magenta)',
    },
    {
        id: 'status_change',
        name: 'Membership Status Change',
        trigger: 'User membership status changes',
        subject: 'Your Membership Status Has Been Updated',
        description: 'Sent when a user\'s membership status changes (e.g. registered → active, active → suspended).',
        color: 'var(--green)',
    },
    {
        id: 'nudge',
        name: 'Member Nudge',
        trigger: 'Admin clicks "nudge" on a user',
        subject: 'Dynamic — based on member status',
        description: 'Personalized prompt based on what step the member is stuck on (application, hours, profile, etc.).',
        color: 'var(--cyan)',
    },
    {
        id: 'volunteer_approved',
        name: 'Volunteer Hours Approved',
        trigger: 'Admin approves a volunteer log entry',
        subject: 'Your Volunteer Hours Have Been Approved',
        description: 'Sent to a member when their submitted volunteer hours are marked approved.',
        color: 'var(--green)',
    },
];

export default function EmailTemplatesPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [testEmail, setTestEmail] = useState('');
    const [sending, setSending] = useState(null);
    const [toast, setToast] = useState(null);
    const [nudgeUserID, setNudgeUserID] = useState('');

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated' && session.user.role !== 'admin') router.push('/dashboard');
    }, [status, session, router]);

    const showToast = (msg, color = 'var(--green)') => { setToast({ msg, color }); setTimeout(() => setToast(null), 3500); };

    const sendNudge = async () => {
        if (!nudgeUserID.trim()) { showToast('Enter a userID to nudge.', 'var(--amber)'); return; }
        setSending('nudge');
        try {
            const res = await fetch('/api/v1/users/nudge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID: nudgeUserID.trim() }),
            });
            const data = await res.json();
            if (res.ok) showToast(`Nudge sent: ${data.message}`);
            else showToast(data.error || 'Failed to send nudge.', 'var(--red)');
        } catch { showToast('Network error.', 'var(--red)'); }
        finally { setSending(null); }
    };

    if (status !== 'authenticated') return null;

    return (
        <div style={{ padding: '20px 24px' }}>
            {toast && (
                <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, background: 'var(--bg-card)', border: `1px solid ${toast.color}`, color: toast.color, padding: '12px 18px', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {toast.msg}
                </div>
            )}

            <div style={{ marginBottom: 28 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                    <span style={{ color: 'var(--green)' }}>$</span> ./emails --list-templates
                </div>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                    email.templates
                </h1>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
                    All transactional emails are sent via nodemailer through Gmail SMTP.
                </div>
            </div>

            {/* Nudge tool */}
            <div style={{ border: '1px solid var(--cyan)', background: 'rgba(0,255,255,0.02)', padding: '16px 20px', marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: 'var(--cyan)', fontFamily: 'var(--mono)', marginBottom: 12 }}>⚡ SEND NUDGE</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                        className="input"
                        placeholder="userID (e.g. user-abc123)"
                        value={nudgeUserID}
                        onChange={e => setNudgeUserID(e.target.value)}
                        style={{ fontSize: 12, width: 260, boxSizing: 'border-box' }}
                    />
                    <button
                        className="btn btn--sm"
                        style={{ fontSize: 10, borderColor: 'var(--cyan)', color: 'var(--cyan)' }}
                        onClick={sendNudge}
                        disabled={sending === 'nudge'}
                    >
                        {sending === 'nudge' ? '$ sending...' : '$ send nudge'}
                    </button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 8 }}>
                    Nudge is context-aware — it detects the user's current onboarding step and sends the appropriate prompt.
                </div>
            </div>

            {/* Template list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {EMAIL_TEMPLATES.map(t => (
                    <div key={t.id} style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '16px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: t.color, border: `1px solid ${t.color}`, padding: '2px 8px' }}>{t.id}</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-bright)' }}>{t.name}</span>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', marginBottom: 8 }}>
                            <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)' }}>TRIGGER</span>
                            <span style={{ fontSize: 11, color: 'var(--text-mid)' }}>{t.trigger}</span>
                            <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)' }}>SUBJECT</span>
                            <span style={{ fontSize: 11, color: 'var(--text-mid)', fontFamily: 'var(--mono)' }}>{t.subject}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>{t.description}</div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: 24, border: '1px solid var(--bd)', padding: '14px 18px', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                <span style={{ color: 'var(--amber)' }}>⚠</span> Templates are defined in <code style={{ color: 'var(--text)' }}>src/app/utils/email.util.js</code>. Edit that file to update email HTML.
            </div>
        </div>
    );
}
