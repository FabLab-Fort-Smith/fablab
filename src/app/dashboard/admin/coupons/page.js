'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const EMPTY_FORM = { name: '', discountType: 'FIXED_PERCENTAGE', percentage: '', amountDollars: '' };

export default function CouponsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [coupons, setCoupons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated') {
            if (session.user.role !== 'admin') router.push('/dashboard');
            else fetchCoupons();
        }
    }, [status, session]);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const fetchCoupons = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/admin/coupons');
            if (!res.ok) throw new Error();
            setCoupons(await res.json());
        } catch { showToast('Failed to load discounts.', 'error'); }
        finally { setLoading(false); }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return showToast('Code is required.', 'error');
        setSaving(true);
        try {
            const body = { name: form.name, discountType: form.discountType };
            if (form.discountType === 'FIXED_PERCENTAGE') {
                if (!form.percentage) return showToast('Percentage required.', 'error');
                body.percentage = form.percentage;
            } else {
                if (!form.amountDollars) return showToast('Amount required.', 'error');
                body.amountCents = Math.round(parseFloat(form.amountDollars) * 100);
            }
            const res = await fetch('/api/v1/admin/coupons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) return showToast(data.error || 'Failed to create.', 'error');
            setCoupons(prev => [data, ...prev]);
            setForm(EMPTY_FORM);
            showToast(`Coupon "${data.name}" created.`);
        } finally { setSaving(false); }
    };

    const handleDelete = async (id, name) => {
        if (!confirm(`Delete coupon "${name}"?`)) return;
        setDeleting(id);
        try {
            const res = await fetch('/api/v1/admin/coupons', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            if (!res.ok) { const d = await res.json(); return showToast(d.error || 'Delete failed.', 'error'); }
            setCoupons(prev => prev.filter(c => c.id !== id));
            showToast(`Deleted "${name}".`);
        } finally { setDeleting(null); }
    };

    const formatDiscount = (c) => {
        if (c.discountType === 'FIXED_PERCENTAGE') return `${c.percentage}%`;
        if (c.amountMoney) return `$${(c.amountMoney.amount / 100).toFixed(2)} off`;
        return '—';
    };

    if (status === 'loading' || loading) {
        return <div style={{ padding: '40px 24px', color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>$ loading coupons...</div>;
    }
    if (session?.user?.role !== 'admin') {
        return <div style={{ padding: 24, color: 'var(--red, #ff4444)' }}>access denied.</div>;
    }

    return (
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 4 }}>
                        <span style={{ color: 'var(--green)' }}>$</span> admin / coupons
                    </div>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.2rem, 2.5vw, 1.8rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                        coupons
                    </h1>
                    <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 4 }}>
                        create discount codes — members enter the code name at checkout
                    </div>
                </div>
                <button className="btn btn--sm" onClick={fetchCoupons} style={{ fontSize: 10 }}>$ refresh</button>
            </div>

            {/* Toast */}
            {toast && (
                <div style={{
                    border: `1px solid ${toast.type === 'error' ? 'var(--red, #ff4444)' : 'var(--green)'}`,
                    color: toast.type === 'error' ? 'var(--red, #ff4444)' : 'var(--green)',
                    background: toast.type === 'error' ? 'rgba(255,68,68,0.05)' : 'rgba(57,255,20,0.05)',
                    padding: '10px 14px', fontSize: 12, fontFamily: 'var(--mono)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <span>{toast.msg}</span>
                    <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14 }}>×</button>
                </div>
            )}

            {/* Create Form */}
            <div style={{ border: '1px solid var(--bd)', padding: 20, background: 'var(--bg-card)' }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.12em', marginBottom: 14 }}>$ create_coupon</div>
                <form onSubmit={handleCreate} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>code</label>
                        <input
                            type="text"
                            placeholder="e.g. TESTDISCOUNT"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value.toUpperCase() }))}
                            style={{ background: 'var(--bg-1)', border: '1px solid var(--bd)', color: 'var(--text)', padding: '8px 10px', fontSize: 12, fontFamily: 'var(--mono)', outline: 'none', width: 180, letterSpacing: '0.06em' }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>type</label>
                        <select
                            value={form.discountType}
                            onChange={e => setForm(f => ({ ...f, discountType: e.target.value, percentage: '', amountDollars: '' }))}
                            style={{ background: 'var(--bg-1)', border: '1px solid var(--bd)', color: 'var(--text)', padding: '8px 10px', fontSize: 12, fontFamily: 'var(--mono)', outline: 'none' }}
                        >
                            <option value="FIXED_PERCENTAGE">Percentage</option>
                            <option value="FIXED_AMOUNT">Fixed Amount</option>
                        </select>
                    </div>

                    {form.discountType === 'FIXED_PERCENTAGE' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>% off</label>
                            <input
                                type="number"
                                min="1" max="100" step="0.01"
                                placeholder="e.g. 50"
                                value={form.percentage}
                                onChange={e => setForm(f => ({ ...f, percentage: e.target.value }))}
                                style={{ background: 'var(--bg-1)', border: '1px solid var(--bd)', color: 'var(--text)', padding: '8px 10px', fontSize: 12, fontFamily: 'var(--mono)', outline: 'none', width: 100 }}
                            />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>$ off</label>
                            <input
                                type="number"
                                min="0.01" step="0.01"
                                placeholder="e.g. 10.00"
                                value={form.amountDollars}
                                onChange={e => setForm(f => ({ ...f, amountDollars: e.target.value }))}
                                style={{ background: 'var(--bg-1)', border: '1px solid var(--bd)', color: 'var(--text)', padding: '8px 10px', fontSize: 12, fontFamily: 'var(--mono)', outline: 'none', width: 100 }}
                            />
                        </div>
                    )}

                    <button type="submit" className="btn btn--sm" disabled={saving} style={{ fontSize: 10, borderColor: 'var(--green)', color: 'var(--green)' }}>
                        {saving ? '$ creating...' : '$ create'}
                    </button>
                </form>
            </div>

            {/* Coupon Table */}
            <div style={{ border: '1px solid var(--bd-1)', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 11 }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--bd)', background: 'var(--bg-1)' }}>
                            {['code', 'type', 'discount', 'square id', ''].map(h => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-dim)', letterSpacing: '0.08em', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {coupons.length === 0 && (
                            <tr>
                                <td colSpan={5} style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-dim)' }}>no coupons yet</td>
                            </tr>
                        )}
                        {coupons.map((c, i) => (
                            <tr key={c.id} style={{ borderBottom: '1px solid var(--bd)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '10px 12px', color: 'var(--green)', letterSpacing: '0.08em', fontWeight: 700 }}>{c.name}</td>
                                <td style={{ padding: '10px 12px', color: 'var(--text-dim)' }}>
                                    {c.discountType === 'FIXED_PERCENTAGE' ? 'percentage' : 'fixed amount'}
                                </td>
                                <td style={{ padding: '10px 12px', color: 'var(--cyan)' }}>{formatDiscount(c)}</td>
                                <td style={{ padding: '10px 12px', color: 'var(--text-dim)', fontSize: 10 }}>{c.id}</td>
                                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                    <button
                                        className="btn btn--sm"
                                        onClick={() => handleDelete(c.id, c.name)}
                                        disabled={deleting === c.id}
                                        style={{ fontSize: 9, padding: '2px 8px', borderColor: 'var(--red, #ff4444)', color: 'var(--red, #ff4444)' }}
                                    >
                                        {deleting === c.id ? 'deleting...' : '$ delete'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
