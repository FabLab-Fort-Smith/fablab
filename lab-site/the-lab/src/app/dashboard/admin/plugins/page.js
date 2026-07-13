'use client';
// Admin plugin-management panel. Lists installed plugins and lets an admin
// enable/disable and configure each. This is a UX gate only (useSession) — real
// enforcement is the admin-only /api/v1/admin/plugins route.
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function AdminPluginsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [plugins, setPlugins] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
    else if (status === 'authenticated' && session.user.role !== 'admin') router.push('/dashboard');
  }, [status, session, router]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/plugins');
      if (!res.ok) throw new Error(`Failed to load plugins (${res.status})`);
      const data = await res.json();
      setPlugins(data.plugins || []);
      setError('');
    } catch (e) {
      setError(e.message);
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
      if (!res.ok) throw new Error((await res.json()).error || 'Update failed');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const saveConfig = async (id, config) => {
    setBusy(id);
    try {
      const res = await fetch('/api/v1/admin/plugins', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pluginId: id, config }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  if (status !== 'authenticated') return null;

  return (
    <div style={{ padding: '20px 24px' }}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
          <span style={{ color: 'var(--magenta)' }}>$</span> sudo ./admin --plugins
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', margin: 0 }}>
          plugins
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
          enable, disable, and configure in-repo add-ons.
        </p>
      </header>

      {error && (
        <div role="alert" style={{ color: 'var(--red, #f66)', fontSize: 12, marginBottom: 16 }}>{error}</div>
      )}

      {plugins === null ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading…</div>
      ) : plugins.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>no plugins installed.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          {plugins.map((p) => (
            <li key={p.id}>
              <PluginCard plugin={p} busy={busy === p.id} onToggle={toggle} onSave={saveConfig} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PluginCard({ plugin, busy, onToggle, onSave }) {
  const [config, setConfig] = useState(plugin.config || {});
  const schema = plugin.configSchema || {};
  const hasConfig = Object.keys(schema).length > 0;

  useEffect(() => { setConfig(plugin.config || {}); }, [plugin]);

  const setField = (field, value) => setConfig((c) => ({ ...c, [field]: value }));

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--text-bright)' }}>
            {plugin.name} <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>v{plugin.version}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{plugin.description}</div>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
          <input
            type="checkbox"
            checked={!!plugin.enabled}
            disabled={busy}
            onChange={(e) => onToggle(plugin.id, e.target.checked)}
            aria-label={`Enable ${plugin.name}`}
          />
          <span style={{ color: plugin.enabled ? 'var(--green)' : 'var(--text-dim)' }}>
            {plugin.enabled ? 'enabled' : 'disabled'}
          </span>
        </label>
      </div>

      {hasConfig && (
        <form
          style={{ marginTop: 14, borderTop: '1px solid var(--bd)', paddingTop: 12, display: 'grid', gap: 10 }}
          onSubmit={(e) => { e.preventDefault(); onSave(plugin.id, config); }}
        >
          {Object.entries(schema).map(([field, spec]) => (
            <ConfigField
              key={field}
              field={field}
              spec={spec}
              value={config[field]}
              onChange={(v) => setField(field, v)}
            />
          ))}
          <div>
            <button type="submit" disabled={busy} className="btn" style={{ fontSize: 12 }}>
              {busy ? 'saving…' : 'save config'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ConfigField({ field, spec, value, onChange }) {
  const id = `cfg-${field}`;
  const label = (
    <label htmlFor={id} style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
      {field}{spec.immutable ? ' (read-only)' : ''}{spec.description ? ` — ${spec.description}` : ''}
    </label>
  );
  const disabled = !!spec.immutable;

  if (spec.type === 'boolean') {
    return (
      <div>
        <label htmlFor={id} style={{ fontSize: 12, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <input id={id} type="checkbox" checked={!!value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
          {field}{spec.description ? ` — ${spec.description}` : ''}
        </label>
      </div>
    );
  }
  if (spec.type === 'number') {
    return (
      <div>{label}
        <input id={id} type="number" value={value ?? ''} min={spec.min} max={spec.max} disabled={disabled}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          style={{ fontSize: 12, width: 160 }} />
      </div>
    );
  }
  if (spec.type === 'string[]') {
    return (
      <div>{label}
        <input id={id} type="text" value={Array.isArray(value) ? value.join(', ') : ''} disabled={disabled}
          placeholder="comma,separated"
          onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          style={{ fontSize: 12, width: '100%', maxWidth: 420 }} />
      </div>
    );
  }
  return (
    <div>{label}
      <input id={id} type="text" value={value ?? ''} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} style={{ fontSize: 12, width: '100%', maxWidth: 420 }} />
    </div>
  );
}
