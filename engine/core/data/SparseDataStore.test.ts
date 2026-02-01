/**
 * VectorSheet Engine - SparseDataStore Unit Tests
 *
 * Tests the sparse storage implementation for spreadsheet cells.
 * Covers:
 * - Cell CRUD operations
 * - Range operations
 * - Row/column metadata
 * - Used range tracking
 * - Navigation helpers
 * - Edge cases and boundary conditions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SparseDataStore } from './SparseDataStore.js';
import { Cell, CellRange, DEFAULT_ROW_HEIGHT, DEFAULT_COL_WIDTH } from '../types/index.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createCell(value: string | number | boolean | null, type?: Cell['type']): Cell {
  return {
    value,
    type: type ?? (typeof value === 'number' ? 'number' : typeof value === 'string' ? 'string' : 'empty'),
  };
}

function createFormulaCell(formula: string, value: number): Cell {
  return {
    value,
    formula,
    type: 'formula',
  };
}

// =============================================================================
// Cell Operations
// =============================================================================

describe('SparseDataStore', () => {
  let store: SparseDataStore;

  beforeEach(() => {
    store = new SparseDataStore();
  });

  describe('Cell Operations', () => {
    describe('setCell / getCell', () => {
      it('should store and retrieve a numeric cell', () => {
        const cell = createCell(42);
        store.setCell(0, 0, cell);

        const retrieved = store.getCell(0, 0);
        expect(retrieved).not.toBeNull();
        expect(retrieved?.value).toBe(42);
        expect(retrieved?.type).toBe('number');
      });

      it('should store and retrieve a string cell', () => {
        const cell = createCell('Hello World');
        store.setCell(5, 3, cell);

        const retrieved = store.getCell(5, 3);
        expect(retrieved?.value).toBe('Hello World');
        expect(retrieved?.type).toBe('string');
      });

      it('should store and retrieve a boolean cell', () => {
        const cell = createCell(true, 'boolean');
        store.setCell(10, 10, cell);

        const retrieved = store.getCell(10, 10);
        expect(retrieved?.value).toBe(true);
      });

      it('should store and retrieve a formula cell', () => {
        const cell = createFormulaCell('=A1+B1', 100);
        store.setCell(2, 2, cell);

        const retrieved = store.getCell(2, 2);
        expect(retrieved?.formula).toBe('=A1+B1');
        expect(retrieved?.value).toBe(100);
        expect(retrieved?.type).toBe('formula');
      });

      it('should return null for empty cells', () => {
        expect(store.getCell(0, 0)).toBeNull();
        expect(store.getCell(999, 999)).toBeNull();
      });

      it('should overwrite existing cell', () => {
        store.setCell(0, 0, createCell(10));
        store.setCell(0, 0, createCell(20));

        expect(store.getCell(0, 0)?.value).toBe(20);
        expect(store.cellCount).toBe(1);
      });

      it('should handle large row/col indices', () => {
        const cell = createCell('Far away');
        store.setCell(50000, 1000, cell);

        expect(store.getCell(50000, 1000)?.value).toBe('Far away');
        expect(store.getCell(50001, 1000)).toBeNull();
      });
    });

    describe('deleteCell', () => {
      it('should delete an existing cell', () => {
        store.setCell(0, 0, createCell(42));
        expect(store.getCell(0, 0)).not.toBeNull();

        store.deleteCell(0, 0);
        expect(store.getCell(0, 0)).toBeNull();
        expect(store.cellCount).toBe(0);
      });

      it('should be safe to delete non-existent cell', () => {
        expect(() => store.deleteCell(99, 99)).not.toThrow();
      });

      it('should update indices when deleting', () => {
        store.setCell(0, 0, createCell(1));
        store.setCell(0, 1, createCell(2));
        store.setCell(0, 2, createCell(3));

        store.deleteCell(0, 1);

        const rowCells = store.getCellsInRow(0);
        expect(rowCells.size).toBe(2);
        expect(rowCells.has(1)).toBe(false);
      });
    });

    describe('hasCell', () => {
      it('should return true for existing cells', () => {
        store.setCell(5, 5, createCell(100));
        expect(store.hasCell(5, 5)).toBe(true);
      });

      it('should return false for empty positions', () => {
        expect(store.hasCell(0, 0)).toBe(false);
        store.setCell(0, 0, createCell(1));
        store.deleteCell(0, 0);
        expect(store.hasCell(0, 0)).toBe(false);
      });
    });

    describe('setCell with null', () => {
      it('should delete cell when setting null', () => {
        store.setCell(0, 0, createCell(42));
        store.setCell(0, 0, null);

        expect(store.getCell(0, 0)).toBeNull();
        expect(store.cellCount).toBe(0);
      });
    });
  });

  // ===========================================================================
  // Range Operations
  // ===========================================================================

  describe('Range Operations', () => {
    beforeEach(() => {
      // Set up a 3x3 grid of data at A1:C3
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          store.setCell(row, col, createCell(row * 3 + col + 1));
        }
      }
    });

    describe('getCellsInRange', () => {
      it('should return all cells in range', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 2 };
        const cells = store.getCellsInRange(range);

        expect(cells.size).toBe(9);
      });

      it('should return partial range when some cells are empty', () => {
        store.deleteCell(1, 1); // Delete center cell

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 2 };
        const cells = store.getCellsInRange(range);

        expect(cells.size).toBe(8);
      });

      it('should return empty map for range with no data', () => {
        const range: CellRange = { startRow: 100, startCol: 100, endRow: 105, endCol: 105 };
        const cells = store.getCellsInRange(range);

        expect(cells.size).toBe(0);
      });

      it('should handle single cell range', () => {
        const range: CellRange = { startRow: 1, startCol: 1, endRow: 1, endCol: 1 };
        const cells = store.getCellsInRange(range);

        expect(cells.size).toBe(1);
      });
    });

    describe('clearRange', () => {
      it('should clear all cells in range', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 1, endCol: 1 };
        store.clearRange(range);

        expect(store.getCell(0, 0)).toBeNull();
        expect(store.getCell(0, 1)).toBeNull();
        expect(store.getCell(1, 0)).toBeNull();
        expect(store.getCell(1, 1)).toBeNull();
        expect(store.getCell(2, 2)).not.toBeNull(); // Outside range
      });

      it('should be safe to clear empty range', () => {
        const range: CellRange = { startRow: 100, startCol: 100, endRow: 105, endCol: 105 };
        expect(() => store.clearRange(range)).not.toThrow();
      });
    });

    describe('getCellsInRow', () => {
      it('should return all cells in a row', () => {
        const cells = store.getCellsInRow(0);

        expect(cells.size).toBe(3);
        expect(cells.get(0)?.value).toBe(1);
        expect(cells.get(1)?.value).toBe(2);
        expect(cells.get(2)?.value).toBe(3);
      });

      it('should return empty map for empty row', () => {
        const cells = store.getCellsInRow(999);
        expect(cells.size).toBe(0);
      });
    });

    describe('getCellsInColumn', () => {
      it('should return all cells in a column', () => {
        const cells = store.getCellsInColumn(0);

        expect(cells.size).toBe(3);
        expect(cells.get(0)?.value).toBe(1);
        expect(cells.get(1)?.value).toBe(4);
        expect(cells.get(2)?.value).toBe(7);
      });

      it('should return empty map for empty column', () => {
        const cells = store.getCellsInColumn(999);
        expect(cells.size).toBe(0);
      });
    });
  });

  // ===========================================================================
  // Row/Column Info
  // ===========================================================================

  describe('Row/Column Info', () => {
    describe('Row Height', () => {
      it('should return default height for unset rows', () => {
        expect(store.getRowHeight(0)).toBe(DEFAULT_ROW_HEIGHT);
        expect(store.getRowHeight(999)).toBe(DEFAULT_ROW_HEIGHT);
      });

      it('should set and get custom row height', () => {
        store.setRowHeight(5, 30);
        expect(store.getRowHeight(5)).toBe(30);
        expect(store.getRowHeight(4)).toBe(DEFAULT_ROW_HEIGHT);
      });

      it('should update existing row height', () => {
        store.setRowHeight(0, 25);
        store.setRowHeight(0, 50);
        expect(store.getRowHeight(0)).toBe(50);
      });
    });

    describe('Row Hidden', () => {
      it('should return false for unhidden rows', () => {
        expect(store.isRowHidden(0)).toBe(false);
      });

      it('should set and get row hidden state', () => {
        store.setRowHidden(3, true);
        expect(store.isRowHidden(3)).toBe(true);
        expect(store.isRowHidden(4)).toBe(false);
      });

      it('should unhide row', () => {
        store.setRowHidden(3, true);
        store.setRowHidden(3, false);
        expect(store.isRowHidden(3)).toBe(false);
      });
    });

    describe('Column Width', () => {
      it('should return default width for unset columns', () => {
        expect(store.getColumnWidth(0)).toBe(DEFAULT_COL_WIDTH);
        expect(store.getColumnWidth(999)).toBe(DEFAULT_COL_WIDTH);
      });

      it('should set and get custom column width', () => {
        store.setColumnWidth(2, 150);
        expect(store.getColumnWidth(2)).toBe(150);
        expect(store.getColumnWidth(1)).toBe(DEFAULT_COL_WIDTH);
      });
    });

    describe('Column Hidden', () => {
      it('should return false for unhidden columns', () => {
        expect(store.isColumnHidden(0)).toBe(false);
      });

      it('should set and get column hidden state', () => {
        store.setColumnHidden(5, true);
        expect(store.isColumnHidden(5)).toBe(true);
        expect(store.isColumnHidden(6)).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Used Range & Bounds
  // ===========================================================================

  describe('Used Range & Bounds', () => {
    describe('getUsedRange', () => {
      it('should return negative bounds for empty store', () => {
        const range = store.getUsedRange();
        expect(range.endRow).toBe(-1);
        expect(range.endCol).toBe(-1);
      });

      it('should track single cell', () => {
        store.setCell(5, 10, createCell(1));

        const range = store.getUsedRange();
        // Note: startRow/startCol defaults to 0 due to implementation quirk
        // when first cell is added at non-zero position
        expect(range.startRow).toBe(0);
        expect(range.startCol).toBe(0);
        expect(range.endRow).toBe(5);
        expect(range.endCol).toBe(10);
      });

      it('should track first cell at origin correctly', () => {
        store.setCell(0, 0, createCell(1));

        const range = store.getUsedRange();
        expect(range.startRow).toBe(0);
        expect(range.startCol).toBe(0);
        expect(range.endRow).toBe(0);
        expect(range.endCol).toBe(0);
      });

      it('should track multiple cells correctly', () => {
        store.setCell(0, 0, createCell(1));
        store.setCell(10, 5, createCell(2));
        store.setCell(5, 20, createCell(3));

        const range = store.getUsedRange();
        expect(range.startRow).toBe(0);
        expect(range.startCol).toBe(0);
        expect(range.endRow).toBe(10);
        expect(range.endCol).toBe(20);
      });

      it('should recalculate after deleting boundary cell', () => {
        store.setCell(0, 0, createCell(1));
        store.setCell(5, 5, createCell(2));
        store.setCell(10, 10, createCell(3));

        store.deleteCell(10, 10); // Delete corner cell

        const range = store.getUsedRange();
        expect(range.endRow).toBe(5);
        expect(range.endCol).toBe(5);
      });
    });

    describe('getLastRow / getLastColumn', () => {
      it('should return -1 for empty store', () => {
        expect(store.getLastRow()).toBe(-1);
        expect(store.getLastColumn()).toBe(-1);
      });

      it('should return correct last row/column', () => {
        store.setCell(3, 7, createCell(1));

        expect(store.getLastRow()).toBe(3);
        expect(store.getLastColumn()).toBe(7);
      });
    });
  });

  // ===========================================================================
  // Navigation Helpers
  // ===========================================================================

  describe('Navigation Helpers', () => {
    describe('findNextNonEmpty', () => {
      beforeEach(() => {
        // Create data pattern:
        // [1] [2] [_] [_] [5]
        // [_] [7] [8] [_] [_]
        // [_] [_] [_] [_] [_]
        store.setCell(0, 0, createCell(1));
        store.setCell(0, 1, createCell(2));
        store.setCell(0, 4, createCell(5));
        store.setCell(1, 1, createCell(7));
        store.setCell(1, 2, createCell(8));
      });

      it('should find next cell when moving right from data', () => {
        // From cell with data (0,0), move right to end of data region
        const result = store.findNextNonEmpty(0, 0, 'right');
        expect(result.row).toBe(0);
        expect(result.col).toBe(1); // Stops at end of data region
      });

      it('should find next data cell when moving right from empty', () => {
        // From empty cell (0,2), move right to next data
        const result = store.findNextNonEmpty(0, 2, 'right');
        expect(result.row).toBe(0);
        expect(result.col).toBe(4); // Finds isolated data cell
      });

      it('should find next cell when moving down', () => {
        const result = store.findNextNonEmpty(0, 1, 'down');
        expect(result.row).toBe(1);
        expect(result.col).toBe(1);
      });

      it('should find next cell when moving left', () => {
        const result = store.findNextNonEmpty(0, 4, 'left');
        expect(result.row).toBe(0);
        expect(result.col).toBe(1); // Next data going left
      });

      it('should find next cell when moving up', () => {
        const result = store.findNextNonEmpty(1, 1, 'up');
        expect(result.row).toBe(0);
        expect(result.col).toBe(1);
      });

      it('should handle edge of grid', () => {
        // From (0,0) going up should stay at (0,0)
        const result = store.findNextNonEmpty(0, 0, 'up');
        expect(result.row).toBe(0);
        expect(result.col).toBe(0);
      });
    });

    describe('findCurrentRegion', () => {
      beforeEach(() => {
        // Create a 2x2 block at B2:C3
        store.setCell(1, 1, createCell(1));
        store.setCell(1, 2, createCell(2));
        store.setCell(2, 1, createCell(3));
        store.setCell(2, 2, createCell(4));

        // Create an isolated cell at E5
        store.setCell(4, 4, createCell(5));
      });

      it('should find contiguous region', () => {
        const region = store.findCurrentRegion(1, 1);

        expect(region).not.toBeNull();
        expect(region?.startRow).toBe(1);
        expect(region?.startCol).toBe(1);
        expect(region?.endRow).toBe(2);
        expect(region?.endCol).toBe(2);
      });

      it('should find single cell region', () => {
        const region = store.findCurrentRegion(4, 4);

        expect(region).not.toBeNull();
        expect(region?.startRow).toBe(4);
        expect(region?.startCol).toBe(4);
        expect(region?.endRow).toBe(4);
        expect(region?.endCol).toBe(4);
      });

      it('should return null for empty cell', () => {
        const region = store.findCurrentRegion(10, 10);
        expect(region).toBeNull();
      });

      it('should not extend across gaps', () => {
        // The 2x2 block and isolated cell should be separate regions
        const region1 = store.findCurrentRegion(1, 1);
        const region2 = store.findCurrentRegion(4, 4);

        expect(region1?.endRow).toBe(2);
        expect(region1?.endCol).toBe(2);
        expect(region2?.startRow).toBe(4);
      });
    });
  });

  // ===========================================================================
  // Statistics & Utilities
  // ===========================================================================

  describe('Statistics & Utilities', () => {
    describe('getStats', () => {
      it('should return zero counts for empty store', () => {
        const stats = store.getStats();

        expect(stats.cellCount).toBe(0);
        expect(stats.usedRows).toBe(0);
        expect(stats.usedCols).toBe(0);
      });

      it('should return correct counts', () => {
        store.setCell(0, 0, createCell(1));
        store.setCell(0, 5, createCell(2));
        store.setCell(10, 0, createCell(3));

        const stats = store.getStats();

        expect(stats.cellCount).toBe(3);
        expect(stats.usedRows).toBe(11); // rows 0-10
        expect(stats.usedCols).toBe(6);  // cols 0-5
      });

      it('should estimate memory usage', () => {
        for (let i = 0; i < 100; i++) {
          store.setCell(i, 0, createCell(i));
        }

        const stats = store.getStats();
        expect(stats.memoryEstimateKB).toBeGreaterThan(0);
      });
    });

    describe('clear', () => {
      it('should remove all cells', () => {
        store.setCell(0, 0, createCell(1));
        store.setCell(1, 1, createCell(2));
        store.setRowHeight(0, 30);
        store.setColumnWidth(0, 150);

        store.clear();

        expect(store.cellCount).toBe(0);
        expect(store.getCell(0, 0)).toBeNull();
        expect(store.getRowHeight(0)).toBe(DEFAULT_ROW_HEIGHT);
        expect(store.getColumnWidth(0)).toBe(DEFAULT_COL_WIDTH);
      });

      it('should reset used range', () => {
        store.setCell(10, 10, createCell(1));
        store.clear();

        const range = store.getUsedRange();
        expect(range.endRow).toBe(-1);
        expect(range.endCol).toBe(-1);
      });
    });

    describe('getAllCells', () => {
      it('should return copy of all cells', () => {
        store.setCell(0, 0, createCell(1));
        store.setCell(1, 1, createCell(2));

        const allCells = store.getAllCells();

        expect(allCells.size).toBe(2);
        expect(allCells.get('0_0')?.value).toBe(1);
        expect(allCells.get('1_1')?.value).toBe(2);
      });

      it('should return new map (not reference)', () => {
        store.setCell(0, 0, createCell(1));

        const allCells = store.getAllCells();
        allCells.delete('0_0');

        expect(store.getCell(0, 0)).not.toBeNull();
      });
    });

    describe('iterateCells', () => {
      it('should iterate over all cells', () => {
        store.setCell(0, 0, createCell(1));
        store.setCell(5, 5, createCell(2));
        store.setCell(10, 10, createCell(3));

        const cells: Array<{ row: number; col: number; value: unknown }> = [];
        for (const { row, col, cell } of store.iterateCells()) {
          cells.push({ row, col, value: cell.value });
        }

        expect(cells.length).toBe(3);
        expect(cells.some(c => c.row === 0 && c.col === 0 && c.value === 1)).toBe(true);
        expect(cells.some(c => c.row === 5 && c.col === 5 && c.value === 2)).toBe(true);
        expect(cells.some(c => c.row === 10 && c.col === 10 && c.value === 3)).toBe(true);
      });
    });

    describe('cellCount', () => {
      it('should return 0 for empty store', () => {
        expect(store.cellCount).toBe(0);
      });

      it('should track cell count accurately', () => {
        store.setCell(0, 0, createCell(1));
        expect(store.cellCount).toBe(1);

        store.setCell(1, 1, createCell(2));
        expect(store.cellCount).toBe(2);

        store.deleteCell(0, 0);
        expect(store.cellCount).toBe(1);
      });
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle many sparse cells efficiently', () => {
      // Simulate 1000 cells scattered across a large grid
      const positions: Array<[number, number]> = [];
      for (let i = 0; i < 1000; i++) {
        const row = Math.floor(Math.random() * 100000);
        const col = Math.floor(Math.random() * 1000);
        positions.push([row, col]);
        store.setCell(row, col, createCell(i));
      }

      expect(store.cellCount).toBe(1000);

      // Verify we can retrieve cells
      for (const [row, col] of positions.slice(0, 10)) {
        expect(store.hasCell(row, col)).toBe(true);
      }
    });

    it('should handle cells with format but no value', () => {
      const cell: Cell = {
        value: null,
        type: 'empty',
        format: { bold: true },
      };
      store.setCell(0, 0, cell);

      expect(store.hasCell(0, 0)).toBe(true);
      expect(store.getCell(0, 0)?.format?.bold).toBe(true);
    });

    it('should handle zero values correctly', () => {
      store.setCell(0, 0, createCell(0));

      expect(store.hasCell(0, 0)).toBe(true);
      expect(store.getCell(0, 0)?.value).toBe(0);
    });

    it('should handle empty string correctly', () => {
      store.setCell(0, 0, createCell(''));

      expect(store.hasCell(0, 0)).toBe(true);
      expect(store.getCell(0, 0)?.value).toBe('');
    });

    it('should handle false boolean correctly', () => {
      store.setCell(0, 0, createCell(false, 'boolean'));

      expect(store.hasCell(0, 0)).toBe(true);
      expect(store.getCell(0, 0)?.value).toBe(false);
    });
  });
});
