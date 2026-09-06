'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { signOut } from 'next-auth/react';

function navForRole(role, userID) {
  const id = userID || 'me';
  if (!role || role === 'user') {
    return [{
      title: 'me',
      items: [
        { id: `/dashboard/${id}`,              icon: '◉', label: 'home' },
        { id: `/dashboard/${id}/profile`,      icon: '◊', label: 'profile' },
        { id: `/dashboard/${id}/stake`,        icon: '§', label: 'stake.ledger', hot: 'magenta' },
        { id: `/dashboard/${id}/volunteer`,    icon: '✴', label: 'volunteer.log' },
        { id: `/dashboard/${id}/settings`,     icon: '⚙', label: 'settings' },
        { id: '/dashboard/checkin',            icon: '⟁', label: 'checkin' },
        { id: '/dashboard/plans',              icon: '$', label: 'plan.billing' },
        { id: '/unlock',                       icon: '⋬', label: 'unlock.door', hot: 'green' },
        { id: '/dashboard/onboarding',         icon: '◐', label: 'onboarding' },
      ],
    }, {
      title: 'activities',
      items: [
        { id: '/dashboard/activities/arcade',       icon: '▶', label: 'arcade',     hot: 'magenta' },
        { id: '/dashboard/activities/holodeck',     icon: '◐', label: 'holodeck',   hot: 'green' },
        { id: '/dashboard/activities/leaderboard',  icon: '⚑', label: 'leaderboard' },
        { id: '/dashboard/activities/bounties',     icon: '⚒', label: 'bounty.board' },
      ],
    }, {
      title: 'community',
      items: [
        { id: '/dashboard/community/feed',           icon: '⌬', label: 'feed' },
        { id: '/dashboard/community/directory',      icon: '∷', label: 'directory' },
        { id: '/dashboard/community/announcements',  icon: '✉', label: 'announcements', hot: 'amber' },
        { id: '/dashboard/community/code-of-conduct', icon: '§', label: 'conduct.md' },
        { id: '/dashboard/showcase',                 icon: '✦', label: 'showcase' },
      ],
    }, {
      title: 'resources',
      items: [
        { id: '/dashboard/resources',         icon: '▤', label: 'docs.tree' },
        { id: '/dashboard/resources/badges',  icon: '◈', label: 'my.badges' },
        { id: '/dashboard/resources/bugs',    icon: '⚠', label: 'bug.board' },
      ],
    }, {
      title: 'public',
      items: [
        { id: '/',       icon: '○', label: 'public.home' },
        { id: '/donate', icon: '$', label: 'donate' },
      ],
    }];
  }

  if (role === 'admin') {
    return [{
      title: 'admin',
      items: [
        { id: '/dashboard/admin',                     icon: '◉', label: 'admin.home' },
        { id: '/dashboard/admin/members',             icon: '∷', label: 'members' },
        { id: '/dashboard/admin/onboarding-reviews',  icon: '◊', label: 'onboarding', hot: 'amber' },
        { id: '/dashboard/admin/checkin-log',         icon: '⟁', label: 'checkin.log' },
        { id: '/dashboard/admin/announcements',       icon: '⌬', label: 'announcements' },
        { id: '/dashboard/admin/analytics',           icon: '▤', label: 'analytics' },
        { id: '/dashboard/admin/donations',           icon: '$', label: 'donations' },
        { id: '/dashboard/admin/bounty-ideas',        icon: '⚑', label: 'bounty.ideas', hot: 'magenta' },
        { id: '/dashboard/admin/badges',              icon: '◈', label: 'badges.registry' },
        { id: '/dashboard/admin/contact',             icon: '✉', label: 'contact.inbox', hot: 'amber' },
        { id: '/dashboard/admin/volunteers',          icon: '✦', label: 'volunteers' },
        { id: '/dashboard/admin/repair',              icon: '⚒', label: 'repair.queue', hot: 'amber' },
        { id: '/dashboard/admin/emails',              icon: '✉', label: 'email.templates' },
        { id: '/dashboard/admin/plans',               icon: '◉', label: 'membership.plans', hot: 'cyan' },
        { id: '/dashboard/admin/square-transactions', icon: '⟁', label: 'square.txns', hot: 'cyan' },
        { id: '/dashboard/admin/coupons',             icon: '%', label: 'coupons', hot: 'cyan' },
      ],
    }, {
      title: 'member.views',
      items: [
        { id: `/dashboard/${id}`,                      icon: '◉', label: 'as.member · home' },
        { id: '/dashboard/activities/leaderboard',     icon: '⚑', label: 'leaderboard' },
        { id: '/dashboard/activities/holodeck',        icon: '◐', label: 'holodeck' },
        { id: '/dashboard/community/feed',             icon: '⌬', label: 'community.feed' },
        { id: '/dashboard/community/directory',        icon: '∷', label: 'directory' },
      ],
    }, {
      title: 'public',
      items: [
        { id: '/',                          icon: '○', label: 'public.site' },
        { id: '/services/computer-repair',  icon: '⚒', label: 'computer.repair' },
        { id: '/board',                     icon: '⚖', label: 'governance' },
      ],
    }];
  }

  return [];
}

