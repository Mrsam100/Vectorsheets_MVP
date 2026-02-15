/**
 * Filter Manager Tests
 * Comprehensive test suite for FilterManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FilterManager } from './FilterManager';
import type { FilterDataSource } from './FilterManager';
import {
  TextContainsPredicate,
  TextEqualsPredicate,
  NumberGreaterThanPredicate,
  NumberLessThanPredicate,
  NumberBetweenPredicate,
  IsEmptyPredicate,
  IsNotEmptyPredicate,
  AndPredicate,
} from './FilterPredicate';
import type { CellValue } from './types';

// ===========================================================================
// Mock Data Source
// ===========================================================================

class MockDataSource implements FilterDataSource {
  private data: Map<string, CellValue> = new Map();
  private maxRow: number = 0;
  private maxCol: number = 0;

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
}

// ===========================================================================
// Filter Management
// ===========================================================================

describe('FilterManager - Filter Management', () => {
  let dataSource: MockDataSource;
  let manager: FilterManager;

  beforeEach(() => {
    dataSource = new MockDataSource();
    manager = new FilterManager(dataSource);
  });

  describe('applyFilter', () => {
    it('should apply filter to column', () => {
      const predicate = new TextContainsPredicate('test');
      manager.applyFilter(0, predicate);

      expect(manager.getFilter(0)).toBe(predicate);
      expect(manager.hasFilters()).toBe(true);
      expect(manager.getFilterCount()).toBe(1);
    });

    it('should replace existing filter on same column', () => {
      const predicate1 = new TextContainsPredicate('test');
      const predicate2 = new TextContainsPredicate('other');

      manager.applyFilter(0, predicate1);
      manager.applyFilter(0, predicate2);

      expect(manager.getFilter(0)).toBe(predicate2);
      expect(manager.getFilterCount()).toBe(1);
    });

    it('should support multiple columns', () => {
      const predicate1 = new TextContainsPredicate('test');
      const predicate2 = new NumberGreaterThanPredicate(10);

      manager.applyFilter(0, predicate1);
      manager.applyFilter(1, predicate2);

      expect(manager.getFilterCount()).toBe(2);
      expect(manager.getFilter(0)).toBe(predicate1);
      expect(manager.getFilter(1)).toBe(predicate2);
    });

    it('should throw on invalid column', () => {
      const predicate = new TextContainsPredicate('test');
      expect(() => manager.applyFilter(-1, predicate)).toThrow();
    });

    it('should invalidate cache', () => {
      dataSource.setCell(0, 0, 'test');
      const predicate = new TextContainsPredicate('test');

      // Calculate initial filtered rows (caches result)
      manager.getFilteredRows();

      // Apply filter should invalidate cache
      manager.applyFilter(0, predicate);

      // Should recalculate
      const rows = manager.getFilteredRows();
      expect(rows.has(0)).toBe(true);
    });
  });

  describe('clearFilter', () => {
    it('should clear filter from specific column', () => {
      const predicate = new TextContainsPredicate('test');
      manager.applyFilter(0, predicate);

      const removed = manager.clearFilter(0);

      expect(removed).toBe(true);
      expect(manager.getFilter(0)).toBeUndefined();
      expect(manager.hasFilters()).toBe(false);
    });

    it('should return false if no filter on column', () => {
      const removed = manager.clearFilter(0);
      expect(removed).toBe(false);
    });

    it('should not affect other columns', () => {
      const predicate1 = new TextContainsPredicate('test');
      const predicate2 = new NumberGreaterThanPredicate(10);

      manager.applyFilter(0, predicate1);
      manager.applyFilter(1, predicate2);

      manager.clearFilter(0);

      expect(manager.getFilter(0)).toBeUndefined();
      expect(manager.getFilter(1)).toBe(predicate2);
      expect(manager.getFilterCount()).toBe(1);
    });
  });

  describe('clearAllFilters', () => {
    it('should clear all filters', () => {
      manager.applyFilter(0, new TextContainsPredicate('test'));
      manager.applyFilter(1, new NumberGreaterThanPredicate(10));
      manager.applyFilter(2, new IsEmptyPredicate());

      manager.clearAllFilters();

      expect(manager.hasFilters()).toBe(false);
      expect(manager.getFilterCount()).toBe(0);
      expect(manager.getAllFilters()).toHaveLength(0);
    });

    it('should do nothing if no filters', () => {
      manager.clearAllFilters();
      expect(manager.hasFilters()).toBe(false);
    });
  });

  describe('getAllFilters', () => {
    it('should return all active filters', () => {
      const predicate1 = new TextContainsPredicate('test');
      const predicate2 = new NumberGreaterThanPredicate(10);

      manager.applyFilter(0, predicate1);
      manager.applyFilter(2, predicate2);

      const filters = manager.getAllFilters();

      expect(filters).toHaveLength(2);
      expect(filters[0].column).toBe(0);
      expect(filters[0].predicate).toBe(predicate1);
      expect(filters[1].column).toBe(2);
      expect(filters[1].predicate).toBe(predicate2);
    });

    it('should return empty array if no filters', () => {
      expect(manager.getAllFilters()).toHaveLength(0);
    });
  });
});

// ===========================================================================
// Filtered Row Calculation
// ===========================================================================

describe('FilterManager - Filtered Row Calculation', () => {
  let dataSource: MockDataSource;
  let manager: FilterManager;

  beforeEach(() => {
    dataSource = new MockDataSource();
    manager = new FilterManager(dataSource);
  });

  describe('getFilteredRows - Single Column', () => {
    it('should return all rows when no filters', () => {
      dataSource.setCell(0, 0, 'a');
      dataSource.setCell(1, 0, 'b');
      dataSource.setCell(2, 0, 'c');

      const rows = manager.getFilteredRows();

      expect(rows.size).toBe(3);
      expect(rows.has(0)).toBe(true);
      expect(rows.has(1)).toBe(true);
      expect(rows.has(2)).toBe(true);
    });

    it('should filter rows by text predicate', () => {
      dataSource.setCell(0, 0, 'apple');
      dataSource.setCell(1, 0, 'banana');
      dataSource.setCell(2, 0, 'apricot');

      manager.applyFilter(0, new TextContainsPredicate('ap'));

      const rows = manager.getFilteredRows();

      expect(rows.size).toBe(2);
      expect(rows.has(0)).toBe(true); // apple
      expect(rows.has(1)).toBe(false); // banana
      expect(rows.has(2)).toBe(true); // apricot
    });

    it('should filter rows by number predicate', () => {
      dataSource.setCell(0, 0, 5);
      dataSource.setCell(1, 0, 15);
      dataSource.setCell(2, 0, 25);

      manager.applyFilter(0, new NumberGreaterThanPredicate(10));

      const rows = manager.getFilteredRows();

      expect(rows.size).toBe(2);
      expect(rows.has(0)).toBe(false);
      expect(rows.has(1)).toBe(true);
      expect(rows.has(2)).toBe(true);
    });

    it('should filter empty cells', () => {
      dataSource.setCell(0, 0, 'value');
      dataSource.setCell(1, 0, null);
      dataSource.setCell(2, 0, 'other');

      manager.applyFilter(0, new IsNotEmptyPredicate());

      const rows = manager.getFilteredRows();

      expect(rows.size).toBe(2);
      expect(rows.has(0)).toBe(true);
      expect(rows.has(1)).toBe(false);
      expect(rows.has(2)).toBe(true);
    });
  });

  describe('getFilteredRows - Multi-Column', () => {
    it('should apply AND logic across columns', () => {
      // Setup data: 3 rows, 2 columns
      dataSource.setCell(0, 0, 'apple');
      dataSource.setCell(0, 1, 15);

      dataSource.setCell(1, 0, 'banana');
      dataSource.setCell(1, 1, 25);

      dataSource.setCell(2, 0, 'apricot');
      dataSource.setCell(2, 1, 5);

      // Filter: col 0 contains 'ap' AND col 1 > 10
      manager.applyFilter(0, new TextContainsPredicate('ap'));
      manager.applyFilter(1, new NumberGreaterThanPredicate(10));

      const rows = manager.getFilteredRows();

      expect(rows.size).toBe(1);
      expect(rows.has(0)).toBe(true); // apple, 15 (passes both)
      expect(rows.has(1)).toBe(false); // banana (fails col 0)
      expect(rows.has(2)).toBe(false); // apricot, 5 (fails col 1)
    });

    it('should handle 3+ column filters', () => {
      dataSource.setCell(0, 0, 'apple');
      dataSource.setCell(0, 1, 15);
      dataSource.setCell(0, 2, 'red');

      dataSource.setCell(1, 0, 'banana');
      dataSource.setCell(1, 1, 25);
      dataSource.setCell(1, 2, 'yellow');

      dataSource.setCell(2, 0, 'apricot');
      dataSource.setCell(2, 1, 12);
      dataSource.setCell(2, 2, 'orange');

      // 3 filters
      manager.applyFilter(0, new TextContainsPredicate('ap'));
      manager.applyFilter(1, new NumberGreaterThanPredicate(10));
      manager.applyFilter(2, new TextEqualsPredicate('red'));

      const rows = manager.getFilteredRows();

      expect(rows.size).toBe(1);
      expect(rows.has(0)).toBe(true); // Only row 0 passes all 3
    });

    it('should return empty set if no rows match', () => {
      dataSource.setCell(0, 0, 'apple');
      dataSource.setCell(1, 0, 'banana');

      manager.applyFilter(0, new TextContainsPredicate('orange'));

      const rows = manager.getFilteredRows();
      expect(rows.size).toBe(0);
    });
  });

  describe('isRowVisible', () => {
    it('should check if row passes all filters', () => {
      dataSource.setCell(0, 0, 'apple');
      dataSource.setCell(0, 1, 15);

      manager.applyFilter(0, new TextContainsPredicate('ap'));
      manager.applyFilter(1, new NumberGreaterThanPredicate(10));

      expect(manager.isRowVisible(0)).toBe(true);
    });

    it('should return false if row fails any filter', () => {
      dataSource.setCell(0, 0, 'apple');
      dataSource.setCell(0, 1, 5); // Fails number filter

      manager.applyFilter(0, new TextContainsPredicate('ap'));
      manager.applyFilter(1, new NumberGreaterThanPredicate(10));

      expect(manager.isRowVisible(0)).toBe(false);
    });

    it('should return true when no filters', () => {
      dataSource.setCell(0, 0, 'anything');
      expect(manager.isRowVisible(0)).toBe(true);
    });
  });

  describe('getVisibleRowCount', () => {
    it('should return count of visible rows', () => {
      dataSource.setCell(0, 0, 'apple');
      dataSource.setCell(1, 0, 'banana');
      dataSource.setCell(2, 0, 'apricot');

      manager.applyFilter(0, new TextContainsPredicate('ap'));

      expect(manager.getVisibleRowCount()).toBe(2);
    });
  });
});

// ===========================================================================
// Cache Management
// ===========================================================================

describe('FilterManager - Cache Management', () => {
  let dataSource: MockDataSource;
  let manager: FilterManager;

  beforeEach(() => {
    dataSource = new MockDataSource();
    manager = new FilterManager(dataSource);
  });

  it('should cache filtered rows result', () => {
    dataSource.setCell(0, 0, 'test');
    manager.applyFilter(0, new TextContainsPredicate('test'));

    const rows1 = manager.getFilteredRows();
    const rows2 = manager.getFilteredRows();

    expect(rows1).toBe(rows2); // Same object reference (cached)
  });

  it('should invalidate cache when filter added', () => {
    dataSource.setCell(0, 0, 'test');

    const rows1 = manager.getFilteredRows();
    manager.applyFilter(0, new TextContainsPredicate('test'));
    const rows2 = manager.getFilteredRows();

    expect(rows1).not.toBe(rows2); // Different objects (cache invalidated)
  });

  it('should invalidate cache when filter removed', () => {
    dataSource.setCell(0, 0, 'test');
    manager.applyFilter(0, new TextContainsPredicate('test'));

    const rows1 = manager.getFilteredRows();
    manager.clearFilter(0);
    const rows2 = manager.getFilteredRows();

    expect(rows1).not.toBe(rows2);
  });

  it('should invalidate cache when all filters cleared', () => {
    dataSource.setCell(0, 0, 'test');
    manager.applyFilter(0, new TextContainsPredicate('test'));

    const rows1 = manager.getFilteredRows();
    manager.clearAllFilters();
    const rows2 = manager.getFilteredRows();

    expect(rows1).not.toBe(rows2);
  });

  it('should invalidate cache manually', () => {
    dataSource.setCell(0, 0, 'test');

    const rows1 = manager.getFilteredRows();
    manager.invalidateCache();
    const rows2 = manager.getFilteredRows();

    expect(rows1).not.toBe(rows2);
  });
});

// ===========================================================================
// React 18 Subscription
// ===========================================================================

describe('FilterManager - React 18 Subscription', () => {
  let dataSource: MockDataSource;
  let manager: FilterManager;

  beforeEach(() => {
    dataSource = new MockDataSource();
    manager = new FilterManager(dataSource);
  });

  it('should notify listeners when filter applied', () => {
    const listener = vi.fn();
    manager.subscribe(listener);

    manager.applyFilter(0, new TextContainsPredicate('test'));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should notify listeners when filter cleared', () => {
    const listener = vi.fn();
    manager.applyFilter(0, new TextContainsPredicate('test'));
    manager.subscribe(listener);

    manager.clearFilter(0);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should notify listeners when all filters cleared', () => {
    const listener = vi.fn();
    manager.applyFilter(0, new TextContainsPredicate('test'));
    manager.subscribe(listener);

    manager.clearAllFilters();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should not notify after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);

    unsubscribe();
    manager.applyFilter(0, new TextContainsPredicate('test'));

    expect(listener).not.toHaveBeenCalled();
  });

  it('should support multiple listeners', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    manager.subscribe(listener1);
    manager.subscribe(listener2);

    manager.applyFilter(0, new TextContainsPredicate('test'));

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('should increment version on changes', () => {
    const version1 = manager.getSnapshot();
    manager.applyFilter(0, new TextContainsPredicate('test'));
    const version2 = manager.getSnapshot();
    manager.clearFilter(0);
    const version3 = manager.getSnapshot();

    expect(version2).toBeGreaterThan(version1);
    expect(version3).toBeGreaterThan(version2);
  });

  it('should return same version when no changes', () => {
    const version1 = manager.getSnapshot();
    const version2 = manager.getSnapshot();

    expect(version1).toBe(version2);
  });
});

// ===========================================================================
// Serialization
// ===========================================================================

describe('FilterManager - Serialization', () => {
  let dataSource: MockDataSource;
  let manager: FilterManager;

  beforeEach(() => {
    dataSource = new MockDataSource();
    manager = new FilterManager(dataSource);
  });

  it('should serialize empty filter state', () => {
    const serialized = manager.serialize();

    expect(serialized.version).toBe('1.0');
    expect(serialized.filters).toHaveLength(0);
  });

  it('should serialize single filter', () => {
    manager.applyFilter(0, new TextContainsPredicate('test'));

    const serialized = manager.serialize();

    expect(serialized.filters).toHaveLength(1);
    expect(serialized.filters[0].column).toBe(0);
    expect(serialized.filters[0].predicate.type).toBe('text.contains');
  });

  it('should serialize multiple filters', () => {
    manager.applyFilter(0, new TextContainsPredicate('test'));
    manager.applyFilter(1, new NumberGreaterThanPredicate(10));
    manager.applyFilter(2, new IsEmptyPredicate());

    const serialized = manager.serialize();

    expect(serialized.filters).toHaveLength(3);
  });

  it('should deserialize filter state', () => {
    manager.applyFilter(0, new TextContainsPredicate('test'));
    manager.applyFilter(1, new NumberGreaterThanPredicate(10));

    const serialized = manager.serialize();

    // Create new manager
    const manager2 = new FilterManager(dataSource);
    manager2.deserialize(serialized);

    expect(manager2.getFilterCount()).toBe(2);
    expect(manager2.getFilter(0)?.type).toBe('text.contains');
    expect(manager2.getFilter(1)?.type).toBe('number.gt');
  });

  it('should clear existing filters on deserialize', () => {
    manager.applyFilter(0, new TextContainsPredicate('old'));
    manager.applyFilter(1, new NumberGreaterThanPredicate(5));

    const serialized = manager.serialize();
    manager.applyFilter(2, new IsEmptyPredicate()); // Add another filter

    manager.deserialize(serialized);

    expect(manager.getFilterCount()).toBe(2);
    expect(manager.getFilter(2)).toBeUndefined();
  });

  it('should preserve filter behavior through serialization', () => {
    dataSource.setCell(0, 0, 'apple');
    dataSource.setCell(1, 0, 'banana');

    manager.applyFilter(0, new TextContainsPredicate('ap'));

    const serialized = manager.serialize();

    const manager2 = new FilterManager(dataSource);
    manager2.deserialize(serialized);

    const rows = manager2.getFilteredRows();
    expect(rows.size).toBe(1);
    expect(rows.has(0)).toBe(true);
  });
});

// ===========================================================================
// Debug/Inspection
// ===========================================================================

describe('FilterManager - Debug/Inspection', () => {
  let dataSource: MockDataSource;
  let manager: FilterManager;

  beforeEach(() => {
    dataSource = new MockDataSource();
    manager = new FilterManager(dataSource);
  });

  describe('getFilterSummary', () => {
    it('should return empty array when no filters', () => {
      expect(manager.getFilterSummary()).toHaveLength(0);
    });

    it('should return filter descriptions', () => {
      manager.applyFilter(0, new TextContainsPredicate('test'));
      manager.applyFilter(1, new NumberGreaterThanPredicate(10));

      const summary = manager.getFilterSummary();

      expect(summary).toHaveLength(2);
      expect(summary[0].column).toBe(0);
      expect(summary[0].description).toContain('test');
      expect(summary[1].column).toBe(1);
      expect(summary[1].description).toContain('10');
    });
  });

  describe('getVersion', () => {
    it('should return current version', () => {
      const version1 = manager.getVersion();
      manager.applyFilter(0, new TextContainsPredicate('test'));
      const version2 = manager.getVersion();

      expect(version2).toBeGreaterThan(version1);
    });
  });
});

// ===========================================================================
// Edge Cases & Performance
// ===========================================================================

describe('FilterManager - Edge Cases', () => {
  let dataSource: MockDataSource;
  let manager: FilterManager;

  beforeEach(() => {
    dataSource = new MockDataSource();
    manager = new FilterManager(dataSource);
  });

  it('should handle sparse data', () => {
    dataSource.setCell(0, 0, 'test');
    dataSource.setCell(10, 0, 'test');
    dataSource.setCell(100, 0, 'test');

    manager.applyFilter(0, new TextContainsPredicate('test'));

    const rows = manager.getFilteredRows();
    expect(rows.size).toBe(3);
    expect(rows.has(0)).toBe(true);
    expect(rows.has(10)).toBe(true);
    expect(rows.has(100)).toBe(true);
  });

  it('should handle large datasets efficiently', () => {
    // Create 10k rows
    for (let i = 0; i < 10000; i++) {
      dataSource.setCell(i, 0, i % 2 === 0 ? 'even' : 'odd');
    }

    manager.applyFilter(0, new TextEqualsPredicate('even'));

    const start = performance.now();
    const rows = manager.getFilteredRows();
    const duration = performance.now() - start;

    expect(rows.size).toBe(5000);
    expect(duration).toBeLessThan(100); // Should be <100ms
  });

  it('should handle composite predicates', () => {
    dataSource.setCell(0, 0, 15);
    dataSource.setCell(1, 0, 5);
    dataSource.setCell(2, 0, 25);

    const composite = new AndPredicate([
      new NumberGreaterThanPredicate(10),
      new NumberLessThanPredicate(20),
    ]);

    manager.applyFilter(0, composite);

    const rows = manager.getFilteredRows();
    expect(rows.size).toBe(1);
    expect(rows.has(0)).toBe(true);
  });

  it('should not modify data source', () => {
    dataSource.setCell(0, 0, 'original');
    manager.applyFilter(0, new TextContainsPredicate('test'));
    manager.getFilteredRows();

    expect(dataSource.getCellValue(0, 0)).toBe('original');
  });
});
