'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import NotificationBell from '../../dashboard/components/NotificationBell';

export default function Topbar({ session, onToggleSidebar, onOpenPalette }) {
  const pathname = usePathname();
  const [time, setTime] = useState('');
  const role = session?.user?.role;

  useEffect(() => {
    const update = () => setTime(new Date().toTimeString().slice(0, 8));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const segs = (pathname || '/').split('/').filter(Boolean);

  return (
    <header className="lab-topbar">
      {/* Mobile hamburger */}
      <button
        className="lab-mobile-toggle"
        onClick={onToggleSidebar}
        aria-label="Toggle menu"
      ><span aria-hidden="true">≡</span></button>

      {/* Breadcrumb path */}
      <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1, overflow: 'hidden' }}>
        <span aria-hidden="true" style={{ color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--mono)', flexShrink: 0 }}>~</span>
        {segs.length === 0 && <span style={{ color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--mono)' }}>/</span>}
        {segs.map((s, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span aria-hidden="true" style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>/</span>
            <span
              aria-current={i === segs.length - 1 ? 'page' : undefined}
              style={{
                color: i === segs.length - 1 ? 'var(--green)' : 'var(--text-mid)',
                fontSize: 12.5,
                fontFamily: 'var(--mono)',
                whiteSpace: 'nowrap',
                textShadow: i === segs.length - 1 ? '0 0 4px var(--green)' : 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: i === segs.length - 1 ? 180 : 80,
              }}>{s}</span>
          </span>
        ))}
      </nav>

      {/* ⌘K search button */}
      <button
        onClick={onOpenPalette}
        className="hide-mobile"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg-1)', border: '1px solid var(--bd-1)',
          color: 'var(--text-mid)', fontFamily: 'var(--mono)', fontSize: 11.5,
          padding: '5px 10px', cursor: 'pointer', minWidth: 240, flexShrink: 0,
        }}
      >
        <span style={{ color: 'var(--green)' }}>$</span>
        <span style={{ flex: 1, textAlign: 'left' }}>search · run · navigate…</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', border: '1px solid var(--bd-1)', padding: '0 4px' }}>⌘K</span>
      </button>

      {/* Clock */}
      <span style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--mono)', flexShrink: 0 }} className="hide-mobile">
        {time}
      </span>

      {/* Auth state */}
      {!session?.user ? (
        <a href="/auth/signin" className="btn btn--sm btn--filled" style={{ textDecoration: 'none', flexShrink: 0 }}>$ signin</a>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <NotificationBell />
          <span className="pill" style={{ color: role === 'admin' ? 'var(--magenta)' : 'var(--green)', fontSize: 9.5 }}>
            <span className="dot pulse" />{role || 'member'}
          </span>
        </div>
      )}
    </header>
  );
}
