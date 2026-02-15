/**
 * useFilterState - Filter state management hook
 *
 * Bridges React UI and engine's FilterManager system.
 *
 * Features:
 * - React 18 subscription to FilterManager (useSyncExternalStore)
 * - Dropdown state management (open/close, position)
 * - Unique value extraction with caching
 * - Checkbox selection → Predicate conversion
 * - Filter actions (apply, clear, clearAll)
 *
 * Design:
 * - Single source of truth: FilterManager (engine)
 * - Local UI state: dropdown open/close, position
 * - Predicates: OrPredicate of TextEquals for multi-select
 * - Performance: Cached unique values, max 1000 values per column
 *
 * Usage:
 * ```tsx
 * const filterState = useFilterState({
 *   filterManager: engine.getFilterManager(),
 *   dataStore: engine.getDataStore(),
 * });
 *
 * // Open filter dropdown
 * filterState.openFilter(column, anchorRect);
 *
 * // Apply filter
 * filterState.applyFilter(column, selectedValues, includeBlanks);
 * ```
 */

import { useState, useCallback, useMemo, useSyncExternalStore } from 'react';
import type { FilterManager } from '../../../engine/core/filtering/FilterManager';
import type { FilterPredicate } from '../../../engine/core/filtering/types';
import {
  TextEqualsPredicate,
  OrPredicate,
  IsEmptyPredicate,
} from '../../../engine/core/filtering/FilterPredicate';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of converting a predicate to a value set
 */
export interface PredicateValueSet {
  values: Set<string>;
  includeBlanks: boolean;
}

/**
 * Data store interface for extracting unique column values
 */
export interface FilterDataStore {
  getCell(row: number, col: number): { value: unknown } | null;
  getUsedRange(): { startRow: number; endRow: number; startCol: number; endCol: number };
}

/**
 * Dropdown state - managed locally
 */
export interface FilterDropdownState {
  isOpen: boolean;
  column: number | null;
  anchorRect: DOMRect | null;
}

/**
 * Filter state hook options
 */
export interface UseFilterStateOptions {
  /** Engine's filter manager (single source of truth) */
  filterManager: FilterManager;
  /** Data store for scanning unique values */
  dataStore: FilterDataStore;
}

/**
 * Filter state hook return value
 */
export interface UseFilterStateResult {
  // Current filter state (from engine)
  activeFilters: Map<number, FilterPredicate>;
  hasFilters: boolean;

  // Dropdown state (local UI state)
  dropdownState: FilterDropdownState;

  // Actions
  openFilter(column: number, anchorRect: DOMRect): void;
  closeFilter(): void;
  applyFilter(column: number, selectedValues: Set<string>, includeBlanks: boolean): void;
  clearFilter(column: number): void;
  clearAllFilters(): void;

