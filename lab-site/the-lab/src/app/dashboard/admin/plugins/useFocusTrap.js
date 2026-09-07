'use client';
// Accessible modal focus management (WCAG 2.2 AA — 2.1.2 No Keyboard Trap done right,
// 2.4.3 Focus Order, 3.2.6/2.4.11). When `active`, this hook:
//   • moves focus INTO the container on open (first focusable, else the container),
//   • TRAPS Tab / Shift+Tab within the container's focusable elements (wrap-around),
//   • closes on Esc (via onClose),
//   • RESTORES focus to the element that was focused before opening (the invoking card).
// Client-only (uses DOM focus APIs); safe no-op while inactive.

import { useEffect, useRef } from 'react';

// Elements that can receive keyboard focus. `[tabindex="-1"]` is excluded — it's
// programmatically focusable but not part of the Tab sequence.
const FOCUSABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Trap focus inside `containerRef` while `active`, close on Esc, and restore focus on teardown.
 * @param {{ active: boolean, onClose: () => void }} opts
 * @returns {{ containerRef: import('react').RefObject<HTMLElement> }}
 */
export function useFocusTrap({ active, onClose }) {
  const containerRef = useRef(null);
  // Keep the latest onClose without re-binding listeners each render.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!active) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    // Remember where focus was so we can return the user to the invoking control on close.
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // All Tab-order focusables currently in the dialog. We intentionally do NOT
    // filter on layout/visibility (offsetParent) — that's unreliable headless and
    // the dialog never hides focusable controls; disabled/tabindex=-1 are already
    // excluded by the selector.
    const focusables = () =>
      Array.from(container.querySelectorAll(FOCUSABLE)).filter((el) => el instanceof HTMLElement);

    // Move focus in on open — first focusable, else the dialog container itself.
    const initial = focusables();
    if (initial.length) initial[0].focus();
    else container.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        // Nothing focusable but the container — keep focus on it.
        e.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      // Restore focus to the invoking element (if it's still in the document).
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return { containerRef };
}

export default useFocusTrap;
