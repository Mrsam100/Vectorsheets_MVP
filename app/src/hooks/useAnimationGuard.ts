/**
 * useAnimationGuard - Animation guardrail hook
 *
 * Disables CSS micro-animations when the user is in a hot-path interaction:
 * - Auto-scroll during drag
 * - Fill drag (expanding selection via fill handle)
 * - Cell editing (typing in inline editor or formula bar)
 *
 * Sets a `data-vs-animating` attribute on `<html>`:
 *   "true"  → animations run (default)
 *   "false" → animations suppressed via CSS `[data-vs-animating="false"]`
 *
 * Also respects `prefers-reduced-motion: reduce` at the OS level.
 * The CSS already has a blanket `@media (prefers-reduced-motion: reduce)` rule
 * that kills all transitions/animations, so this hook only needs to handle
 * the runtime guardrails.
 */

import { useLayoutEffect, useRef } from 'react';

export interface AnimationGuardFlags {
  /** Fill drag is active (fill handle being dragged) */
  isFillDragging?: boolean;
  /** Auto-scroll is active (pointer near viewport edge) */
  isAutoScrolling?: boolean;
  /** Cell editor or formula bar is focused */
  isEditing?: boolean;
}

/**
 * Suppresses micro-animations when any hot-path flag is true.
 *
 * Usage:
 *   useAnimationGuard({ isFillDragging, isAutoScrolling, isEditing });
 *
 * The attribute is set on documentElement so CSS can target it globally:
 *   [data-vs-animating="false"] .selection-rect { transition: none; }
 */
export function useAnimationGuard(flags: AnimationGuardFlags): void {
  const { isFillDragging = false, isAutoScrolling = false, isEditing = false } = flags;
  const shouldSuppress = isFillDragging || isAutoScrolling || isEditing;

  // Use a ref to avoid setting the attribute on every render if unchanged
  const prevRef = useRef<boolean | null>(null);

  useLayoutEffect(() => {
    const value = shouldSuppress ? 'false' : 'true';
    if (prevRef.current === shouldSuppress) return;
    prevRef.current = shouldSuppress;
    document.documentElement.dataset.vsAnimating = value;

    // Clean up on unmount — restore animations
    return () => {
      document.documentElement.dataset.vsAnimating = 'true';
    };
  }, [shouldSuppress]);
}

export default useAnimationGuard;
