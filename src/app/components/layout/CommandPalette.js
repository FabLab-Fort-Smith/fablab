'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const ALL_ROUTES = [
  // Public
  { cat: 'public',   label: 'home',              path: '/' },
  { cat: 'public',   label: 'about',             path: '/about' },
  { cat: 'public',   label: 'board.members',     path: '/board-members' },
  { cat: 'public',   label: 'governance',        path: '/board' },
  { cat: 'public',   label: 'donate',            path: '/donate' },
  { cat: 'public',   label: 'computer.repair',   path: '/services/computer-repair' },
  { cat: 'public',   label: 'conduct.md',        path: '/code-of-conduct' },
  // Auth
  { cat: 'auth',     label: 'signin',            path: '/auth/signin' },
  { cat: 'auth',     label: 'register',          path: '/auth/register' },
  // Member
  { cat: 'me',       label: 'home',              path: '/dashboard' },
  { cat: 'me',       label: 'checkin',           path: '/dashboard/checkin' },
  { cat: 'me',       label: 'onboarding',        path: '/dashboard/onboarding' },
  { cat: 'me',       label: 'plan.billing',      path: '/dashboard/plans' },
  { cat: 'me',       label: 'showcase',          path: '/dashboard/showcase' },
  { cat: 'me',       label: 'unlock.door',       path: '/unlock' },
  // Activities
  { cat: 'activities', label: 'arcade',           path: '/dashboard/activities/arcade' },
  { cat: 'activities', label: 'holodeck',         path: '/dashboard/activities/holodeck' },
  { cat: 'activities', label: 'leaderboard',      path: '/dashboard/activities/leaderboard' },
  { cat: 'activities', label: 'bounty.board',     path: '/dashboard/activities/bounties' },
  // Community
  { cat: 'community', label: 'feed',              path: '/dashboard/community/feed' },
  { cat: 'community', label: 'directory',         path: '/dashboard/community/directory' },
  { cat: 'community', label: 'announcements',     path: '/dashboard/community/announcements' },
  { cat: 'community', label: 'conduct.md',        path: '/dashboard/community/code-of-conduct' },
  // Resources
  { cat: 'resources', label: 'docs.tree',         path: '/dashboard/resources' },
  { cat: 'resources', label: 'my.badges',         path: '/dashboard/resources/badges' },
  { cat: 'resources', label: 'bug.board',         path: '/dashboard/resources/bugs' },
  // Admin
  { cat: 'admin',    label: 'admin.home',         path: '/dashboard/admin' },
  { cat: 'admin',    label: 'members',            path: '/dashboard/admin/members' },
  { cat: 'admin',    label: 'onboarding.reviews', path: '/dashboard/admin/onboarding-reviews' },
  { cat: 'admin',    label: 'checkin.log',        path: '/dashboard/admin/checkin-log' },
  { cat: 'admin',    label: 'analytics',          path: '/dashboard/admin/analytics' },
  { cat: 'admin',    label: 'announcements',      path: '/dashboard/admin/announcements' },
  { cat: 'admin',    label: 'donations',          path: '/dashboard/admin/donations' },
  { cat: 'admin',    label: 'bounty.ideas',       path: '/dashboard/admin/bounty-ideas' },
  { cat: 'admin',    label: 'badges.registry',    path: '/dashboard/admin/badges' },
  { cat: 'admin',    label: 'contact.inbox',      path: '/dashboard/admin/contact' },
  { cat: 'admin',    label: 'volunteers',         path: '/dashboard/admin/volunteers' },
  { cat: 'admin',    label: 'repair.queue',       path: '/dashboard/admin/repair' },
  { cat: 'admin',    label: 'email.templates',    path: '/dashboard/admin/emails' },
];

export default function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (open) { setQ(''); setCursor(0); }
  }, [open]);

  const filtered = useMemo(() => {
    if (!q.trim()) return ALL_ROUTES.slice(0, 18);
    const lower = q.toLowerCase();
    return ALL_ROUTES.filter(it =>
      it.label.toLowerCase().includes(lower) || it.path.toLowerCase().includes(lower) || it.cat.toLowerCase().includes(lower)
    ).slice(0, 18);
  }, [q]);

  const run = useCallback((item) => {
    router.push(item.path);
    onClose();
  }, [router, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
      else if (e.key === 'Enter' && filtered[cursor]) run(filtered[cursor]);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, cursor, run, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '12vh 16px 16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 640,
          background: 'var(--bg-card)', border: '1px solid var(--green)',
          boxShadow: '0 0 40px rgba(57,255,20,0.25)',
        }}
      >
        {/* Search input */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bd-1)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 14, flexShrink: 0 }}>$</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setCursor(0); }}
            placeholder="search routes…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-bright)', fontFamily: 'var(--mono)', fontSize: 14,
            }}
          />
          <span className="caret-block" style={{ width: '0.4em' }} />
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: '1px solid var(--bd-1)', color: 'var(--text-dim)', padding: '2px 6px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10.5 }}
          >esc</button>
        </div>

        {/* Results */}
        <div style={{ maxHeight: '60vh', overflow: 'auto' }} className="term-scroll">
          {filtered.map((item, i) => (
            <div
              key={i}
              onClick={() => run(item)}
              style={{
                padding: '9px 18px',
                display: 'grid', gridTemplateColumns: '70px 1fr auto',
                gap: 12, alignItems: 'center', cursor: 'pointer',
                borderBottom: '1px dotted var(--bd)',
                background: i === cursor ? 'rgba(57,255,20,0.08)' : 'transparent',
                transition: 'background 0.08s',
              }}
              onMouseEnter={() => setCursor(i)}
            >
              <span style={{ fontSize: 10, color: 'var(--magenta)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>{item.cat}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: i === cursor ? 'var(--green)' : 'var(--text-bright)', textShadow: i === cursor ? '0 0 4px var(--green)' : 'none' }}>{item.label}</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{item.path}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>
              // no matches · try a route name or path
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div style={{ padding: '8px 18px', borderTop: '1px solid var(--bd)', display: 'flex', gap: 16, fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
