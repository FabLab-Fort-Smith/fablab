'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function PlansPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);
    const [addOpen, setAddOpen] = useState(false);
    const [editPlan, setEditPlan] = useState(null);
    const [archivePlan, setArchivePlan] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({ name: '', monthlyPrice: '', annualPrice: '' });
    const [editName, setEditName] = useState('');

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated') {
            if (session.user.role !== 'admin') router.push('/dashboard');
            else fetchPlans();
        }
    }, [status, session]);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const fetchPlans = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/admin/plans');
            if (!res.ok) throw new Error('Failed to fetch');
            setPlans(await res.json());
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async () => {
        if (!form.name || !form.monthlyPrice) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/v1/admin/plans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name,
                    monthlyPriceCents: Math.round(parseFloat(form.monthlyPrice) * 100),
                    annualPriceCents: form.annualPrice ? Math.round(parseFloat(form.annualPrice) * 100) : null,
                }),
            });
            if (res.ok) {
                showToast('Plan created.');
                setAddOpen(false);
                setForm({ name: '', monthlyPrice: '', annualPrice: '' });
                fetchPlans();
            } else {
                const d = await res.json();
                showToast(d.error || 'Failed to create plan.', 'error');
            }
        } finally { setSubmitting(false); }
    };

    const handleEdit = async () => {
        if (!editName || !editPlan) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/v1/admin/plans', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId: editPlan.id, name: editName, version: editPlan.version }),
            });
            if (res.ok) {
                showToast('Plan updated.');
                setEditPlan(null);
                fetchPlans();
            } else {
                const d = await res.json();
                showToast(d.error || 'Failed to update.', 'error');
            }
        } finally { setSubmitting(false); }
    };

    const handleArchive = async () => {
        if (!archivePlan) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/v1/admin/plans', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId: archivePlan.id }),
            });
            if (res.ok) {
                showToast('Plan archived.');
                setArchivePlan(null);
                fetchPlans();
            } else {
                const d = await res.json();
                showToast(d.error || 'Failed to archive.', 'error');
            }
        } finally { setSubmitting(false); }
    };

    if (status !== 'authenticated') return null;

    return (
        <div style={{ padding: '20px 24px', maxWidth: 1000 }}>
            <div style={{ marginBottom: 24 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                    <span style={{ color: 'var(--cyan)' }}>$</span> ./admin/plans --list
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                            membership.plans
                        </h1>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                            create and manage square subscription plans — no square dashboard needed
                        </div>
                    </div>
                    <button className="btn btn--sm" style={{ borderColor: 'var(--cyan)', color: 'var(--cyan)', fontSize: 10 }} onClick={() => setAddOpen(true)}>
                        + add plan
                    </button>
                </div>
            </div>

            {toast && (
                <div style={{ border: `1px solid ${toast.type === 'error' ? 'var(--red)' : 'var(--green)'}`, color: toast.type === 'error' ? 'var(--red)' : 'var(--green)', background: 'var(--bg-card)', padding: '10px 14px', marginBottom: 16, fontSize: 12, fontFamily: 'var(--mono)' }}>
                    {toast.type === 'error' ? '✗' : '✓'} {toast.msg}
                </div>
            )}

            {loading ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--mono)' }}>loading plans...</div>
            ) : plans.length === 0 ? (
                <div style={{ border: '1px solid var(--bd)', padding: '32px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
                    no plans found. create one to get started.
                </div>
            ) : (
                <div style={{ border: '1px solid var(--bd)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 120px', borderBottom: '1px solid var(--bd)', padding: '8px 14px', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)' }}>
                        <span>PLAN NAME</span>
                        <span>BILLING OPTIONS</span>
                        <span>ACTIONS</span>
                    </div>
                    {plans.map((plan, i) => (
                        <div key={plan.id} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 120px', padding: '12px 14px', borderBottom: i < plans.length - 1 ? '1px solid var(--bd)' : 'none', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-bright)', fontFamily: 'var(--mono)', fontWeight: 600 }}>{plan.name}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {(plan.variations || []).map(v => (
                                    <span key={v.id} style={{ fontSize: 9, border: '1px solid var(--bd-1)', color: 'var(--cyan)', padding: '2px 6px', letterSpacing: '0.08em' }}>
                                        {v.name} · {v.cadence}
                                    </span>
                                ))}
                                {!plan.variations?.length && plan.price != null && (
                                    <span style={{ fontSize: 9, border: '1px solid var(--bd-1)', color: 'var(--cyan)', padding: '2px 6px' }}>
                                        ${plan.price}/mo
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn--sm" style={{ fontSize: 9, padding: '3px 8px' }} onClick={() => { setEditName(plan.name); setEditPlan(plan); }}>
                                    edit
                                </button>
                                <button className="btn btn--sm" style={{ fontSize: 9, padding: '3px 8px', borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => setArchivePlan(plan)}>
                                    archive
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add Plan Modal */}
            {addOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--cyan)', padding: 24, width: 380, maxWidth: '90vw' }}>
                        <div style={{ fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.1em', marginBottom: 16 }}>ADD NEW PLAN</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {[
                                { label: 'plan name', key: 'name', type: 'text', required: true },
                                { label: 'monthly price (usd)', key: 'monthlyPrice', type: 'number', required: true },
                                { label: 'annual price (usd, optional)', key: 'annualPrice', type: 'number', required: false },
                            ].map(f => (
                                <div key={f.key}>
                                    <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 4 }}>{f.label.toUpperCase()}{f.required && ' *'}</div>
                                    <input
                                        type={f.type}
                                        value={form[f.key]}
                                        onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                                        style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--bd)', color: 'var(--text)', padding: '7px 10px', fontSize: 12, fontFamily: 'var(--mono)', boxSizing: 'border-box' }}
                                    />
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                            <button className="btn btn--sm" style={{ fontSize: 10 }} onClick={() => setAddOpen(false)}>cancel</button>
                            <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--cyan)', color: 'var(--cyan)' }} onClick={handleAdd} disabled={!form.name || !form.monthlyPrice || submitting}>
                                {submitting ? 'creating...' : '$ create plan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Plan Modal */}
            {editPlan && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--cyan)', padding: 24, width: 360, maxWidth: '90vw' }}>
                        <div style={{ fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.1em', marginBottom: 16 }}>EDIT PLAN NAME</div>
                        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 4 }}>PLAN NAME *</div>
                        <input
                            type="text"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--bd)', color: 'var(--text)', padding: '7px 10px', fontSize: 12, fontFamily: 'var(--mono)', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                            <button className="btn btn--sm" style={{ fontSize: 10 }} onClick={() => setEditPlan(null)}>cancel</button>
                            <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--cyan)', color: 'var(--cyan)' }} onClick={handleEdit} disabled={!editName || submitting}>
                                {submitting ? 'saving...' : '$ save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Archive Confirm Modal */}
            {archivePlan && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--red)', padding: 24, width: 360, maxWidth: '90vw' }}>
                        <div style={{ fontSize: 11, color: 'var(--red)', letterSpacing: '0.1em', marginBottom: 12 }}>ARCHIVE PLAN?</div>
                        <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 16 }}>
                            Archive <span style={{ color: 'var(--text-bright)', fontFamily: 'var(--mono)' }}>{archivePlan.name}</span>? It will no longer appear for new members. Existing subscriptions are unaffected.
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn btn--sm" style={{ fontSize: 10 }} onClick={() => setArchivePlan(null)}>cancel</button>
                            <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={handleArchive} disabled={submitting}>
                                {submitting ? 'archiving...' : '$ archive'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
