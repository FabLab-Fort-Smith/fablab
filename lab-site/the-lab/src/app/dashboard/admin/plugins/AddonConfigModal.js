'use client';
// Accessible config modal for a single addon. A true dialog (role="dialog",
// aria-modal, labelled by its title + described by its subtitle) with a focus
// trap, focus restore to the invoking card, and Esc-to-close (useFocusTrap).
// Motion is dropped under prefers-reduced-motion. The form is schema-driven
// (AddonConfigForm); this component owns the overlay, header, and save/error UX.

import { useEffect, useState } from 'react';
import useFocusTrap from './useFocusTrap';
import AddonConfigForm from './AddonConfigForm';

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 100, padding: 16,
};
const dialogStyle = {
  background: 'var(--bg)', border: '1px solid var(--bd)', padding: 20,
  width: 520, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto',
  fontFamily: 'var(--mono)',
};

/**
 * @param {{
 *   addon: { id, name, version, description, icon, category, configSchema, config, secretsSet, enabled },
 *   busy?: boolean,
 *   error?: string,
 *   onSave: (pluginId: string, patch: object) => void,
 *   onClose: () => void,
 * }} props
 */
export default function AddonConfigModal({ addon, busy = false, error = '', onSave, onClose }) {
  const { containerRef } = useFocusTrap({ active: true, onClose });
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    // Honor prefers-reduced-motion (WCAG 2.3.3) for the open animation.
    if (typeof window === 'undefined' || !window.matchMedia) return;
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  const schema = addon.configSchema || {};
  const hasConfig = Object.keys(schema).length > 0;
  const titleId = 'addon-modal-title';
  const descId = 'addon-modal-desc';

  return (
    // Overlay: clicking it (outside the dialog) closes, unless a save is in flight.
    <div style={overlayStyle} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={addon.description ? descId : undefined}
        tabIndex={-1}
        style={{ ...dialogStyle, animation: reduceMotion ? 'none' : undefined }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {addon.icon && (
              <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1, color: 'var(--text-bright)' }}>{addon.icon}</span>
            )}
            <div>
              <h2 id={titleId} style={{ fontSize: 15, margin: 0, color: 'var(--text-bright)' }}>
                {addon.name}{' '}
                <span style={{ color: 'var(--text-dim)', fontSize: 11, fontWeight: 400 }}>v{addon.version}</span>
              </h2>
              {addon.category && (
                <div style={{ fontSize: 10, color: 'var(--magenta)', letterSpacing: '0.1em', marginTop: 3 }}>
                  {addon.category}
                </div>
              )}
              {addon.description && (
                <p id={descId} style={{ fontSize: 11.5, color: 'var(--text-dim)', margin: '8px 0 0' }}>
                  {addon.description}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            className="btn btn--sm"
            onClick={onClose}
            disabled={busy}
            aria-label={`Close ${addon.name} settings`}
            style={{ flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div role="alert" style={{ color: 'var(--red, #f66)', fontSize: 12, marginTop: 14 }}>{error}</div>
        )}

        <div style={{ marginTop: 16, borderTop: '1px solid var(--bd)', paddingTop: 14 }}>
          {hasConfig ? (
            <AddonConfigForm
              schema={schema}
              config={addon.config || {}}
              secretsSet={addon.secretsSet || {}}
              busy={busy}
              onSubmit={(patch) => onSave(addon.id, patch)}
              onCancel={onClose}
            />
          ) : (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>
                This addon has no configurable settings.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn--sm" onClick={onClose} disabled={busy}>close</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
