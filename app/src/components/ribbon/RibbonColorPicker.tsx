/**
 * RibbonColorPicker - Color picker button with swatch dropdown.
 *
 * Shows a button with an icon and a colored underline bar.
 * Clicking opens a dropdown panel of preset color swatches.
 * Closes on color selection, click-outside, or Escape.
 * Returns focus to trigger button after close.
 */

import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDownIcon } from './icons';

// =============================================================================
// Preset Palette (standard spreadsheet colors)
// =============================================================================

const COLOR_PALETTE: ReadonlyArray<string> = [
  // Row 1: grayscale
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
  // Row 2: saturated
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  // Row 3: light tints
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
  // Row 4: medium tints
  '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
  // Row 5: dark shades
  '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0',
];

// Hoisted style objects — avoids per-render allocation
const TRIGGER_STYLE: React.CSSProperties = { flexDirection: 'column', gap: 0, padding: '3px 4px' };
const GRID_STYLE: React.CSSProperties = { gridTemplateColumns: 'repeat(10, 18px)' };

// =============================================================================
// Types
// =============================================================================

export interface RibbonColorPickerProps {
  /** Current color value (hex) */
  value: string | undefined;
  /** Color change handler */
  onChange: (color: string) => void;
  /** Icon to display on the button */
  icon: React.ReactNode;
  /** Tooltip */
  tooltip: string;
  /** Disabled state */
  disabled?: boolean;
}

// =============================================================================
// Component
// =============================================================================

const SWATCH_COLS = 10;
const SWATCH_COUNT = COLOR_PALETTE.length;

export const RibbonColorPicker: React.FC<RibbonColorPickerProps> = memo(
  ({ value, onChange, icon, tooltip, disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const noColorRef = useRef<HTMLButtonElement>(null);
    const swatchRefs = useRef<(HTMLButtonElement | null)[]>([]);

    // Close on click outside or Escape key
    useEffect(() => {
      if (!isOpen) return;

      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setIsOpen(false);
          triggerRef.current?.focus();
        }
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsOpen(false);
          triggerRef.current?.focus();
          e.stopPropagation();
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown, true);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown, true);
      };
    }, [isOpen]);

    const handleColorSelect = useCallback(
      (color: string) => {
        onChange(color);
        setIsOpen(false);
        // Return focus to trigger after selection
        requestAnimationFrame(() => triggerRef.current?.focus());
      },
      [onChange],
    );

    // Event delegation: one handler for all swatches instead of 50+ closures
    const handleSwatchClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const target = (e.target as HTMLElement).closest('[data-color]') as HTMLElement | null;
        const color = target?.dataset.color;
        if (color === undefined) return;
        handleColorSelect(color);
      },
      [handleColorSelect],
    );

    const toggleOpen = useCallback(() => {
      if (!disabled) setIsOpen((prev) => !prev);
    }, [disabled]);

    // Arrow key navigation for the swatch grid (10 columns)
    // ArrowUp from first row jumps to the "No Color" button above the grid
    const handleSwatchKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const color = target.dataset.color;
      if (color === undefined) return;

      const idx = COLOR_PALETTE.indexOf(color);
      if (idx === -1) return;

      let nextIdx = idx;
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          nextIdx = idx + 1 < SWATCH_COUNT ? idx + 1 : idx;
          break;
        case 'ArrowLeft':
          e.preventDefault();
          nextIdx = idx - 1 >= 0 ? idx - 1 : idx;
          break;
        case 'ArrowDown':
          e.preventDefault();
          nextIdx = idx + SWATCH_COLS < SWATCH_COUNT ? idx + SWATCH_COLS : idx;
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (idx - SWATCH_COLS >= 0) {
            nextIdx = idx - SWATCH_COLS;
          } else {
            // First row: jump to "No Color" button
            noColorRef.current?.focus();
            return;
          }
          break;
        case 'Home':
          e.preventDefault();
          nextIdx = 0;
          break;
        case 'End':
          e.preventDefault();
          nextIdx = SWATCH_COUNT - 1;
          break;
        default:
          return;
      }

      swatchRefs.current[nextIdx]?.focus();
    }, []);

    // Focus selected swatch (or first) when dropdown opens
    useEffect(() => {
      if (!isOpen) return;
      const rafId = requestAnimationFrame(() => {
        const selectedIdx = value ? COLOR_PALETTE.indexOf(value) : 0;
        const target = swatchRefs.current[selectedIdx >= 0 ? selectedIdx : 0];
        target?.focus();
      });
      return () => cancelAnimationFrame(rafId);
    }, [isOpen, value]);

    return (
      <div ref={containerRef} className="relative inline-flex">
        <button
          ref={triggerRef}
          type="button"
          className="ribbon-btn ribbon-color-btn"
          title={tooltip}
          aria-label={tooltip}
          aria-expanded={isOpen}
          aria-haspopup="true"
          disabled={disabled}
          onClick={toggleOpen}
          style={TRIGGER_STYLE}
        >
          {icon}
          {/* Color indicator bar */}
          <div
            className="ribbon-color-indicator"
            style={{ backgroundColor: value || '#000000' }}
          />
          <ChevronDownIcon className="absolute bottom-0.5 right-0.5" />
        </button>

        {/* Dropdown panel — single delegated click handler for all swatches */}
        {isOpen && (
          <div
            className="absolute top-full left-0 mt-1 p-2 ribbon-color-dropdown z-50"
            role="listbox"
            aria-label={`${tooltip} colors`}
            onClick={handleSwatchClick}
          >
            {/* Reset / No Color — ArrowDown from here enters the swatch grid */}
            <button
              ref={noColorRef}
              type="button"
              className="w-full mb-1.5 px-2 py-1 text-xs text-left ribbon-color-no-color"
              data-color=""
              role="option"
              aria-selected={!value}
              aria-label="No color"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const target = value ? COLOR_PALETTE.indexOf(value) : 0;
                  swatchRefs.current[target >= 0 ? target : 0]?.focus();
                }
              }}
            >
              No Color
            </button>
            <div className="grid gap-0.5" style={GRID_STYLE} onKeyDown={handleSwatchKeyDown}>
              {COLOR_PALETTE.map((color, idx) => (
                <button
                  type="button"
                  key={color}
                  ref={(el) => { swatchRefs.current[idx] = el; }}
                  className={`ribbon-color-swatch${value === color ? ' ribbon-color-swatch-selected' : ''}`}
                  style={{ backgroundColor: color }}
                  data-color={color}
                  role="option"
                  aria-selected={value === color}
                  aria-label={color}
                  title={color}
                  tabIndex={value === color || (!value && idx === 0) ? 0 : -1}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  },
);

RibbonColorPicker.displayName = 'RibbonColorPicker';
