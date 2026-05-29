'use client';
import { useState } from 'react';

export default function DeclineDialog({ open, onClose, onConfirm, user, loading }) {
    const [reason, setReason] = useState('');
    const [sendEmail, setSendEmail] = useState(true);

    if (!open || !user) return null;

    const handleConfirm = () => {
        onConfirm(reason, sendEmail);
        setReason('');
        setSendEmail(true);
    };

    const previewText = `Hi ${user.firstName || 'there'}, thank you for your interest in The Lab. After reviewing your application, we aren't able to move forward at this time. We appreciate your interest in the community and hope to see you at a future event.`;

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={onClose}
        >
            <div className="card" style={{ maxWidth: 480, width: '100%' }} onClick={e => e.stopPropagation()}>
                <div className="card-header">
                    <span style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
                        decline: {user.firstName} {user.lastName}
                    </span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                </div>

                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.14em', marginBottom: 6 }}>INTERNAL NOTE (admin-only, optional)</label>
                        <textarea
                            className="input"
                            rows={3}
                            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 12 }}
                            placeholder="Reason for declining (not sent to applicant)..."
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                        />
                    </div>

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 12, color: 'var(--text-mid)' }}>
                        <input
                            type="checkbox"
                            checked={sendEmail}
                            onChange={e => setSendEmail(e.target.checked)}
                            style={{ marginTop: 2, accentColor: 'var(--red)' }}
                        />
                        Send decline email to applicant
                    </label>

                    {sendEmail && (
                        <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-1)', padding: '12px 16px' }}>
                            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 6 }}>EMAIL_PREVIEW</div>
                            <div style={{ fontSize: 11, color: 'var(--text-mid)', lineHeight: 1.7, fontStyle: 'italic' }}>
                                &quot;{previewText}&quot;
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ padding: '12px 24px', borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={onClose} disabled={loading}>cancel</button>
                    <button
                        className="btn btn--filled btn--sm"
                        style={{ fontSize: 10, borderColor: 'var(--red)', background: 'rgba(255,50,50,0.08)', color: 'var(--red)' }}
                        onClick={handleConfirm}
                        disabled={loading}
                    >
                        {loading ? '$ declining...' : '$ confirm decline'}
                    </button>
                </div>
            </div>
        </div>
    );
}
