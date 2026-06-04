'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function SquareTransactionsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [allUsers, setAllUsers] = useState([]);
    const [search, setSearch] = useState('');
    const [linkDialog, setLinkDialog] = useState({ open: false, customerId: null });
    const [userQuery, setUserQuery] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [linking, setLinking] = useState(false);
    const [postLinkResult, setPostLinkResult] = useState(null);
    const [toast, setToast] = useState(null);
    const [plans, setPlans] = useState([]);
    const [selectedVariationId, setSelectedVariationId] = useState('');
    const [subStartDate, setSubStartDate] = useState('');

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated') {
            if (session.user.role !== 'admin') router.push('/dashboard');
            else { fetchTransactions(); fetchAllUsers(); }
        }
    }, [status, session]);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const fetchTransactions = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/admin/square/transactions');
            if (!res.ok) throw new Error();
            setTransactions(await res.json());
        } catch { showToast('Failed to fetch transactions.', 'error'); }
        finally { setLoading(false); }
    };

    const fetchAllUsers = async () => {
        try {
            const res = await fetch('/api/v1/users?limit=1000');
            const data = await res.json();
            setAllUsers(data.users || []);
        } catch {}
    };

    const openLinkDialog = (customerId, squareCustomer) => {
        setLinkDialog({ open: true, customerId, squareCustomer });
        setSelectedUser(null);
        setUserQuery('');
        setPostLinkResult(null);
        setSelectedVariationId('');
        // Default start date to 30 days from now so we don't charge them again
        const d = new Date(); d.setDate(d.getDate() + 30);
        setSubStartDate(d.toISOString().split('T')[0]);
        if (!plans.length) fetch('/api/v1/plans').then(r => r.json()).then(setPlans).catch(() => {});
    };

    const handleConvertToSubscription = async () => {
        if (!selectedVariationId || !postLinkResult) return;
        setLinking(true);
        try {
            const res = await fetch('/api/v1/admin/square/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userID: postLinkResult.user.userID,
                    squareCustomerId: postLinkResult.customerId,
                    planVariationId: selectedVariationId,
                    startDate: subStartDate,
                }),
            });
            const data = await res.json();
            if (!res.ok) { showToast(data.error || 'Failed to create subscription.', 'error'); return; }
            showToast(`Subscription created for ${postLinkResult.user.firstName} ${postLinkResult.user.lastName}.`);
            setLinkDialog({ open: false, customerId: null });
            setPostLinkResult(null);
            fetchTransactions();
        } catch { showToast('An error occurred.', 'error'); }
        finally { setLinking(false); }
    };

    const handleLink = async (grantAccess = false) => {
        if (!selectedUser || !linkDialog.customerId) return;
        setLinking(true);
        try {
            const res = await fetch('/api/v1/admin/square/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID: selectedUser.userID, squareCustomerId: linkDialog.customerId, grantAccess }),
            });
            const data = await res.json();
            if (res.ok) {
                if (!data.subscriptionFound && !grantAccess) {
                    // Linked but no subscription in Square — ask admin what to do
                    setPostLinkResult({ user: selectedUser, customerId: linkDialog.customerId });
                } else {
                    const note = grantAccess ? ' Access manually granted.' : data.subscriptionStatus ? ` Status: ${data.subscriptionStatus}.` : '';
                    showToast(`Linked ${selectedUser.firstName} ${selectedUser.lastName}.${note}`);
                    setLinkDialog({ open: false, customerId: null });
                    setPostLinkResult(null);
                    fetchTransactions();
                }
            } else {
                showToast(data.error || 'Link failed.', 'error');
            }
        } catch { showToast('An error occurred.', 'error'); }
        finally { setLinking(false); }
    };

    const statusColor = (s) => {
        if (s === 'COMPLETED') return 'var(--green)';
        if (s === 'FAILED' || s === 'CANCELED') return 'var(--red, #ff4444)';
        return 'var(--text-dim)';
    };

    const filteredUsers = allUsers.filter(u => {
        const q = userQuery.toLowerCase();
        return (
            u.firstName?.toLowerCase().includes(q) ||
            u.lastName?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q)
        );
    }).slice(0, 10);

    const filteredTxns = transactions.filter(t => {
        const q = search.toLowerCase();
        return (
            t.status?.toLowerCase().includes(q) ||
            t.note?.toLowerCase().includes(q) ||
            t.customerId?.toLowerCase().includes(q) ||
            t.linkedUser?.email?.toLowerCase().includes(q) ||
            t.linkedUser?.firstName?.toLowerCase().includes(q) ||
            t.squareCustomer?.email?.toLowerCase().includes(q) ||
            t.squareCustomer?.name?.toLowerCase().includes(q)
        );
    });

    if (status === 'loading' || loading) {
        return (
            <div style={{ padding: '40px 24px', color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                $ loading transactions...
            </div>
        );
    }

    if (session?.user?.role !== 'admin') {
        return <div style={{ padding: 24, color: 'var(--red, #ff4444)' }}>access denied.</div>;
    }

    return (
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 4 }}>
                        <span style={{ color: 'var(--green)' }}>$</span> admin / square_transactions
                    </div>
                    <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.2rem, 2.5vw, 1.8rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
                        square_transactions
                    </h1>
                    <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 4 }}>
                        view payments and link square customers to lab members
                    </div>
                </div>
                <button className="btn btn--sm" onClick={fetchTransactions} style={{ fontSize: 10 }}>
                    $ refresh
                </button>
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

            {/* Search */}
            <input
                type="text"
                placeholder="$ filter transactions..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                    background: 'var(--bg-1)', border: '1px solid var(--bd)', color: 'var(--text)',
                    padding: '8px 12px', fontSize: 12, fontFamily: 'var(--mono)', width: '100%', maxWidth: 400,
                    outline: 'none',
                }}
            />

            {/* Table */}
            <div style={{ border: '1px solid var(--bd-1)', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 11 }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--bd)', background: 'var(--bg-1)' }}>
                            {['date', 'amount', 'status', 'type', 'note', 'linked member', 'sq customer'].map(h => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-dim)', letterSpacing: '0.08em', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTxns.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-dim)' }}>
                                    no transactions found
                                </td>
                            </tr>
                        )}
                        {filteredTxns.map((t, i) => (
                            <tr key={t.id || i} style={{ borderBottom: '1px solid var(--bd)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '10px 12px', color: 'var(--text-mid)', whiteSpace: 'nowrap' }}>
                                    {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}
                                </td>
                                <td style={{ padding: '10px 12px', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                                    {t.amount != null ? `$${t.amount.toFixed(2)}` : '—'}
                                </td>
                                <td style={{ padding: '10px 12px' }}>
                                    <span style={{
                                        color: statusColor(t.status), border: `1px solid ${statusColor(t.status)}`,
                                        padding: '2px 6px', fontSize: 9, letterSpacing: '0.06em',
                                    }}>
                                        {t.status || '—'}
                                    </span>
                                </td>
                                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                                    <span style={{
                                        fontSize: 9, padding: '2px 6px', letterSpacing: '0.06em',
                                        border: `1px solid ${t.isSubscription ? 'var(--cyan)' : 'var(--text-dim)'}`,
                                        color: t.isSubscription ? 'var(--cyan)' : 'var(--text-dim)',
                                    }}>
                                        {t.isSubscription ? 'SUBSCRIPTION' : 'ONE-TIME'}
                                    </span>
                                </td>
                                <td style={{ padding: '10px 12px', color: 'var(--text-dim)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {t.note || '—'}
                                </td>
                                <td style={{ padding: '10px 12px' }}>
                                    {t.linkedUser ? (
                                        <span style={{ color: 'var(--text)' }}>
                                            {t.linkedUser.firstName} {t.linkedUser.lastName}
                                            <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>({t.linkedUser.email})</span>
                                        </span>
                                    ) : (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ color: 'var(--text-dim)' }}>unknown</span>
                                            {t.customerId && (
                                                <button
                                                    className="btn btn--sm"
                                                    onClick={() => openLinkDialog(t.customerId, t.squareCustomer)}
                                                    style={{ fontSize: 9, padding: '2px 6px' }}
                                                >
                                                    $ link
                                                </button>
                                            )}
                                        </span>
                                    )}
                                </td>
                                <td style={{ padding: '10px 12px', maxWidth: 200 }}>
                                    {t.squareCustomer?.name || t.squareCustomer?.email ? (
                                        <div>
                                            {t.squareCustomer.name && (
                                                <div style={{ color: 'var(--text)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.squareCustomer.name}</div>
                                            )}
                                            {t.squareCustomer.email && (
                                                <div style={{ color: 'var(--text-dim)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.squareCustomer.email}</div>
                                            )}
                                        </div>
                                    ) : (
                                        <span style={{ color: 'var(--text-dim)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                            {t.customerId || '—'}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Link dialog */}
            {linkDialog.open && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                }}>
                    <div style={{
                        background: 'var(--bg-card)', border: '1px solid var(--bd)', padding: 24,
                        width: '100%', maxWidth: 480, fontFamily: 'var(--mono)',
                    }}>
                        <div style={{ color: 'var(--text-bright)', fontSize: 14, marginBottom: 4 }}>link_customer_to_member</div>
                        <div style={{ borderBottom: '1px solid var(--bd)', paddingBottom: 14, marginBottom: 16 }}>
                            {linkDialog.squareCustomer?.name && (
                                <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{linkDialog.squareCustomer.name}</div>
                            )}
                            {linkDialog.squareCustomer?.email && (
                                <div style={{ fontSize: 11, color: 'var(--cyan, #00e5ff)', marginBottom: 4 }}>{linkDialog.squareCustomer.email}</div>
                            )}
                            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>sq id: {linkDialog.customerId}</div>
                        </div>

                        {postLinkResult ? (
                            // No subscription found after linking — convert or grant manually
                            <>
                                <div style={{ border: '1px solid var(--amber)', padding: '12px 14px', marginBottom: 16, fontSize: 11, color: 'var(--amber)' }}>
                                    ⚠ Linked {postLinkResult.user.firstName} {postLinkResult.user.lastName} but no active Square subscription was found.
                                    This payment may have been a one-time invoice.
                                </div>

                                {/* Convert to subscription */}
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>convert to recurring subscription:</div>
                                    <select
                                        value={selectedVariationId}
                                        onChange={e => setSelectedVariationId(e.target.value)}
                                        style={{ width: '100%', background: 'var(--bg-1)', border: '1px solid var(--bd)', color: selectedVariationId ? 'var(--text)' : 'var(--text-dim)', padding: '8px 10px', fontSize: 11, fontFamily: 'var(--mono)', outline: 'none', marginBottom: 8 }}
                                    >
                                        <option value="">select a plan...</option>
                                        {plans.map(plan => plan.variations?.length
                                            ? plan.variations.map(v => (
                                                <option key={v.id} value={v.id}>
                                                    {plan.name} — {v.name || v.cadence}{v.priceCents != null ? ` ($${(v.priceCents / 100).toFixed(2)})` : ''}
                                                </option>
                                            ))
                                            : <option key={plan.id} value={plan.id}>{plan.name}</option>
                                        )}
                                    </select>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                        <label style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>first charge date:</label>
                                        <input
                                            type="date"
                                            value={subStartDate}
                                            onChange={e => setSubStartDate(e.target.value)}
                                            style={{ background: 'var(--bg-1)', border: '1px solid var(--bd)', color: 'var(--text)', padding: '5px 8px', fontSize: 11, fontFamily: 'var(--mono)', outline: 'none' }}
                                        />
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                                        defaults to +30 days so they aren&apos;t charged again immediately. uses card on file.
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                    <button className="btn btn--sm" onClick={() => { setLinkDialog({ open: false, customerId: null }); setPostLinkResult(null); fetchTransactions(); }} style={{ fontSize: 10 }}>close</button>
                                    <button className="btn btn--sm" onClick={() => handleLink(true)} disabled={linking} style={{ fontSize: 10, borderColor: 'var(--amber)', color: 'var(--amber)' }}>
                                        {linking ? 'granting...' : '$ grant access manually'}
                                    </button>
                                    <button className="btn btn--sm" onClick={handleConvertToSubscription} disabled={!selectedVariationId || linking} style={{ fontSize: 10, borderColor: 'var(--green)', color: 'var(--green)' }}>
                                        {linking ? 'creating...' : '$ convert to subscription →'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: 8 }}>search members:</div>
                                <input
                                    type="text"
                                    placeholder="name or email..."
                                    value={userQuery}
                                    onChange={e => { setUserQuery(e.target.value); setSelectedUser(null); }}
                                    style={{
                                        width: '100%', background: 'var(--bg-1)', border: '1px solid var(--bd)',
                                        color: 'var(--text)', padding: '8px 10px', fontSize: 12, fontFamily: 'var(--mono)',
                                        outline: 'none', marginBottom: 4,
                                    }}
                                />
                                {userQuery && filteredUsers.length > 0 && (
                                    <div style={{ border: '1px solid var(--bd)', maxHeight: 160, overflowY: 'auto', marginBottom: 12 }}>
                                        {filteredUsers.map(u => (
                                            <div
                                                key={u.userID}
                                                onClick={() => { setSelectedUser(u); setUserQuery(`${u.firstName} ${u.lastName} (${u.email})`); }}
                                                style={{
                                                    padding: '8px 10px', fontSize: 11, cursor: 'pointer',
                                                    background: selectedUser?.userID === u.userID ? 'rgba(57,255,20,0.08)' : 'var(--bg-1)',
                                                    color: 'var(--text)',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                                onMouseLeave={e => e.currentTarget.style.background = selectedUser?.userID === u.userID ? 'rgba(57,255,20,0.08)' : 'var(--bg-1)'}
                                            >
                                                {u.firstName} {u.lastName} <span style={{ color: 'var(--text-dim)' }}>({u.email})</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                                    <button className="btn btn--sm" onClick={() => setLinkDialog({ open: false, customerId: null })} style={{ fontSize: 10 }}>cancel</button>
                                    <button className="btn btn--sm" onClick={() => handleLink(false)} disabled={!selectedUser || linking} style={{ fontSize: 10, borderColor: 'var(--green)', color: 'var(--green)' }}>
                                        {linking ? '$ linking...' : '$ link & sync'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
