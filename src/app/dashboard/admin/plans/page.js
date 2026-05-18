'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const CADENCES = ['MONTHLY', 'ANNUAL', 'WEEKLY', 'DAILY', 'EVERY_TWO_YEARS'];

function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function cadenceLabel(cadence) {
  const map = { MONTHLY: 'mo', ANNUAL: 'yr', WEEKLY: 'wk', DAILY: 'day', EVERY_TWO_YEARS: '2yr' };
  return map[cadence] || cadence.toLowerCase();
}

const inputStyle = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--bd)',
  color: 'var(--text)',
  padding: '7px 10px',
  fontSize: 12,
  fontFamily: 'var(--mono)',
  boxSizing: 'border-box',
};

function Modal({ children, onClose, title, accentColor, width = 400 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg-card)', border: `1px solid ${accentColor}`, padding: 24, width, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', fontFamily: 'var(--mono)' }}>
        <div style={{ fontSize: 11, color: accentColor, letterSpacing: '0.1em', marginBottom: 16 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

export default function PlansPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editPlan, setEditPlan] = useState(null);
  const [archivePlan, setArchivePlan] = useState(null);
  const [subscribersPlan, setSubscribersPlan] = useState(null);
  const [subscribers, setSubscribers] = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelSubs, setCancelSubs] = useState(false);
  const [subAction, setSubAction] = useState(null);

  const [addForm, setAddForm] = useState({
    name: '',
    variations: [{ name: '', cadence: 'MONTHLY', priceCents: '', trialDays: '' }],
  });
  const [editForm, setEditForm] = useState({ name: '', variations: [] });

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

  const openSubscriberModal = async (plan) => {
    setSubscribersPlan(plan);
    setSubscribers([]);
    setLoadingSubs(true);
    try {
      const res = await fetch(`/api/v1/admin/plans?subscribers=${plan.id}`);
      if (!res.ok) throw new Error('Failed to fetch subscribers');
      setSubscribers(await res.json());
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoadingSubs(false);
    }
  };

  const handleSubAction = async (subscriptionId, action) => {
    setSubAction({ subscriptionId, action });
    try {
      const res = await fetch('/api/v1/admin/plans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId, action }),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.error || 'Failed.', 'error'); return; }
      showToast(`Subscription ${action}d.`);
      const res2 = await fetch(`/api/v1/admin/plans?subscribers=${subscribersPlan.id}`);
      if (res2.ok) setSubscribers(await res2.json());
      fetchPlans();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSubAction(null);
    }
  };

  const handleAdd = async () => {
    if (!addForm.name || !addForm.variations.length) return;
    if (plans.some(p => p.name.toLowerCase() === addForm.name.toLowerCase())) {
      showToast('A plan with that name already exists.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const variations = addForm.variations.map(v => ({
        name: v.name || v.cadence,
        cadence: v.cadence,
        priceCents: Math.round(parseFloat(v.priceCents) * 100),
        trialDays: v.trialDays ? parseInt(v.trialDays, 10) : 0,
      }));
      const res = await fetch('/api/v1/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addForm.name, variations }),
      });
      const d = await res.json();
      if (res.ok) {
        showToast('Plan created.');
        setAddOpen(false);
        setAddForm({ name: '', variations: [{ name: '', cadence: 'MONTHLY', priceCents: '', trialDays: '' }] });
        fetchPlans();
      } else {
        showToast(d.error || 'Failed to create plan.', 'error');
      }
    } finally { setSubmitting(false); }
  };

  const handleEdit = async () => {
    if (!editForm.name || !editPlan) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/admin/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: editPlan.id,
          name: editForm.name,
          variations: editForm.variations.map(v => ({
            id: v.id,
            priceCents: Math.round(parseFloat(v.priceCents) * 100),
          })),
        }),
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
        body: JSON.stringify({ planId: archivePlan.id, cancelSubscriptions: cancelSubs }),
      });
      const d = await res.json();
      if (res.ok) {
        const cancelNote = d.cancelledCount > 0 ? ` ${d.cancelledCount} subscription(s) cancelled.` : '';
        showToast(d.hidden ? `Hidden from member selection.${cancelNote}` : `Plan deleted.${cancelNote}`);
        setArchivePlan(null);
        setCancelSubs(false);
        fetchPlans();
      } else {
        showToast(d.error || 'Failed to archive.', 'error');
      }
    } finally { setSubmitting(false); }
  };

  const handleRestore = async (plan) => {
    try {
      const res = await fetch('/api/v1/admin/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, restore: true }),
      });
      if (res.ok) { showToast('Plan restored.'); fetchPlans(); }
      else { const d = await res.json(); showToast(d.error || 'Failed to restore.', 'error'); }
    } catch { showToast('Failed to restore.', 'error'); }
  };

  const openEditModal = (plan) => {
    setEditPlan(plan);
    setEditForm({
      name: plan.name,
      variations: (plan.variations || []).map(v => ({
        id: v.id,
        name: v.name,
        cadence: v.cadence,
        priceCents: (v.priceCents / 100).toFixed(2),
        trialDays: v.trialDays || 0,
      })),
    });
  };

  const updateAddVar = (idx, key, value) =>
    setAddForm(p => { const vars = [...p.variations]; vars[idx] = { ...vars[idx], [key]: value }; return { ...p, variations: vars }; });

  const updateEditVar = (idx, key, value) =>
    setEditForm(p => { const vars = [...p.variations]; vars[idx] = { ...vars[idx], [key]: value }; return { ...p, variations: vars }; });

  if (status !== 'authenticated') return null;

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100 }}>
      {/* Header */}
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

      {/* Toast */}
      {toast && (
        <div style={{ border: `1px solid ${toast.type === 'error' ? 'var(--red)' : 'var(--green)'}`, color: toast.type === 'error' ? 'var(--red)' : 'var(--green)', background: 'var(--bg-card)', padding: '10px 14px', marginBottom: 16, fontSize: 12, fontFamily: 'var(--mono)' }}>
          {toast.type === 'error' ? '✗' : '✓'} {toast.msg}
        </div>
      )}

      {/* Plans table */}
      {loading ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--mono)' }}>loading plans...</div>
      ) : plans.length === 0 ? (
        <div style={{ border: '1px solid var(--bd)', padding: '32px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
          no plans found. create one to get started.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--bd)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 110px 160px', borderBottom: '1px solid var(--bd)', padding: '8px 14px', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)' }}>
            <span>PLAN NAME</span>
            <span>BILLING OPTIONS</span>
            <span>SUBSCRIBERS</span>
            <span>ACTIONS</span>
          </div>
          {plans.map((plan, i) => (
            <div key={plan.id} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 110px 160px', padding: '12px 14px', borderBottom: i < plans.length - 1 ? '1px solid var(--bd)' : 'none', alignItems: 'center', gap: 8, opacity: plan.hidden ? 0.55 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: plan.hidden ? 'var(--text-dim)' : 'var(--text-bright)', fontFamily: 'var(--mono)', fontWeight: 600, textDecoration: plan.hidden ? 'line-through' : 'none' }}>{plan.name}</span>
                {plan.hidden && <span style={{ fontSize: 8, border: '1px solid var(--amber)', color: 'var(--amber)', padding: '1px 5px', letterSpacing: '0.1em' }}>HIDDEN</span>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(plan.variations || []).map(v => (
                  <span key={v.id} style={{ fontSize: 9, border: '1px solid var(--bd-1)', color: 'var(--cyan)', padding: '3px 7px', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>
                    {v.priceCents != null ? `${formatPrice(v.priceCents)}/` : ''}{cadenceLabel(v.cadence)}
                    {v.priceCents == null && <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>variable</span>}
                    {v.trialDays > 0 && <span style={{ color: 'var(--amber)', marginLeft: 4 }}>+{v.trialDays}d trial</span>}
                  </span>
                ))}
              </div>
              <div>
                {plan.subscriberCount > 0 ? (
                  <button
                    onClick={() => openSubscriberModal(plan)}
                    style={{ background: 'none', border: '1px solid var(--green)', color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 8px', cursor: 'pointer', letterSpacing: '0.06em' }}
                  >
                    {plan.subscriberCount} active
                  </button>
                ) : (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>—</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {plan.hidden ? (
                  <button className="btn btn--sm" style={{ fontSize: 9, padding: '3px 8px', borderColor: 'var(--amber)', color: 'var(--amber)' }} onClick={() => handleRestore(plan)}>
                    restore
                  </button>
                ) : (
                  <>
                    <button className="btn btn--sm" style={{ fontSize: 9, padding: '3px 8px' }} onClick={() => openEditModal(plan)}>
                      edit
                    </button>
                    <button className="btn btn--sm" style={{ fontSize: 9, padding: '3px 8px', borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => setArchivePlan(plan)}>
                      archive
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add Plan Modal ───────────────────────────────────────────────────── */}
      {addOpen && (
        <Modal onClose={() => setAddOpen(false)} title="ADD NEW PLAN" accentColor="var(--cyan)" width={540}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="PLAN NAME *">
              <input
                type="text"
                value={addForm.name}
                onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                style={inputStyle}
                placeholder="e.g. Individual Member"
              />
            </Field>

            <div>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 8 }}>BILLING VARIATIONS</div>
              {addForm.variations.map((v, idx) => (
                <div key={idx} style={{ border: '1px solid var(--bd)', padding: '12px', marginBottom: 8, position: 'relative' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="VARIATION NAME">
                      <input type="text" value={v.name} placeholder={v.cadence} onChange={e => updateAddVar(idx, 'name', e.target.value)} style={inputStyle} />
                    </Field>
                    <Field label="CADENCE">
                      <select value={v.cadence} onChange={e => updateAddVar(idx, 'cadence', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                        {CADENCES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field label="PRICE (USD) *">
                      <input type="number" min="0" step="0.01" value={v.priceCents} placeholder="0.00" onChange={e => updateAddVar(idx, 'priceCents', e.target.value)} style={inputStyle} />
                    </Field>
                    <Field label="TRIAL DAYS (0 = none)">
                      <input type="number" min="0" step="1" value={v.trialDays} placeholder="0" onChange={e => updateAddVar(idx, 'trialDays', e.target.value)} style={inputStyle} />
                    </Field>
                  </div>
                  {addForm.variations.length > 1 && (
                    <button
                      onClick={() => setAddForm(p => ({ ...p, variations: p.variations.filter((_, i) => i !== idx) }))}
                      style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--mono)' }}
                    >✕</button>
                  )}
                </div>
              ))}
              <button
                className="btn btn--sm"
                style={{ fontSize: 9, color: 'var(--cyan)', borderColor: 'var(--cyan)' }}
                onClick={() => setAddForm(p => ({ ...p, variations: [...p.variations, { name: '', cadence: 'MONTHLY', priceCents: '', trialDays: '' }] }))}
              >
                + add variation
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn--sm" style={{ fontSize: 10 }} onClick={() => setAddOpen(false)}>cancel</button>
            <button
              className="btn btn--sm"
              style={{ fontSize: 10, borderColor: 'var(--cyan)', color: 'var(--cyan)' }}
              onClick={handleAdd}
              disabled={!addForm.name || !addForm.variations.every(v => v.priceCents !== '') || submitting}
            >
              {submitting ? 'creating...' : '$ create plan'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Edit Plan Modal ──────────────────────────────────────────────────── */}
      {editPlan && (
        <Modal onClose={() => setEditPlan(null)} title="EDIT PLAN" accentColor="var(--cyan)" width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="PLAN NAME *">
              <input type="text" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
            </Field>
            {editForm.variations.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 8 }}>VARIATION PRICES</div>
                {editForm.variations.map((v, idx) => (
                  <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10, padding: '10px 12px', border: '1px solid var(--bd)' }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-bright)', fontFamily: 'var(--mono)', marginBottom: 2 }}>{v.name || v.cadence}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                        {v.cadence}{v.trialDays > 0 ? ` · ${v.trialDays}d trial` : ''}
                      </div>
                    </div>
                    <Field label="PRICE (USD)">
                      <input type="number" min="0" step="0.01" value={v.priceCents} onChange={e => updateEditVar(idx, 'priceCents', e.target.value)} style={inputStyle} />
                    </Field>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn--sm" style={{ fontSize: 10 }} onClick={() => setEditPlan(null)}>cancel</button>
            <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--cyan)', color: 'var(--cyan)' }} onClick={handleEdit} disabled={!editForm.name || submitting}>
              {submitting ? 'saving...' : '$ save'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Archive Confirm Modal ────────────────────────────────────────────── */}
      {archivePlan && (
        <Modal onClose={() => { setArchivePlan(null); setCancelSubs(false); }} title="ARCHIVE PLAN?" accentColor="var(--red)" width={420}>
          <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 16 }}>
            Archive <span style={{ color: 'var(--text-bright)' }}>{archivePlan.name}</span>?
            This will remove it from Square&apos;s catalog and hide it from new members.
          </div>
          {archivePlan.subscriberCount > 0 && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', border: `1px solid ${cancelSubs ? 'var(--red)' : 'var(--bd)'}`, background: cancelSubs ? 'rgba(255,56,56,0.05)' : 'var(--bg-1)', marginBottom: 16 }}>
              <input type="checkbox" checked={cancelSubs} onChange={e => setCancelSubs(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--red)', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 11, color: cancelSubs ? 'var(--red)' : 'var(--text)', fontWeight: 600 }}>
                  cancel {archivePlan.subscriberCount} active subscription{archivePlan.subscriberCount !== 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, lineHeight: 1.5 }}>
                  Immediately cancel every subscriber on this plan in Square. Members will lose access at the end of their billing period.
                </div>
              </div>
            </label>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn--sm" style={{ fontSize: 10 }} onClick={() => { setArchivePlan(null); setCancelSubs(false); }}>cancel</button>
            <button className="btn btn--sm" style={{ fontSize: 10, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={handleArchive} disabled={submitting}>
              {submitting ? 'archiving...' : cancelSubs ? '$ cancel subs & archive' : '$ archive'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Subscriber List Modal ────────────────────────────────────────────── */}
      {subscribersPlan && (
        <Modal onClose={() => { setSubscribersPlan(null); setSubscribers([]); }} title={`SUBSCRIBERS — ${subscribersPlan.name.toUpperCase()}`} accentColor="var(--green)" width={740}>
          {loadingSubs ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '24px 0' }}>loading subscribers...</div>
          ) : subscribers.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '24px 0' }}>no active subscribers.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--mono)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bd)' }}>
                    {['MEMBER', 'VARIATION', 'STATUS', 'THROUGH', 'ACTIONS'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-dim)', fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subscribers.map(s => {
                    const variation = subscribersPlan.variations?.find(v => v.id === s.planVariationId);
                    const isPending = subAction?.subscriptionId === s.id;
                    const statusColor = s.status === 'ACTIVE' ? 'var(--green)' : s.status === 'PAUSED' ? 'var(--amber)' : 'var(--red)';
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--bd)', opacity: isPending ? 0.4 : 1 }}>
                        <td style={{ padding: '8px 8px', color: 'var(--text-bright)' }}>
                          {s.customer ? `${s.customer.firstName} ${s.customer.lastName}` : <span style={{ color: 'var(--text-dim)' }}>unknown</span>}
                        </td>
                        <td style={{ padding: '8px 8px', color: 'var(--cyan)' }}>
                          {variation
                            ? variation.priceCents != null
                              ? `${formatPrice(variation.priceCents)}/${cadenceLabel(variation.cadence)}`
                              : cadenceLabel(variation.cadence)
                            : '—'}
                        </td>
                        <td style={{ padding: '8px 8px' }}>
                          <span style={{ fontSize: 9, border: `1px solid ${statusColor}`, color: statusColor, padding: '1px 5px', letterSpacing: '0.08em' }}>
                            {s.status}
                          </span>
                        </td>
                        <td style={{ padding: '8px 8px', color: 'var(--text-dim)', fontSize: 10 }}>{s.chargedThroughDate || '—'}</td>
                        <td style={{ padding: '8px 8px' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {s.status === 'ACTIVE' && (
                              <button className="btn btn--sm" style={{ fontSize: 8, padding: '2px 6px', borderColor: 'var(--amber)', color: 'var(--amber)' }} onClick={() => handleSubAction(s.id, 'pause')} disabled={isPending}>pause</button>
                            )}
                            {s.status === 'PAUSED' && (
                              <button className="btn btn--sm" style={{ fontSize: 8, padding: '2px 6px', borderColor: 'var(--green)', color: 'var(--green)' }} onClick={() => handleSubAction(s.id, 'resume')} disabled={isPending}>resume</button>
                            )}
                            {(s.status === 'ACTIVE' || s.status === 'PAUSED') && (
                              <button className="btn btn--sm" style={{ fontSize: 8, padding: '2px 6px', borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => handleSubAction(s.id, 'cancel')} disabled={isPending}>cancel</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn--sm" style={{ fontSize: 10 }} onClick={() => { setSubscribersPlan(null); setSubscribers([]); }}>close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
