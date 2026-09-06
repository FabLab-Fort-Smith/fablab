'use client';
// Admin management for the door-access-controller plugin. UX gate only — real enforcement is
// the admin-authorized service behind /api/v1/plugins/door-access-controller/admin. Accessible:
// semantic landmarks + headings, labelled inputs, table headers, and a live region for status.
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const API = '/api/v1/plugins/door-access-controller/admin';

export default function AdminDoorAccessPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [status_, setStatus_] = useState('');
  const [busy, setBusy] = useState(false);
  const [door, setDoor] = useState({ doorId: '', name: '', deviceId: '', timezone: '', enabled: true });
  const [policyText, setPolicyText] = useState('');
  const [edgeKey, setEdgeKey] = useState({ edgeId: '', pubSpki: '' });

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
    else if (status === 'authenticated' && session.user.role !== 'admin') router.push('/dashboard');
  }, [status, session, router]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(API);
      if (res.status === 404) { setStatus_('The door-access-controller plugin is disabled.'); setData({ doors: [], cards: [], policy: { rules: [], accountOverrides: {} }, allowlist: {} }); return; }
      if (res.status === 403) { setStatus_('Admin access required.'); return; }
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const d = await res.json();
      setData(d);
      setPolicyText(JSON.stringify({ rules: d.policy?.rules || [], accountOverrides: d.policy?.accountOverrides || {} }, null, 2));
      setStatus_('');
    } catch (e) { setStatus_(e.message); }
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && session.user.role === 'admin') load();
  }, [status, session, load]);

  const act = async (payload, okMsg) => {
    setBusy(true);
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Action failed (${res.status})`);
      setStatus_(okMsg);
      await load();
      return true;
    } catch (e) { setStatus_(e.message); return false; } finally { setBusy(false); }
  };

  const addDoor = (e) => {
    e.preventDefault();
    if (!door.doorId.trim() || !door.deviceId.trim()) { setStatus_('Door ID and Device ID are required.'); return; }
    act({ action: 'door.upsert', ...door }, `Saved door "${door.doorId}".`);
  };

  const savePolicy = () => {
    let parsed;
    try { parsed = JSON.parse(policyText); } catch { setStatus_('Policy is not valid JSON.'); return; }
    act({ action: 'policy.save', rules: parsed.rules, accountOverrides: parsed.accountOverrides }, 'Policy saved.');
  };

  const registerEdgeKey = (e) => {
    e.preventDefault();
    const edgeId = edgeKey.edgeId.trim();
    const pubSpki = edgeKey.pubSpki.trim();
    if (!edgeId || !pubSpki) { setStatus_('Edge ID and public key are required.'); return; }
    // The server re-anchors this edge's audit trust and audits it; a rotation replaces the prior key.
    const known = edges.find((x) => x.edgeId === edgeId);
    if (known && !confirm(`Edge "${edgeId}" already has a key — replace it (rotation)?`)) return;
    act({ action: 'edgeKey.register', edgeId, pubSpki }, `Registered audit key for "${edgeId}".`)
      .then((ok) => { if (ok) setEdgeKey({ edgeId: '', pubSpki: '' }); });
  };

  if (status !== 'authenticated') return null;

  const doors = data?.doors || [];
  const cards = data?.cards || [];
  const edges = data?.edges || [];

  return (
    <main style={{ padding: '20px 24px', maxWidth: 960 }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>Door Access</h1>
        <p style={{ margin: 0, color: 'var(--text-dim)' }}>Doors, access policy, and paired cards for the door-access controller.</p>
      </header>

      <div role="status" aria-live="polite" style={{ minHeight: 22, color: 'var(--cyan)', marginBottom: 16 }}>{status_}</div>

      {/* Allowlist */}
      <section aria-labelledby="al-h" style={{ marginBottom: 28 }}>
        <h2 id="al-h" style={{ fontSize: 16 }}>Offline allowlist</h2>
        <p style={{ margin: '4px 0', color: 'var(--text-dim)' }}>
          Signing key {data?.allowlist?.signingReady ? 'configured' : 'NOT set (offline mode unavailable)'}.
        </p>
        <button type="button" disabled={busy} onClick={() => act({ action: 'allowlist.refresh' }, 'Allowlist refreshed.')}>
          Refresh now
        </button>
      </section>

      {/* Doors */}
      <section aria-labelledby="doors-h" style={{ marginBottom: 28 }}>
        <h2 id="doors-h" style={{ fontSize: 16 }}>Doors</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Door ID', 'Name', 'Device', 'Timezone', 'Enabled'].map((h) => (
              <th key={h} scope="col" style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '6px 8px' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {doors.length === 0 ? <tr><td colSpan={5} style={{ padding: 8, color: 'var(--text-dim)' }}>No doors yet.</td></tr>
              : doors.map((d) => (
                <tr key={d.doorId}>
                  <td style={{ padding: '6px 8px' }}>{d.doorId}</td>
                  <td style={{ padding: '6px 8px' }}>{d.name}</td>
                  <td style={{ padding: '6px 8px' }}>{d.deviceId}</td>
                  <td style={{ padding: '6px 8px' }}>{d.timezone || '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{d.enabled ? 'yes' : 'no'}</td>
                </tr>
              ))}
          </tbody>
        </table>

        <form onSubmit={addDoor} style={{ marginTop: 12, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, minmax(0,1fr))', maxWidth: 560 }}>
          <h3 style={{ gridColumn: '1 / -1', fontSize: 13, margin: '4px 0' }}>Add / update a door</h3>
          <Field id="d-id" label="Door ID" value={door.doorId} onChange={(v) => setDoor({ ...door, doorId: v })} required />
          <Field id="d-name" label="Name" value={door.name} onChange={(v) => setDoor({ ...door, name: v })} />
          <Field id="d-device" label="Device ID" value={door.deviceId} onChange={(v) => setDoor({ ...door, deviceId: v })} required />
          <Field id="d-tz" label="Timezone (IANA)" value={door.timezone} onChange={(v) => setDoor({ ...door, timezone: v })} placeholder="America/Chicago" />
          <label htmlFor="d-enabled" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id="d-enabled" type="checkbox" checked={door.enabled} onChange={(e) => setDoor({ ...door, enabled: e.target.checked })} />
            Enabled
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" disabled={busy}>Save door</button>
          </div>
        </form>
      </section>

      {/* Edge audit keys */}
      <section aria-labelledby="edge-h" style={{ marginBottom: 28 }}>
        <h2 id="edge-h" style={{ fontSize: 16 }}>Edge audit keys</h2>
        <p style={{ color: 'var(--text-dim)', margin: '4px 0 10px' }}>
          Each edge signs its offline audit with a per-device key. Provision it on the device
          (<code>python -m edge.provision_audit_key</code>) and register the printed public key here so the
          cloud will accept that edge&apos;s audit. Registering a new key for an existing edge is a rotation.
        </p>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Edge ID', 'Key fingerprint', 'Registered', 'Last seen', 'Via broker', 'Last mode'].map((h) => (
              <th key={h} scope="col" style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '6px 8px', whiteSpace: 'nowrap' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {edges.length === 0 ? <tr><td colSpan={6} style={{ padding: 8, color: 'var(--text-dim)' }}>No edges registered yet.</td></tr>
              : edges.map((x) => (
                <tr key={x.edgeId}>
                  <td style={{ padding: '6px 8px' }}>{x.edgeId}</td>
                  <td style={{ padding: '6px 8px', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{x.fingerprint || '—'}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{x.updatedAt ? new Date(x.updatedAt).toLocaleString() : '—'}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{x.lastSeenAt ? new Date(x.lastSeenAt).toLocaleString() : 'never'}</td>
                  <td style={{ padding: '6px 8px' }}>{x.lastBrokerId || '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{x.lastMode || '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
        </div>

        <form onSubmit={registerEdgeKey} style={{ marginTop: 12, display: 'grid', gap: 8, maxWidth: 560 }}>
          <h3 style={{ fontSize: 13, margin: '4px 0' }}>Register / rotate an edge key</h3>
          <Field id="e-id" label="Edge ID (device cert CN)" value={edgeKey.edgeId} onChange={(v) => setEdgeKey({ ...edgeKey, edgeId: v })} required placeholder="front-01" />
          <label htmlFor="e-pub" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            <span>Public key (SPKI, base64) *</span>
            <textarea id="e-pub" value={edgeKey.pubSpki} onChange={(e) => setEdgeKey({ ...edgeKey, pubSpki: e.target.value })}
              required rows={3} spellCheck={false} placeholder="MCowBQYDK2Vw..."
              style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12, padding: '6px 8px' }} />
          </label>
          <div><button type="submit" disabled={busy}>Register key</button></div>
        </form>
      </section>

      {/* Policy */}
      <section aria-labelledby="pol-h" style={{ marginBottom: 28 }}>
        <h2 id="pol-h" style={{ fontSize: 16 }}>Access policy</h2>
        <label htmlFor="pol" style={{ display: 'block', color: 'var(--text-dim)', marginBottom: 4 }}>
          Rules and per-account overrides (JSON). Each rule: <code>{'{ id, roles[], doors[], windows?, credentialTypes? }'}</code>.
        </label>
        <textarea id="pol" value={policyText} onChange={(e) => setPolicyText(e.target.value)} rows={12}
          spellCheck={false} style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
        <div style={{ marginTop: 8 }}><button type="button" disabled={busy} onClick={savePolicy}>Save policy</button></div>
      </section>

      {/* Cards */}
      <section aria-labelledby="cards-h">
        <h2 id="cards-h" style={{ fontSize: 16 }}>Paired cards</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Member', 'Type', 'Status', 'Paired', ''].map((h, i) => (
              <th key={i} scope="col" style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '6px 8px' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {cards.length === 0 ? <tr><td colSpan={5} style={{ padding: 8, color: 'var(--text-dim)' }}>No cards paired.</td></tr>
              : cards.map((c) => (
                <tr key={`${c.userID}-${c.createdAt}`}>
                  <td style={{ padding: '6px 8px' }}>{c.userID}</td>
                  <td style={{ padding: '6px 8px' }}>{c.credentialType}</td>
                  <td style={{ padding: '6px 8px' }}>{c.status}</td>
                  <td style={{ padding: '6px 8px' }}>{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '6px 8px' }}>
                    {c.status !== 'revoked' && (
                      <button type="button" disabled={busy}
                        onClick={() => confirm(`Revoke ${c.userID}'s card?`) && act({ action: 'card.revoke', userID: c.userID }, `Revoked ${c.userID}'s card.`)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Field({ id, label, value, onChange, required, placeholder }) {
  return (
    <label htmlFor={id} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
      <span>{label}{required ? ' *' : ''}</span>
      <input id={id} value={value} required={required} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} style={{ padding: '6px 8px' }} />
    </label>
  );
}
