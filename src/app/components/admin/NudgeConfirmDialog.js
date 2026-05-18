'use client';

export default function NudgeConfirmDialog({ open, onClose, onConfirm, nudgeDetails, loading }) {
    if (!open || !nudgeDetails) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
            <div className="card" style={{ maxWidth: 500, width: '100%' }} onClick={e => e.stopPropagation()}>
                <div className="card-header">
                    <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>send nudge notification</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>
                        recipient: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{nudgeDetails.recipient}</span>
                    </div>
                    <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-1)', padding: '12px 16px' }}>
                        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 6 }}>STEP: {nudgeDetails.step}</div>
                        <div style={{ fontSize: 12, color: 'var(--text)', fontStyle: 'italic', lineHeight: 1.6, marginBottom: 10 }}>"{nudgeDetails.message}"</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span className="pill" style={{ fontSize: 10, opacity: 0.6 }}>{nudgeDetails.actionText}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>{nudgeDetails.actionLink}</span>
                        </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        this will send an email notification to the user immediately.
                    </div>
                </div>
                <div style={{ padding: '12px 24px', borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={onClose} disabled={loading}>cancel</button>
                    <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} onClick={onConfirm} disabled={loading}>
                        {loading ? '$ sending...' : '$ send email'}
                    </button>
                </div>
            </div>
        </div>
    );
}
