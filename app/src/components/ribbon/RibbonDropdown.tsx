/**
 * RibbonDropdown - Native select dropdown styled for the Ribbon.
 *
 * Uses a native <select> for accessibility and simplicity.
 * Styled with .ribbon-dropdown class.
 */

import React, { memo, useCallback, useMemo } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface RibbonDropdownOption<T extends string | number> {
  value: T;
  label: string;
}

export interface RibbonDropdownProps<T extends string | number> {
  /** Current value */
  value: T | undefined;
  /** Options list */
  options: ReadonlyArray<RibbonDropdownOption<T>>;
  /** Change handler */
  onChange: (value: T) => void;
  /** Whether dropdown is disabled */
  disabled?: boolean;
  /** Display width in px */
  width?: number;
  /** Tooltip */
  tooltip: string;
  /** Accessible label */
  ariaLabel: string;
  /** Whether this dropdown preserves edit session (default: true) */
  preserveEdit?: boolean;
}

// =============================================================================
// Component
// =============================================================================

function RibbonDropdownInner<T extends string | number>(
  {
    value,
    options,
    onChange,
    disabled = false,
    width,
    tooltip,
    ariaLabel,
    preserveEdit = true,
  }: RibbonDropdownProps<T>,
) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const raw = e.target.value;
      // Determine if T is number based on the first option's value type
      const first = options[0];
      const parsed = first && typeof first.value === 'number' ? Number(raw) : raw;
      onChange(parsed as T);
    },
    [onChange, options],
  );

  // Stable style object — avoids new allocation per render
  const widthStyle = useMemo(
    () => (width ? { width } as React.CSSProperties : undefined),
    [width],
  );

  return (
    <select
      className="ribbon-dropdown"
      value={value ?? ''}
      onChange={handleChange}
      disabled={disabled}
      title={tooltip}
      aria-label={ariaLabel}
      style={widthStyle}
      data-preserve-edit={preserveEdit || undefined}
    >
      {options.map((opt) => (
        <option key={String(opt.value)} value={String(opt.value)}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// Memo wrapper (generic components need this pattern)
export const RibbonDropdown = memo(RibbonDropdownInner) as typeof RibbonDropdownInner;
