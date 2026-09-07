'use client';
// Addon Manager (AD-2): a gallery of addon cards. Each card shows the addon's
// icon, name, description, category, and enabled state with an enable/disable
// toggle; clicking a card opens a config popup (modal) whose form is built from
// the addon's declarative configSchema.
//
// This page is a UX gate only (useSession) — real authorization is the admin-only
// GET/PATCH/PUT /api/v1/admin/plugins route (service enforces isAdmin). The client
// is untrusted; all validation here is for feedback, the server is authoritative.

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import AddonCard from './AddonCard';
import AddonConfigModal from './AddonConfigModal';

export default function AdminAddonManagerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [addons, setAddons] = useState(null); // null = loading, [] = loaded-empty
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');       // id currently mutating
  const [openId, setOpenId] = useState(null); // addon whose modal is open
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
    else if (status === 'authenticated' && session.user.role !== 'admin') router.push('/dashboard');
  }, [status, session, router]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/plugins');
      if (!res.ok) throw new Error(`Failed to load addons (${res.status})`);
      const data = await res.json();
      setAddons(Array.isArray(data.plugins) ? data.plugins : []);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to load addons.');
      setAddons([]); // leave loading state; show the error + empty region
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && session.user.role === 'admin') load();
  }, [status, session, load]);

  const toggle = async (id, enabled) => {
    setBusy(id);
    try {
      const res = await fetch('/api/v1/admin/plugins', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pluginId: id, enabled }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Update failed');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const saveConfig = async (id, config) => {
    setBusy(id);
    setModalError('');
    try {
      const res = await fetch('/api/v1/admin/plugins', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pluginId: id, config }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Save failed');
      await load();
      setOpenId(null); // close on success; focus returns to the invoking card (focus trap)
    } catch (e) {
      setModalError(e.message || 'Save failed.');
    } finally {
      setBusy('');
    }
  };

  if (status !== 'authenticated') return null;

  const openAddon = addons?.find((a) => a.id === openId) || null;

  return (
    <div style={{ padding: '20px 24px' }}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
          <span style={{ color: 'var(--magenta)' }}>$</span> sudo ./admin --addons
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
          addon manager
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
          browse installed addons — enable, disable, and configure each.
        </p>
      </header>

      {error && (
        <div role="alert" style={{ color: 'var(--red, #f66)', fontSize: 12, marginBottom: 16 }}>{error}</div>
      )}

      {addons === null ? (
        <div role="status" aria-live="polite" style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading addons…</div>
      ) : addons.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 12, border: '1px dashed var(--bd)', padding: 24, textAlign: 'center' }}>
          {error ? 'could not load addons.' : 'no addons installed.'}
        </div>
      ) : (
        <ul
          aria-label="Installed addons"
          style={{
            listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 14,
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          }}
        >
          {addons.map((addon) => (
            <li key={addon.id} style={{ display: 'flex' }}>
              <AddonCard
                addon={addon}
                busy={busy === addon.id}
                onOpen={() => { setModalError(''); setOpenId(addon.id); }}
                onToggle={toggle}
              />
            </li>
          ))}
        </ul>
      )}

      {openAddon && (
        <AddonConfigModal
          addon={openAddon}
          busy={busy === openAddon.id}
          error={modalError}
          onSave={saveConfig}
          onClose={() => { setModalError(''); setOpenId(null); }}
        />
      )}
    </div>
  );
}
