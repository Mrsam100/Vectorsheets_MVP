/**
 * ErrorBanner - Persistent banner for formula errors and validation messages
 *
 * Renders between TopBar and the grid area. Shows contextual information
 * about the active cell's error state or validation input message.
 *
 * Not a toast — persistent while the relevant cell is selected.
 */

import React, { memo } from 'react';

// =============================================================================
// Types
// =============================================================================

export type ErrorBannerVariant =
  | 'formula-error'
  | 'validation-input'
  | 'validation-stop'
  | 'validation-warning'
  | 'validation-info';

export interface ErrorBannerProps {
  /** The message to display */
  message: string | null;
  /** Optional title (for validation input messages) */
  title?: string;
  /** Visual variant controlling icon and color */
  variant: ErrorBannerVariant;
  /** Whether the banner is visible */
  visible: boolean;
}

// =============================================================================
// Formula Error Explanations (static, no engine coupling)
// =============================================================================

export const FORMULA_ERROR_EXPLANATIONS: Record<string, string> = {
  '#NULL!': 'Incorrect range reference. Check for missing colon or intersection.',
  '#DIV/0!': 'Cannot divide by zero.',
  '#VALUE!': 'Wrong type of argument or operand.',
  '#REF!': 'Invalid cell reference. A referenced cell may have been deleted.',
  '#NAME?': 'Unrecognized formula name. Check for typos.',
  '#NUM!': 'Invalid numeric value in formula.',
  '#N/A': 'Value not available. A lookup may not have found a match.',
  '#SPILL!': 'Spill range is blocked by existing data.',
  '#CALC!': 'Calculation error. The formula may be too complex.',
  '#GETTING_DATA': 'Waiting for external data source.',
};

// =============================================================================
// Icons
// =============================================================================

const ErrorIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M7 0.5L13.5 12.5H0.5L7 0.5Z"
      stroke="var(--color-danger)"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    <path d="M7 5v3M7 9.5h.01" stroke="var(--color-danger)" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const WarningIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M7 0.5L13.5 12.5H0.5L7 0.5Z"
      stroke="var(--color-warning)"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    <path d="M7 5v3M7 9.5h.01" stroke="var(--color-warning)" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const InfoIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="6" stroke="var(--color-accent)" strokeWidth="1.2" />
    <path d="M7 6v3.5M7 4.5h.01" stroke="var(--color-accent)" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

// =============================================================================
// Component
// =============================================================================

const VARIANT_CONFIG: Record<
  ErrorBannerVariant,
  { icon: React.FC; className: string }
> = {
  'formula-error': { icon: ErrorIcon, className: 'error-banner-formula' },
  'validation-input': { icon: InfoIcon, className: 'error-banner-validation-info' },
  'validation-stop': { icon: ErrorIcon, className: 'error-banner-formula' },
  'validation-warning': { icon: WarningIcon, className: 'error-banner-validation-warning' },
  'validation-info': { icon: InfoIcon, className: 'error-banner-validation-info' },
};

export const ErrorBanner: React.FC<ErrorBannerProps> = memo(
  ({ message, title, variant, visible }) => {
    if (!visible || !message) return null;

    const config = VARIANT_CONFIG[variant];
    const Icon = config.icon;

    const isError = variant === 'formula-error' || variant === 'validation-stop';

    return (
      <div
        className={`error-banner ${config.className}`}
        role={isError ? 'alert' : 'status'}
        aria-live={isError ? 'assertive' : 'polite'}
        aria-label={isError ? 'Cell error' : 'Validation message'}
      >
        <span className="error-banner-icon">
          <Icon />
        </span>
        {title && <span className="error-banner-title">{title}:</span>}
        <span className="error-banner-message">{message}</span>
      </div>
    );
  },
);

ErrorBanner.displayName = 'ErrorBanner';
export default ErrorBanner;
