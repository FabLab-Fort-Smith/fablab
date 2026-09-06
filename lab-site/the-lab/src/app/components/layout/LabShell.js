'use client';
import { useState, useEffect, useCallback } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import CommandPalette from './CommandPalette';
import AuthMethodsNudge from './AuthMethodsNudge';

export default function LabShell({ session, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const handler = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key === 'Escape') {
        if (paletteOpen) setPaletteOpen(false);
        else if (sidebarOpen) setSidebarOpen(false); // keyboard close for the mobile drawer
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [paletteOpen, sidebarOpen]);

  return (
    <div className="lab-shell">
      {/* Skip-link: first focusable element, jumps keyboard/AT users past the nav to the content. */}
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Sidebar
        session={session}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isMobile={isMobile}
      />
      {isMobile && (
        // Decorative click-to-close backdrop; keyboard users close via the drawer's Close button or Escape.
        <div
          className={'lab-overlay' + (sidebarOpen ? ' open' : '')}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <div className="lab-main">
        <Topbar
          session={session}
          onToggleSidebar={() => setSidebarOpen(true)}
          onOpenPalette={openPalette}
        />
        <AuthMethodsNudge />
        <main id="main-content" tabIndex={-1} className="lab-content page-enter">
          {children}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  );
}
