/**
 * useFilterState Hook Tests
 *
 * Test coverage:
 * - React 18 subscription to FilterManager
 * - Dropdown state management (open/close)
 * - Unique value extraction with caching
 * - Filter application (checkbox → predicate conversion)
 * - Filter clearing (single & all)
 * - Helper functions (isColumnFiltered, counts)
 * - Edge cases (empty columns, large datasets, no selection)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFilterState } from './useFilterState';
import type { FilterDataStore } from './useFilterState';
import { FilterManager } from '../../../engine/core/filtering/FilterManager';
import type { FilterDataSource } from '../../../engine/core/filtering/FilterManager';
import type { CellValue } from '../../../engine/core/filtering/types';

// =============================================================================
// Mock Data Store
// =============================================================================

class MockDataStore implements FilterDataStore, FilterDataSource {
  private data: Map<string, unknown> = new Map();
  private maxRow = 0;
  private maxCol = 0;

  setCell(row: number, col: number, value: unknown): void {
    this.data.set(`${row}_${col}`, value);
    this.maxRow = Math.max(this.maxRow, row);
    this.maxCol = Math.max(this.maxCol, col);
  }

  getCell(row: number, col: number): { value: unknown } | null {
    const value = this.data.get(`${row}_${col}`);
    return value !== undefined ? { value } : null;
  }

  getCellValue(row: number, col: number): CellValue {
    const cell = this.getCell(row, col);
    return (cell?.value ?? null) as CellValue;
  }

  getUsedRange() {
    return {
      startRow: 0,
      endRow: this.maxRow,
      startCol: 0,
      endCol: this.maxCol,
    };
  }
}

// =============================================================================
// Basic Functionality Tests
// =============================================================================

describe('useFilterState - Basic Functionality', () => {
  let dataStore: MockDataStore;
  let filterManager: FilterManager;

  beforeEach(() => {
    dataStore = new MockDataStore();
    filterManager = new FilterManager(dataStore);
  });

  it('should initialize with no filters', () => {
    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    expect(result.current.hasFilters).toBe(false);
    expect(result.current.activeFilters.size).toBe(0);
    expect(result.current.dropdownState.isOpen).toBe(false);
  });

  it('should subscribe to FilterManager changes', () => {
    const { result, rerender } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    // Initially no filters
    expect(result.current.hasFilters).toBe(false);

    // Apply filter outside hook (simulate engine change)
    act(() => {
      const { TextContainsPredicate } = require('../../../engine/core/filtering/FilterPredicate');
      filterManager.applyFilter(0, new TextContainsPredicate('test'));
    });

    // Hook should re-render and reflect change
    rerender();
    expect(result.current.hasFilters).toBe(true);
    expect(result.current.activeFilters.size).toBe(1);
  });

  it('should provide getTotalRowCount', () => {
    // Set up data
    for (let i = 0; i < 10; i++) {
      dataStore.setCell(i, 0, `Value ${i}`);
    }

    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    expect(result.current.getTotalRowCount()).toBe(10);
  });

  it('should provide getFilteredRowCount (no filters)', () => {
    // Set up data
    for (let i = 0; i < 10; i++) {
      dataStore.setCell(i, 0, `Value ${i}`);
    }

    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    // No filters - should return total count
    expect(result.current.getFilteredRowCount()).toBe(10);
  });
});

// =============================================================================
// Dropdown State Management Tests
// =============================================================================

describe('useFilterState - Dropdown State', () => {
  let dataStore: MockDataStore;
  let filterManager: FilterManager;

  beforeEach(() => {
    dataStore = new MockDataStore();
    filterManager = new FilterManager(dataStore);
  });

  it('should open filter dropdown', () => {
    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    const mockRect = new DOMRect(100, 200, 150, 30);

    act(() => {
      result.current.openFilter(3, mockRect);
    });

    expect(result.current.dropdownState.isOpen).toBe(true);
    expect(result.current.dropdownState.column).toBe(3);
    expect(result.current.dropdownState.anchorRect).toBe(mockRect);
  });

  it('should close filter dropdown', () => {
    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    // Open dropdown
    act(() => {
      result.current.openFilter(3, new DOMRect());
    });

    expect(result.current.dropdownState.isOpen).toBe(true);

    // Close dropdown
    act(() => {
      result.current.closeFilter();
    });

    expect(result.current.dropdownState.isOpen).toBe(false);
    expect(result.current.dropdownState.column).toBe(null);
    expect(result.current.dropdownState.anchorRect).toBe(null);
  });

  it('should close dropdown after applying filter', () => {
    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    // Open dropdown
    act(() => {
      result.current.openFilter(0, new DOMRect());
    });

    expect(result.current.dropdownState.isOpen).toBe(true);

    // Apply filter
    act(() => {
      result.current.applyFilter(0, new Set(['value1']), false);
    });

    // Dropdown should close
    expect(result.current.dropdownState.isOpen).toBe(false);
  });
});

// =============================================================================
// Unique Values Extraction Tests
// =============================================================================

describe('useFilterState - Unique Values', () => {
  let dataStore: MockDataStore;
  let filterManager: FilterManager;

  beforeEach(() => {
    dataStore = new MockDataStore();
    filterManager = new FilterManager(dataStore);
  });

  it('should extract unique values from column', () => {
    // Set up data
    dataStore.setCell(0, 0, 'Alice');
    dataStore.setCell(1, 0, 'Bob');
    dataStore.setCell(2, 0, 'Alice'); // Duplicate
    dataStore.setCell(3, 0, 'Charlie');

    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    const values = result.current.getUniqueValues(0);

    expect(values).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('should sort unique values alphabetically', () => {
    dataStore.setCell(0, 0, 'Zebra');
    dataStore.setCell(1, 0, 'Apple');
    dataStore.setCell(2, 0, 'Mango');

    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    const values = result.current.getUniqueValues(0);

    expect(values).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('should sort numeric values numerically', () => {
    dataStore.setCell(0, 0, '100');
    dataStore.setCell(1, 0, '20');
    dataStore.setCell(2, 0, '3');

    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    const values = result.current.getUniqueValues(0);

    expect(values).toEqual(['3', '20', '100']); // Numeric sort, not alphabetic
  });

  it('should handle empty cells', () => {
    dataStore.setCell(0, 0, 'Value1');
    dataStore.setCell(1, 0, null);
    dataStore.setCell(2, 0, undefined);
    dataStore.setCell(3, 0, 'Value2');

    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    const values = result.current.getUniqueValues(0);

    // Empty values should be last
    expect(values).toEqual(['Value1', 'Value2', '']);
  });

  it('should cache unique values', () => {
    dataStore.setCell(0, 0, 'Value1');

    const { result, rerender } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    const values1 = result.current.getUniqueValues(0);
    rerender(); // Force re-render
    const values2 = result.current.getUniqueValues(0);

    // Should return same array reference (cached)
    expect(values1).toBe(values2);
  });

  it('should cap unique values at 1000', () => {
    // Add 1500 unique values
    for (let i = 0; i < 1500; i++) {
      dataStore.setCell(i, 0, `Value${i}`);
    }

    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    const values = result.current.getUniqueValues(0);

    // Should cap at 1000
    expect(values.length).toBe(1000);
  });

  it('should handle empty column', () => {
    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    const values = result.current.getUniqueValues(0);

    expect(values).toEqual(['']); // Empty column returns one empty string
  });
});

// =============================================================================
// Filter Application Tests
// =============================================================================

describe('useFilterState - Apply Filter', () => {
  let dataStore: MockDataStore;
  let filterManager: FilterManager;

  beforeEach(() => {
    dataStore = new MockDataStore();
    filterManager = new FilterManager(dataStore);

    // Set up test data
    dataStore.setCell(0, 0, 'Alice');
    dataStore.setCell(1, 0, 'Bob');
    dataStore.setCell(2, 0, 'Charlie');
  });

  it('should apply filter with single value', () => {
    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    act(() => {
      result.current.applyFilter(0, new Set(['Alice']), false);
    });

    expect(result.current.hasFilters).toBe(true);
    expect(result.current.isColumnFiltered(0)).toBe(true);
  });

  it('should apply filter with multiple values (OR predicate)', () => {
    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    act(() => {
      result.current.applyFilter(0, new Set(['Alice', 'Bob']), false);
    });

    expect(result.current.hasFilters).toBe(true);

    // Verify predicate type is OR
    const predicate = filterManager.getFilter(0);
    expect(predicate?.type).toBe('or');
  });

  it('should include blanks when requested', () => {
    dataStore.setCell(3, 0, null); // Add blank cell

    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    act(() => {
      result.current.applyFilter(0, new Set(['Alice']), true); // Include blanks
    });

    // Verify predicate includes IsEmpty
    const predicate = filterManager.getFilter(0);
    expect(predicate?.type).toBe('or'); // Alice OR empty
  });

  it('should clear filter when no values selected', () => {
    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    act(() => {
      result.current.applyFilter(0, new Set([]), false); // No values, no blanks
    });

    // Should clear filter instead of applying empty predicate
    expect(result.current.hasFilters).toBe(false);
  });

  it('should update filtered row count after applying filter', () => {
    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    // Apply filter to show only Alice
    act(() => {
      result.current.applyFilter(0, new Set(['Alice']), false);
    });

    // Only 1 row should be visible
    expect(result.current.getFilteredRowCount()).toBe(1);
  });
});

// =============================================================================
// Filter Clearing Tests
// =============================================================================

describe('useFilterState - Clear Filter', () => {
  let dataStore: MockDataStore;
  let filterManager: FilterManager;

  beforeEach(() => {
    dataStore = new MockDataStore();
    filterManager = new FilterManager(dataStore);

    dataStore.setCell(0, 0, 'Alice');
    dataStore.setCell(1, 0, 'Bob');
  });

  it('should clear filter from column', () => {
    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    // Apply filter
    act(() => {
      result.current.applyFilter(0, new Set(['Alice']), false);
    });

    expect(result.current.isColumnFiltered(0)).toBe(true);

    // Clear filter
    act(() => {
      result.current.clearFilter(0);
    });

    expect(result.current.isColumnFiltered(0)).toBe(false);
    expect(result.current.hasFilters).toBe(false);
  });

  it('should clear all filters', () => {
    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    // Apply filters to two columns
    act(() => {
      result.current.applyFilter(0, new Set(['Alice']), false);
      result.current.applyFilter(1, new Set(['Value1']), false);
    });

    expect(result.current.activeFilters.size).toBe(2);

    // Clear all
    act(() => {
      result.current.clearAllFilters();
    });

    expect(result.current.hasFilters).toBe(false);
    expect(result.current.activeFilters.size).toBe(0);
  });

  it('should close dropdown after clearing filter', () => {
    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    // Open dropdown
    act(() => {
      result.current.openFilter(0, new DOMRect());
    });

    expect(result.current.dropdownState.isOpen).toBe(true);

    // Clear filter
    act(() => {
      result.current.clearFilter(0);
    });

    // Dropdown should close
    expect(result.current.dropdownState.isOpen).toBe(false);
  });
});

// =============================================================================
// Helper Function Tests
// =============================================================================

describe('useFilterState - Helper Functions', () => {
  let dataStore: MockDataStore;
  let filterManager: FilterManager;

  beforeEach(() => {
    dataStore = new MockDataStore();
    filterManager = new FilterManager(dataStore);

    for (let i = 0; i < 10; i++) {
      dataStore.setCell(i, 0, `Value${i}`);
    }
  });

  it('should check if column is filtered', () => {
    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    expect(result.current.isColumnFiltered(0)).toBe(false);

    // Apply filter
    act(() => {
      result.current.applyFilter(0, new Set(['Value1']), false);
    });

    expect(result.current.isColumnFiltered(0)).toBe(true);
    expect(result.current.isColumnFiltered(1)).toBe(false); // Other column not filtered
  });

  it('should track active filters map', () => {
    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    // Apply filters to two columns
    act(() => {
      result.current.applyFilter(0, new Set(['Value1']), false);
      result.current.applyFilter(1, new Set(['Value2']), false);
    });

    expect(result.current.activeFilters.size).toBe(2);
    expect(result.current.activeFilters.has(0)).toBe(true);
    expect(result.current.activeFilters.has(1)).toBe(true);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('useFilterState - Edge Cases', () => {
  it('should handle rapid open/close cycles', () => {
    const dataStore = new MockDataStore();
    const filterManager = new FilterManager(dataStore);

    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    // Rapid open/close
    for (let i = 0; i < 10; i++) {
      act(() => {
        result.current.openFilter(i % 5, new DOMRect());
        result.current.closeFilter();
      });
    }

    expect(result.current.dropdownState.isOpen).toBe(false);
  });

  it('should handle filter application to different columns', () => {
    const dataStore = new MockDataStore();
    const filterManager = new FilterManager(dataStore);

    for (let col = 0; col < 5; col++) {
      for (let row = 0; row < 3; row++) {
        dataStore.setCell(row, col, `Col${col}Row${row}`);
      }
    }

    const { result } = renderHook(() =>
      useFilterState({ filterManager, dataStore })
    );

    // Apply filters to all columns
    act(() => {
      for (let col = 0; col < 5; col++) {
        result.current.applyFilter(col, new Set([`Col${col}Row0`]), false);
      }
    });

    expect(result.current.activeFilters.size).toBe(5);

    // Clear specific columns
    act(() => {
      result.current.clearFilter(2);
      result.current.clearFilter(4);
    });

    expect(result.current.activeFilters.size).toBe(3);
  });
});
