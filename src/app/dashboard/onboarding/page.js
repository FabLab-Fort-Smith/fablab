"use client";
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const STEPS = [
    { label: 'Personal Information', description: 'Tell us a bit about yourself.', fields: ['firstName', 'lastName', 'bio', 'interests'] },
    { label: 'Membership Questions', description: 'Why do you want to join the FabLab?', fields: ['reason', 'projects'] },
    { label: 'Emergency Contact', description: 'Who should we call in case of an emergency?', fields: ['emergencyContactName', 'emergencyContactPhone'] },
];

const COMMON_INTERESTS = [
    "3D Printing", "Laser Cutting", "CNC Machining", "Woodworking", "Metalworking",
    "Electronics", "Arduino", "Raspberry Pi", "Programming", "Web Development",
    "Graphic Design", "CAD/CAM", "Sewing", "Embroidery", "Vinyl Cutting",
    "Gaming", "Reading", "Hiking", "Cooking", "Traveling", "Photography",
    "Music", "Art", "Gardening", "DIY", "Robotics", "Cosplay", "Board Games",
];

const FIELD_LABEL = {
    firstName: 'First Name', lastName: 'Last Name', bio: 'About You (Bio)',
    reason: 'Why do you want to join?', projects: 'What projects do you have in mind?',
    emergencyContactName: 'Emergency Contact Name', emergencyContactPhone: 'Emergency Contact Phone',
};

export default function OnboardingPage() {
    const { data: session, update } = useSession();
    const router = useRouter();
    const [activeStep, setActiveStep] = useState(0);
    const [formData, setFormData] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [interestInput, setInterestInput] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        if (session?.user) {
            setFormData(prev => ({ ...prev, firstName: session.user.firstName || '', lastName: session.user.lastName || '', bio: session.user.bio || '' }));
        }
    }, [session]);

    const handleChange = (field) => (e) => setFormData(prev => ({ ...prev, [field]: e.target.value }));

    const addInterest = (val) => {
        const v = val.trim();
        if (v && !(formData.interests || []).includes(v)) setFormData(prev => ({ ...prev, interests: [...(prev.interests || []), v] }));
        setInterestInput('');
        setShowSuggestions(false);
    };

    const removeInterest = (val) => setFormData(prev => ({ ...prev, interests: (prev.interests || []).filter(i => i !== val) }));

    const filteredSuggestions = COMMON_INTERESTS.filter(i => i.toLowerCase().includes(interestInput.toLowerCase()) && !(formData.interests || []).includes(i));

    const handleSubmit = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/v1/users?userID=${session.user.userID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName: formData.firstName, lastName: formData.lastName, bio: formData.bio, interests: formData.interests, isPublic: true, profileCompleted: true,
                    questions: { reason: formData.reason, interests: formData.interests, projects: formData.projects, emergencyContactName: formData.emergencyContactName, emergencyContactPhone: formData.emergencyContactPhone },
                    membership: { applicationDate: new Date().toISOString() },
                }),
            });
            if (!res.ok) throw new Error('Failed to submit application');
            await update();
            router.push('/dashboard');
        } catch (err) { setError('Failed to submit application. Please try again.'); }
        finally { setLoading(false); }
    };

    const step = STEPS[activeStep];

    return (
        <div style={{ padding: '20px 24px', maxWidth: 640, margin: '0 auto' }}>
            <div style={{ marginBottom: 28 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}><span style={{ color: 'var(--green)' }}>$</span> ./onboarding --apply</div>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>membership application</h1>
            </div>

            <div style={{ border: '1px solid var(--cyan)', background: 'rgba(0,255,255,0.03)', padding: '10px 16px', marginBottom: 20, fontSize: 11, color: 'var(--cyan)', fontFamily: 'var(--mono)' }}>
                ℹ REWARD: Earn <strong>10 Stake</strong> upon completion!
            </div>

            {error && <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '10px 14px', marginBottom: 20, fontSize: 12, fontFamily: 'var(--mono)' }}>✕ {error}</div>}

            {/* Step indicators */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 24 }}>
                {STEPS.map((s, i) => (
                    <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: i < activeStep ? 'var(--green)' : i === activeStep ? 'var(--bg-card)' : 'var(--bg-1)', border: `2px solid ${i <= activeStep ? 'var(--green)' : 'var(--bd)'}`, color: i <= activeStep ? 'var(--green)' : 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700, margin: '0 auto 6px' }}>
                            {i < activeStep ? '✓' : i + 1}
                        </div>
                        <div style={{ fontSize: 9, letterSpacing: '0.08em', color: i === activeStep ? 'var(--green)' : 'var(--text-dim)' }}>{s.label.toUpperCase()}</div>
                    </div>
                ))}
            </div>

            <div style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '24px 28px' }}>
                <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 4 }}>{step.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>{step.description}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {step.fields.map(field => {
                        if (field === 'interests') {
                            return (
                                <div key={field}>
                                    <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>INTERESTS &amp; SKILLS</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                        {(formData.interests || []).map(i => (
                                            <span key={i} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', border: '1px solid var(--green)', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {i} <button type="button" onClick={() => removeInterest(i)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 10, padding: 0 }}>×</button>
                                            </span>
                                        ))}
                                    </div>
                                    <div style={{ position: 'relative' }}>
                                        <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} placeholder="Add interests... (press Enter)"
                                            value={interestInput}
                                            onChange={e => { setInterestInput(e.target.value); setShowSuggestions(true); }}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (interestInput.trim()) addInterest(interestInput); } }}
                                            onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 150)} />
                                        {showSuggestions && interestInput && filteredSuggestions.length > 0 && (
                                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--bd)', zIndex: 100, maxHeight: 180, overflowY: 'auto' }}>
                                                {filteredSuggestions.slice(0, 8).map(s => (
                                                    <button key={s} type="button" onMouseDown={() => addInterest(s)} style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', borderBottom: '1px solid var(--bd)' }}>{s}</button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        }
                        return (
                            <div key={field}>
                                <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>{FIELD_LABEL[field]?.toUpperCase() || field.toUpperCase()} *</label>
                                {field === 'bio' || field === 'reason' || field === 'projects' ? (
                                    <textarea className="input" rows={3} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 12 }} value={formData[field] || ''} onChange={handleChange(field)} required />
                                ) : (
                                    <input className="input" style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} value={formData[field] || ''} onChange={handleChange(field)} required />
                                )}
                            </div>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
                    <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} disabled={activeStep === 0 || loading} onClick={() => setActiveStep(p => p - 1)}>← back</button>
                    <button className="btn btn--filled btn--sm" style={{ fontSize: 10 }} disabled={loading} onClick={activeStep === STEPS.length - 1 ? handleSubmit : () => setActiveStep(p => p + 1)}>
                        {activeStep === STEPS.length - 1 ? (loading ? '$ submitting...' : '$ submit application') : 'continue →'}
                    </button>
                </div>
            </div>
        </div>
    );
}
