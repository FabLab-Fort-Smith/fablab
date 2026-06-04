'use client';

const STATUS_COLORS = {
  online:  'var(--green)',
  active:  'var(--green)',
  pending: 'var(--amber)',
  review:  'var(--amber)',
  new:     'var(--magenta)',
  alert:   'var(--magenta)',
  error:   'var(--red)',
  info:    'var(--cyan)',
  offline: 'var(--text-dim)',
  paused:  'var(--amber)',
  cancelled: 'var(--red)',
  lapsed:  'var(--text-dim)',
};

export default function StatusPill({ status, label, pulse = false, style }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.online;
  return (
    <span className="pill" style={{ color, ...style }}>
      <span className={'dot' + (pulse ? ' pulse' : '')} />
      {label || status}
    </span>
  );
}
