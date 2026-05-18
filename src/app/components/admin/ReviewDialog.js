'use client';

export default function ReviewDialog({ open, onClose, user, onReview }) {
    if (!open || !user) return null;

    const isReviewed = user.membership?.reviewStatus === 'reviewed';

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
            <div className="card" style={{ maxWidth: 620, width: '100%', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                <div className="card-header">
                    <div>
                        <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
                            review: {user.firstName} {user.lastName}
                        </span>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                            @{user.username} · {user.email}
                            {user.discordHandle && <span style={{ color: 'var(--magenta)', marginLeft: 10 }}>discord: {user.discordHandle}</span>}
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                </div>

                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.14em', marginBottom: 12 }}>PERSONAL_INFO</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div>
                                <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 4 }}>BIO</div>
                                <div style={{ color: 'var(--text-mid)', fontSize: 12, lineHeight: 1.6 }}>{user.bio || 'N/A'}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 4 }}>INTERESTS</div>
                                <div style={{ color: 'var(--text-mid)', fontSize: 12 }}>{user.interests?.length ? user.interests.join(', ') : 'N/A'}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 6 }}>CREATOR_TYPE</div>
                                {Array.isArray(user.creatorType) && user.creatorType.length > 0
                                    ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {user.creatorType.map(t => <span key={t} className="pill" style={{ fontSize: 10 }}>{t}</span>)}
                                    </div>
                                    : <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>N/A</div>
                                }
                            </div>
                        </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 16 }}>
                        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.14em', marginBottom: 12 }}>QUESTIONNAIRE</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {[
                                { label: 'WHAT_WOULD_YOU_CHANGE_ABOUT_THE_CITY', val: user.cityChange },
                                { label: 'KNOWN_MEMBERS', val: user.knownMembers },
                                { label: 'QUESTIONS_FOR_US', val: typeof user.questions === 'string' ? user.questions : null },
                            ].map(({ label, val }) => (
                                <div key={label}>
                                    <div style={{ fontSize: 9, color: 'var(--green)', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
                                    <div style={{ color: 'var(--text-mid)', fontSize: 12, lineHeight: 1.6 }}>{val || 'N/A'}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div style={{ padding: '12px 24px', borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={onClose}>close</button>
                    <button
                        className="btn btn--filled btn--sm"
                        style={{ fontSize: 10, borderColor: isReviewed ? 'var(--amber)' : 'var(--green)', background: isReviewed ? 'rgba(255,170,0,0.1)' : 'rgba(57,255,20,0.1)', color: isReviewed ? 'var(--amber)' : 'var(--green)' }}
                        onClick={() => onReview(user)}
                    >
                        {isReviewed ? '$ mark needs-review' : '$ mark reviewed'}
                    </button>
                </div>
            </div>
        </div>
    );
}
