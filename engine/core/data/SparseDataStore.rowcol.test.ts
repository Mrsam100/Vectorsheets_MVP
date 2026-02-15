/**
 * Row/Column Structural Operations Tests
 * Tests for insertRows, deleteRows, insertColumns, deleteColumns
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SparseDataStore } from './SparseDataStore';
import type { Cell } from '../types/index';

describe('SparseDataStore - Row/Column Operations', () => {
  let store: SparseDataStore;

  beforeEach(() => {
    store = new SparseDataStore();
  });

  // ===========================================================================
  // Insert Rows
  // ===========================================================================

  describe('insertRows', () => {
    it('should move cells down when inserting rows', () => {
      // Setup: cells at rows 0, 1, 2
      store.setCell(0, 0, { value: 'A1' });
      store.setCell(1, 0, { value: 'A2' });
      store.setCell(2, 0, { value: 'A3' });

      // Insert 2 rows at row 1
      store.insertRows(1, 2);

      // A1 stays at row 0
      expect(store.getCell(0, 0)?.value).toBe('A1');

      // A2 moves to row 3 (1 + 2)
      expect(store.getCell(1, 0)).toBeNull();
      expect(store.getCell(2, 0)).toBeNull();
      expect(store.getCell(3, 0)?.value).toBe('A2');

      // A3 moves to row 4 (2 + 2)
      expect(store.getCell(4, 0)?.value).toBe('A3');
    });

    it('should handle insertRows at row 0', () => {
      store.setCell(0, 0, { value: 'A1' });
      store.setCell(1, 0, { value: 'A2' });

      store.insertRows(0, 3);

      // All cells move down by 3
      expect(store.getCell(0, 0)).toBeNull();
      expect(store.getCell(1, 0)).toBeNull();
      expect(store.getCell(2, 0)).toBeNull();
      expect(store.getCell(3, 0)?.value).toBe('A1');
      expect(store.getCell(4, 0)?.value).toBe('A2');
    });

    it('should preserve column data when inserting rows', () => {
      store.setCell(1, 0, { value: 'A2' });
      store.setCell(1, 1, { value: 'B2' });
      store.setCell(1, 2, { value: 'C2' });

      store.insertRows(1, 1);

      // Row 1 now empty, data moved to row 2
      expect(store.getCell(1, 0)).toBeNull();
      expect(store.getCell(2, 0)?.value).toBe('A2');
      expect(store.getCell(2, 1)?.value).toBe('B2');
      expect(store.getCell(2, 2)?.value).toBe('C2');
    });

    it('should move row heights when inserting rows', () => {
      store.setRowHeight(2, 50);
      store.setRowHeight(3, 60);

      store.insertRows(2, 1);

      // Row 2 height should be default
      expect(store.getRowHeight(2)).toBe(21); // DEFAULT_ROW_HEIGHT

      // Old row 2 height moved to row 3
      expect(store.getRowHeight(3)).toBe(50);

      // Old row 3 height moved to row 4
      expect(store.getRowHeight(4)).toBe(60);
    });

    it('should do nothing when count is 0', () => {
      store.setCell(0, 0, { value: 'A1' });

      store.insertRows(0, 0);

      expect(store.getCell(0, 0)?.value).toBe('A1');
    });
  });

  // ===========================================================================
  // Delete Rows
  // ===========================================================================

  describe('deleteRows', () => {
    it('should delete cells in deleted rows', () => {
      store.setCell(0, 0, { value: 'A1' });
      store.setCell(1, 0, { value: 'A2' });
      store.setCell(2, 0, { value: 'A3' });
      store.setCell(3, 0, { value: 'A4' });

      // Delete rows 1-2 (2 rows)
      store.deleteRows(1, 2);

      // Row 0 intact
      expect(store.getCell(0, 0)?.value).toBe('A1');

      // Rows 1-2 deleted
      expect(store.getCell(1, 0)?.value).toBe('A4'); // A4 moved from row 3 to row 1

      expect(store.getCell(2, 0)).toBeNull();
      expect(store.getCell(3, 0)).toBeNull();
    });

    it('should move cells up after deleted rows', () => {
      store.setCell(5, 0, { value: 'A6' });
      store.setCell(6, 0, { value: 'A7' });
      store.setCell(7, 0, { value: 'A8' });

      // Delete rows 5-6 (2 rows)
      store.deleteRows(5, 2);

      // A8 moves from row 7 to row 5 (7 - 2)
      expect(store.getCell(5, 0)?.value).toBe('A8');
      expect(store.getCell(6, 0)).toBeNull();
      expect(store.getCell(7, 0)).toBeNull();
    });

    it('should preserve column data when deleting rows', () => {
      store.setCell(1, 0, { value: 'A2' });
      store.setCell(1, 1, { value: 'B2' });
      store.setCell(1, 2, { value: 'C2' });

      store.deleteRows(1, 1);

      // All cells in row 1 deleted
      expect(store.getCell(1, 0)).toBeNull();
      expect(store.getCell(1, 1)).toBeNull();
      expect(store.getCell(1, 2)).toBeNull();
    });

    it('should delete row heights in deleted range', () => {
      store.setRowHeight(1, 50);
      store.setRowHeight(2, 60);
      store.setRowHeight(3, 70);

      store.deleteRows(1, 2);

      // Row 1 height deleted, row 3 moved to row 1
      expect(store.getRowHeight(1)).toBe(70);
      expect(store.getRowHeight(2)).toBe(21); // Default
    });

    it('should do nothing when count is 0', () => {
      store.setCell(0, 0, { value: 'A1' });

      store.deleteRows(0, 0);

      expect(store.getCell(0, 0)?.value).toBe('A1');
    });
  });

  // ===========================================================================
  // Insert Columns
  // ===========================================================================

  describe('insertColumns', () => {
    it('should move cells right when inserting columns', () => {
      store.setCell(0, 0, { value: 'A1' });
      store.setCell(0, 1, { value: 'B1' });
      store.setCell(0, 2, { value: 'C1' });

      // Insert 2 columns at column 1
      store.insertColumns(1, 2);

      // A1 stays at col 0
      expect(store.getCell(0, 0)?.value).toBe('A1');

      // B1 moves to col 3 (1 + 2)
      expect(store.getCell(0, 1)).toBeNull();
      expect(store.getCell(0, 2)).toBeNull();
      expect(store.getCell(0, 3)?.value).toBe('B1');

      // C1 moves to col 4 (2 + 2)
      expect(store.getCell(0, 4)?.value).toBe('C1');
    });

    it('should handle insertColumns at col 0', () => {
      store.setCell(0, 0, { value: 'A1' });
      store.setCell(0, 1, { value: 'B1' });

      store.insertColumns(0, 3);

      // All cells move right by 3
      expect(store.getCell(0, 0)).toBeNull();
      expect(store.getCell(0, 1)).toBeNull();
      expect(store.getCell(0, 2)).toBeNull();
      expect(store.getCell(0, 3)?.value).toBe('A1');
      expect(store.getCell(0, 4)?.value).toBe('B1');
    });

    it('should preserve row data when inserting columns', () => {
      store.setCell(0, 1, { value: 'B1' });
      store.setCell(1, 1, { value: 'B2' });
      store.setCell(2, 1, { value: 'B3' });

      store.insertColumns(1, 1);

      // Col 1 now empty, data moved to col 2
      expect(store.getCell(0, 1)).toBeNull();
      expect(store.getCell(0, 2)?.value).toBe('B1');
      expect(store.getCell(1, 2)?.value).toBe('B2');
      expect(store.getCell(2, 2)?.value).toBe('B3');
    });

    it('should move column widths when inserting columns', () => {
      store.setColumnWidth(2, 150);
      store.setColumnWidth(3, 200);

      store.insertColumns(2, 1);

      // Col 2 width should be default
      expect(store.getColumnWidth(2)).toBe(72); // DEFAULT_COL_WIDTH

      // Old col 2 width moved to col 3
      expect(store.getColumnWidth(3)).toBe(150);

      // Old col 3 width moved to col 4
      expect(store.getColumnWidth(4)).toBe(200);
    });
  });

  // ===========================================================================
  // Delete Columns
  // ===========================================================================

  describe('deleteColumns', () => {
    it('should delete cells in deleted columns', () => {
      store.setCell(0, 0, { value: 'A1' });
      store.setCell(0, 1, { value: 'B1' });
      store.setCell(0, 2, { value: 'C1' });
      store.setCell(0, 3, { value: 'D1' });

      // Delete cols 1-2 (2 columns)
      store.deleteColumns(1, 2);

      // Col 0 intact
      expect(store.getCell(0, 0)?.value).toBe('A1');

      // Cols 1-2 deleted, D1 moved from col 3 to col 1
      expect(store.getCell(0, 1)?.value).toBe('D1');

      expect(store.getCell(0, 2)).toBeNull();
      expect(store.getCell(0, 3)).toBeNull();
    });

    it('should move cells left after deleted columns', () => {
      store.setCell(0, 5, { value: 'F1' });
      store.setCell(0, 6, { value: 'G1' });
      store.setCell(0, 7, { value: 'H1' });

      // Delete cols 5-6 (2 columns)
      store.deleteColumns(5, 2);

      // H1 moves from col 7 to col 5 (7 - 2)
      expect(store.getCell(0, 5)?.value).toBe('H1');
      expect(store.getCell(0, 6)).toBeNull();
      expect(store.getCell(0, 7)).toBeNull();
    });

    it('should preserve row data when deleting columns', () => {
      store.setCell(0, 1, { value: 'B1' });
      store.setCell(1, 1, { value: 'B2' });
      store.setCell(2, 1, { value: 'B3' });

      store.deleteColumns(1, 1);

      // All cells in col 1 deleted
      expect(store.getCell(0, 1)).toBeNull();
      expect(store.getCell(1, 1)).toBeNull();
      expect(store.getCell(2, 1)).toBeNull();
    });

    it('should delete column widths in deleted range', () => {
      store.setColumnWidth(1, 150);
      store.setColumnWidth(2, 200);
      store.setColumnWidth(3, 250);

      store.deleteColumns(1, 2);

      // Col 1 width deleted, col 3 moved to col 1
      expect(store.getColumnWidth(1)).toBe(250);
      expect(store.getColumnWidth(2)).toBe(72); // Default
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle empty store', () => {
      expect(() => store.insertRows(0, 1)).not.toThrow();
      expect(() => store.deleteRows(0, 1)).not.toThrow();
      expect(() => store.insertColumns(0, 1)).not.toThrow();
      expect(() => store.deleteColumns(0, 1)).not.toThrow();
    });

    it('should throw on invalid insertRow', () => {
      expect(() => store.insertRows(-1, 1)).toThrow();
      expect(() => store.insertRows(1048576, 1)).toThrow(); // MAX_ROWS
    });

    it('should throw on invalid deleteRow', () => {
      expect(() => store.deleteRows(-1, 1)).toThrow();
      expect(() => store.deleteRows(1048576, 1)).toThrow();
    });

    it('should throw on invalid insertCol', () => {
      expect(() => store.insertColumns(-1, 1)).toThrow();
      expect(() => store.insertColumns(16384, 1)).toThrow(); // MAX_COLS
    });

    it('should throw on invalid deleteCol', () => {
      expect(() => store.deleteColumns(-1, 1)).toThrow();
      expect(() => store.deleteColumns(16384, 1)).toThrow();
    });

    it('should update used range after row operations', () => {
      store.setCell(5, 5, { value: 'F6' });

      const before = store.getUsedRange();
      expect(before.endRow).toBe(5);

      store.insertRows(0, 10);

      const after = store.getUsedRange();
      expect(after.endRow).toBe(15); // 5 + 10
    });

    it('should update used range after column operations', () => {
      store.setCell(5, 5, { value: 'F6' });

      const before = store.getUsedRange();
      expect(before.endCol).toBe(5);

      store.insertColumns(0, 10);

      const after = store.getUsedRange();
      expect(after.endCol).toBe(15); // 5 + 10
    });
  });

  // ===========================================================================
  // Complex Scenarios
  // ===========================================================================

  describe('complex scenarios', () => {
    it('should handle multiple insert/delete operations', () => {
      // Build grid
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          store.setCell(r, c, { value: `${String.fromCharCode(65 + c)}${r + 1}` });
        }
      }

      // Insert 2 rows at row 2
      store.insertRows(2, 2);

      // Delete 1 column at col 1
      store.deleteColumns(1, 1);

      // Check a few cells
      expect(store.getCell(0, 0)?.value).toBe('A1'); // Unchanged
      expect(store.getCell(1, 0)?.value).toBe('A2'); // Unchanged
      expect(store.getCell(4, 0)?.value).toBe('A3'); // Row 2 moved to row 4

      // Col 1 (B) deleted, C moved to col 1
      expect(store.getCell(0, 1)?.value).toBe('C1');
    });

    it('should preserve cell data integrity', () => {
      const cell: Cell = {
        value: 'Test',
        format: { bold: true, fontSize: 14 },
        borders: { top: { style: 'thin', color: '#000000' } },
      };

      store.setCell(1, 1, cell);

      store.insertRows(0, 1);

      const moved = store.getCell(2, 1);
      expect(moved?.value).toBe('Test');
      expect(moved?.format?.bold).toBe(true);
      expect(moved?.format?.fontSize).toBe(14);
      expect(moved?.borders?.top?.style).toBe('thin');
    });
  });
});
