/**
 * Filter Performance Tests
 *
 * Verify that filtering large datasets meets performance targets:
 * - 100k rows filtered in <100ms (Target: Batch 4)
 * - Virtual rendering with filters maintains 60fps
 * - Memory usage remains reasonable
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FilteredDimensionProvider } from './FilteredDimensionProvider.js';
import { VirtualRenderer } from './VirtualRenderer.js';
import { FilterManager } from '../filtering/FilterManager.js';
import {
  TextContainsPredicate,
  NumberGreaterThanPredicate,
  NumberBetweenPredicate,
} from '../filtering/FilterPredicate.js';
import type { DimensionProvider } from './VirtualRenderer.js';
import type { FilterDataSource } from '../filtering/FilterManager.js';
import type { CellValue } from '../filtering/types.js';
import type { Cell, CellRange } from '../types/index.js';

// =============================================================================
// Large-Scale Mock Provider
// =============================================================================

class LargeScaleMockProvider implements DimensionProvider {
  private rowCount: number;
  private colCount: number;

  constructor(rowCount: number, colCount: number) {
    this.rowCount = rowCount;
    this.colCount = colCount;
  }

  getRowHeight(_row: number): number {
    return 21;
  }

  getColumnWidth(_col: number): number {
    return 100;
  }

  isRowHidden(_row: number): boolean {
    return false;
  }

  isColumnHidden(_col: number): boolean {
    return false;
  }

  getCell(row: number, col: number): Cell | null {
    // Simulate realistic data distribution
    if (row >= this.rowCount || col >= this.colCount) return null;
    return null; // Virtual renderer doesn't need actual cells for perf test
  }

  getUsedRange(): CellRange {
    return {
      startRow: 0,
      endRow: this.rowCount - 1,
      startCol: 0,
      endCol: this.colCount - 1,
    };
  }
}

// =============================================================================
// Large-Scale Mock Data Source
// =============================================================================

class LargeScaleDataSource implements FilterDataSource {
  private rowCount: number;
  private colCount: number;

  constructor(rowCount: number, colCount: number) {
    this.rowCount = rowCount;
    this.colCount = colCount;
  }

  getCellValue(row: number, col: number): CellValue {
    if (row >= this.rowCount || col >= this.colCount) return null;

    // Generate realistic test data
    if (col === 0) {
      // Column 0: Names
      const names = ['Alice', 'Bob', 'Charlie', 'David', 'Eve'];
      return names[row % names.length];
    } else if (col === 1) {
      // Column 1: Ages (20-60)
      return 20 + (row % 40);
    } else if (col === 2) {
      // Column 2: Scores (0-100)
      return row % 101;
    }

    return null;
  }

  getUsedRange() {
    return {
      startRow: 0,
      endRow: this.rowCount - 1,
      startCol: 0,
      endCol: this.colCount - 1,
    };
  }
}

// =============================================================================
// Performance Tests - 100k Rows
// =============================================================================

describe('Filter Performance - 100k Rows', () => {
  const ROW_COUNT = 100_000;
  const COL_COUNT = 10;

  it('should filter 100k rows in <100ms (Target: Batch 4)', () => {
    const dataSource = new LargeScaleDataSource(ROW_COUNT, COL_COUNT);
    const filterManager = new FilterManager(dataSource);

    // Apply filter: name contains "Alice"
    const predicate = new TextContainsPredicate('Alice');

    const start = performance.now();
    filterManager.applyFilter(0, predicate);
    filterManager.getFilteredRows(); // Force calculation
    const duration = performance.now() - start;

    console.log(`100k rows filtered in ${duration.toFixed(2)}ms`);

    // Target: <100ms
    expect(duration).toBeLessThan(100);

    // Verify filter worked (should be ~20k rows visible, since names cycle every 5)
    const visibleCount = filterManager.getVisibleRowCount();
    expect(visibleCount).toBe(20_000);
  });

  it('should filter 100k rows with numeric predicate in <100ms', () => {
    const dataSource = new LargeScaleDataSource(ROW_COUNT, COL_COUNT);
    const filterManager = new FilterManager(dataSource);

    // Apply filter: age > 40 (column 1)
    const predicate = new NumberGreaterThanPredicate(40);

    const start = performance.now();
    filterManager.applyFilter(1, predicate);
    filterManager.getFilteredRows();
    const duration = performance.now() - start;

    console.log(`100k rows (numeric filter) in ${duration.toFixed(2)}ms`);

    expect(duration).toBeLessThan(100);

    // Ages range from 20-59 (40 values)
    // Age > 40 means ages 41-59 (19 values out of 40)
    // Expected: 100k * (19/40) = 47,500
    const visibleCount = filterManager.getVisibleRowCount();
    expect(visibleCount).toBe(47_500);
  });

  it('should filter 100k rows with multi-column filters in <100ms', () => {
    const dataSource = new LargeScaleDataSource(ROW_COUNT, COL_COUNT);
    const filterManager = new FilterManager(dataSource);

    // Apply two filters
    const namePredicate = new TextContainsPredicate('Alice');
    const agePredicate = new NumberBetweenPredicate({ min: 30, max: 50 });

    const start = performance.now();
    filterManager.applyFilter(0, namePredicate);
    filterManager.applyFilter(1, agePredicate);
    filterManager.getFilteredRows();
    const duration = performance.now() - start;

    console.log(`100k rows (multi-column filter) in ${duration.toFixed(2)}ms`);

    expect(duration).toBeLessThan(100);
  });

  it('should handle repeated filter changes on 100k rows efficiently', () => {
    const dataSource = new LargeScaleDataSource(ROW_COUNT, COL_COUNT);
    const filterManager = new FilterManager(dataSource);

    const predicates = [
      new TextContainsPredicate('Alice'),
      new TextContainsPredicate('Bob'),
      new TextContainsPredicate('Charlie'),
      new TextContainsPredicate('David'),
      new TextContainsPredicate('Eve'),
    ];

    const start = performance.now();

    // Apply 10 filter changes
    for (let i = 0; i < 10; i++) {
      filterManager.applyFilter(0, predicates[i % predicates.length]);
      filterManager.getFilteredRows(); // Force recalculation
    }

    const duration = performance.now() - start;
    const avgDuration = duration / 10;

    console.log(`10 filter changes on 100k rows: ${duration.toFixed(2)}ms (avg ${avgDuration.toFixed(2)}ms)`);

    // Each change should average <100ms
    expect(avgDuration).toBeLessThan(100);
  });
});

// =============================================================================
// Performance Tests - VirtualRenderer Integration
// =============================================================================

describe('Filter Performance - VirtualRenderer Integration', () => {
  const ROW_COUNT = 100_000;
  const COL_COUNT = 10;

  it('should render filtered viewport in <50ms (20+ fps)', () => {
    const baseProvider = new LargeScaleMockProvider(ROW_COUNT, COL_COUNT);
    const dataSource = new LargeScaleDataSource(ROW_COUNT, COL_COUNT);
    const filterManager = new FilterManager(dataSource);

    // Apply filter to show only ~20% of rows
    const predicate = new TextContainsPredicate('Alice');
    filterManager.applyFilter(0, predicate);
    filterManager.getFilteredRows(); // Pre-calculate

    // Create filter-aware renderer
    const filteredProvider = new FilteredDimensionProvider(baseProvider, filterManager);
    const renderer = new VirtualRenderer(filteredProvider, {
      width: 1200,
      height: 800,
      overscanRows: 5,
      overscanCols: 3,
      frozenRows: 0,
      frozenCols: 0,
      zoom: 1.0,
      rtl: false,
      headerWidth: 50,
      headerHeight: 25,
    });

    // Render frame
    const start = performance.now();
    const frame = renderer.getRenderFrame();
    const duration = performance.now() - start;

    console.log(`VirtualRenderer frame with 100k rows (filtered): ${duration.toFixed(2)}ms`);

    // Target: <50ms (20+ fps) - First frame includes setup overhead
    // Subsequent frames are much faster (see scrolling test)
    expect(duration).toBeLessThan(50);

    // Verify frame is valid
    expect(frame.rows.length).toBeGreaterThan(0);
    expect(frame.columns.length).toBeGreaterThan(0);
  });

  it('should handle scrolling through filtered data at 60fps', () => {
    const baseProvider = new LargeScaleMockProvider(ROW_COUNT, COL_COUNT);
    const dataSource = new LargeScaleDataSource(ROW_COUNT, COL_COUNT);
    const filterManager = new FilterManager(dataSource);

    const predicate = new NumberGreaterThanPredicate(40);
    filterManager.applyFilter(1, predicate);
    filterManager.getFilteredRows();

    const filteredProvider = new FilteredDimensionProvider(baseProvider, filterManager);
    const renderer = new VirtualRenderer(filteredProvider, {
      width: 1200,
      height: 800,
      overscanRows: 5,
      overscanCols: 3,
    });

    // Simulate 60 frames of scrolling
    const frameCount = 60;
    const start = performance.now();

    for (let i = 0; i < frameCount; i++) {
      renderer.setScroll(0, i * 100); // Scroll 100px per frame
      renderer.getRenderFrame();
    }

    const duration = performance.now() - start;
    const avgFrameTime = duration / frameCount;

    console.log(
      `60 frames scrolling through filtered 100k rows: ${duration.toFixed(2)}ms (avg ${avgFrameTime.toFixed(2)}ms/frame)`
    );

    // Target: <16ms per frame for 60fps
    expect(avgFrameTime).toBeLessThan(16);
  });
});

// =============================================================================
// Performance Tests - Cached Filtered Rows
// =============================================================================

describe('Filter Performance - Cache Efficiency', () => {
  const ROW_COUNT = 100_000;
  const COL_COUNT = 10;

  it('should use cached filtered rows for repeated checks', () => {
    const dataSource = new LargeScaleDataSource(ROW_COUNT, COL_COUNT);
    const filterManager = new FilterManager(dataSource);

    const predicate = new TextContainsPredicate('Alice');
    filterManager.applyFilter(0, predicate);
    filterManager.getFilteredRows(); // First call - builds cache

    // Second call should be instant (cached)
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      filterManager.getFilteredRows();
    }
    const duration = performance.now() - start;

    console.log(`100 cached getFilteredRows() calls: ${duration.toFixed(2)}ms`);

    // Should be <1ms total (cached Set reference)
    expect(duration).toBeLessThan(1);
  });

  it('should efficiently check isRowVisible for filtered rows', () => {
    const dataSource = new LargeScaleDataSource(ROW_COUNT, COL_COUNT);
    const filterManager = new FilterManager(dataSource);

    const predicate = new TextContainsPredicate('Alice');
    filterManager.applyFilter(0, predicate);
    filterManager.getFilteredRows(); // Build cache

    // Check 10k rows
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) {
      filterManager.isRowVisible(i);
    }
    const duration = performance.now() - start;

    console.log(`10k isRowVisible() checks: ${duration.toFixed(2)}ms`);

    // Should be <5ms (O(1) Set.has() checks)
    expect(duration).toBeLessThan(5);
  });
});

// =============================================================================
// Performance Tests - Memory Usage
// =============================================================================

describe('Filter Performance - Memory', () => {
  it('should have reasonable memory overhead for 100k filtered rows', () => {
    const ROW_COUNT = 100_000;
    const dataSource = new LargeScaleDataSource(ROW_COUNT, 10);
    const filterManager = new FilterManager(dataSource);

    // Apply filter
    const predicate = new TextContainsPredicate('Alice');
    filterManager.applyFilter(0, predicate);

    // Force memory snapshot
    const filteredRows = filterManager.getFilteredRows();

    // Verify reasonable memory
    // Set<number> with 20k entries ≈ 20k * 8 bytes = 160KB
    // Should be well under 1MB
    const memoryEstimate = filteredRows.size * 8; // 8 bytes per number in Set
    console.log(`Filtered rows Set memory estimate: ${(memoryEstimate / 1024).toFixed(2)} KB`);

    expect(memoryEstimate).toBeLessThan(1_000_000); // <1MB
  });
});