  // Helpers
  getUniqueValues(column: number): string[];
  isColumnFiltered(column: number): boolean;
  getFilteredRowCount(): number;
  getTotalRowCount(): number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert a FilterPredicate back to a value set for FilterDropdown
 *
 * This is the inverse of applyFilter() - it extracts the selected values
 * from a predicate so we can pre-populate the checkbox list.
 *
 * Supports:
 * - Single TextEqualsPredicate → { values: Set([value]), includeBlanks: false }
 * - OrPredicate of TextEquals → { values: Set([...]), includeBlanks: false }
 * - OrPredicate with IsEmpty → { values: Set([...]), includeBlanks: true }
 *
 * Returns null for complex predicates that can't be represented as checkboxes
 * (e.g., NumberGreaterThan, DateBetween, composite AND predicates).
 */
export function predicateToValueSet(
  predicate: FilterPredicate | undefined
): PredicateValueSet | null {
  if (!predicate) {
    // No filter - return null (FilterDropdown will select all by default)
    return null;
  }

  // Use serialize() to access predicate data (properties are private)
  const serialized = predicate.serialize();

  // Single TextEquals
  if (serialized.type === 'text.equals' && 'value' in serialized) {
    const value = serialized.value as string;

    // Excel compatibility: treat empty string as blank
    if (value === '') {
      return {
        values: new Set(),
        includeBlanks: true,
      };
    }

    return {
      values: new Set([value]),
      includeBlanks: false,
    };
  }

  // Single IsEmpty
  if (serialized.type === 'null.isEmpty') {
    return {
      values: new Set(),
      includeBlanks: true,
    };
  }

  // OrPredicate - extract TextEquals and IsEmpty
  if (serialized.type === 'composite.or' && 'predicates' in serialized) {
    const values = new Set<string>();
    let includeBlanks = false;

    for (const p of serialized.predicates as any[]) {
      if (p.type === 'text.equals' && 'value' in p) {
        const value = p.value as string;
        // Excel compatibility: empty string in TextEquals means blanks
        if (value === '') {
          includeBlanks = true;
        } else {
          values.add(value);
        }
      } else if (p.type === 'null.isEmpty') {
        includeBlanks = true;
      } else {
        // Complex predicate in OR - can't convert
        return null;
      }
    }

    return { values, includeBlanks };
  }

  // Complex predicate (AND, number, date, etc.) - can't convert to value set
  return null;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Filter state management hook
 *
 * Subscribes to FilterManager changes and manages filter UI state.
 */
export function useFilterState(options: UseFilterStateOptions): UseFilterStateResult {
  const { filterManager, dataStore } = options;

  // --- React 18 Subscription to FilterManager ---
  // Subscribe to filter changes - triggers re-render when filters change
  const filterVersion = useSyncExternalStore(
    filterManager.subscribe,
    filterManager.getSnapshot
  );

  // --- Local Dropdown State ---
  const [dropdownState, setDropdownState] = useState<FilterDropdownState>({
    isOpen: false,
    column: null,
    anchorRect: null,
  });

  // --- Unique Values Cache ---
  // Memoize unique value extractor to avoid re-creating on every render
  const getUniqueValues = useMemo(() => {
    // Cache unique values per column
    const cache = new Map<number, string[]>();

    return (column: number): string[] => {
      // Return cached if available
      if (cache.has(column)) {
        return cache.get(column)!;
      }

      // Extract unique values from column
      const values = new Set<string>();
      const range = dataStore.getUsedRange();
      const MAX_VALUES = 1000; // Cap at 1000 for performance (Excel does this)

      for (let row = range.startRow; row <= range.endRow; row++) {
        // Stop if we hit the cap
        if (values.size >= MAX_VALUES) break;

        const cell = dataStore.getCell(row, column);
        const value = cell?.value;

        // Convert to string (null/undefined → empty string)
        const stringValue = value == null ? '' : String(value);

        values.add(stringValue);
      }

      // Sort for better UX
      const sorted = Array.from(values).sort((a, b) => {
        // Empty strings last
        if (a === '' && b !== '') return 1;
        if (b === '' && a !== '') return -1;

        // Try numeric sort if both are numbers
        const aNum = Number(a);
        const bNum = Number(b);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return aNum - bNum;
        }

        // Alphabetical sort
        return a.localeCompare(b);
      });

      // Cache result
      cache.set(column, sorted);

      return sorted;
    };
  }, [dataStore]);

  // --- Open Filter Dropdown ---
  const openFilter = useCallback((column: number, anchorRect: DOMRect) => {
    setDropdownState({
      isOpen: true,
      column,
      anchorRect,
    });
  }, []);

  // --- Close Filter Dropdown ---
  const closeFilter = useCallback(() => {
    setDropdownState({
      isOpen: false,
      column: null,
      anchorRect: null,
    });
  }, []);

  // --- Apply Filter (Convert Checkboxes → Predicate) ---
  const applyFilter = useCallback(
    (column: number, selectedValues: Set<string>, includeBlanks: boolean) => {
      const predicates: FilterPredicate[] = [];

      // Add TextEquals predicate for each selected value
      for (const value of selectedValues) {
        // Skip empty string - handled by includeBlanks
        if (value === '') continue;

        predicates.push(new TextEqualsPredicate(value));
      }

      // Add IsEmpty predicate if blanks included
      if (includeBlanks) {
        predicates.push(new IsEmptyPredicate());
      }

      // Edge case: No predicates means no filter (shouldn't happen with UI validation)
      if (predicates.length === 0) {
        // Clear filter instead
        filterManager.clearFilter(column);
        closeFilter();
        return;
      }

      // Combine predicates
      const predicate =
        predicates.length === 1
          ? predicates[0] // Single predicate
          : new OrPredicate(predicates); // Multiple predicates → OR

      // Apply to FilterManager
      filterManager.applyFilter(column, predicate);

      // Close dropdown
      closeFilter();
    },
    [filterManager, closeFilter]
  );

  // --- Clear Filter ---
  const clearFilter = useCallback(
    (column: number) => {
      filterManager.clearFilter(column);
      closeFilter();
    },
    [filterManager, closeFilter]
  );

  // --- Clear All Filters ---
  const clearAllFilters = useCallback(() => {
    filterManager.clearAllFilters();
    closeFilter();
  }, [filterManager, closeFilter]);

  // --- Helper: Is Column Filtered? ---
  const isColumnFiltered = useCallback(
    (column: number): boolean => {
      return filterManager.getFilter(column) !== undefined;
    },
    [filterManager, filterVersion] // Re-compute when filters change
  );

  // --- Helper: Get Filtered Row Count ---
  const getFilteredRowCount = useCallback((): number => {
    if (!filterManager.hasFilters()) {
      // No filters - return total row count
      const range = dataStore.getUsedRange();
      return range.endRow - range.startRow + 1;
    }

    return filterManager.getVisibleRowCount();
  }, [filterManager, dataStore, filterVersion]);

  // --- Helper: Get Total Row Count ---
  const getTotalRowCount = useCallback((): number => {
    const range = dataStore.getUsedRange();
    return range.endRow - range.startRow + 1;
  }, [dataStore]);

  // --- Return Hook Result ---
  return {
    // Current filter state (from engine)
    activeFilters: new Map(
      filterManager.getAllFilters().map((f) => [f.column, f.predicate])
    ),
    hasFilters: filterManager.hasFilters(),

    // Dropdown state (local UI state)
    dropdownState,

    // Actions
    openFilter,
    closeFilter,
    applyFilter,
    clearFilter,
    clearAllFilters,

    // Helpers
    getUniqueValues,
    isColumnFiltered,
    getFilteredRowCount,
    getTotalRowCount,
  };
}
