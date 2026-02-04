/**
 * useVirtualKeyboard - Detect virtual keyboard open/close state
 *
 * Two-tier detection strategy:
 * 1. navigator.virtualKeyboard API (Chrome 94+) — most reliable
 * 2. window.visualViewport resize fallback (Safari, Firefox)
 *
 * Returns { isOpen: false, keyboardHeight: 0 } on desktop (no-op).
 */

import { useState, useEffect } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface VirtualKeyboardState {
  /** Whether a virtual keyboard is currently visible */
  isOpen: boolean;
  /** Height of the keyboard in CSS pixels (0 when closed) */
  keyboardHeight: number;
}

// Threshold to distinguish keyboard from URL-bar/chrome changes
const MIN_KEYBOARD_HEIGHT = 100;

// =============================================================================
// Hook
// =============================================================================

export function useVirtualKeyboard(): VirtualKeyboardState {
  const [state, setState] = useState<VirtualKeyboardState>({
    isOpen: false,
    keyboardHeight: 0,
  });

  useEffect(() => {
    // Strategy 1: navigator.virtualKeyboard API (Chrome 94+)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vk = (navigator as any).virtualKeyboard;
    if (vk) {
      // Tell the browser we handle layout ourselves
      vk.overlaysContent = true;

      const handler = () => {
        const rect = vk.boundingRect;
        const height = rect?.height ?? 0;
        setState({
          isOpen: height > 0,
          keyboardHeight: height,
        });
      };

      vk.addEventListener('geometrychange', handler);
      return () => vk.removeEventListener('geometrychange', handler);
    }

    // Strategy 2: visualViewport resize fallback (Safari, Firefox)
    const vv = window.visualViewport;
    if (!vv) return;

    const handler = () => {
      const heightDiff = window.innerHeight - vv.height;
      // Only treat as keyboard if the difference exceeds threshold
      // (avoids false positives from URL bar show/hide)
      const isKeyboard = heightDiff > MIN_KEYBOARD_HEIGHT;
      setState({
        isOpen: isKeyboard,
        keyboardHeight: isKeyboard ? heightDiff : 0,
      });
    };

    vv.addEventListener('resize', handler);
    return () => vv.removeEventListener('resize', handler);
  }, []);

  return state;
}

export default useVirtualKeyboard;
