'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// AC-7: admin search / view / create / edit Square customers + disable their saved cards.
const FIELDS = [
    { key: 'givenName', label: 'FIRST NAME' },
    { key: 'familyName', label: 'LAST NAME' },
    { key: 'emailAddress', label: 'EMAIL' },
    { key: 'phoneNumber', label: 'PHONE' },
    { key: 'note', label: 'NOTE' },
];

export default function CustomersPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [query, setQuery] = useState('');
    const [results, setResults] = useState(null);
    const [searching, setSearching] = useState(false);
    const [detail, setDetail] = useState(null);      // { customer, cards }
    const [form, setForm] = useState(null);          // edit/create form fields
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);

    const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); };

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated' && session.user.role !== 'admin') router.push('/dashboard');
    }, [status, session, router]);

    const search = useCallback(async (e) => {
        e?.preventDefault?.();
        if (!query.trim()) return;
        setSearching(true); setDetail(null); setForm(null);
        try {
            const res = await fetch(`/api/v1/admin/customers?q=${encodeURIComponent(query.trim())}`);
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Search failed');
            setResults(d.customers || []);
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSearching(false); }
    }, [query]);

    const openDetail = async (id) => {
        setCreating(false);
        try {
            const res = await fetch(`/api/v1/admin/customers?id=${encodeURIComponent(id)}`);
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Load failed');
            setDetail(d);
            setForm(Object.fromEntries(FIELDS.map(f => [f.key, d.customer[f.key] || ''])));
        } catch (err) { showToast(err.message, 'error'); }
    };

    const openCreate = () => { setCreating(true); setDetail(null); setForm(Object.fromEntries(FIELDS.map(f => [f.key, '']))); };

    const submit = async () => {
        const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim()));
        if (creating && !Object.keys(payload).length) { showToast('Enter at least one field.', 'error'); return; }
        setSaving(true);
        try {
            const res = await fetch('/api/v1/admin/customers', {
                method: creating ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(creating ? payload : { customerId: detail.customer.id, ...payload }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Save failed');
            showToast(creating ? 'Customer created.' : 'Customer updated.');
            if (creating) { setCreating(false); openDetail(d.id); }
            else openDetail(detail.customer.id);
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSaving(false); }
    };

    const disableCard = async (cardId) => {
        if (!confirm('Disable this saved card?')) return;
        try {
            const res = await fetch('/api/v1/admin/customers/cards/disable', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerId: detail.customer.id, cardId }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Disable failed');
            openDetail(detail.customer.id);
        } catch (err) { showToast(err.message, 'error'); }
    };

    if (status === 'loading') return <div style={{ padding: '40px 24px', color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>$ loading…</div>;
    if (session?.user?.role !== 'admin') return <div style={{ padding: 24, color: 'var(--red, #ff4444)' }}>access denied.</div>;

    const inputStyle = { width: '100%', padding: '6px 8px', marginTop: 2, background: 'var(--bg-1)', color: 'var(--text)', border: '1px solid var(--bd)', fontFamily: 'var(--mono)', fontSize: 12 };
    const labelStyle = { display: 'block', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-dim)', marginTop: 8 };

    return (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 4 }}><span style={{ color: 'var(--green)' }}>$</span> admin / square_customers</div>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.2rem, 2.5vw, 1.8rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>square_customers</h1>
                    <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 4 }}>search, create &amp; edit square customers; manage saved cards</div>
                </div>
                <button className="btn btn--sm" onClick={openCreate} style={{ fontSize: 10, color: 'var(--green)', borderColor: 'var(--green)' }}>$ new customer</button>
            </div>

            {toast && <div role="status" style={{ border: `1px solid ${toast.type === 'error' ? 'var(--red, #ff4444)' : 'var(--green)'}`, color: toast.type === 'error' ? 'var(--red, #ff4444)' : 'var(--green)', padding: '10px 14px', fontSize: 12, fontFamily: 'var(--mono)' }}>{toast.msg}</div>}

            <form onSubmit={search} style={{ display: 'flex', gap: 8, maxWidth: 460 }}>
                <label htmlFor="cust-q" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>search customers by email</label>
                <input id="cust-q" value={query} onChange={e => setQuery(e.target.value)} placeholder="$ search by email…" style={{ ...inputStyle, marginTop: 0 }} />
                <button type="submit" className="btn btn--sm" disabled={searching} style={{ fontSize: 10 }}>{searching ? '…' : '$ search'}</button>
            </form>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(280px, 1.4fr)', gap: 16, alignItems: 'start' }}>
                {/* Results */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {results && results.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--mono)' }}>no customers found</div>}
                    {(results || []).map(c => (
                        <button key={c.id} onClick={() => openDetail(c.id)} style={{ textAlign: 'left', background: detail?.customer?.id === c.id ? 'rgba(57,255,20,0.06)' : 'var(--bg-1)', border: '1px solid var(--bd)', color: 'var(--text)', padding: '8px 10px', fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer' }}>
                            <div style={{ color: 'var(--text-bright)' }}>{[c.givenName, c.familyName].filter(Boolean).join(' ') || '(no name)'}</div>
                            <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>{c.emailAddress || c.phoneNumber || c.id}</div>
                        </button>
                    ))}
                </div>

                {/* Detail / edit / create */}
                {(detail || creating) && form && (
                    <div style={{ border: '1px solid var(--bd)', padding: 16, fontFamily: 'var(--mono)' }}>
                        <h2 style={{ fontSize: 13, marginTop: 0, color: 'var(--text-bright)' }}>{creating ? 'new customer' : 'edit customer'}</h2>
                        {!creating && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>id: {detail.customer.id}</div>}
                        {FIELDS.map(f => (
                            <div key={f.key}>
                                <label htmlFor={`f-${f.key}`} style={labelStyle}>{f.label}</label>
                                <input id={`f-${f.key}`} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                            {creating && <button className="btn btn--sm" disabled={saving} onClick={() => setCreating(false)}>cancel</button>}
                            <button className="btn btn--sm" disabled={saving} onClick={submit} style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>{saving ? 'saving…' : (creating ? 'create' : 'save')}</button>
                        </div>

                        {!creating && (
                            <div style={{ marginTop: 18 }}>
                                <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 8 }}>SAVED_CARDS</div>
                                {detail.cards.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>no cards on file</div>}
                                {detail.cards.map(c => (
                                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--bd)', padding: '6px 10px', fontSize: 11, marginBottom: 6 }}>
                                        <span style={{ color: c.enabled ? 'var(--text)' : 'var(--text-dim)' }}>{c.brand || 'card'} •••• {c.last4 || '????'}{c.expMonth ? ` (${c.expMonth}/${c.expYear})` : ''}{c.enabled ? '' : ' — disabled'}</span>
                                        {c.enabled && <button className="btn btn--sm" style={{ fontSize: 9, color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => disableCard(c.id)}>$ disable</button>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
