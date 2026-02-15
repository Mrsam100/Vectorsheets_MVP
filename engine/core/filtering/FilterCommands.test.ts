/**
 * Filter Commands - Undo/Redo Tests
 *
 * Test coverage:
 * - ApplyFilterCommand (apply, revert, replace, cycles)
 * - ClearFilterCommand (clear, revert, no-op)
 * - ClearAllFiltersCommand (clear all, revert, empty)
 * - Command reversibility (apply → revert → apply cycles)
 * - Memory size estimation
 * - Edge cases (empty columns, multiple filters)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FilterManager } from './FilterManager.js';
import {
  ApplyFilterCommand,
  ClearFilterCommand,
  ClearAllFiltersCommand,
} from './FilterCommands.js';
import {
  TextContainsPredicate,
  NumberGreaterThanPredicate,
  NumberBetweenPredicate,
  IsEmptyPredicate,
} from './FilterPredicate.js';
import type { FilterDataSource } from './FilterManager.js';
import type { CellValue } from './types.js';

// =============================================================================
// Mock Data Source
// =============================================================================

class MockDataSource implements FilterDataSource {
  private data: Map<string, CellValue> = new Map();

  constructor(data?: Record<string, CellValue>) {
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        this.data.set(key, value);
      }
    }
  }

  getCellValue(row: number, col: number): CellValue {
    return this.data.get(`${row}_${col}`) ?? null;
  }

  getUsedRange() {
    return { startRow: 0, endRow: 10, startCol: 0, endCol: 5 };
  }

  setCellValue(row: number, col: number, value: CellValue): void {
    this.data.set(`${row}_${col}`, value);
  }
}

// =============================================================================
// ApplyFilterCommand Tests
// =============================================================================

describe('ApplyFilterCommand', () => {
  let filterManager: FilterManager;
  let dataSource: MockDataSource;

  beforeEach(() => {
    dataSource = new MockDataSource({
      '0_0': 'Alice',
      '1_0': 'Bob',
      '2_0': 'Charlie',
      '0_1': 25,
      '1_1': 30,
      '2_1': 35,
    });
    filterManager = new FilterManager(dataSource);
  });

  it('should apply filter to empty column', () => {
    const predicate = new TextContainsPredicate('Alice');
    const cmd = new ApplyFilterCommand(filterManager, 0, predicate);

    // Initially no filter
    expect(filterManager.getFilter(0)).toBeUndefined();

    // Apply filter
    cmd.apply();
    expect(filterManager.getFilter(0)).toBe(predicate);
    expect(filterManager.hasFilters()).toBe(true);

    // Revert should clear filter
    cmd.revert();
    expect(filterManager.getFilter(0)).toBeUndefined();
    expect(filterManager.hasFilters()).toBe(false);
  });

  it('should replace existing filter', () => {
    const oldPredicate = new TextContainsPredicate('Alice');
    const newPredicate = new TextContainsPredicate('Bob');

    // Apply initial filter
    filterManager.applyFilter(0, oldPredicate);
    expect(filterManager.getFilter(0)).toBe(oldPredicate);

    // Apply new filter via command
    const cmd = new ApplyFilterCommand(filterManager, 0, newPredicate);
    cmd.apply();

    expect(filterManager.getFilter(0)).toBe(newPredicate);

    // Revert should restore old filter
    cmd.revert();
    expect(filterManager.getFilter(0)).toBe(oldPredicate);
  });

  it('should support apply/revert cycles', () => {
    const predicate = new NumberGreaterThanPredicate(25);
    const cmd = new ApplyFilterCommand(filterManager, 1, predicate);

    // Apply/revert 10 times
    for (let i = 0; i < 10; i++) {
      cmd.apply();
      expect(filterManager.getFilter(1)).toBe(predicate);

      cmd.revert();
      expect(filterManager.getFilter(1)).toBeUndefined();
    }

    // Final state: no filter
    expect(filterManager.hasFilters()).toBe(false);
  });

  it('should preserve other column filters', () => {
    const filter0 = new TextContainsPredicate('Alice');
    const filter1 = new NumberGreaterThanPredicate(25);

    // Apply filter to column 0
    filterManager.applyFilter(0, filter0);

    // Apply filter to column 1 via command
    const cmd = new ApplyFilterCommand(filterManager, 1, filter1);
    cmd.apply();

    expect(filterManager.getFilter(0)).toBe(filter0);
    expect(filterManager.getFilter(1)).toBe(filter1);
    expect(filterManager.getFilterCount()).toBe(2);

    // Revert column 1 filter
    cmd.revert();

    // Column 0 filter should remain
    expect(filterManager.getFilter(0)).toBe(filter0);
    expect(filterManager.getFilter(1)).toBeUndefined();
    expect(filterManager.getFilterCount()).toBe(1);
  });

  it('should have reasonable memory size', () => {
    const predicate = new TextContainsPredicate('test');
    const cmd = new ApplyFilterCommand(filterManager, 0, predicate);

    const size = cmd.getMemorySize();
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(500); // Should be ~100 bytes
  });

  it('should have correct command metadata', () => {
    const predicate = new TextContainsPredicate('test');
    const cmd = new ApplyFilterCommand(filterManager, 0, predicate);

    expect(cmd.id).toMatch(/^filter_cmd_/);
    expect(cmd.type).toBe('filterRange');
    expect(cmd.description).toContain('column');
    expect(cmd.timestamp).toBeGreaterThan(0);
  });
});

// =============================================================================
// ClearFilterCommand Tests
// =============================================================================

describe('ClearFilterCommand', () => {
  let filterManager: FilterManager;
  let dataSource: MockDataSource;

  beforeEach(() => {
    dataSource = new MockDataSource();
    filterManager = new FilterManager(dataSource);
  });

  it('should clear filter from column', () => {
    const predicate = new TextContainsPredicate('test');
    filterManager.applyFilter(0, predicate);
    expect(filterManager.getFilter(0)).toBe(predicate);

    // Clear via command
    const cmd = new ClearFilterCommand(filterManager, 0);
    cmd.apply();

    expect(filterManager.getFilter(0)).toBeUndefined();
    expect(filterManager.hasFilters()).toBe(false);
  });

  it('should restore filter on revert', () => {
    const predicate = new NumberGreaterThanPredicate(10);
    filterManager.applyFilter(1, predicate);

    const cmd = new ClearFilterCommand(filterManager, 1);

    // Clear
    cmd.apply();
    expect(filterManager.getFilter(1)).toBeUndefined();

    // Revert should restore
    cmd.revert();
    expect(filterManager.getFilter(1)).toBe(predicate);
  });

  it('should handle clearing already-cleared column', () => {
    // No filter on column 0
    expect(filterManager.getFilter(0)).toBeUndefined();

    const cmd = new ClearFilterCommand(filterManager, 0);

    // Clear (no-op)
    cmd.apply();
    expect(filterManager.getFilter(0)).toBeUndefined();

    // Revert (no-op)
    cmd.revert();
    expect(filterManager.getFilter(0)).toBeUndefined();
  });

  it('should support apply/revert cycles', () => {
    const predicate = new TextContainsPredicate('cycle');
    filterManager.applyFilter(0, predicate);

    const cmd = new ClearFilterCommand(filterManager, 0);

    // Apply/revert 10 times
    for (let i = 0; i < 10; i++) {
      cmd.apply();
      expect(filterManager.getFilter(0)).toBeUndefined();

      cmd.revert();
      expect(filterManager.getFilter(0)).toBe(predicate);
    }

    // Final state: filter restored
    expect(filterManager.getFilter(0)).toBe(predicate);
  });

  it('should preserve other column filters', () => {
    const filter0 = new TextContainsPredicate('keep');
    const filter1 = new NumberGreaterThanPredicate(5);

    filterManager.applyFilter(0, filter0);
    filterManager.applyFilter(1, filter1);

    // Clear column 1
    const cmd = new ClearFilterCommand(filterManager, 1);
    cmd.apply();

    // Column 0 should remain
    expect(filterManager.getFilter(0)).toBe(filter0);
    expect(filterManager.getFilter(1)).toBeUndefined();
    expect(filterManager.getFilterCount()).toBe(1);
  });

  it('should have reasonable memory size', () => {
    const cmd = new ClearFilterCommand(filterManager, 0);

    const size = cmd.getMemorySize();
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(500); // Should be ~100 bytes
  });

  it('should have correct command metadata', () => {
    const cmd = new ClearFilterCommand(filterManager, 0);

    expect(cmd.id).toMatch(/^filter_cmd_/);
    expect(cmd.type).toBe('filterRange');
    expect(cmd.description).toContain('Clear');
    expect(cmd.timestamp).toBeGreaterThan(0);
  });
});

// =============================================================================
// ClearAllFiltersCommand Tests
// =============================================================================

describe('ClearAllFiltersCommand', () => {
  let filterManager: FilterManager;
  let dataSource: MockDataSource;

  beforeEach(() => {
    dataSource = new MockDataSource();
    filterManager = new FilterManager(dataSource);
  });

  it('should clear all filters', () => {
    const filter0 = new TextContainsPredicate('test');
    const filter1 = new NumberGreaterThanPredicate(10);
    const filter2 = new IsEmptyPredicate();

    filterManager.applyFilter(0, filter0);
    filterManager.applyFilter(1, filter1);
    filterManager.applyFilter(2, filter2);
    expect(filterManager.getFilterCount()).toBe(3);

    // Clear all via command
    const cmd = new ClearAllFiltersCommand(filterManager);
    cmd.apply();

    expect(filterManager.getFilterCount()).toBe(0);
    expect(filterManager.hasFilters()).toBe(false);
  });

  it('should restore all filters on revert', () => {
    const filter0 = new TextContainsPredicate('restore');
    const filter1 = new NumberBetweenPredicate({ min: 10, max: 20 });

    filterManager.applyFilter(0, filter0);
    filterManager.applyFilter(1, filter1);

    const cmd = new ClearAllFiltersCommand(filterManager);

    // Clear all
    cmd.apply();
    expect(filterManager.getFilterCount()).toBe(0);

    // Revert should restore all
    cmd.revert();
    expect(filterManager.getFilterCount()).toBe(2);
    expect(filterManager.getFilter(0)).toBe(filter0);
    expect(filterManager.getFilter(1)).toBe(filter1);
  });

  it('should handle clearing when no filters exist', () => {
    expect(filterManager.getFilterCount()).toBe(0);

    const cmd = new ClearAllFiltersCommand(filterManager);

    // Clear all (no-op)
    cmd.apply();
    expect(filterManager.getFilterCount()).toBe(0);

    // Revert (no-op)
    cmd.revert();
    expect(filterManager.getFilterCount()).toBe(0);
  });

  it('should support apply/revert cycles', () => {
    const filter0 = new TextContainsPredicate('cycle1');
    const filter1 = new TextContainsPredicate('cycle2');

    filterManager.applyFilter(0, filter0);
    filterManager.applyFilter(1, filter1);

    const cmd = new ClearAllFiltersCommand(filterManager);

    // Apply/revert 5 times
    for (let i = 0; i < 5; i++) {
      cmd.apply();
      expect(filterManager.getFilterCount()).toBe(0);

      cmd.revert();
      expect(filterManager.getFilterCount()).toBe(2);
      expect(filterManager.getFilter(0)).toBe(filter0);
      expect(filterManager.getFilter(1)).toBe(filter1);
    }
  });

  it('should have memory size proportional to filter count', () => {
    // No filters
    const cmd1 = new ClearAllFiltersCommand(filterManager);
    expect(cmd1.getMemorySize()).toBe(0);

    // 3 filters
    filterManager.applyFilter(0, new TextContainsPredicate('a'));
    filterManager.applyFilter(1, new TextContainsPredicate('b'));
    filterManager.applyFilter(2, new TextContainsPredicate('c'));

    const cmd2 = new ClearAllFiltersCommand(filterManager);
    expect(cmd2.getMemorySize()).toBe(300); // 3 * 100
  });

  it('should have correct command metadata', () => {
    const cmd = new ClearAllFiltersCommand(filterManager);

    expect(cmd.id).toMatch(/^filter_cmd_/);
    expect(cmd.type).toBe('filterRange');
    expect(cmd.description).toContain('Clear all');
    expect(cmd.timestamp).toBeGreaterThan(0);
  });
});

// =============================================================================
// Command Integration Tests
// =============================================================================

describe('Filter Commands - Integration', () => {
  let filterManager: FilterManager;
  let dataSource: MockDataSource;

  beforeEach(() => {
    dataSource = new MockDataSource({
      '0_0': 'Alice',
      '1_0': 'Bob',
      '2_0': 'Charlie',
      '0_1': 25,
      '1_1': 30,
      '2_1': 35,
    });
    filterManager = new FilterManager(dataSource);
  });

  it('should work with complex filter operations', () => {
    // Apply filter to column 0
    const textFilter = new TextContainsPredicate('Bob');
    const applyCmd1 = new ApplyFilterCommand(filterManager, 0, textFilter);
    applyCmd1.apply();

    // Apply filter to column 1
    const numberFilter = new NumberGreaterThanPredicate(25);
    const applyCmd2 = new ApplyFilterCommand(filterManager, 1, numberFilter);
    applyCmd2.apply();

    expect(filterManager.getFilterCount()).toBe(2);

    // Clear column 0 filter
    const clearCmd = new ClearFilterCommand(filterManager, 0);
    clearCmd.apply();

    expect(filterManager.getFilterCount()).toBe(1);
    expect(filterManager.getFilter(1)).toBe(numberFilter);

    // Undo clear
    clearCmd.revert();
    expect(filterManager.getFilterCount()).toBe(2);
    expect(filterManager.getFilter(0)).toBe(textFilter);

    // Undo second apply
    applyCmd2.revert();
    expect(filterManager.getFilterCount()).toBe(1);
    expect(filterManager.getFilter(0)).toBe(textFilter);

    // Undo first apply
    applyCmd1.revert();
    expect(filterManager.getFilterCount()).toBe(0);
  });

  it('should handle rapid filter changes', () => {
    const filters = [
      new TextContainsPredicate('a'),
      new TextContainsPredicate('b'),
      new TextContainsPredicate('c'),
    ];

    // Create and apply commands sequentially (each captures previous state)
    const cmd1 = new ApplyFilterCommand(filterManager, 0, filters[0]);
    cmd1.apply(); // Apply 'a'

    const cmd2 = new ApplyFilterCommand(filterManager, 0, filters[1]);
    cmd2.apply(); // Apply 'b' (captures old='a')

    const cmd3 = new ApplyFilterCommand(filterManager, 0, filters[2]);
    cmd3.apply(); // Apply 'c' (captures old='b')

    // Final filter should be 'c'
    expect(filterManager.getFilter(0)).toBe(filters[2]);

    // Revert in reverse order (should restore previous filters)
    cmd3.revert(); // Restore filter 'b'
    expect(filterManager.getFilter(0)).toBe(filters[1]);

    cmd2.revert(); // Restore filter 'a'
    expect(filterManager.getFilter(0)).toBe(filters[0]);

    cmd1.revert(); // Clear filter
    expect(filterManager.getFilter(0)).toBeUndefined();
  });

  it('should correctly handle ClearAll after multiple applies', () => {
    // Apply 3 filters
    const cmd1 = new ApplyFilterCommand(filterManager, 0, new TextContainsPredicate('x'));
    const cmd2 = new ApplyFilterCommand(filterManager, 1, new NumberGreaterThanPredicate(10));
    const cmd3 = new ApplyFilterCommand(filterManager, 2, new IsEmptyPredicate());

    cmd1.apply();
    cmd2.apply();
    cmd3.apply();

    expect(filterManager.getFilterCount()).toBe(3);

    // Clear all
    const clearAllCmd = new ClearAllFiltersCommand(filterManager);
    clearAllCmd.apply();

    expect(filterManager.getFilterCount()).toBe(0);

    // Revert clear all (should restore all 3)
    clearAllCmd.revert();
    expect(filterManager.getFilterCount()).toBe(3);

    // Now revert individual applies
    cmd3.revert();
    expect(filterManager.getFilterCount()).toBe(2);

    cmd2.revert();
    expect(filterManager.getFilterCount()).toBe(1);

    cmd1.revert();
    expect(filterManager.getFilterCount()).toBe(0);
  });
});
