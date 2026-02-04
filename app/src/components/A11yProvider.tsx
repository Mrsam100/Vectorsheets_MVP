/**
 * A11yProvider - Accessibility context and live region manager
 *
 * Provides a stable `announce()` function for screen reader announcements
 * via hidden aria-live regions. Mounted once at the SpreadsheetShell level.
 *
 * Two live regions:
 * - polite:    for non-urgent announcements (cell navigation, selection changes)
 * - assertive: for urgent announcements (errors, validation failures)
 *
 * Uses the "clear then set" pattern so the same message can be announced
 * consecutively (screen readers ignore identical content changes).
 */

import React, { createContext, useContext, useRef, useMemo, useCallback, useEffect } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface A11yContextValue {
  /**
   * Announce a message to screen readers via the hidden live region.
   * @param message  Text to announce
   * @param priority 'polite' (default) or 'assertive'
   */
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
}

// =============================================================================
// Context
// =============================================================================

const defaultValue: A11yContextValue = {
  announce: () => {},
};

export const A11yContext = createContext<A11yContextValue>(defaultValue);
A11yContext.displayName = 'A11yContext';

export function useA11y(): A11yContextValue {
  return useContext(A11yContext);
}

// =============================================================================
// Provider Component
// =============================================================================

export const A11yProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const politeRef = useRef<HTMLDivElement>(null);
  const assertiveRef = useRef<HTMLDivElement>(null);
  const politeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const assertiveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const el = priority === 'assertive' ? assertiveRef.current : politeRef.current;
    const timer = priority === 'assertive' ? assertiveTimerRef : politeTimerRef;
    if (!el) return;
    clearTimeout(timer.current);
    if (el.textContent === message) {
      // Same message repeated — clear first so screen reader re-announces
      el.textContent = '';
      timer.current = setTimeout(() => { el.textContent = message; }, 50);
    } else {
      // Different message — set immediately
      el.textContent = message;
    }
  }, []);

  // Clean up pending timers on unmount
  useEffect(() => () => {
    clearTimeout(politeTimerRef.current);
    clearTimeout(assertiveTimerRef.current);
  }, []);

  const value = useMemo<A11yContextValue>(() => ({ announce }), [announce]);

  return (
    <A11yContext.Provider value={value}>
      {children}

      {/* Hidden live regions for screen reader announcements */}
      <div
        ref={politeRef}
        className="sr-only"
        role="log"
        aria-live="polite"
        aria-atomic="true"
      />
      <div
        ref={assertiveRef}
        className="sr-only"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      />
    </A11yContext.Provider>
  );
};

A11yProvider.displayName = 'A11yProvider';

export default A11yProvider;
