'use client';
// A single addon "card" in the gallery: icon, name, description, category, and
// enabled/disabled state, with an enable/disable toggle. The card body is a
// <button> that opens the config modal (keyboard: Enter/Space); the enable
// toggle is a SIBLING control (not nested — that would be invalid
// nested-interactive markup / an axe violation) so the two actions never collide.

const containerStyle = {
  padding: 0, display: 'flex', flexDirection: 'column',
  height: '100%', background: 'var(--bg-card)', border: '1px solid var(--bd)',
};
const openBtnStyle = {
  display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left',
  padding: 16, background: 'transparent', border: 'none', color: 'inherit',
  cursor: 'pointer', width: '100%', flex: 1, font: 'inherit',
};

/**
 * @param {{
 *   addon: { id, name, version, description, icon, category, enabled, configSchema },
 *   busy?: boolean,
 *   onOpen: (addon) => void,
 *   onToggle: (id: string, enabled: boolean) => void,
 * }} props
 */
export default function AddonCard({ addon, busy = false, onOpen, onToggle }) {
  const configCount = Object.keys(addon.configSchema || {}).length;
  const titleId = `addon-card-title-${addon.id}`;

  return (
    <article className="card" aria-labelledby={titleId} style={containerStyle}>
      {/* Primary action: open settings. A real <button> => native Enter/Space + focus. */}
      <button type="button" onClick={() => onOpen(addon)} aria-haspopup="dialog" style={openBtnStyle}>
        <span style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span
            aria-hidden="true"
            style={{
              fontSize: 24, lineHeight: 1, width: 34, height: 34, flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--bd)', color: 'var(--text-bright)',
            }}
          >
            {addon.icon || '⧉'}
          </span>
          <span style={{ minWidth: 0 }}>
            <span id={titleId} style={{ display: 'block', fontSize: 14, color: 'var(--text-bright)', fontFamily: 'var(--mono)' }}>
              {addon.name}{' '}
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>v{addon.version}</span>
            </span>
            {addon.category && (
              <span style={{ display: 'block', fontSize: 9.5, color: 'var(--magenta)', letterSpacing: '0.12em', marginTop: 3, textTransform: 'uppercase' }}>
                {addon.category}
              </span>
            )}
          </span>
        </span>

        {addon.description && (
          <span style={{ fontSize: 11.5, color: 'var(--text-dim)', margin: 0, lineHeight: 1.5 }}>
            {addon.description}
          </span>
        )}

        <span aria-hidden="true" style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 'auto', paddingTop: 6 }}>
          {configCount > 0 ? 'configure →' : 'details →'}
        </span>
      </button>

      {/* Footer sits OUTSIDE the open-button so the toggle is not nested-interactive. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--bd)' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
          <input
            type="checkbox"
            checked={!!addon.enabled}
            disabled={busy}
            onChange={(e) => onToggle(addon.id, e.target.checked)}
            aria-label={`${addon.name} enabled`}
          />
          {/* State conveyed by text + color, never color alone (WCAG 1.4.1). */}
          <span style={{ color: addon.enabled ? 'var(--green)' : 'var(--text-dim)' }}>
            {addon.enabled ? 'enabled' : 'disabled'}
          </span>
        </label>
        {configCount > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            {configCount} setting{configCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </article>
  );
}
