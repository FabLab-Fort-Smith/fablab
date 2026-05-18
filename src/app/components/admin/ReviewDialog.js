'use client';

const WORKFLOW_STEPS = [
    { label: 'Applied' },
    { label: 'Reviewed' },
    { label: 'Contacted' },
    { label: 'Onboarding Complete' },
];

function Field({ label, value }) {
    return (
        <div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
            <div style={{ color: 'var(--text-mid)', fontSize: 12, lineHeight: 1.6 }}>{value || 'N/A'}</div>
        </div>
    );
}

export default function ReviewDialog({ open, onClose, user, onReview, onMarkContacted, onMarkOnboardingComplete, onDecline }) {
    if (!open || !user) return null;

    const m = user.membership || {};
    const q = typeof user.questions === 'object' && user.questions !== null ? user.questions : {};

    const isReviewed = m.reviewStatus === 'reviewed';
    const isContacted = !!m.contacted;
    const isOnboardingComplete = !!m.onboardingComplete;
    const isDeclined = m.status === 'declined';

    const workflowStep = isOnboardingComplete ? 4 : isContacted ? 3 : isReviewed ? 2 : 1;

    const appliedDate = m.applicationDate ? new Date(m.applicationDate).toLocaleDateString() : null;
    const registeredDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : null;

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={onClose}
        >
            <div className="card" style={{ maxWidth: 660, width: '100%', maxHeight: '92vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                {/* Header */}
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

                {/* Workflow Stepper */}
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--bd)', background: 'var(--bg-1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                        {WORKFLOW_STEPS.map((step, i) => {
                            const stepNum = i + 1;
                            const isDone = workflowStep > stepNum;
                            const isCurrent = workflowStep === stepNum;
                            return (
                                <div key={step.label} style={{ display: 'flex', alignItems: 'center', flex: i < WORKFLOW_STEPS.length - 1 ? 1 : 0 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                        <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${isDone || isCurrent ? 'var(--green)' : 'var(--bd)'}`, background: isDone ? 'var(--green)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontFamily: 'var(--mono)', color: isDone ? 'var(--bg)' : isCurrent ? 'var(--green)' : 'var(--text-dim)', flexShrink: 0 }}>
                                            {isDone ? '✓' : stepNum}
                                        </div>
                                        <div style={{ fontSize: 8, color: isCurrent ? 'var(--green)' : isDone ? 'var(--text)' : 'var(--text-dim)', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{step.label.toUpperCase()}</div>
                                    </div>
                                    {i < WORKFLOW_STEPS.length - 1 && (
                                        <div style={{ flex: 1, height: 1, background: isDone ? 'var(--green)' : 'var(--bd)', margin: '0 6px', marginBottom: 14 }} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>

                    {/* Dates */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div style={{ border: '1px solid var(--bd)', padding: '10px 14px' }}>
                            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 4 }}>REGISTERED_ON</div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>{registeredDate || 'N/A'}</div>
                        </div>
                        <div style={{ border: '1px solid var(--bd)', padding: '10px 14px' }}>
                            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 4 }}>APPLIED_ON</div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>{appliedDate || 'N/A'}</div>
                        </div>
                    </div>

                    {/* Personal info */}
                    <div>
                        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.14em', marginBottom: 12 }}>PERSONAL_INFO</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <Field label="PHONE" value={user.phoneNumber} />
                                <Field label="DISCORD" value={user.discordHandle} />
                            </div>
                            <Field label="BIO" value={user.bio} />
                            <Field label="INTERESTS" value={user.interests?.length ? user.interests.join(', ') : null} />
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

                    {/* Emergency Contact */}
                    <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 16 }}>
                        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.14em', marginBottom: 12 }}>EMERGENCY_CONTACT</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <Field label="NAME" value={q.emergencyContactName} />
                            <Field label="PHONE" value={q.emergencyContactPhone} />
                        </div>
                    </div>

                    {/* Questionnaire */}
                    <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 16 }}>
                        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.14em', marginBottom: 12 }}>QUESTIONNAIRE</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <Field label="WHY_JOIN" value={q.reason} />
                            <Field label="PROJECTS" value={q.projects} />
                            <Field label="WHAT_WOULD_YOU_CHANGE_ABOUT_THE_CITY" value={q.cityChange || user.cityChange} />
                            <Field label="KNOWN_MEMBERS" value={q.knownMembers || user.knownMembers} />
                            <Field label="QUESTIONS_FOR_US" value={q.questions || (typeof user.questions === 'string' ? user.questions : null)} />
                        </div>
                    </div>
                </div>

                {/* Action Bar */}
                <div style={{ padding: '12px 24px', borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button
                        className="btn btn--ghost btn--sm"
                        style={{ fontSize: 10, borderColor: 'var(--red)', color: 'var(--red)' }}
                        onClick={() => onDecline && onDecline(user)}
                        disabled={isDeclined}
                    >
                        {isDeclined ? '✗ declined' : '$ decline'}
                    </button>

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={onClose}>close</button>

                        {!isReviewed && (
                            <button
                                className="btn btn--filled btn--sm"
                                style={{ fontSize: 10 }}
                                onClick={() => onReview && onReview(user)}
                            >
                                $ mark reviewed
                            </button>
                        )}

                        {isReviewed && !isContacted && (
                            <button
                                className="btn btn--filled btn--sm"
                                style={{ fontSize: 10 }}
                                onClick={() => onMarkContacted && onMarkContacted(user)}
                            >
                                $ mark contacted
                            </button>
                        )}

                        {isContacted && !isOnboardingComplete && (
                            <button
                                className="btn btn--filled btn--sm"
                                style={{ fontSize: 10 }}
                                onClick={() => onMarkOnboardingComplete && onMarkOnboardingComplete(user)}
                            >
                                $ mark onboarding complete
                            </button>
                        )}

                        {isOnboardingComplete && (
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', border: '1px solid var(--green)', padding: '4px 10px' }}>
                                ✓ ready for payment
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
