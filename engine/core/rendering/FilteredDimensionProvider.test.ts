/**
 * FilteredDimensionProvider Tests
 *
 * Test coverage:
 * - Delegation to base provider (getRowHeight, getColumnWidth, etc.)
 * - Filter-aware isRowHidden (manual hide + filter hide)
 * - Performance (O(1) checks)
 * - Edge cases (no filters, all filtered, mixed state)
 * - Integration with VirtualRenderer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FilteredDimensionProvider } from './FilteredDimensionProvider.js';
import { FilterManager } from '../filtering/FilterManager.js';
import { TextContainsPredicate, NumberGreaterThanPredicate } from '../filtering/FilterPredicate.js';
import type { DimensionProvider } from './VirtualRenderer.js';
import type { FilterDataSource } from '../filtering/FilterManager.js';
import type { CellValue } from '../filtering/types.js';
import type { Cell, CellRange } from '../types/index.js';

// =============================================================================
// Mock Base Provider
// =============================================================================

class MockDimensionProvider implements DimensionProvider {
  private rowHeights: Map<number, number> = new Map();
  private colWidths: Map<number, number> = new Map();
  private hiddenRows: Set<number> = new Set();
  private hiddenCols: Set<number> = new Set();
  private cells: Map<string, Cell> = new Map();

  getRowHeight(row: number): number {
    return this.rowHeights.get(row) ?? 21;
  }

  getColumnWidth(col: number): number {
    return this.colWidths.get(col) ?? 100;
  }

  isRowHidden(row: number): boolean {
    return this.hiddenRows.has(row);
  }

  isColumnHidden(col: number): boolean {
    return this.hiddenCols.has(col);
  }

  getCell(row: number, col: number): Cell | null {
    return this.cells.get(`${row}_${col}`) ?? null;
  }

  getUsedRange(): CellRange {
    return { startRow: 0, endRow: 100, startCol: 0, endCol: 10 };
  }

  // Helpers for testing
  setRowHeight(row: number, height: number): void {
    this.rowHeights.set(row, height);
  }

  setColumnWidth(col: number, width: number): void {
    this.colWidths.set(col, width);
  }

  setRowHidden(row: number, hidden: boolean): void {
    if (hidden) {
      this.hiddenRows.add(row);
    } else {
      this.hiddenRows.delete(row);
    }
  }

  setColumnHidden(col: number, hidden: boolean): void {
    if (hidden) {
      this.hiddenCols.add(col);
    } else {
      this.hiddenCols.delete(col);
    }
  }

  setCell(row: number, col: number, cell: Cell): void {
    this.cells.set(`${row}_${col}`, cell);
  }
}

// =============================================================================
// Mock Data Source for FilterManager
// =============================================================================

class MockFilterDataSource implements FilterDataSource {
  private data: Map<string, CellValue> = new Map();

  getCellValue(row: number, col: number): CellValue {
    return this.data.get(`${row}_${col}`) ?? null;
  }

  getUsedRange() {
    return { startRow: 0, endRow: 100, startCol: 0, endCol: 10 };
  }

  setCellValue(row: number, col: number, value: CellValue): void {
    this.data.set(`${row}_${col}`, value);
  }
}

// =============================================================================
// Basic Delegation Tests
// =============================================================================

describe('FilteredDimensionProvider - Delegation', () => {
  let baseProvider: MockDimensionProvider;
  let filterManager: FilterManager;
  let provider: FilteredDimensionProvider;

  beforeEach(() => {
    baseProvider = new MockDimensionProvider();
    const dataSource = new MockFilterDataSource();
    filterManager = new FilterManager(dataSource);
    provider = new FilteredDimensionProvider(baseProvider, filterManager);
  });

  it('should delegate getRowHeight to base provider', () => {
    baseProvider.setRowHeight(5, 42);

    expect(provider.getRowHeight(5)).toBe(42);
    expect(provider.getRowHeight(10)).toBe(21); // Default
  });

  it('should delegate getColumnWidth to base provider', () => {
    baseProvider.setColumnWidth(3, 150);

    expect(provider.getColumnWidth(3)).toBe(150);
    expect(provider.getColumnWidth(7)).toBe(100); // Default
  });

  it('should delegate isColumnHidden to base provider', () => {
    baseProvider.setColumnHidden(2, true);

    expect(provider.isColumnHidden(2)).toBe(true);
    expect(provider.isColumnHidden(5)).toBe(false);
  });

  it('should delegate getCell to base provider', () => {
    const cell: Cell = { value: 'test', format: {} };
    baseProvider.setCell(1, 2, cell);

    expect(provider.getCell?.(1, 2)).toBe(cell);
    expect(provider.getCell?.(5, 5)).toBe(null);
  });

  it('should delegate getUsedRange to base provider', () => {
    const range = provider.getUsedRange?.();

    expect(range).toEqual({ startRow: 0, endRow: 100, startCol: 0, endCol: 10 });
  });
});

// =============================================================================
// Filter-Aware isRowHidden Tests
// =============================================================================

describe('FilteredDimensionProvider - Filter Awareness', () => {
  let baseProvider: MockDimensionProvider;
  let dataSource: MockFilterDataSource;
  let filterManager: FilterManager;
  let provider: FilteredDimensionProvider;

  beforeEach(() => {
    baseProvider = new MockDimensionProvider();
    dataSource = new MockFilterDataSource();
    filterManager = new FilterManager(dataSource);
    provider = new FilteredDimensionProvider(baseProvider, filterManager);

    // Set up test data
    dataSource.setCellValue(0, 0, 'Alice');
    dataSource.setCellValue(1, 0, 'Bob');
    dataSource.setCellValue(2, 0, 'Charlie');
    dataSource.setCellValue(3, 0, 'David');
    dataSource.setCellValue(4, 0, 'Eve');
  });

  it('should return false for visible rows when no filters active', () => {
    expect(provider.isRowHidden(0)).toBe(false);
    expect(provider.isRowHidden(1)).toBe(false);
    expect(provider.isRowHidden(2)).toBe(false);
  });

  it('should return true for manually hidden rows', () => {
    baseProvider.setRowHidden(1, true);

    expect(provider.isRowHidden(1)).toBe(true);
    expect(provider.isRowHidden(0)).toBe(false);
  });

  it('should return true for filtered rows', () => {
    // Filter to show only "Alice"
    const predicate = new TextContainsPredicate('Alice');
    filterManager.applyFilter(0, predicate);

    // Row 0 (Alice) should be visible
    expect(provider.isRowHidden(0)).toBe(false);

    // Rows 1-4 should be hidden (filtered out)
    expect(provider.isRowHidden(1)).toBe(true); // Bob
    expect(provider.isRowHidden(2)).toBe(true); // Charlie
    expect(provider.isRowHidden(3)).toBe(true); // David
    expect(provider.isRowHidden(4)).toBe(true); // Eve
  });

  it('should combine manual hide and filter hide', () => {
    // Manually hide row 0 (Alice)
    baseProvider.setRowHidden(0, true);

    // Filter to show only "Alice" or "Bob"
    const predicate = new TextContainsPredicate('Alice');
    filterManager.applyFilter(0, predicate);

    // Row 0 is hidden by both manual hide AND filter
    expect(provider.isRowHidden(0)).toBe(true); // Manually hidden

    // Row 1 is hidden by filter only
    expect(provider.isRowHidden(1)).toBe(true); // Filtered out

    // Row 2+ are also filtered out
    expect(provider.isRowHidden(2)).toBe(true);
  });

  it('should update visibility when filters change', () => {
    // Apply filter
    const predicate1 = new TextContainsPredicate('Alice');
    filterManager.applyFilter(0, predicate1);

    expect(provider.isRowHidden(1)).toBe(true); // Bob hidden

    // Change filter
    const predicate2 = new TextContainsPredicate('Bob');
    filterManager.applyFilter(0, predicate2);

    expect(provider.isRowHidden(0)).toBe(true); // Alice now hidden
    expect(provider.isRowHidden(1)).toBe(false); // Bob now visible
  });

  it('should show all rows when filters are cleared', () => {
    // Apply filter
    const predicate = new TextContainsPredicate('Alice');
    filterManager.applyFilter(0, predicate);

    expect(provider.isRowHidden(1)).toBe(true); // Bob hidden

    // Clear filters
    filterManager.clearAllFilters();

    expect(provider.isRowHidden(0)).toBe(false);
    expect(provider.isRowHidden(1)).toBe(false);
    expect(provider.isRowHidden(2)).toBe(false);
  });

  it('should handle multiple column filters (AND logic)', () => {
    // Add age data
    dataSource.setCellValue(0, 1, 25); // Alice, 25
    dataSource.setCellValue(1, 1, 30); // Bob, 30
    dataSource.setCellValue(2, 1, 35); // Charlie, 35

    // Filter name contains "Alice" OR "Bob"
    // (We'll simulate this with just "li" which matches Alice and Charlie)
    const namePredicate = new TextContainsPredicate('li');
    filterManager.applyFilter(0, namePredicate);

    // Filter age > 26
    const agePredicate = new NumberGreaterThanPredicate(26);
    filterManager.applyFilter(1, agePredicate);

    // Row 0: Alice, 25 → name matches, age fails → HIDDEN
    expect(provider.isRowHidden(0)).toBe(true);

    // Row 1: Bob, 30 → name fails → HIDDEN
    expect(provider.isRowHidden(1)).toBe(true);

    // Row 2: Charlie, 35 → name matches, age passes → VISIBLE
    expect(provider.isRowHidden(2)).toBe(false);
  });
});

// =============================================================================
// Performance Tests
// =============================================================================

describe('FilteredDimensionProvider - Performance', () => {
  it('should have O(1) isRowHidden check with no filters', () => {
    const baseProvider = new MockDimensionProvider();
    const dataSource = new MockFilterDataSource();
    const filterManager = new FilterManager(dataSource);
    const provider = new FilteredDimensionProvider(baseProvider, filterManager);

    // No filters active - should be instant
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      provider.isRowHidden(i % 100);
    }
    const duration = performance.now() - start;

    // 10k checks should be < 10ms (100k checks/sec)
    expect(duration).toBeLessThan(10);
  });

  it('should have O(1) isRowHidden check with filters', () => {
    const baseProvider = new MockDimensionProvider();
    const dataSource = new MockFilterDataSource();
    const filterManager = new FilterManager(dataSource);
    const provider = new FilteredDimensionProvider(baseProvider, filterManager);

    // Set up data
    for (let i = 0; i < 100; i++) {
      dataSource.setCellValue(i, 0, i % 2 === 0 ? 'even' : 'odd');
    }

    // Apply filter
    const predicate = new TextContainsPredicate('even');
    filterManager.applyFilter(0, predicate);

    // Filter checks should be O(1) (Set.has() lookup)
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      provider.isRowHidden(i % 100);
    }
    const duration = performance.now() - start;

    // 10k checks should be < 20ms (500k checks/sec)
    expect(duration).toBeLessThan(20);
  });
});

// =============================================================================
// Utility Methods Tests
// =============================================================================

describe('FilteredDimensionProvider - Utility Methods', () => {
  it('should allow updating filter manager', () => {
    const baseProvider = new MockDimensionProvider();
    const dataSource1 = new MockFilterDataSource();
    const filterManager1 = new FilterManager(dataSource1);
    const provider = new FilteredDimensionProvider(baseProvider, filterManager1);

    // Set up data and filter
    dataSource1.setCellValue(0, 0, 'test');
    const predicate = new TextContainsPredicate('test');
    filterManager1.applyFilter(0, predicate);

    expect(provider.isRowHidden(1)).toBe(true); // Filtered out

    // Create new filter manager with different data
    const dataSource2 = new MockFilterDataSource();
    dataSource2.setCellValue(1, 0, 'test'); // Row 1 now matches
    const filterManager2 = new FilterManager(dataSource2);
    filterManager2.applyFilter(0, predicate);

    // Update provider's filter manager
    provider.setFilterManager(filterManager2);

    expect(provider.isRowHidden(0)).toBe(true); // Now filtered out
    expect(provider.isRowHidden(1)).toBe(false); // Now visible
  });

  it('should expose getBaseProvider for debugging', () => {
    const baseProvider = new MockDimensionProvider();
    const filterManager = new FilterManager(new MockFilterDataSource());
    const provider = new FilteredDimensionProvider(baseProvider, filterManager);

    expect(provider.getBaseProvider()).toBe(baseProvider);
  });

  it('should expose getFilterManager for debugging', () => {
    const baseProvider = new MockDimensionProvider();
    const filterManager = new FilterManager(new MockFilterDataSource());
    const provider = new FilteredDimensionProvider(baseProvider, filterManager);

    expect(provider.getFilterManager()).toBe(filterManager);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('FilteredDimensionProvider - Edge Cases', () => {
  it('should handle empty data', () => {
    const baseProvider = new MockDimensionProvider();
    const dataSource = new MockFilterDataSource();
    const filterManager = new FilterManager(dataSource);
    const provider = new FilteredDimensionProvider(baseProvider, filterManager);

    // No data, no filters
    expect(provider.isRowHidden(0)).toBe(false);
    expect(provider.isRowHidden(100)).toBe(false);
  });

  it('should handle all rows filtered out', () => {
    const baseProvider = new MockDimensionProvider();
    const dataSource = new MockFilterDataSource();
    const filterManager = new FilterManager(dataSource);
    const provider = new FilteredDimensionProvider(baseProvider, filterManager);

    // Set up data
    for (let i = 0; i < 10; i++) {
      dataSource.setCellValue(i, 0, 'visible');
    }

    // Filter for non-existent value
    const predicate = new TextContainsPredicate('nonexistent');
    filterManager.applyFilter(0, predicate);

    // All rows should be hidden
    for (let i = 0; i < 10; i++) {
      expect(provider.isRowHidden(i)).toBe(true);
    }
  });

  it('should handle rows beyond data range', () => {
    const baseProvider = new MockDimensionProvider();
    const dataSource = new MockFilterDataSource();
    const filterManager = new FilterManager(dataSource);
    const provider = new FilteredDimensionProvider(baseProvider, filterManager);

    // Apply filter (will filter out empty rows)
    const predicate = new TextContainsPredicate('test');
    filterManager.applyFilter(0, predicate);

    // Rows beyond data should be hidden (no data = doesn't match filter)
    expect(provider.isRowHidden(1000)).toBe(true);
    expect(provider.isRowHidden(10000)).toBe(true);
  });
});
