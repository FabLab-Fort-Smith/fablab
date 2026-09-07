'use client';
// The addon config form, built from a plugin's declarative `configSchema`
// (see src/lib/plugins/manifest.schema.js CONFIG_TYPES). Renders the right
// control per field type and mirrors the server's validation client-side for
// fast feedback — the server (PUT /api/v1/admin/plugins) remains authoritative.
//
// SECRET fields are WRITE-ONLY: never prefilled, shown with a set/not-set badge
// from `secretsSet`, and a blank value on save KEEPS the stored secret (AD-1).

import { useMemo, useState } from 'react';

const labelStyle = {
  fontSize: 11,
  color: 'var(--text-dim)',
  display: 'block',
  marginBottom: 4,
  letterSpacing: '0.04em',
};
const controlStyle = { fontSize: 12, width: '100%', maxWidth: 460, fontFamily: 'var(--mono)' };
const hintStyle = { fontSize: 10.5, color: 'var(--text-dim)', marginTop: 4 };
const errStyle = { fontSize: 11, color: 'var(--red, #f66)', marginTop: 4 };

/** Build the initial editable state from the redacted config + schema (secrets always blank). */
function initialValues(schema, config) {
  const out = {};
  for (const [field, spec] of Object.entries(schema)) {
    if (spec.type === 'secret') { out[field] = ''; continue; }
    const v = config?.[field];
    if (spec.type === 'string[]') out[field] = Array.isArray(v) ? v : [];
    else if (spec.type === 'boolean') out[field] = !!v;
    else if (v === undefined || v === null) out[field] = spec.default ?? '';
    else out[field] = v;
  }
  return out;
}

/**
 * Validate a single field's value against its spec. Returns an error string or ''.
 * Mirrors coerce() in manifest.schema.js (server is authoritative; this is UX).
 */
export function validateField(field, spec, value) {
  switch (spec.type) {
    case 'number': {
      if (value === '' || value === null || value === undefined) return `${field} must be a number`;
      const n = Number(value);
      if (!Number.isFinite(n)) return `${field} must be a number`;
      if (spec.min !== undefined && n < spec.min) return `${field} must be >= ${spec.min}`;
      if (spec.max !== undefined && n > spec.max) return `${field} must be <= ${spec.max}`;
      return '';
    }
    case 'string':
    case 'text':
      if (typeof value !== 'string') return `${field} must be text`;
      if (spec.max !== undefined && value.length > spec.max) return `${field} must be ${spec.max} characters or fewer`;
      return '';
    case 'select':
      if (!Array.isArray(spec.options) || !spec.options.includes(value)) {
        return `${field} must be one of: ${(spec.options || []).join(', ')}`;
      }
      return '';
    case 'secret':
      // Write-only: blank is valid (keeps the current value). Only length-check a new value.
      if (value && spec.max !== undefined && value.length > spec.max) return `${field} must be ${spec.max} characters or fewer`;
      return '';
    case 'boolean':
    case 'string[]':
    default:
      return '';
  }
}

/**
 * Build the PATCH-style config payload from the editable values. Omits secret
 * fields left blank (a blank secret means "keep current" — never send "").
 */
export function buildConfigPatch(schema, values) {
  const patch = {};
  for (const [field, spec] of Object.entries(schema)) {
    if (spec.immutable) continue; // server ignores these anyway
    const v = values[field];
    if (spec.type === 'secret') {
      if (typeof v === 'string' && v.length > 0) patch[field] = v; // only send a replacement
      continue;
    }
    if (spec.type === 'number') { patch[field] = v === '' ? v : Number(v); continue; }
    patch[field] = v;
  }
  return patch;
}

/**
 * Controlled config form. The parent owns submission; this owns field state +
 * client validation and calls `onSubmit(patch)` when the form is valid.
 * @param {{
 *   schema: object,
 *   config: object,
 *   secretsSet?: Record<string, boolean>,
 *   busy?: boolean,
 *   describedById?: string,
 *   onSubmit: (patch: object) => void,
 *   onCancel: () => void,
 * }} props
 */
