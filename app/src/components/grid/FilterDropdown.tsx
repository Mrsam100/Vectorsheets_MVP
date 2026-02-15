/**
 * FilterDropdown - Column value filter dropdown
 *
 * Anchored below a column header. Provides a searchable checkbox list of
 * unique cell values for filtering. Follows the ContextMenu pattern for
 * positioning and click-outside dismissal.
 *
 * Behaviour:
 * - Anchored at anchorRect (column header position), viewport-clamped
 * - Click-outside dismisses
 * - Search input filters visible checkboxes (local, instant)
 * - Select All toggles all visible items
 * - Blanks checkbox for empty cells
 * - "X of Y selected" counter for user awareness
 * - Enter in search field applies filter
 * - Empty state when search has no matches
 * - Apply / Clear / Cancel actions
 * - Escape closes
 * - onKeyDownCapture stops propagation to grid
 * - position: fixed, z-index 250
 */

import React, { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

// =============================================================================
// Types
// =============================================================================

export interface FilterDropdownProps {
  isOpen: boolean;
  column: number;
  anchorRect: { x: number; y: number; width: number; height: number };
  columnName: string;
  uniqueValues: string[];
  currentFilter: Set<string> | null;
  onApply: (column: number, selectedValues: Set<string>, includeBlanks: boolean) => void;
  onClear: (column: number) => void;
  onClose: () => void;
}

// =============================================================================
// Component
// =============================================================================

const FilterDropdownInner: React.FC<FilterDropdownProps> = ({
  isOpen,
  column,
  anchorRect,
  columnName,
  uniqueValues,
  currentFilter,
  onApply,
  onClear,
  onClose,
}) => {
  // --- Internal state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [checkedValues, setCheckedValues] = useState<Set<string>>(new Set());
  const [includeBlanks, setIncludeBlanks] = useState(true);

  // --- Refs ---
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // --- Focus trap for modal-like dropdown ---
  useFocusTrap({ containerRef: dropdownRef, enabled: isOpen, onEscape: onClose });

  // Stable ref for onApply
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;

  // Initialize state on open
  useEffect(() => {
    let rafId: number | undefined;
    if (isOpen) {
      setSearchQuery('');
      if (currentFilter) {
        setCheckedValues(new Set(currentFilter));
        setIncludeBlanks(currentFilter.has(''));
      } else {
        // No active filter — select all
        setCheckedValues(new Set(uniqueValues));
        setIncludeBlanks(true);
      }
      rafId = requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
    return () => { if (rafId !== undefined) cancelAnimationFrame(rafId); };
  }, [isOpen, currentFilter, uniqueValues]);

  // Click-outside dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use setTimeout to avoid catching the same mousedown that opened the dropdown
    const timerId = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
    }, 0);
    return () => {
      clearTimeout(timerId);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isOpen, onClose]);

  // Filtered values based on search
  const filteredValues = useMemo(() => {
    if (!searchQuery) return uniqueValues;
    const lower = searchQuery.toLowerCase();
    return uniqueValues.filter((v) => v.toLowerCase().includes(lower));
  }, [uniqueValues, searchQuery]);

  // Determine if all visible items are checked
  const allVisibleChecked = useMemo(() => {
    return filteredValues.length > 0 && filteredValues.every((v) => checkedValues.has(v));
  }, [filteredValues, checkedValues]);

  // Checked count for user feedback
  const checkedCount = checkedValues.size + (includeBlanks ? 1 : 0);
  const totalCount = uniqueValues.length + 1; // +1 for blanks

  // --- Handlers ---
  const toggleValue = useCallback((value: string) => {
    setCheckedValues((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setCheckedValues((prev) => {
      const next = new Set(prev);
      const allChecked = filteredValues.length > 0 && filteredValues.every((v) => prev.has(v));
      for (const v of filteredValues) {
        allChecked ? next.delete(v) : next.add(v);
      }
      return next;
    });
  }, [filteredValues]);

  const handleApply = useCallback(() => {
    onApplyRef.current(column, checkedValues, includeBlanks);
  }, [column, checkedValues, includeBlanks]);

  const handleClear = useCallback(() => {
    onClear(column);
  }, [onClear, column]);

  // --- Keyboard handling ---
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      // Escape is handled by useFocusTrap({ onEscape: onClose }) — no duplicate handler needed
      case 'Enter':
        e.preventDefault();
        handleApply();
        break;
    }
  }, [handleApply]);

  const handleKeyDownCapture = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (['a', 'c', 'v', 'x', 'z'].includes(key)) return;
    }
    e.stopPropagation();
  }, []);

  if (!isOpen) return null;

  // Position: anchor below header, clamp to viewport
  const DROPDOWN_WIDTH = 260;
  const DROPDOWN_MAX_HEIGHT = 400;
  let left = anchorRect.x;
  let top = anchorRect.y + anchorRect.height;

  // Clamp to viewport edges
  if (left + DROPDOWN_WIDTH > window.innerWidth) {
    left = window.innerWidth - DROPDOWN_WIDTH - 8;
  }
  if (left < 8) left = 8;
  if (top + DROPDOWN_MAX_HEIGHT > window.innerHeight) {
    top = anchorRect.y - DROPDOWN_MAX_HEIGHT;
    if (top < 8) top = 8;
  }

  return (
    <div
      ref={dropdownRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Filter ${columnName}`}
      className="filter-dropdown"
      style={{ left, top }}
      onKeyDown={handleKeyDown}
      onKeyDownCapture={handleKeyDownCapture}
    >
      {/* Header */}
      <div className="filter-dropdown-header">
        <span>Filter: {columnName}</span>
        <span className="filter-dropdown-count">{checkedCount} of {totalCount}</span>
      </div>

      {/* Search */}
      <div className="filter-dropdown-search">
        <div className="filter-dropdown-search-wrapper">
          <svg className="filter-dropdown-search-icon" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="5" r="3.5" />
            <path d="M8 8l2.5 2.5" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search values..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* 1000 value cap warning */}
      {uniqueValues.length >= 1000 && (
        <div className="filter-dropdown-warning">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 1L13 12H1L7 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M7 5V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="7" cy="10" r="0.5" fill="currentColor"/>
          </svg>
          <span>Showing first 1,000 values. Use search to find more.</span>
        </div>
      )}

      {/* Value list */}
      <div className="filter-dropdown-list">
        {/* Select All */}
        <label className="filter-dropdown-item filter-dropdown-select-all">
          <input
            type="checkbox"
            checked={allVisibleChecked}
            onChange={toggleSelectAll}
          />
          <span>(Select All)</span>
        </label>

        {filteredValues.length === 0 && uniqueValues.length > 0 && (
          <div className="filter-dropdown-empty">No matching values</div>
        )}

        {uniqueValues.length === 0 && (
          <div className="filter-dropdown-empty">No values in column</div>
        )}

        {filteredValues.map((value) => (
          <label key={value} className="filter-dropdown-item">
            <input
              type="checkbox"
              checked={checkedValues.has(value)}
              onChange={() => toggleValue(value)}
            />
            <span className="filter-dropdown-value" title={value || '(empty)'}>
              {value || '(empty)'}
            </span>
          </label>
        ))}

        {/* Blanks */}
        <label className="filter-dropdown-item filter-dropdown-blanks">
          <input
            type="checkbox"
            checked={includeBlanks}
            onChange={(e) => setIncludeBlanks(e.target.checked)}
          />
          <span>(Blanks)</span>
        </label>
      </div>

      {/* Actions */}
      <div className="filter-dropdown-actions">
        <button type="button" className="dialog-btn" onClick={handleClear}>
          Clear
        </button>
        <div className="filter-dropdown-actions-spacer" />
        <button type="button" className="dialog-btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="dialog-btn dialog-btn-primary"
          onClick={handleApply}
          disabled={checkedValues.size === 0 && !includeBlanks}
        >
          Apply
        </button>
      </div>
    </div>
  );
};

FilterDropdownInner.displayName = 'FilterDropdown';

export const FilterDropdown = memo(FilterDropdownInner);
export default FilterDropdown;
