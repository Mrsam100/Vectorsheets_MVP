/**
 * ToastProvider - Lightweight toast notification system
 *
 * Provides a React context for showing auto-dismissing notifications.
 * Toasts render via portal to document.body (z-index 400).
 *
 * Features:
 * - Four variants: success, info, warning, error
 * - Auto-dismiss with configurable duration (default 3s)
 * - Max 5 visible toasts (FIFO queue)
 * - Animated enter/exit (CSS keyframes)
 * - Screen reader announcements via own aria-live region
 * - Themed via CSS custom properties
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  memo,
} from 'react';
import { createPortal } from 'react-dom';

// =============================================================================
// Types
// =============================================================================

export type ToastVariant = 'success' | 'info' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
  createdAt: number;
}

export interface ToastContextValue {
  /** Show a toast notification */
  toast: (message: string, variant?: ToastVariant, duration?: number) => void;
  /** Dismiss a specific toast by ID */
  dismiss: (id: string) => void;
  /** Dismiss all toasts */
  dismissAll: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const MAX_VISIBLE = 5;
const DEFAULT_DURATION_MS = 3000;

// =============================================================================
// Context
// =============================================================================

const defaultValue: ToastContextValue = {
  toast: () => {},
  dismiss: () => {},
  dismissAll: () => {},
};

const ToastContext = createContext<ToastContextValue>(defaultValue);
ToastContext.displayName = 'ToastContext';

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

// =============================================================================
// Toast Card
// =============================================================================

const VARIANT_ICONS: Record<ToastVariant, React.ReactNode> = {
  success: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="var(--color-success-bg)" strokeWidth="1.5" />
      <path d="M5 8l2 2 4-4" stroke="var(--color-success-bg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="var(--color-accent)" strokeWidth="1.5" />
      <path d="M8 7v4M8 5h.01" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  warning: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5l6.93 12H1.07L8 1.5z" stroke="var(--color-warning)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6v3M8 11h.01" stroke="var(--color-warning)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="var(--color-danger)" strokeWidth="1.5" />
      <path d="M6 6l4 4M10 6l-4 4" stroke="var(--color-danger)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

interface ToastCardProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
}

const ToastCard: React.FC<ToastCardProps> = memo(({ item, onDismiss }) => {
  const [closing, setClosing] = useState(false);
  const elRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleAnimationEnd = useCallback(() => {
    if (closing) {
      onDismiss(item.id);
    }
  }, [closing, onDismiss, item.id]);

  return (
    <div
      ref={elRef}
      className={`toast toast-${item.variant}`}
      role={item.variant === 'error' ? 'alert' : 'status'}
      data-closing={closing || undefined}
      onAnimationEnd={handleAnimationEnd}
    >
      <span className="toast-icon">{VARIANT_ICONS[item.variant]}</span>
      <span className="toast-message">{item.message}</span>
      <button
        type="button"
        className="toast-dismiss"
        onClick={handleClose}
        aria-label="Dismiss notification"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
});

ToastCard.displayName = 'ToastCard';

// =============================================================================
// Provider
// =============================================================================

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idCounter = useRef(0);
  const [liveMessage, setLiveMessage] = useState('');

  // Auto-dismiss timer for the earliest expiring toast
  useEffect(() => {
    if (toasts.length === 0) return;

    // Find the toast that expires soonest
    let earliest: ToastItem | null = null;
    for (const t of toasts) {
      if (t.duration <= 0) continue; // sticky
      if (!earliest || t.createdAt + t.duration < earliest.createdAt + earliest.duration) {
        earliest = t;
      }
    }

    if (!earliest) return;

    const remaining = earliest.createdAt + earliest.duration - Date.now();
    const delay = Math.max(0, remaining);
    const targetId = earliest.id;

    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== targetId));
    }, delay);

    return () => clearTimeout(timer);
  }, [toasts]);

  const toast = useCallback((message: string, variant: ToastVariant = 'info', duration: number = DEFAULT_DURATION_MS) => {
    setToasts((prev) => {
      // Deduplicate: skip if the same message+variant is already visible
      if (prev.some((t) => t.message === message && t.variant === variant)) {
        return prev;
      }

      const id = `toast-${++idCounter.current}`;
      const item: ToastItem = { id, message, variant, duration, createdAt: Date.now() };
      const next = [...prev, item];
      // Trim oldest if exceeding max
      if (next.length > MAX_VISIBLE) {
        return next.slice(next.length - MAX_VISIBLE);
      }
      return next;
    });

    // Announce to screen readers
    setLiveMessage(message);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const value = React.useMemo<ToastContextValue>(
    () => ({ toast, dismiss, dismissAll }),
    [toast, dismiss, dismissAll],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <>
          {/* Screen reader live region */}
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {liveMessage}
          </div>
          {/* Visible toast container */}
          {toasts.length > 0 && (
            <div className="toast-container">
              {toasts.map((item) => (
                <ToastCard key={item.id} item={item} onDismiss={dismiss} />
              ))}
            </div>
          )}
        </>,
        document.body,
      )}
    </ToastContext.Provider>
  );
};

ToastProvider.displayName = 'ToastProvider';
export default ToastProvider;