export default function AddonConfigForm({ schema, config, secretsSet = {}, busy = false, onSubmit, onCancel }) {
  const [values, setValues] = useState(() => initialValues(schema, config));
  const [errors, setErrors] = useState({});
  const entries = useMemo(() => Object.entries(schema || {}), [schema]);

  const setField = (field, v) => {
    setValues((s) => ({ ...s, [field]: v }));
    setErrors((e) => (e[field] ? { ...e, [field]: '' } : e));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const next = {};
    for (const [field, spec] of entries) {
      if (spec.immutable) continue;
      const msg = validateField(field, spec, values[field]);
      if (msg) next[field] = msg;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return; // fail closed: don't submit invalid input
    onSubmit(buildConfigPatch(schema, values));
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14, marginTop: 4 }} noValidate>
      {entries.map(([field, spec]) => (
        <Field
          key={field}
          field={field}
          spec={spec}
          value={values[field]}
          error={errors[field]}
          secretIsSet={!!secretsSet[field]}
          onChange={(v) => setField(field, v)}
        />
      ))}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
        <button type="button" className="btn btn--sm" onClick={onCancel} disabled={busy}>cancel</button>
        <button type="submit" className="btn btn--sm" disabled={busy} style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>
          {busy ? 'saving…' : 'save config'}
        </button>
      </div>
    </form>
  );
}

/** A single schema-driven field with a real <label>, description hint, and aria-described error. */
function Field({ field, spec, value, error, secretIsSet, onChange }) {
  const id = `addon-cfg-${field}`;
  const hintId = spec.description ? `${id}-hint` : undefined;
  const errId = `${id}-err`;
  const disabled = !!spec.immutable;
  const describedBy = [hintId, error ? errId : null].filter(Boolean).join(' ') || undefined;
  const invalid = error ? true : undefined;

  const labelText = `${field}${spec.immutable ? ' (read-only)' : ''}`;

  // boolean → a labelled checkbox (label wraps the control).
  if (spec.type === 'boolean') {
    return (
      <div>
        <label htmlFor={id} style={{ fontSize: 12, display: 'inline-flex', gap: 8, alignItems: 'center', color: 'var(--text-mid)' }}>
          <input
            id={id}
            type="checkbox"
            checked={!!value}
            disabled={disabled}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.checked)}
          />
          {labelText}
        </label>
        {spec.description && <div id={hintId} style={hintStyle}>{spec.description}</div>}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} style={labelStyle}>{labelText}</label>
      {renderControl({ id, spec, value, disabled, describedBy, invalid, secretIsSet, onChange })}
      {spec.description && <div id={hintId} style={hintStyle}>{spec.description}</div>}
      {error && <div id={errId} role="alert" style={errStyle}>{error}</div>}
    </div>
  );
}

function renderControl({ id, spec, value, disabled, describedBy, invalid, secretIsSet, onChange }) {
  switch (spec.type) {
    case 'number':
      return (
        <input
          id={id} type="number" className="input" value={value ?? ''}
          min={spec.min} max={spec.max} disabled={disabled}
          aria-describedby={describedBy} aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...controlStyle, maxWidth: 180 }}
        />
      );
    case 'text':
      return (
        <textarea
          id={id} className="input" value={value ?? ''} rows={4} disabled={disabled}
          maxLength={spec.max} aria-describedby={describedBy} aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...controlStyle, resize: 'vertical' }}
        />
      );
    case 'select':
      return (
        <select
          id={id} className="input" value={value ?? ''} disabled={disabled}
          aria-describedby={describedBy} aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...controlStyle, maxWidth: 260 }}
        >
          {/* An explicit empty option so an unset select is a real, selectable state. */}
          {!spec.options?.includes(value) && <option value="">— choose —</option>}
          {(spec.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    case 'string[]':
      return (
        <input
          id={id} type="text" className="input"
          value={Array.isArray(value) ? value.join(', ') : ''} disabled={disabled}
          placeholder="comma, separated, values"
          aria-describedby={describedBy} aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          style={controlStyle}
        />
      );
    case 'secret':
      return (
        <>
          <input
            id={id} type="password" className="input" autoComplete="new-password"
            value={value ?? ''} disabled={disabled}
            placeholder={secretIsSet ? '•••••••• (leave blank to keep current)' : 'not set — enter a value'}
            aria-describedby={describedBy} aria-invalid={invalid}
            onChange={(e) => onChange(e.target.value)}
            style={controlStyle}
          />
          <div style={{ ...hintStyle, marginTop: 6 }}>
            <span
              data-testid={`secret-status-${id}`}
              style={{ color: secretIsSet ? 'var(--green)' : 'var(--amber, #fb0)' }}
            >
              {secretIsSet ? '● set' : '○ not set'}
            </span>
            <span style={{ color: 'var(--text-dim)' }}> — write-only; the current value is never shown.</span>
          </div>
        </>
      );
    case 'string':
    default:
      return (
        <input
          id={id} type="text" className="input" value={value ?? ''} disabled={disabled}
          maxLength={spec.max} aria-describedby={describedBy} aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          style={controlStyle}
        />
      );
  }
}
