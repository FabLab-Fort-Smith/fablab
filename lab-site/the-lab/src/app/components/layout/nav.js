// Sidebar navigation model. Pure + client-import-free so it is unit-testable in node
// (Sidebar.js is a client component; keeping the nav data here isolates the logic).
//
// navForRole returns the STATIC sections for a role. The Sidebar additionally injects a
// dynamic "addons" section at runtime from enabled plugins' adminNav socket
// (GET /api/v1/admin/plugins) — see Sidebar.js. The static "addon.manager" entry below
// always links admins to the plugin/addon manager itself (/dashboard/admin/plugins).

export function navForRole(role, userID) {
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
        { id: '/dashboard/admin/plugins',             icon: '⧉', label: 'addon.manager', hot: 'cyan' },
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
