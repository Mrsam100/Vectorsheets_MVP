/**
 * useFocusTrap - Generic focus trap hook for modal dialogs
 *
 * Traps Tab/Shift+Tab focus cycling within a container element.
 * Re-queries focusable elements on every Tab press so dynamically
 * shown/hidden content (e.g. Replace row in FindReplaceDialog) is
 * always included.
 *
 * Activation:  captures current focus, moves focus into container
 * Deactivation: restores focus to the previously focused element
 * Escape:       calls optional onEscape callback (does NOT deactivate)
 */

import { useEffect, useRef } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface UseFocusTrapOptions {
  /** Ref to the container element that traps focus */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Whether the trap is currently active */
  enabled: boolean;
  /** Optional callback when user presses Escape (trap does NOT close itself) */
  onEscape?: () => void;
  /** Element to return focus to when trap deactivates */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

// =============================================================================
// Constants
// =============================================================================

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'textarea:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// =============================================================================
// Hook
// =============================================================================

export function useFocusTrap({
  containerRef,
  enabled,
  onEscape,
  returnFocusRef,
}: UseFocusTrapOptions): void {
  // Stable refs for callbacks to avoid effect churn
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  // Store the element that had focus before the trap activated
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Cleanup ref for deferred setup (when container ref isn't attached immediately)
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // containerRef / returnFocusRef are stable useRef objects — their identity
    // never changes, so they are intentionally omitted from deps. We read
    // .current eagerly here. If the ref isn't attached yet, retry next frame.
    let container = containerRef.current;

    const setup = (el: HTMLElement) => {
      // Capture currently focused element for restoration
      previousFocusRef.current = document.activeElement as HTMLElement | null;

      // Move focus into the container (first focusable element)
      const focusRafId = requestAnimationFrame(() => {
        const focusable = el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length > 0) {
          focusable[0].focus();
        }
      });

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onEscapeRef.current?.();
          return;
        }

        if (e.key !== 'Tab') return;

        // Re-query on every Tab so dynamic content is always included
        const focusable = Array.from(
          el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          // Shift+Tab from first → wrap to last
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab from last → wrap to first
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown, true);

      return () => {
        cancelAnimationFrame(focusRafId);
        document.removeEventListener('keydown', handleKeyDown, true);

        // Restore focus on deactivation
        const returnTo = returnFocusRef?.current ?? previousFocusRef.current;
        if (returnTo && typeof returnTo.focus === 'function') {
          returnTo.focus();
        }
      };
    };

    // If container ref is already attached, set up immediately
    if (container) {
      return setup(container);
    }

    // Ref not attached yet (render in progress) — retry after next frame
    const retryId = requestAnimationFrame(() => {
      container = containerRef.current;
      if (container) {
        cleanupRef.current = setup(container);
      }
    });

    return () => {
      cancelAnimationFrame(retryId);
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}

export default useFocusTrap;
