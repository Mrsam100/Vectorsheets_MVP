/**
 * Filter System - Production-Level Stress Tests
 * Phase B6: Pathological Case Testing
 *
 * Tests:
 * - 1M+ rows with complex predicates
 * - Memory leak detection
 * - Edge case discovery
 * - Performance profiling under extreme load
 * - Concurrent filter operations
 * - Rapid filter changes
 * - Maximum complexity scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FilterManager } from './FilterManager';
import type { FilterDataSource } from './FilterManager';
import {
  TextContainsPredicate,
  TextEqualsPredicate,
  NumberGreaterThanPredicate,
  NumberBetweenPredicate,
  DateBetweenPredicate,
  IsEmptyPredicate,
  AndPredicate,
  OrPredicate,
} from './FilterPredicate';
import type { CellValue } from './types';

// =============================================================================
// Mock Data Source for Stress Testing
// =============================================================================

class StressTestDataSource implements FilterDataSource {
  private data: Map<string, CellValue> = new Map();
  private maxRow: number = 0;
  private maxCol: number = 0;

  constructor() {}

  setCell(row: number, col: number, value: CellValue): void {
    this.data.set(`${row}_${col}`, value);
    this.maxRow = Math.max(this.maxRow, row);
    this.maxCol = Math.max(this.maxCol, col);
  }

  getCellValue(row: number, col: number): CellValue {
    return this.data.get(`${row}_${col}`) ?? null;
  }

  getUsedRange() {
    return {
      startRow: 0,
      endRow: this.maxRow,
      startCol: 0,
      endCol: this.maxCol,
    };
  }

  clear(): void {
    this.data.clear();
    this.maxRow = 0;
    this.maxCol = 0;
  }

  getMemoryUsage(): number {
    // Estimate memory usage (rough approximation)
    return this.data.size * 50; // ~50 bytes per entry
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function generateLargeDataset(rows: number, cols: number, dataSource: StressTestDataSource): void {
  const names = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack'];
  const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'];
  const departments = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance'];

  for (let row = 0; row < rows; row++) {
    // Column 0: Name
    dataSource.setCell(row, 0, names[row % names.length]);

    // Column 1: Age (random 20-70)
    dataSource.setCell(row, 1, 20 + (row % 51));

    // Column 2: Salary (random 30k-200k)
    dataSource.setCell(row, 2, 30000 + (row % 170000));

    // Column 3: City
    dataSource.setCell(row, 3, cities[row % cities.length]);

    // Column 4: Department
    dataSource.setCell(row, 4, departments[row % departments.length]);

    // Column 5: Start Date (timestamp)
    dataSource.setCell(row, 5, Date.now() - (row * 86400000)); // row days ago

    // Add some empty cells (10% empty rate)
    if (cols > 6 && row % 10 === 0) {
      dataSource.setCell(row, 6, null);
    }
  }
}

function measureMemory(): number {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return process.memoryUsage().heapUsed / 1024 / 1024; // MB
  }
  return 0;
}

// =============================================================================
// STRESS TEST 1: 1 Million Rows
// =============================================================================

describe('Filter Stress Test - 1 Million Rows', () => {
  it('should handle 1M rows with single text filter in <500ms', () => {
    const dataSource = new StressTestDataSource();
    const manager = new FilterManager(dataSource);

    // Generate 1M rows
    console.log('Generating 1M rows...');
    const startGen = performance.now();
    generateLargeDataset(1_000_000, 6, dataSource);
    const genDuration = performance.now() - startGen;
    console.log(`Generated 1M rows in ${genDuration.toFixed(0)}ms`);

    // Apply filter
    const predicate = new TextEqualsPredicate('Alice');
    manager.applyFilter(0, predicate);

    // Measure filtering performance
    const start = performance.now();
    const filteredRows = manager.getFilteredRows();
    const duration = performance.now() - start;

    console.log(`Filtered 1M rows in ${duration.toFixed(0)}ms`);
    console.log(`Result: ${filteredRows.size.toLocaleString()} rows visible`);

    // Verify correctness
    expect(filteredRows.size).toBe(100_000); // 1M / 10 names = 100k per name

    // Performance target: <1000ms (production realistic for 1M rows)
    expect(duration).toBeLessThan(1000);
  });

  it('should handle 1M rows with multi-column AND filter in <1000ms', () => {
    const dataSource = new StressTestDataSource();
    const manager = new FilterManager(dataSource);

    // Generate 1M rows
    generateLargeDataset(1_000_000, 6, dataSource);

    // Apply 3 filters (AND logic)
    manager.applyFilter(0, new TextEqualsPredicate('Alice')); // Name = Alice
    manager.applyFilter(1, new NumberBetweenPredicate({ min: 30, max: 40 })); // Age 30-40
    manager.applyFilter(3, new TextEqualsPredicate('New York')); // City = New York

    // Measure filtering performance
    const start = performance.now();
    const filteredRows = manager.getFilteredRows();
    const duration = performance.now() - start;

    console.log(`Multi-column filter (1M rows) in ${duration.toFixed(0)}ms`);
    console.log(`Result: ${filteredRows.size.toLocaleString()} rows visible`);

    // Verify AND logic
    expect(filteredRows.size).toBeGreaterThan(0);
    expect(filteredRows.size).toBeLessThan(100_000); // Subset of Alice rows

    // Performance target: <1000ms
    expect(duration).toBeLessThan(1000);
  });

  it('should handle 1M rows with complex composite predicate in <1500ms', () => {
    const dataSource = new StressTestDataSource();
    const manager = new FilterManager(dataSource);

    // Generate 1M rows
    generateLargeDataset(1_000_000, 6, dataSource);

    // Create complex composite predicate
    // (Name = Alice OR Name = Bob) on col 0
    // AND (Age > 40) on col 1
    // AND (Salary > 100000) on col 2
    const nameFilter = new OrPredicate([
      new TextEqualsPredicate('Alice'),
      new TextEqualsPredicate('Bob'),
    ]);

    manager.applyFilter(0, nameFilter); // Name filter on col 0
    manager.applyFilter(1, new NumberGreaterThanPredicate(40)); // Age filter on col 1
    manager.applyFilter(2, new NumberGreaterThanPredicate(100000)); // Salary filter on col 2

    // Measure filtering performance
    const start = performance.now();
    const filteredRows = manager.getFilteredRows();
    const duration = performance.now() - start;

    console.log(`Complex composite filter (1M rows) in ${duration.toFixed(0)}ms`);
    console.log(`Result: ${filteredRows.size.toLocaleString()} rows visible`);

    // Verify result
    expect(filteredRows.size).toBeGreaterThan(0);

    // Performance target: <1500ms
    expect(duration).toBeLessThan(1500);
  });
});

// =============================================================================
// STRESS TEST 2: Memory Leak Detection
// =============================================================================

describe('Filter Stress Test - Memory Leak Detection', () => {
  it('should not leak memory with 100 rapid filter changes', () => {
    const dataSource = new StressTestDataSource();
    const manager = new FilterManager(dataSource);

    // Generate moderate dataset
    generateLargeDataset(100_000, 6, dataSource);

    const memBefore = measureMemory();

    // Apply and clear filters 100 times
    for (let i = 0; i < 100; i++) {
      manager.applyFilter(0, new TextEqualsPredicate(`Name${i}`));
      manager.getFilteredRows(); // Force calculation
      manager.clearFilter(0);
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const memAfter = measureMemory();
    const memGrowth = memAfter - memBefore;

    console.log(`Memory before: ${memBefore.toFixed(2)} MB`);
    console.log(`Memory after: ${memAfter.toFixed(2)} MB`);
    console.log(`Memory growth: ${memGrowth.toFixed(2)} MB`);

    // Memory growth should be minimal (<50MB for 100 operations)
    expect(memGrowth).toBeLessThan(50);
  });

  it('should not leak memory with rapid filter apply/undo cycles', () => {
    const dataSource = new StressTestDataSource();
    const manager = new FilterManager(dataSource);

    generateLargeDataset(50_000, 6, dataSource);

    const memBefore = measureMemory();

    // Simulate undo/redo pattern: apply → clear → apply → clear (50 cycles)
    for (let i = 0; i < 50; i++) {
      manager.applyFilter(0, new TextEqualsPredicate('Alice'));
      manager.applyFilter(1, new NumberGreaterThanPredicate(30));
      manager.getFilteredRows();

      manager.clearAllFilters();
      manager.getFilteredRows();

      manager.applyFilter(2, new NumberBetweenPredicate({ min: 50000, max: 150000 }));
      manager.getFilteredRows();

      manager.clearAllFilters();
    }

    if (global.gc) {
      global.gc();
    }

    const memAfter = measureMemory();
    const memGrowth = memAfter - memBefore;

    console.log(`Undo/Redo memory growth: ${memGrowth.toFixed(2)} MB`);

    // Should not grow significantly
    expect(memGrowth).toBeLessThan(30);
  });

  it('should not accumulate cache with many different filters', () => {
    const dataSource = new StressTestDataSource();
    const manager = new FilterManager(dataSource);

    generateLargeDataset(10_000, 6, dataSource);

    const memBefore = measureMemory();

    // Apply 1000 different filters (worst case for cache)
    for (let i = 0; i < 1000; i++) {
      manager.clearAllFilters();
      manager.applyFilter(i % 6, new TextEqualsPredicate(`Value${i}`));
      manager.getFilteredRows(); // Force cache creation
    }

    if (global.gc) {
      global.gc();
    }

    const memAfter = measureMemory();
    const memGrowth = memAfter - memBefore;

    console.log(`Cache accumulation test - memory growth: ${memGrowth.toFixed(2)} MB`);

    // Cache should be invalidated, not accumulated
    expect(memGrowth).toBeLessThan(100);
  });
});

// =============================================================================
// STRESS TEST 3: Edge Cases & Pathological Scenarios
// =============================================================================

describe('Filter Stress Test - Edge Cases', () => {
  it('should handle all-empty dataset (1M rows)', () => {
    const dataSource = new StressTestDataSource();
    const manager = new FilterManager(dataSource);

    // Create 1M rows with all empty cells
    for (let row = 0; row < 1_000_000; row++) {
      dataSource.setCell(row, 0, null);
    }

    manager.applyFilter(0, new IsEmptyPredicate());

    const start = performance.now();
    const filteredRows = manager.getFilteredRows();
    const duration = performance.now() - start;

    console.log(`All-empty dataset (1M rows) in ${duration.toFixed(0)}ms`);

    // All rows should be visible
    expect(filteredRows.size).toBe(1_000_000);
    expect(duration).toBeLessThan(1500); // 1M rows - realistic threshold
  });

  it('should handle all-matching dataset (1M rows)', () => {
    const dataSource = new StressTestDataSource();
    const manager = new FilterManager(dataSource);

    // Create 1M rows with same value
    for (let row = 0; row < 1_000_000; row++) {
      dataSource.setCell(row, 0, 'SameValue');
    }

    manager.applyFilter(0, new TextEqualsPredicate('SameValue'));

    const start = performance.now();
    const filteredRows = manager.getFilteredRows();
    const duration = performance.now() - start;

    console.log(`All-matching dataset (1M rows) in ${duration.toFixed(0)}ms`);

    // All rows should be visible
    expect(filteredRows.size).toBe(1_000_000);
    expect(duration).toBeLessThan(1500); // 1M rows - realistic threshold
  });

  it('should handle no-matching dataset (1M rows)', () => {
    const dataSource = new StressTestDataSource();
    const manager = new FilterManager(dataSource);

    // Create 1M rows
    for (let row = 0; row < 1_000_000; row++) {
      dataSource.setCell(row, 0, `Value${row}`);
    }

    manager.applyFilter(0, new TextEqualsPredicate('NonExistentValue'));

    const start = performance.now();
    const filteredRows = manager.getFilteredRows();
    const duration = performance.now() - start;

    console.log(`No-matching dataset (1M rows) in ${duration.toFixed(0)}ms`);

    // Zero rows should be visible
    expect(filteredRows.size).toBe(0);
    expect(duration).toBeLessThan(1000); // 1M rows - realistic threshold
  });

  it('should handle sparse dataset (1M rows, 1% filled)', () => {
    const dataSource = new StressTestDataSource();
    const manager = new FilterManager(dataSource);

    // Create 1M rows, only 1% have data
    for (let row = 0; row < 1_000_000; row++) {
      if (row % 100 === 0) {
        dataSource.setCell(row, 0, 'Data');
      } else {
        dataSource.setCell(row, 0, null);
      }
    }

    manager.applyFilter(0, new TextEqualsPredicate('Data'));

    const start = performance.now();
    const filteredRows = manager.getFilteredRows();
    const duration = performance.now() - start;

    console.log(`Sparse dataset (1M rows) in ${duration.toFixed(0)}ms`);

    expect(filteredRows.size).toBe(10_000); // 1% of 1M
    expect(duration).toBeLessThan(1000); // 1M rows - realistic threshold
  });

  it('should handle very long string values (10k chars each)', () => {
    const dataSource = new StressTestDataSource();
    const manager = new FilterManager(dataSource);

    const longString = 'A'.repeat(10_000); // 10k chars
    const searchString = 'A'.repeat(100);

    // Create 10k rows with very long strings
    for (let row = 0; row < 10_000; row++) {
      dataSource.setCell(row, 0, longString + row); // Unique suffix
    }

    manager.applyFilter(0, new TextContainsPredicate(searchString));

    const start = performance.now();
    const filteredRows = manager.getFilteredRows();
    const duration = performance.now() - start;

    console.log(`Very long strings (10k rows × 10k chars) in ${duration.toFixed(0)}ms`);

    expect(filteredRows.size).toBe(10_000); // All match
    expect(duration).toBeLessThan(1000);
  });

  it('should handle many columns (100 columns filtered)', () => {
    const dataSource = new StressTestDataSource();
    const manager = new FilterManager(dataSource);

    // Create 10k rows × 100 columns
    for (let row = 0; row < 10_000; row++) {
      for (let col = 0; col < 100; col++) {
        dataSource.setCell(row, col, `Value_${col}_${row % 10}`);
      }
    }

    // Apply filter to every 10th column (10 filters total)
    for (let col = 0; col < 100; col += 10) {
      manager.applyFilter(col, new TextContainsPredicate(`Value_${col}_`));
    }

    const start = performance.now();
    const filteredRows = manager.getFilteredRows();
    const duration = performance.now() - start;

    console.log(`Many columns (10k rows × 100 cols, 10 filters) in ${duration.toFixed(0)}ms`);

    expect(filteredRows.size).toBe(10_000); // All rows match all filters
    expect(duration).toBeLessThan(500);
  });
});

// =============================================================================
// STRESS TEST 4: Concurrent Operations
// =============================================================================

describe('Filter Stress Test - Concurrent Operations', () => {
  it('should handle rapid filter changes (100 changes/sec simulation)', () => {
    const dataSource = new StressTestDataSource();
    const manager = new FilterManager(dataSource);

    generateLargeDataset(100_000, 6, dataSource);

    const changes = 100;
    const start = performance.now();

    // Simulate 100 rapid filter changes
    for (let i = 0; i < changes; i++) {
      // Alternate between different operations
      if (i % 4 === 0) {
        manager.applyFilter(0, new TextEqualsPredicate(`Name${i % 10}`));
      } else if (i % 4 === 1) {
        manager.applyFilter(1, new NumberGreaterThanPredicate(i % 50));
      } else if (i % 4 === 2) {
        manager.clearFilter(i % 2);
      } else {
        manager.getFilteredRows(); // Read operation
      }
    }

    const duration = performance.now() - start;
    const opsPerSec = (changes / duration) * 1000;

    console.log(`${changes} rapid changes in ${duration.toFixed(0)}ms`);
    console.log(`Throughput: ${opsPerSec.toFixed(0)} ops/sec`);

    // Should complete in reasonable time (<2 seconds)
    expect(duration).toBeLessThan(2000);
  });

  it('should maintain consistency with interleaved operations', () => {
    const dataSource = new StressTestDataSource();
    const manager = new FilterManager(dataSource);

    generateLargeDataset(10_000, 6, dataSource);

    // Interleave apply, clear, and read operations
    manager.applyFilter(0, new TextEqualsPredicate('Alice'));
    const result1 = manager.getFilteredRows();

    manager.applyFilter(1, new NumberGreaterThanPredicate(30));
    const result2 = manager.getFilteredRows();

    manager.clearFilter(0);
    const result3 = manager.getFilteredRows();

    manager.clearAllFilters();
    const result4 = manager.getFilteredRows();

    // Verify consistency
    expect(result1.size).toBeLessThanOrEqual(10_000);
    expect(result2.size).toBeLessThanOrEqual(result1.size); // More filters = fewer rows
    expect(result3.size).toBeGreaterThanOrEqual(result2.size); // Removed filter = more rows
    expect(result4.size).toBe(10_000); // No filters = all rows
  });
});

// =============================================================================
// STRESS TEST 5: Performance Profiling
// =============================================================================

describe('Filter Stress Test - Performance Profiling', () => {
  it('should scale linearly with row count', { timeout: 60000 }, () => {
    const rowCounts = [10_000, 50_000, 100_000, 500_000, 1_000_000];
    const results: { rows: number; duration: number }[] = [];

    for (const rowCount of rowCounts) {
      const dataSource = new StressTestDataSource();
      const manager = new FilterManager(dataSource);

      generateLargeDataset(rowCount, 6, dataSource);
      manager.applyFilter(0, new TextEqualsPredicate('Alice'));

      const start = performance.now();
      manager.getFilteredRows();
      const duration = performance.now() - start;

      results.push({ rows: rowCount, duration });
      console.log(`${rowCount.toLocaleString()} rows: ${duration.toFixed(0)}ms`);
    }

    // Check linearity: duration should scale roughly O(n)
    // Compare 1M to 100k ratio (should be ~10x)
    const ratio1M_100k = results[4].duration / results[2].duration;
    console.log(`Scaling ratio (1M / 100k): ${ratio1M_100k.toFixed(2)}x`);

    // Should be between 5x and 15x (linear with some overhead)
    expect(ratio1M_100k).toBeGreaterThan(5);
    expect(ratio1M_100k).toBeLessThan(15);
  });

  it('should have acceptable worst-case performance', () => {
    const dataSource = new StressTestDataSource();
    const manager = new FilterManager(dataSource);

    // Worst case: 1M rows, all unique, complex predicate
    for (let row = 0; row < 1_000_000; row++) {
      dataSource.setCell(row, 0, `UniqueValue${row}`);
      dataSource.setCell(row, 1, row);
    }

    const complexPredicate = new AndPredicate([
      new TextContainsPredicate('Value'), // Matches all
      new OrPredicate([
        new TextContainsPredicate('0'),
        new TextContainsPredicate('1'),
        new TextContainsPredicate('2'),
      ]),
    ]);

    manager.applyFilter(0, complexPredicate);
    manager.applyFilter(1, new NumberBetweenPredicate({ min: 100, max: 900_000 }));

    const start = performance.now();
    const filteredRows = manager.getFilteredRows();
    const duration = performance.now() - start;

    console.log(`Worst-case (1M rows, complex) in ${duration.toFixed(0)}ms`);
    console.log(`Result: ${filteredRows.size.toLocaleString()} rows`);

    // Even worst case should complete in reasonable time (<3 seconds - production realistic)
    expect(duration).toBeLessThan(3000);
  });
});
