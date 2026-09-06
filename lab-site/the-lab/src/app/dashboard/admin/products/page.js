'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// AC-6: admin CRUD for generic Square catalog items (products/services) + their priced variations.
const emptyVar = () => ({ id: null, name: '', priceStr: '' });
const emptyForm = () => ({ id: null, name: '', description: '', variations: [emptyVar()] });

export default function ProductsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);
    const [form, setForm] = useState(null); // null = closed; else create/edit form
    const [saving, setSaving] = useState(false);

    const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); };

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/admin/catalog/items');
            if (!res.ok) throw new Error();
            const d = await res.json();
            setItems(d.items || []);
        } catch { showToast('Failed to load products.', 'error'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated') {
            if (session.user.role !== 'admin') router.push('/dashboard');
            else fetchItems();
        }
    }, [status, session, router, fetchItems]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !saving) setForm(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [saving]);

    const openCreate = () => setForm(emptyForm());
    const openEdit = (it) => setForm({
        id: it.id, name: it.name || '', description: it.description || '',
        variations: (it.variations.length ? it.variations : [{}]).map(v => ({ id: v.id || null, name: v.name || '', priceStr: v.priceCents != null ? (v.priceCents / 100).toFixed(2) : '' })),
    });

    const setVar = (i, key, val) => setForm(f => ({ ...f, variations: f.variations.map((v, j) => j === i ? { ...v, [key]: val } : v) }));
    const addVar = () => setForm(f => ({ ...f, variations: [...f.variations, emptyVar()] }));
    const removeVar = (i) => setForm(f => ({ ...f, variations: f.variations.filter((_, j) => j !== i) }));

    const submit = async () => {
        if (!form.name.trim()) { showToast('Name is required.', 'error'); return; }
        const variations = [];
        for (const v of form.variations) {
            if (!v.name.trim()) { showToast('Every variation needs a name.', 'error'); return; }
            const cents = Math.round(parseFloat(v.priceStr) * 100);
            if (!Number.isInteger(cents) || cents < 0) { showToast(`Bad price for "${v.name}".`, 'error'); return; }
            variations.push({ ...(v.id ? { id: v.id } : {}), name: v.name.trim(), priceCents: cents });
        }
        if (!variations.length) { showToast('Add at least one variation.', 'error'); return; }

        setSaving(true);
        try {
            const editing = !!form.id;
            const res = await fetch('/api/v1/admin/catalog/items', {
                method: editing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...(editing ? { id: form.id } : {}), name: form.name.trim(), description: form.description.trim(), variations }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || 'Save failed');
            showToast(editing ? 'Product updated.' : 'Product created.');
            setForm(null);
            fetchItems();
        } catch (e) { showToast(e.message, 'error'); }
        finally { setSaving(false); }
    };

    const del = async (it) => {
        if (!confirm(`Delete "${it.name}"? This removes it from the Square catalog.`)) return;
        try {
            const res = await fetch(`/api/v1/admin/catalog/items?id=${encodeURIComponent(it.id)}`, { method: 'DELETE' });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.error || 'Delete failed');
            showToast('Product deleted.');
            fetchItems();
        } catch (e) { showToast(e.message, 'error'); }
    };

    if (status === 'loading' || loading) return <div style={{ padding: '40px 24px', color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>$ loading products...</div>;
    if (session?.user?.role !== 'admin') return <div style={{ padding: 24, color: 'var(--red, #ff4444)' }}>access denied.</div>;

    const inputStyle = { width: '100%', padding: '6px 8px', marginTop: 2, background: 'var(--bg-1)', color: 'var(--text)', border: '1px solid var(--bd)', fontFamily: 'var(--mono)', fontSize: 12 };
    const labelStyle = { display: 'block', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-dim)' };

    return (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 4 }}><span style={{ color: 'var(--green)' }}>$</span> admin / products</div>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.2rem, 2.5vw, 1.8rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>products</h1>
                    <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 4 }}>square catalog items &amp; prices (not membership plans or coupons)</div>
                </div>
                <button className="btn btn--sm" onClick={openCreate} style={{ fontSize: 10, color: 'var(--green)', borderColor: 'var(--green)' }}>$ new product</button>
            </div>

            {toast && (
                <div role="status" style={{ border: `1px solid ${toast.type === 'error' ? 'var(--red, #ff4444)' : 'var(--green)'}`, color: toast.type === 'error' ? 'var(--red, #ff4444)' : 'var(--green)', padding: '10px 14px', fontSize: 12, fontFamily: 'var(--mono)' }}>{toast.msg}</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--mono)' }}>no products yet</div>}
                {items.map(it => (
                    <div key={it.id} style={{ border: '1px solid var(--bd-1)', padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ color: 'var(--text-bright)', fontWeight: 700 }}>{it.name}</div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn--sm" style={{ fontSize: 9 }} onClick={() => openEdit(it)}>$ edit</button>
                                <button className="btn btn--sm" style={{ fontSize: 9, color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => del(it)}>$ delete</button>
                            </div>
                        </div>
                        {it.description && <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 4 }}>{it.description}</div>}
                        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {it.variations.map(v => (
                                <span key={v.id} style={{ border: '1px solid var(--bd)', padding: '2px 8px', fontSize: 10, color: 'var(--text-mid)' }}>
                                    {v.name}: {v.priceCents != null ? `$${(v.priceCents / 100).toFixed(2)}` : '—'}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {form && (
                <div role="dialog" aria-modal="true" aria-labelledby="product-form-title" onClick={() => !saving && setForm(null)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', border: '1px solid var(--bd)', padding: 20, width: 440, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', fontFamily: 'var(--mono)' }}>
                        <h2 id="product-form-title" style={{ fontSize: 14, marginTop: 0, color: 'var(--text-bright)' }}>{form.id ? 'edit product' : 'new product'}</h2>
                        <label htmlFor="p-name" style={labelStyle}>NAME</label>
                        <input id="p-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
                        <label htmlFor="p-desc" style={{ ...labelStyle, marginTop: 10 }}>DESCRIPTION</label>
                        <input id="p-desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={inputStyle} />

                        <div style={{ marginTop: 14, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={labelStyle}>VARIATIONS</span>
                            <button className="btn btn--sm" style={{ fontSize: 9 }} onClick={addVar}>+ add</button>
                        </div>
                        {form.variations.map((v, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                                <input aria-label={`variation ${i + 1} name`} placeholder="name" value={v.name} onChange={e => setVar(i, 'name', e.target.value)} style={{ ...inputStyle, marginTop: 0, flex: 2 }} />
                                <input aria-label={`variation ${i + 1} price in dollars`} inputMode="decimal" placeholder="0.00" value={v.priceStr} onChange={e => setVar(i, 'priceStr', e.target.value)} style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
                                {form.variations.length > 1 && <button aria-label={`remove variation ${i + 1}`} onClick={() => removeVar(i)} style={{ background: 'none', border: '1px solid var(--bd)', color: 'var(--red)', cursor: 'pointer', padding: '4px 8px' }}>✕</button>}
                            </div>
                        ))}

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                            <button className="btn btn--sm" disabled={saving} onClick={() => setForm(null)}>cancel</button>
                            <button className="btn btn--sm" disabled={saving} onClick={submit} style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>{saving ? 'saving…' : (form.id ? 'save' : 'create')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
