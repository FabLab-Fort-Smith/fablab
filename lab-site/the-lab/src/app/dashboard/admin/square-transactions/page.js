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
    const [refundDialog, setRefundDialog] = useState({ open: false, paymentId: null, maxCents: 0, amountStr: '', reason: '', submitting: false });
    // AC-2: payment detail drawer + disputes (read-only)
    const [detail, setDetail] = useState({ open: false, loading: false, data: null, error: null });
    const [disputesPanel, setDisputesPanel] = useState({ open: false, loading: false, loaded: false, items: [], error: null });
    const [disputeDrawer, setDisputeDrawer] = useState({ open: false, loading: false, data: null, error: null });

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/signin');
        else if (status === 'authenticated') {
            if (session.user.role !== 'admin') router.push('/dashboard');
            else { fetchTransactions(); fetchAllUsers(); }
        }
    }, [status, session]);

    // Close the top-most open drawer/dialog on Escape (keyboard operability).
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            if (disputeDrawer.open) setDisputeDrawer({ open: false, loading: false, data: null, error: null });
            else if (detail.open) setDetail({ open: false, loading: false, data: null, error: null });
            else if (refundDialog.open && !refundDialog.submitting) setRefundDialog({ open: false, paymentId: null, maxCents: 0, amountStr: '', reason: '', submitting: false });
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [disputeDrawer.open, detail.open, refundDialog.open, refundDialog.submitting]);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const openRefund = (t) => setRefundDialog({
        open: true, paymentId: t.id, maxCents: Math.round((t.amount || 0) * 100), amountStr: '', reason: '', submitting: false,
    });

    const submitRefund = async () => {
        const payload = { paymentId: refundDialog.paymentId };
        const amt = refundDialog.amountStr.trim();
        if (amt) {
            const cents = Math.round(parseFloat(amt) * 100);
            if (!Number.isFinite(cents) || cents <= 0) { showToast('Enter a valid amount.', 'error'); return; }
            if (cents > refundDialog.maxCents) { showToast('Amount exceeds the payment.', 'error'); return; }
            payload.amountCents = cents;
        }
        if (refundDialog.reason.trim()) payload.reason = refundDialog.reason.trim();
        setRefundDialog(d => ({ ...d, submitting: true }));
        try {
            const res = await fetch('/api/v1/admin/square/refund', {
                method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Refund failed (${res.status})`);
            showToast(amt ? `Refunded $${amt}.` : 'Full refund issued.');
            const refundedPaymentId = refundDialog.paymentId;
            setRefundDialog({ open: false, paymentId: null, maxCents: 0, amountStr: '', reason: '', submitting: false });
            fetchTransactions();
            if (detail.open && detail.data?.id === refundedPaymentId) openDetail(refundedPaymentId);
        } catch (e) {
            showToast(e.message, 'error');
            setRefundDialog(d => ({ ...d, submitting: false }));
        }
    };

    const openDetail = async (paymentId) => {
        if (!paymentId) return;
        setDetail({ open: true, loading: true, data: null, error: null });
        try {
            const res = await fetch(`/api/v1/admin/square/payment/${encodeURIComponent(paymentId)}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Failed to load payment (${res.status})`);
            setDetail({ open: true, loading: false, data, error: null });
        } catch (e) {
            setDetail({ open: true, loading: false, data: null, error: e.message });
        }
    };

    // Refund from the detail drawer — guard against the REMAINING refundable amount (server is authoritative).
    const openRefundFromDetail = (d) => setRefundDialog({
        open: true, paymentId: d.id, maxCents: d.refundableCents ?? d.amountCents ?? 0, amountStr: '', reason: '', submitting: false,
    });

    const toggleDisputes = async () => {
        if (disputesPanel.open) { setDisputesPanel(p => ({ ...p, open: false })); return; }
        setDisputesPanel(p => ({ ...p, open: true }));
        if (disputesPanel.loaded) return;
        setDisputesPanel(p => ({ ...p, loading: true, error: null }));
        try {
            const res = await fetch('/api/v1/admin/square/disputes');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Failed to load disputes (${res.status})`);
            setDisputesPanel({ open: true, loading: false, loaded: true, items: data.disputes || [], error: null });
        } catch (e) {
            setDisputesPanel({ open: true, loading: false, loaded: false, items: [], error: e.message });
        }
    };

    const openDispute = async (disputeId) => {
        if (!disputeId) return;
        setDisputeDrawer({ open: true, loading: true, data: null, error: null });
        try {
            const res = await fetch(`/api/v1/admin/square/disputes/${encodeURIComponent(disputeId)}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Failed to load dispute (${res.status})`);
            setDisputeDrawer({ open: true, loading: false, data, error: null });
        } catch (e) {
            setDisputeDrawer({ open: true, loading: false, data: null, error: e.message });
        }
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
                            {['date', 'amount', 'status', 'type', 'note', 'linked member', 'sq customer', 'actions'].map(h => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-dim)', letterSpacing: '0.08em', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTxns.length === 0 && (
                            <tr>
                                <td colSpan={8} style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-dim)' }}>
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
                                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                                    <span style={{ display: 'flex', gap: 6 }}>
                                        {t.id && (
                                            <button
                                                className="btn btn--sm"
                                                onClick={() => openDetail(t.id)}
                                                style={{ fontSize: 9, padding: '2px 6px' }}
                                            >
                                                $ details
                                            </button>
                                        )}
                                        {t.status === 'COMPLETED' && t.id && (
                                            <button
                                                className="btn btn--sm"
                                                onClick={() => openRefund(t)}
                                                style={{ fontSize: 9, padding: '2px 6px', color: 'var(--amber)', borderColor: 'var(--amber)' }}
                                            >
                                                $ refund
                                            </button>
                                        )}
                                        {!t.id && <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>—</span>}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Disputes (read-only) */}
            <div style={{ border: '1px solid var(--bd-1)' }}>
                <button
                    className="btn btn--sm"
                    onClick={toggleDisputes}
                    aria-expanded={disputesPanel.open}
                    aria-controls="disputes-panel"
                    style={{ fontSize: 10, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 0 }}
                >
                    {disputesPanel.open ? '▾' : '▸'} $ disputes / chargebacks{disputesPanel.loaded ? ` (${disputesPanel.items.length})` : ''}
                </button>
                {disputesPanel.open && (
                    <div id="disputes-panel" style={{ borderTop: '1px solid var(--bd)', overflowX: 'auto' }}>
                        {disputesPanel.loading && <div style={{ padding: '16px 12px', color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--mono)' }}>$ loading disputes…</div>}
                        {disputesPanel.error && <div style={{ padding: '16px 12px', color: 'var(--red, #ff4444)', fontSize: 11 }}>{disputesPanel.error}</div>}
                        {disputesPanel.loaded && !disputesPanel.items.length && <div style={{ padding: '16px 12px', color: 'var(--text-dim)', fontSize: 11 }}>no disputes 🎉</div>}
                        {disputesPanel.loaded && disputesPanel.items.length > 0 && (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 11 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--bd)', background: 'var(--bg-1)' }}>
                                        {['reported', 'amount', 'state', 'reason', 'card', 'due', 'actions'].map(h => (
                                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-dim)', letterSpacing: '0.08em', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {disputesPanel.items.map((d, i) => (
                                        <tr key={d.id || i} style={{ borderBottom: '1px solid var(--bd)' }}>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-mid)', whiteSpace: 'nowrap' }}>{(d.reportedAt || d.createdAt) ? new Date(d.reportedAt || d.createdAt).toLocaleDateString() : '—'}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text)', whiteSpace: 'nowrap' }}>{d.amountCents != null ? `$${(d.amountCents / 100).toFixed(2)}` : '—'}</td>
                                            <td style={{ padding: '8px 12px' }}><span style={{ fontSize: 9, padding: '2px 6px', letterSpacing: '0.06em', border: '1px solid var(--amber)', color: 'var(--amber)' }}>{d.state || '—'}</span></td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-dim)' }}>{d.reason || '—'}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{d.cardBrand || '—'}</td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{d.dueAt ? new Date(d.dueAt).toLocaleDateString() : '—'}</td>
                                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                                <button className="btn btn--sm" onClick={() => openDispute(d.id)} style={{ fontSize: 9, padding: '2px 6px' }}>$ view</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>

            {/* Payment detail drawer */}
            {detail.open && (
                <div role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={() => setDetail({ open: false, loading: false, data: null, error: null })}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'flex-end', zIndex: 120 }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderLeft: '1px solid var(--bd)', padding: 20, width: 420, maxWidth: '92vw', height: '100%', overflowY: 'auto', fontFamily: 'var(--mono)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 id="detail-title" style={{ fontSize: 14, margin: 0, color: 'var(--text-bright)' }}>payment_detail</h2>
                            <button autoFocus className="btn btn--sm" onClick={() => setDetail({ open: false, loading: false, data: null, error: null })} aria-label="Close payment detail" style={{ fontSize: 12 }}>×</button>
                        </div>
                        {detail.loading && <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 16 }}>$ loading…</div>}
                        {detail.error && <div style={{ color: 'var(--red, #ff4444)', fontSize: 11, marginTop: 16 }}>{detail.error}</div>}
                        {detail.data && (() => {
                            const d = detail.data;
                            const row = (k, v) => (
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--bd)', fontSize: 11 }}>
                                    <span style={{ color: 'var(--text-dim)' }}>{k}</span>
                                    <span style={{ color: 'var(--text)', textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
                                </div>
                            );
                            const money = (c) => c == null ? '—' : `$${(c / 100).toFixed(2)}`;
                            return (
                                <div style={{ marginTop: 14 }}>
                                    {row('id', d.id)}
                                    {row('status', d.status || '—')}
                                    {row('amount', `${money(d.amountCents)} ${d.currency}`)}
                                    {row('refunded', money(d.refundedCents))}
                                    {row('refundable', money(d.refundableCents))}
                                    {d.tipCents != null && row('tip', money(d.tipCents))}
                                    {d.processingFeeCents != null && row('processing fee', money(d.processingFeeCents))}
                                    {row('type', d.sourceType || '—')}
                                    {d.card && row('card', `${d.card.brand || '—'} •••• ${d.card.last4 || '—'}${d.card.expMonth ? ` (${d.card.expMonth}/${d.card.expYear})` : ''}`)}
                                    {row('created', d.createdAt ? new Date(d.createdAt).toLocaleString() : '—')}
                                    {d.note && row('note', d.note)}
                                    {d.orderId && row('order', d.orderId)}
                                    {d.customerId && row('sq customer', d.customerId)}
                                    {row('refunds', d.refundIds?.length ? d.refundIds.length : 0)}
                                    {d.receiptUrl && (
                                        <div style={{ marginTop: 12 }}>
                                            <a href={d.receiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cyan, #00e5ff)', fontSize: 11 }}>$ view receipt ↗</a>
                                        </div>
                                    )}
                                    {d.status === 'COMPLETED' && (d.refundableCents ?? 0) > 0 && (
                                        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                                            <button className="btn btn--sm" onClick={() => openRefundFromDetail(d)} style={{ fontSize: 10, color: 'var(--amber)', borderColor: 'var(--amber)' }}>$ refund</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Dispute detail drawer */}
            {disputeDrawer.open && (
                <div role="dialog" aria-modal="true" aria-labelledby="dispute-title" onClick={() => setDisputeDrawer({ open: false, loading: false, data: null, error: null })}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'flex-end', zIndex: 120 }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', borderLeft: '1px solid var(--bd)', padding: 20, width: 420, maxWidth: '92vw', height: '100%', overflowY: 'auto', fontFamily: 'var(--mono)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 id="dispute-title" style={{ fontSize: 14, margin: 0, color: 'var(--amber)' }}>dispute_detail</h2>
                            <button autoFocus className="btn btn--sm" onClick={() => setDisputeDrawer({ open: false, loading: false, data: null, error: null })} aria-label="Close dispute detail" style={{ fontSize: 12 }}>×</button>
                        </div>
                        {disputeDrawer.loading && <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 16 }}>$ loading…</div>}
                        {disputeDrawer.error && <div style={{ color: 'var(--red, #ff4444)', fontSize: 11, marginTop: 16 }}>{disputeDrawer.error}</div>}
                        {disputeDrawer.data && (() => {
                            const d = disputeDrawer.data;
                            const row = (k, v) => (
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--bd)', fontSize: 11 }}>
                                    <span style={{ color: 'var(--text-dim)' }}>{k}</span>
                                    <span style={{ color: 'var(--text)', textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
                                </div>
                            );
                            return (
                                <div style={{ marginTop: 14 }}>
                                    {row('id', d.id)}
                                    {row('state', d.state || '—')}
                                    {row('reason', d.reason || '—')}
                                    {row('amount', d.amountCents != null ? `$${(d.amountCents / 100).toFixed(2)} ${d.currency}` : '—')}
                                    {row('card', d.cardBrand || '—')}
                                    {row('payment', d.paymentId || '—')}
                                    {row('due', d.dueAt ? new Date(d.dueAt).toLocaleString() : '—')}
                                    {row('reported', (d.reportedAt || d.createdAt) ? new Date(d.reportedAt || d.createdAt).toLocaleString() : '—')}
                                    {row('evidence', d.evidenceIds?.length ? `${d.evidenceIds.length} file(s)` : 'none')}
                                    {d.paymentId && (
                                        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                                            <button className="btn btn--sm" onClick={() => { setDisputeDrawer({ open: false, loading: false, data: null, error: null }); openDetail(d.paymentId); }} style={{ fontSize: 10 }}>$ view payment →</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Refund dialog */}
            {refundDialog.open && (
                <div role="dialog" aria-modal="true" aria-labelledby="refund-title" style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', zIndex: 100,
                }}>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--bd)', padding: 20, width: 360, maxWidth: '90vw' }}>
                        <h2 id="refund-title" style={{ fontSize: 14, marginTop: 0, color: 'var(--amber)' }}>Refund payment</h2>
                        <p style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                            Full amount is <strong>${(refundDialog.maxCents / 100).toFixed(2)}</strong>. Leave the amount blank for a full refund, or enter a smaller amount for a partial refund.
                        </p>
                        <label htmlFor="refund-amount" style={{ display: 'block', fontSize: 11, color: 'var(--text-mid)', marginTop: 8 }}>Amount ($) — blank = full</label>
                        <input id="refund-amount" type="text" inputMode="decimal" value={refundDialog.amountStr}
                            onChange={e => setRefundDialog(d => ({ ...d, amountStr: e.target.value }))}
                            placeholder={(refundDialog.maxCents / 100).toFixed(2)}
                            style={{ width: '100%', padding: '6px 8px', marginTop: 2, background: 'var(--bg-alt, #111)', color: 'var(--text)', border: '1px solid var(--bd)' }} />
                        <label htmlFor="refund-reason" style={{ display: 'block', fontSize: 11, color: 'var(--text-mid)', marginTop: 10 }}>Reason (optional)</label>
                        <input id="refund-reason" type="text" value={refundDialog.reason}
                            onChange={e => setRefundDialog(d => ({ ...d, reason: e.target.value }))}
                            style={{ width: '100%', padding: '6px 8px', marginTop: 2, background: 'var(--bg-alt, #111)', color: 'var(--text)', border: '1px solid var(--bd)' }} />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                            <button className="btn btn--sm" disabled={refundDialog.submitting}
                                onClick={() => setRefundDialog({ open: false, paymentId: null, maxCents: 0, amountStr: '', reason: '', submitting: false })}>
                                Cancel
                            </button>
                            <button className="btn btn--sm" disabled={refundDialog.submitting}
                                onClick={submitRefund} style={{ color: 'var(--amber)', borderColor: 'var(--amber)' }}>
                                {refundDialog.submitting ? 'Refunding…' : 'Issue refund'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