export default function Sidebar({ session, open, onClose, isMobile }) {
  const pathname = usePathname();
  const role = session?.user?.role || 'user';
  const userID = session?.user?.userID;
  const name = session?.user?.name || session?.user?.email || 'unknown';
  const initials = name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
  const nav = useMemo(() => navForRole(role, userID), [role, userID]);

  const isActive = (id) => {
    if (id === '/') return pathname === '/';
    return pathname === id || pathname.startsWith(id + '/');
  };

  return (
    <aside className={'lab-sidebar' + (open ? ' open' : '')}>
      {/* Logo + branding */}
      <div style={{ padding: '14px', borderBottom: '1px solid var(--bd-1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, position: 'relative', flexShrink: 0 }}>
            <Image
              src="/logos/icon.png"
              alt="THE LAB"
              fill
              style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 6px var(--green))' }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 800, color: 'var(--green)', textShadow: '0 0 4px var(--green)', letterSpacing: '0.04em' }}>THE.LAB</div>
            <div style={{ fontSize: 9.5, color: 'var(--text-dim)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>fab lab fort smith</div>
          </div>
          {isMobile && (
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: '1px solid var(--bd-1)', color: 'var(--text-mid)', width: 28, height: 28, cursor: 'pointer', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              aria-label="Close menu"
            >×</button>
          )}
        </div>

        {/* User identity */}
        {session?.user && (
          <div style={{ marginTop: 10, padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 24, height: 24,
              border: `1px solid ${role === 'admin' ? 'var(--magenta)' : 'var(--green)'}`,
              color: role === 'admin' ? 'var(--magenta)' : 'var(--green)',
              fontWeight: 700, fontSize: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(57,255,20,0.04)',
              fontFamily: 'var(--mono)',
              flexShrink: 0,
            }}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-bright)', fontWeight: 600, fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                @{session.user.username || name}
              </div>
              <div style={{ fontSize: 9.5, color: role === 'admin' ? 'var(--magenta)' : 'var(--green)', fontFamily: 'var(--mono)' }}>
                {role === 'admin' ? 'root · admin' : './member · active'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Nav groups */}
      <nav aria-label="Primary" style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }} className="term-scroll">
        {nav.map((section) => (
          <div key={section.title} style={{ marginBottom: 14 }}>
            <div style={{ padding: '4px 14px', fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-dim)', fontFamily: 'var(--mono)', userSelect: 'none' }}>
              ── {section.title} ─────
            </div>
            {section.items.map((item) => {
              const active = isActive(item.id);
              const hotColor = item.hot === 'amber' ? 'var(--amber)'
                : item.hot === 'magenta' ? 'var(--magenta)'
                : 'var(--green)';
              return (
                <Link
                  key={item.id + section.title}
                  href={item.id}
                  onClick={isMobile ? onClose : undefined}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '6px 14px',
                    background: active ? 'rgba(57,255,20,0.08)' : 'transparent',
                    borderLeft: active ? '2px solid var(--green)' : '2px solid transparent',
                    color: active ? 'var(--green)' : 'var(--text-mid)',
                    fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'left',
                    textShadow: active ? '0 0 6px var(--green)' : 'none',
                    textDecoration: 'none',
                    transition: 'background 0.08s',
                  }}
                >
                  <span aria-hidden="true" style={{ width: 12, color: active ? 'var(--green)' : 'var(--text-dim)', flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.count !== undefined && item.count !== null && (
                    <span style={{
                      fontSize: 10, padding: '0 4px', fontFamily: 'var(--mono)',
                      color: item.hot ? hotColor : 'var(--text-dim)',
                      background: item.hot ? `color-mix(in oklab, ${hotColor} 15%, transparent)` : 'transparent',
                      border: item.hot ? `1px solid color-mix(in oklab, ${hotColor} 40%, transparent)` : 'none',
                    }}>{item.count}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--bd-1)' }}>
        <button
          onClick={() => signOut({ callbackUrl: '/auth/signin' })}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 2px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--red)', textAlign: 'left' }}
        >
          <span style={{ width: 12, flexShrink: 0 }}>⏻</span>
          <span>logout</span>
        </button>
      </div>

      {/* Build info footer */}
      <div style={{ padding: 12, borderTop: '1px solid var(--bd-1)', fontSize: 10.5, color: 'var(--text-mid)', fontFamily: 'var(--mono)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>build</span><span className="green">{process.env.NEXT_PUBLIC_BUILD_HASH || 'dev'}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>env</span><span className="amber">{process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || 'dev'}</span></div>
        <div style={{ marginTop: 6, fontSize: 9.5, color: 'var(--text-dim)' }}>⌘K · search · run</div>
      </div>
    </aside>
  );
}
