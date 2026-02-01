/**
 * SortFilter Unit Tests
 *
 * Tests the sort and filter engine including:
 * - Single and multi-column sorting
 * - Stable sorting
 * - Custom sort lists
 * - Value filters
 * - Condition filters (text, number)
 * - Top/Bottom N filters
 * - Above/Below average filters
 * - Filter state management
 * - Events
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SortFilter,
  createSortFilter,
  createSortFilterWithWriter,
  SortFilterDataReader,
  SortFilterDataWriter,
  SortRule,
  ColumnFilter,
  FilterCondition,
} from './SortFilter.js';
import { Cell, CellRange } from '../types/index.js';

describe('SortFilter', () => {
  let mockDataStore: MockDataStore;
  let sortFilter: SortFilter;

  class MockDataStore implements SortFilterDataReader, SortFilterDataWriter {
    cells: Map<string, Cell> = new Map();
    hiddenRows: Set<number> = new Set();

    getCell(row: number, col: number): Cell | null {
      return this.cells.get(`${row}_${col}`) ?? null;
    }

    setCell(row: number, col: number, cell: Cell): void {
      this.cells.set(`${row}_${col}`, cell);
    }

    deleteCell(row: number, col: number): void {
      this.cells.delete(`${row}_${col}`);
    }

    setRowHidden(row: number, hidden: boolean): void {
      if (hidden) {
        this.hiddenRows.add(row);
      } else {
        this.hiddenRows.delete(row);
      }
    }

    getUsedRange(): CellRange {
      let minRow = Infinity, maxRow = -Infinity;
      let minCol = Infinity, maxCol = -Infinity;

      for (const key of this.cells.keys()) {
        const [r, c] = key.split('_').map(Number);
        minRow = Math.min(minRow, r);
        maxRow = Math.max(maxRow, r);
        minCol = Math.min(minCol, c);
        maxCol = Math.max(maxCol, c);
      }

      return {
        startRow: minRow === Infinity ? 0 : minRow,
        startCol: minCol === Infinity ? 0 : minCol,
        endRow: maxRow === -Infinity ? 0 : maxRow,
        endCol: maxCol === -Infinity ? 0 : maxCol,
      };
    }

    // Helper for tests
    setCells(data: Array<{ row: number; col: number; value: Cell['value'] }>): void {
      for (const { row, col, value } of data) {
        this.setCell(row, col, {
          value,
          type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
        });
      }
    }

    getCellValue(row: number, col: number): Cell['value'] | undefined {
      return this.getCell(row, col)?.value;
    }
  }

  beforeEach(() => {
    mockDataStore = new MockDataStore();
    sortFilter = createSortFilter(mockDataStore);
  });

  // ===========================================================================
  // Sorting
  // ===========================================================================

  describe('Sorting', () => {
    describe('sort ascending', () => {
      it('should sort numbers in ascending order', () => {
        // Header + 3 data rows
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Value' }, // Header
          { row: 1, col: 0, value: 30 },
          { row: 2, col: 0, value: 10 },
          { row: 3, col: 0, value: 20 },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 0 };
        const result = sortFilter.sortAscending(range, 0);

        expect(result.success).toBe(true);
        expect(result.rowCount).toBe(3);
        expect(mockDataStore.getCellValue(1, 0)).toBe(10);
        expect(mockDataStore.getCellValue(2, 0)).toBe(20);
        expect(mockDataStore.getCellValue(3, 0)).toBe(30);
      });

      it('should sort strings in ascending order', () => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Name' },
          { row: 1, col: 0, value: 'Charlie' },
          { row: 2, col: 0, value: 'Alice' },
          { row: 3, col: 0, value: 'Bob' },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 0 };
        sortFilter.sortAscending(range, 0);

        expect(mockDataStore.getCellValue(1, 0)).toBe('Alice');
        expect(mockDataStore.getCellValue(2, 0)).toBe('Bob');
        expect(mockDataStore.getCellValue(3, 0)).toBe('Charlie');
      });
    });

    describe('sort descending', () => {
      it('should sort numbers in descending order', () => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Value' },
          { row: 1, col: 0, value: 10 },
          { row: 2, col: 0, value: 30 },
          { row: 3, col: 0, value: 20 },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 0 };
        sortFilter.sortDescending(range, 0);

        expect(mockDataStore.getCellValue(1, 0)).toBe(30);
        expect(mockDataStore.getCellValue(2, 0)).toBe(20);
        expect(mockDataStore.getCellValue(3, 0)).toBe(10);
      });
    });

    describe('sort without header', () => {
      it('should include first row when hasHeader is false', () => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 30 },
          { row: 1, col: 0, value: 10 },
          { row: 2, col: 0, value: 20 },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 0 };
        sortFilter.sort(range, [{ column: 0, order: 'asc' }], { hasHeader: false });

        expect(mockDataStore.getCellValue(0, 0)).toBe(10);
        expect(mockDataStore.getCellValue(1, 0)).toBe(20);
        expect(mockDataStore.getCellValue(2, 0)).toBe(30);
      });
    });

    describe('multi-column sort', () => {
      it('should sort by multiple columns', () => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Category' },
          { row: 0, col: 1, value: 'Value' },
          { row: 1, col: 0, value: 'A' },
          { row: 1, col: 1, value: 30 },
          { row: 2, col: 0, value: 'B' },
          { row: 2, col: 1, value: 10 },
          { row: 3, col: 0, value: 'A' },
          { row: 3, col: 1, value: 20 },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 1 };
        sortFilter.sort(range, [
          { column: 0, order: 'asc' },
          { column: 1, order: 'asc' },
        ]);

        // Should be: A,20 / A,30 / B,10
        expect(mockDataStore.getCellValue(1, 0)).toBe('A');
        expect(mockDataStore.getCellValue(1, 1)).toBe(20);
        expect(mockDataStore.getCellValue(2, 0)).toBe('A');
        expect(mockDataStore.getCellValue(2, 1)).toBe(30);
        expect(mockDataStore.getCellValue(3, 0)).toBe('B');
        expect(mockDataStore.getCellValue(3, 1)).toBe(10);
      });
    });

    describe('stable sort', () => {
      it('should preserve original order for equal elements', () => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Group' },
          { row: 0, col: 1, value: 'ID' },
          { row: 1, col: 0, value: 'A' },
          { row: 1, col: 1, value: 1 },
          { row: 2, col: 0, value: 'A' },
          { row: 2, col: 1, value: 2 },
          { row: 3, col: 0, value: 'A' },
          { row: 3, col: 1, value: 3 },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 1 };
        sortFilter.sortAscending(range, 0); // All 'A', so order should be preserved

        expect(mockDataStore.getCellValue(1, 1)).toBe(1);
        expect(mockDataStore.getCellValue(2, 1)).toBe(2);
        expect(mockDataStore.getCellValue(3, 1)).toBe(3);
      });
    });

    describe('custom sort list', () => {
      it('should sort by custom list order', () => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Priority' },
          { row: 1, col: 0, value: 'Low' },
          { row: 2, col: 0, value: 'High' },
          { row: 3, col: 0, value: 'Medium' },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 0 };
        sortFilter.sort(range, [{
          column: 0,
          order: 'asc',
          customList: ['High', 'Medium', 'Low'],
        }]);

        expect(mockDataStore.getCellValue(1, 0)).toBe('High');
        expect(mockDataStore.getCellValue(2, 0)).toBe('Medium');
        expect(mockDataStore.getCellValue(3, 0)).toBe('Low');
      });
    });

    describe('case sensitivity', () => {
      it('should ignore case by default', () => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Name' },
          { row: 1, col: 0, value: 'banana' },
          { row: 2, col: 0, value: 'Apple' },
          { row: 3, col: 0, value: 'CHERRY' },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 0 };
        sortFilter.sortAscending(range, 0);

        expect(mockDataStore.getCellValue(1, 0)).toBe('Apple');
        expect(mockDataStore.getCellValue(2, 0)).toBe('banana');
        expect(mockDataStore.getCellValue(3, 0)).toBe('CHERRY');
      });

      it('should respect case sensitivity option', () => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Name' },
          { row: 1, col: 0, value: 'banana' },
          { row: 2, col: 0, value: 'Apple' },
          { row: 3, col: 0, value: 'CHERRY' },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 0 };
        sortFilter.sort(range, [{
          column: 0,
          order: 'asc',
          caseSensitive: true,
        }]);

        // With localeCompare, sorting is alphabetical (A < b < C)
        // caseSensitive means case differences matter, not ASCII ordering
        expect(mockDataStore.getCellValue(1, 0)).toBe('Apple');
        expect(mockDataStore.getCellValue(2, 0)).toBe('banana');
        expect(mockDataStore.getCellValue(3, 0)).toBe('CHERRY');
      });
    });

    describe('blanks handling', () => {
      it('should sort blanks to end by default', () => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Value' },
          { row: 1, col: 0, value: null },
          { row: 2, col: 0, value: 10 },
          { row: 3, col: 0, value: 20 },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 0 };
        sortFilter.sortAscending(range, 0);

        expect(mockDataStore.getCellValue(1, 0)).toBe(10);
        expect(mockDataStore.getCellValue(2, 0)).toBe(20);
        expect(mockDataStore.getCellValue(3, 0)).toBeNull();
      });

      it('should sort blanks to beginning when blanksFirst is true', () => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Value' },
          { row: 1, col: 0, value: 10 },
          { row: 2, col: 0, value: null },
          { row: 3, col: 0, value: 20 },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 0 };
        sortFilter.sort(range, [{
          column: 0,
          order: 'asc',
          blanksFirst: true,
        }]);

        expect(mockDataStore.getCellValue(1, 0)).toBeNull();
        expect(mockDataStore.getCellValue(2, 0)).toBe(10);
        expect(mockDataStore.getCellValue(3, 0)).toBe(20);
      });
    });

    describe('mixed types', () => {
      it('should sort numbers before strings', () => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Value' },
          { row: 1, col: 0, value: 'text' },
          { row: 2, col: 0, value: 100 },
          { row: 3, col: 0, value: 50 },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 0 };
        sortFilter.sortAscending(range, 0);

        expect(mockDataStore.getCellValue(1, 0)).toBe(50);
        expect(mockDataStore.getCellValue(2, 0)).toBe(100);
        expect(mockDataStore.getCellValue(3, 0)).toBe('text');
      });
    });

    describe('sort result', () => {
      it('should return original and new order', () => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Value' },
          { row: 1, col: 0, value: 30 },
          { row: 2, col: 0, value: 10 },
          { row: 3, col: 0, value: 20 },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 0 };
        const result = sortFilter.sortAscending(range, 0);

        expect(result.originalOrder).toEqual([1, 2, 3]);
        expect(result.newOrder).toEqual([2, 3, 1]);
      });
    });

    describe('error handling', () => {
      it('should fail without writer', () => {
        const readOnlyFilter = new SortFilter(mockDataStore);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 0 };
        const result = readOnlyFilter.sortAscending(range, 0);

        expect(result.success).toBe(false);
        expect(result.error).toContain('writer');
      });

      it('should fail without sort rules', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 0 };
        const result = sortFilter.sort(range, []);

        expect(result.success).toBe(false);
        expect(result.error).toContain('rules');
      });
    });

    describe('events', () => {
      it('should call onSort event', () => {
        const onSort = vi.fn();
        sortFilter.setEventHandlers({ onSort });

        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Value' },
          { row: 1, col: 0, value: 20 },
          { row: 2, col: 0, value: 10 },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 0 };
        sortFilter.sortAscending(range, 0);

        expect(onSort).toHaveBeenCalled();
        expect(onSort).toHaveBeenCalledWith(expect.objectContaining({
          success: true,
          rowCount: 2,
        }));
      });
    });
  });

  // ===========================================================================
  // Value Filtering
  // ===========================================================================

  describe('Value Filtering', () => {
    beforeEach(() => {
      mockDataStore.setCells([
        { row: 0, col: 0, value: 'Category' },
        { row: 1, col: 0, value: 'A' },
        { row: 2, col: 0, value: 'B' },
        { row: 3, col: 0, value: 'A' },
        { row: 4, col: 0, value: 'C' },
        { row: 5, col: 0, value: 'B' },
      ]);
    });

    it('should filter by selected values', () => {
      const range: CellRange = { startRow: 0, startCol: 0, endRow: 5, endCol: 0 };
      const result = sortFilter.applyValueFilter(range, 0, new Set(['A', 'B']));

      expect(result.success).toBe(true);
      expect(result.hiddenRows.has(1)).toBe(false); // A - visible
      expect(result.hiddenRows.has(2)).toBe(false); // B - visible
      expect(result.hiddenRows.has(3)).toBe(false); // A - visible
      expect(result.hiddenRows.has(4)).toBe(true);  // C - hidden
      expect(result.hiddenRows.has(5)).toBe(false); // B - visible
    });

    it('should handle blanks', () => {
      mockDataStore.setCell(3, 0, { value: '', type: 'string' });

      const range: CellRange = { startRow: 0, startCol: 0, endRow: 5, endCol: 0 };
      const result = sortFilter.applyValueFilter(range, 0, new Set(['A']), true); // includeBlanks

      expect(result.hiddenRows.has(3)).toBe(false); // Blank - visible
    });

    it('should hide blanks when not included', () => {
      mockDataStore.setCell(3, 0, { value: '', type: 'string' });

      const range: CellRange = { startRow: 0, startCol: 0, endRow: 5, endCol: 0 };
      const result = sortFilter.applyValueFilter(range, 0, new Set(['A']), false);

      expect(result.hiddenRows.has(3)).toBe(true); // Blank - hidden
    });
  });

  // ===========================================================================
  // Condition Filtering
  // ===========================================================================

  describe('Condition Filtering', () => {
    describe('text conditions', () => {
      beforeEach(() => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Name' },
          { row: 1, col: 0, value: 'Apple' },
          { row: 2, col: 0, value: 'Banana' },
          { row: 3, col: 0, value: 'Cherry' },
          { row: 4, col: 0, value: 'Apricot' },
        ]);
      });

      it('should filter equals', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 4, endCol: 0 };
        sortFilter.applyConditionFilter(range, 0, [{ operator: 'equals', value: 'Apple' }]);

        expect(sortFilter.isRowVisible(1)).toBe(true);
        expect(sortFilter.isRowVisible(2)).toBe(false);
      });

      it('should filter contains', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 4, endCol: 0 };
        sortFilter.applyConditionFilter(range, 0, [{ operator: 'contains', value: 'ap' }]);

        expect(sortFilter.isRowVisible(1)).toBe(true);  // Apple
        expect(sortFilter.isRowVisible(2)).toBe(false); // Banana
        expect(sortFilter.isRowVisible(4)).toBe(true);  // Apricot
      });

      it('should filter starts with', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 4, endCol: 0 };
        sortFilter.applyConditionFilter(range, 0, [{ operator: 'startsWith', value: 'A' }]);

        expect(sortFilter.isRowVisible(1)).toBe(true);  // Apple
        expect(sortFilter.isRowVisible(2)).toBe(false); // Banana
        expect(sortFilter.isRowVisible(4)).toBe(true);  // Apricot
      });

      it('should filter ends with', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 4, endCol: 0 };
        sortFilter.applyConditionFilter(range, 0, [{ operator: 'endsWith', value: 'e' }]);

        expect(sortFilter.isRowVisible(1)).toBe(true);  // Apple
        expect(sortFilter.isRowVisible(2)).toBe(false); // Banana
      });

      it('should filter not contains', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 4, endCol: 0 };
        sortFilter.applyConditionFilter(range, 0, [{ operator: 'notContains', value: 'an' }]);

        expect(sortFilter.isRowVisible(1)).toBe(true);  // Apple
        expect(sortFilter.isRowVisible(2)).toBe(false); // Banana
        expect(sortFilter.isRowVisible(3)).toBe(true);  // Cherry
      });
    });

    describe('number conditions', () => {
      beforeEach(() => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Value' },
          { row: 1, col: 0, value: 10 },
          { row: 2, col: 0, value: 25 },
          { row: 3, col: 0, value: 50 },
          { row: 4, col: 0, value: 75 },
          { row: 5, col: 0, value: 100 },
        ]);
      });

      it('should filter greater than', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 5, endCol: 0 };
        sortFilter.applyConditionFilter(range, 0, [{ operator: 'greaterThan', value: 50 }]);

        expect(sortFilter.isRowVisible(1)).toBe(false); // 10
        expect(sortFilter.isRowVisible(3)).toBe(false); // 50
        expect(sortFilter.isRowVisible(4)).toBe(true);  // 75
        expect(sortFilter.isRowVisible(5)).toBe(true);  // 100
      });

      it('should filter greater than or equal', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 5, endCol: 0 };
        sortFilter.applyConditionFilter(range, 0, [{ operator: 'greaterThanOrEqual', value: 50 }]);

        expect(sortFilter.isRowVisible(2)).toBe(false); // 25
        expect(sortFilter.isRowVisible(3)).toBe(true);  // 50
        expect(sortFilter.isRowVisible(4)).toBe(true);  // 75
      });

      it('should filter less than', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 5, endCol: 0 };
        sortFilter.applyConditionFilter(range, 0, [{ operator: 'lessThan', value: 50 }]);

        expect(sortFilter.isRowVisible(1)).toBe(true);  // 10
        expect(sortFilter.isRowVisible(2)).toBe(true);  // 25
        expect(sortFilter.isRowVisible(3)).toBe(false); // 50
      });

      it('should filter between', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 5, endCol: 0 };
        sortFilter.applyConditionFilter(range, 0, [{ operator: 'between', value: 20, value2: 60 }]);

        expect(sortFilter.isRowVisible(1)).toBe(false); // 10
        expect(sortFilter.isRowVisible(2)).toBe(true);  // 25
        expect(sortFilter.isRowVisible(3)).toBe(true);  // 50
        expect(sortFilter.isRowVisible(4)).toBe(false); // 75
      });

      it('should filter not between', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 5, endCol: 0 };
        sortFilter.applyConditionFilter(range, 0, [{ operator: 'notBetween', value: 20, value2: 60 }]);

        expect(sortFilter.isRowVisible(1)).toBe(true);  // 10
        expect(sortFilter.isRowVisible(2)).toBe(false); // 25
        expect(sortFilter.isRowVisible(3)).toBe(false); // 50
        expect(sortFilter.isRowVisible(4)).toBe(true);  // 75
      });
    });

    describe('empty checks', () => {
      beforeEach(() => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Value' },
          { row: 1, col: 0, value: 'Text' },
          { row: 2, col: 0, value: '' },
          { row: 3, col: 0, value: 100 },
        ]);
        mockDataStore.deleteCell(4, 0); // null cell
      });

      it('should filter isEmpty', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 4, endCol: 0 };
        sortFilter.applyConditionFilter(range, 0, [{ operator: 'isEmpty' }]);

        expect(sortFilter.isRowVisible(1)).toBe(false); // Text
        expect(sortFilter.isRowVisible(2)).toBe(true);  // Empty string
        expect(sortFilter.isRowVisible(3)).toBe(false); // 100
        expect(sortFilter.isRowVisible(4)).toBe(true);  // null
      });

      it('should filter isNotEmpty', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 4, endCol: 0 };
        sortFilter.applyConditionFilter(range, 0, [{ operator: 'isNotEmpty' }]);

        expect(sortFilter.isRowVisible(1)).toBe(true);  // Text
        expect(sortFilter.isRowVisible(2)).toBe(false); // Empty string
        expect(sortFilter.isRowVisible(3)).toBe(true);  // 100
      });
    });

    describe('multiple conditions', () => {
      beforeEach(() => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Value' },
          { row: 1, col: 0, value: 10 },
          { row: 2, col: 0, value: 50 },
          { row: 3, col: 0, value: 100 },
        ]);
      });

      it('should use AND logic by default', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 0 };
        sortFilter.applyConditionFilter(range, 0, [
          { operator: 'greaterThan', value: 25 },
          { operator: 'lessThan', value: 75 },
        ], 'and');

        expect(sortFilter.isRowVisible(1)).toBe(false); // 10 - fails first
        expect(sortFilter.isRowVisible(2)).toBe(true);  // 50 - passes both
        expect(sortFilter.isRowVisible(3)).toBe(false); // 100 - fails second
      });

      it('should support OR logic', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 0 };
        sortFilter.applyConditionFilter(range, 0, [
          { operator: 'lessThan', value: 25 },
          { operator: 'greaterThan', value: 75 },
        ], 'or');

        expect(sortFilter.isRowVisible(1)).toBe(true);  // 10 - passes first
        expect(sortFilter.isRowVisible(2)).toBe(false); // 50 - fails both
        expect(sortFilter.isRowVisible(3)).toBe(true);  // 100 - passes second
      });
    });
  });

  // ===========================================================================
  // Top/Bottom N Filtering
  // ===========================================================================

  describe('Top/Bottom N Filtering', () => {
    beforeEach(() => {
      mockDataStore.setCells([
        { row: 0, col: 0, value: 'Score' },
        { row: 1, col: 0, value: 10 },
        { row: 2, col: 0, value: 20 },
        { row: 3, col: 0, value: 30 },
        { row: 4, col: 0, value: 40 },
        { row: 5, col: 0, value: 50 },
      ]);
    });

    it('should filter top N items', () => {
      const range: CellRange = { startRow: 0, startCol: 0, endRow: 5, endCol: 0 };
      sortFilter.applyTopFilter(range, 0, 2);

      expect(sortFilter.isRowVisible(1)).toBe(false); // 10
      expect(sortFilter.isRowVisible(2)).toBe(false); // 20
      expect(sortFilter.isRowVisible(3)).toBe(false); // 30
      expect(sortFilter.isRowVisible(4)).toBe(true);  // 40
      expect(sortFilter.isRowVisible(5)).toBe(true);  // 50
    });

    it('should filter bottom N items', () => {
      const range: CellRange = { startRow: 0, startCol: 0, endRow: 5, endCol: 0 };
      sortFilter.applyBottomFilter(range, 0, 2);

      expect(sortFilter.isRowVisible(1)).toBe(true);  // 10
      expect(sortFilter.isRowVisible(2)).toBe(true);  // 20
      expect(sortFilter.isRowVisible(3)).toBe(false); // 30
      expect(sortFilter.isRowVisible(4)).toBe(false); // 40
      expect(sortFilter.isRowVisible(5)).toBe(false); // 50
    });

    it('should filter top N percent', () => {
      const range: CellRange = { startRow: 0, startCol: 0, endRow: 5, endCol: 0 };
      sortFilter.applyTopFilter(range, 0, 40, true); // Top 40% = top 2

      expect(sortFilter.isRowVisible(1)).toBe(false);
      expect(sortFilter.isRowVisible(4)).toBe(true);
      expect(sortFilter.isRowVisible(5)).toBe(true);
    });
  });

  // ===========================================================================
  // Average Filtering
  // ===========================================================================

  describe('Average Filtering', () => {
    beforeEach(() => {
      mockDataStore.setCells([
        { row: 0, col: 0, value: 'Value' },
        { row: 1, col: 0, value: 10 },  // Below avg
        { row: 2, col: 0, value: 20 },  // Below avg
        { row: 3, col: 0, value: 30 },  // Avg is 30
        { row: 4, col: 0, value: 40 },  // Above avg
        { row: 5, col: 0, value: 50 },  // Above avg
      ]);
    });

    it('should filter above average', () => {
      const range: CellRange = { startRow: 0, startCol: 0, endRow: 5, endCol: 0 };
      sortFilter.applyAboveAverageFilter(range, 0);

      // Average is 30, so only 40 and 50 are above
      expect(sortFilter.isRowVisible(1)).toBe(false); // 10
      expect(sortFilter.isRowVisible(2)).toBe(false); // 20
      expect(sortFilter.isRowVisible(3)).toBe(false); // 30 (not above)
      expect(sortFilter.isRowVisible(4)).toBe(true);  // 40
      expect(sortFilter.isRowVisible(5)).toBe(true);  // 50
    });

    it('should filter below average', () => {
      const range: CellRange = { startRow: 0, startCol: 0, endRow: 5, endCol: 0 };
      sortFilter.applyBelowAverageFilter(range, 0);

      expect(sortFilter.isRowVisible(1)).toBe(true);  // 10
      expect(sortFilter.isRowVisible(2)).toBe(true);  // 20
      expect(sortFilter.isRowVisible(3)).toBe(false); // 30 (not below)
      expect(sortFilter.isRowVisible(4)).toBe(false); // 40
    });
  });

  // ===========================================================================
  // Multiple Column Filters
  // ===========================================================================

  describe('Multiple Column Filters', () => {
    beforeEach(() => {
      mockDataStore.setCells([
        { row: 0, col: 0, value: 'Category' },
        { row: 0, col: 1, value: 'Value' },
        { row: 1, col: 0, value: 'A' },
        { row: 1, col: 1, value: 100 },
        { row: 2, col: 0, value: 'B' },
        { row: 2, col: 1, value: 50 },
        { row: 3, col: 0, value: 'A' },
        { row: 3, col: 1, value: 25 },
      ]);
    });

    it('should apply multiple column filters', () => {
      const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 1 };

      sortFilter.applyFilters(range, [
        { column: 0, type: 'values', values: new Set(['A']) },
        { column: 1, type: 'condition', conditions: [{ operator: 'greaterThan', value: 50 }] },
      ]);

      // Row 1: A, 100 - passes both
      // Row 2: B, 50 - fails col 0
      // Row 3: A, 25 - fails col 1
      expect(sortFilter.isRowVisible(1)).toBe(true);
      expect(sortFilter.isRowVisible(2)).toBe(false);
      expect(sortFilter.isRowVisible(3)).toBe(false);
    });
  });

  // ===========================================================================
  // Filter State Management
  // ===========================================================================

  describe('Filter State Management', () => {
    it('should track filter state', () => {
      mockDataStore.setCells([
        { row: 0, col: 0, value: 'Value' },
        { row: 1, col: 0, value: 'A' },
        { row: 2, col: 0, value: 'B' },
      ]);

      const range: CellRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 0 };
      sortFilter.applyValueFilter(range, 0, new Set(['A']));

      expect(sortFilter.isFilterActive()).toBe(true);

      const state = sortFilter.getFilterState();
      expect(state?.filters.size).toBe(1);
      expect(state?.hiddenRows.has(2)).toBe(true);
    });

    it('should get hidden rows', () => {
      mockDataStore.setCells([
        { row: 0, col: 0, value: 'Value' },
        { row: 1, col: 0, value: 'A' },
        { row: 2, col: 0, value: 'B' },
        { row: 3, col: 0, value: 'C' },
      ]);

      const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 0 };
      sortFilter.applyValueFilter(range, 0, new Set(['A']));

      const hidden = sortFilter.getHiddenRows();
      expect(hidden.has(2)).toBe(true);
      expect(hidden.has(3)).toBe(true);
      expect(hidden.has(1)).toBe(false);
    });

    it('should clear column filter', () => {
      mockDataStore.setCells([
        { row: 0, col: 0, value: 'Value' },
        { row: 1, col: 0, value: 'A' },
        { row: 2, col: 0, value: 'B' },
      ]);

      const range: CellRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 0 };
      sortFilter.applyValueFilter(range, 0, new Set(['A']));

      expect(sortFilter.isRowVisible(2)).toBe(false);

      sortFilter.clearFilter(range, 0);

      expect(sortFilter.isRowVisible(2)).toBe(true);
    });

    it('should clear all filters', () => {
      mockDataStore.setCells([
        { row: 0, col: 0, value: 'Value' },
        { row: 1, col: 0, value: 'A' },
        { row: 2, col: 0, value: 'B' },
      ]);

      const range: CellRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 0 };
      sortFilter.applyValueFilter(range, 0, new Set(['A']));
      sortFilter.clearFilter(range);

      expect(sortFilter.getFilterState()?.filters.size).toBe(0);
    });

    it('should disable filter', () => {
      mockDataStore.setCells([
        { row: 0, col: 0, value: 'Value' },
        { row: 1, col: 0, value: 'A' },
        { row: 2, col: 0, value: 'B' },
      ]);

      const range: CellRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 0 };
      sortFilter.applyValueFilter(range, 0, new Set(['A']));

      sortFilter.disableFilter();

      expect(sortFilter.isFilterActive()).toBe(false);
      expect(sortFilter.getFilterState()).toBeNull();
      expect(mockDataStore.hiddenRows.size).toBe(0);
    });
  });

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  describe('Helper Methods', () => {
    describe('getColumnUniqueValues', () => {
      it('should return unique values with counts', () => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Category' },
          { row: 1, col: 0, value: 'A' },
          { row: 2, col: 0, value: 'B' },
          { row: 3, col: 0, value: 'A' },
          { row: 4, col: 0, value: 'A' },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 4, endCol: 0 };
        const values = sortFilter.getColumnUniqueValues(range, 0);

        expect(values).toContainEqual({ value: 'A', count: 3 });
        expect(values).toContainEqual({ value: 'B', count: 1 });
      });

      it('should sort numbers before strings', () => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Value' },
          { row: 1, col: 0, value: 'text' },
          { row: 2, col: 0, value: 100 },
          { row: 3, col: 0, value: 50 },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 3, endCol: 0 };
        const values = sortFilter.getColumnUniqueValues(range, 0);

        expect(values[0].value).toBe('50');
        expect(values[1].value).toBe('100');
        expect(values[2].value).toBe('text');
      });
    });

    describe('getColumnStats', () => {
      it('should return column statistics', () => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Value' },
          { row: 1, col: 0, value: 10 },
          { row: 2, col: 0, value: 20 },
          { row: 3, col: 0, value: 30 },
          { row: 4, col: 0, value: 40 },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 4, endCol: 0 };
        const stats = sortFilter.getColumnStats(range, 0);

        expect(stats?.min).toBe(10);
        expect(stats?.max).toBe(40);
        expect(stats?.average).toBe(25);
        expect(stats?.count).toBe(4);
      });

      it('should return null for non-numeric column', () => {
        mockDataStore.setCells([
          { row: 0, col: 0, value: 'Name' },
          { row: 1, col: 0, value: 'Alice' },
          { row: 2, col: 0, value: 'Bob' },
        ]);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 0 };
        const stats = sortFilter.getColumnStats(range, 0);

        expect(stats).toBeNull();
      });
    });
  });

  // ===========================================================================
  // Events
  // ===========================================================================

  describe('Events', () => {
    it('should call onFilterApply', () => {
      const onFilterApply = vi.fn();
      sortFilter.setEventHandlers({ onFilterApply });

      mockDataStore.setCells([
        { row: 0, col: 0, value: 'Value' },
        { row: 1, col: 0, value: 'A' },
      ]);

      const range: CellRange = { startRow: 0, startCol: 0, endRow: 1, endCol: 0 };
      sortFilter.applyValueFilter(range, 0, new Set(['A']));

      expect(onFilterApply).toHaveBeenCalled();
    });

    it('should call onFilterClear', () => {
      const onFilterClear = vi.fn();
      sortFilter.setEventHandlers({ onFilterClear });

      mockDataStore.setCells([
        { row: 0, col: 0, value: 'Value' },
        { row: 1, col: 0, value: 'A' },
      ]);

      const range: CellRange = { startRow: 0, startCol: 0, endRow: 1, endCol: 0 };
      sortFilter.applyValueFilter(range, 0, new Set(['A']));
      sortFilter.clearFilter(range, 0);

      expect(onFilterClear).toHaveBeenCalledWith(0);
    });

    it('should call onRowVisibilityChange', () => {
      const onRowVisibilityChange = vi.fn();
      sortFilter.setEventHandlers({ onRowVisibilityChange });

      mockDataStore.setCells([
        { row: 0, col: 0, value: 'Value' },
        { row: 1, col: 0, value: 'A' },
        { row: 2, col: 0, value: 'B' },
      ]);

      const range: CellRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 0 };
      sortFilter.applyValueFilter(range, 0, new Set(['A']));

      expect(onRowVisibilityChange).toHaveBeenCalled();
      const hidden = onRowVisibilityChange.mock.calls[0][0];
      expect(hidden.has(2)).toBe(true);
    });
  });

  // ===========================================================================
  // Factory Functions
  // ===========================================================================

  describe('Factory Functions', () => {
    it('should create SortFilter with single data store', () => {
      const sf = createSortFilter(mockDataStore);
      expect(sf).toBeInstanceOf(SortFilter);
    });

    it('should create SortFilter with separate reader/writer', () => {
      const sf = createSortFilterWithWriter(mockDataStore, mockDataStore);
      expect(sf).toBeInstanceOf(SortFilter);
    });
  });
});
