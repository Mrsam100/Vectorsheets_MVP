/**
 * VectorSheet Engine - ClipboardManager Unit Tests
 *
 * Tests Excel-grade clipboard operations.
 * Covers:
 * - Copy/Cut/Paste for cells and ranges
 * - Paste Special options (values, formulas, formats, etc.)
 * - Paste operations (add, subtract, multiply, divide)
 * - Transpose and skip blanks
 * - Formula reference adjustment
 * - Multi-range selection support
 * - External paste handling
 * - Event callbacks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ClipboardManager,
  ClipboardData,
  PasteResult,
  PasteOptions,
} from './ClipboardManager.js';
import { SparseDataStore } from '../data/SparseDataStore.js';
import { Cell, CellRange, Selection } from '../types/index.js';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a SparseDataStore with test data.
 */
function createTestDataStore(): SparseDataStore {
  const store = new SparseDataStore();

  // Set up test data
  // A1:C3 with mixed content
  store.setCell(0, 0, { value: 100, type: 'number' });
  store.setCell(0, 1, { value: 200, type: 'number' });
  store.setCell(0, 2, { value: 'Text', type: 'string' });
  store.setCell(1, 0, { value: '=A1+B1', formula: '=A1+B1', type: 'formula', formulaResult: 300 });
  store.setCell(1, 1, { value: true, type: 'boolean' });
  store.setCell(1, 2, { value: null, type: 'empty' });
  store.setCell(2, 0, { value: 1.5, type: 'number', format: { bold: true } });
  store.setCell(2, 1, { value: 'Hello', type: 'string', format: { italic: true, fontColor: '#FF0000' } });
  store.setCell(2, 2, { value: 999, type: 'number' });

  return store;
}

/**
 * Create a selection object from a range.
 */
function createSelection(range: CellRange): Selection {
  return {
    ranges: [range],
    activeCell: { row: range.startRow, col: range.startCol },
    anchorCell: { row: range.startRow, col: range.startCol },
    activeRangeIndex: 0,
  };
}

/**
 * Create a multi-range selection.
 */
function createMultiSelection(ranges: CellRange[]): Selection {
  return {
    ranges,
    activeCell: { row: ranges[0].startRow, col: ranges[0].startCol },
    anchorCell: { row: ranges[0].startRow, col: ranges[0].startCol },
    activeRangeIndex: 0,
  };
}

// =============================================================================
// Initial State Tests
// =============================================================================

describe('ClipboardManager', () => {
  describe('Initial State', () => {
    let store: SparseDataStore;
    let clipboard: ClipboardManager;

    beforeEach(() => {
      store = createTestDataStore();
      clipboard = new ClipboardManager(store);
    });

    it('should have no data initially', () => {
      expect(clipboard.hasData()).toBe(false);
    });

    it('should return null for getData()', () => {
      expect(clipboard.getData()).toBeNull();
    });

    it('should return null for getSourceRange()', () => {
      expect(clipboard.getSourceRange()).toBeNull();
    });

    it('should return empty array for getSourceRanges()', () => {
      expect(clipboard.getSourceRanges()).toEqual([]);
    });

    it('should not be a cut operation', () => {
      expect(clipboard.isCutOperation()).toBe(false);
    });

    it('should not have any cell in cut source', () => {
      expect(clipboard.isCellInCutSource(0, 0)).toBe(false);
    });
  });

  // ===========================================================================
  // Copy Operations
  // ===========================================================================

  describe('Copy Operations', () => {
    let store: SparseDataStore;
    let clipboard: ClipboardManager;

    beforeEach(() => {
      store = createTestDataStore();
      clipboard = new ClipboardManager(store);
    });

    describe('copyRange()', () => {
      it('should copy a single cell', () => {
        const data = clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

        expect(clipboard.hasData()).toBe(true);
        expect(data.type).toBe('copy');
        expect(data.rows).toBe(1);
        expect(data.cols).toBe(1);
        expect(data.cells.length).toBe(1);
        expect(data.cells[0].cell.value).toBe(100);
      });

      it('should copy a range of cells', () => {
        const data = clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 });

        expect(data.rows).toBe(2);
        expect(data.cols).toBe(2);
        expect(data.cells.length).toBe(4);
      });

      it('should normalize inverted ranges', () => {
        const data = clipboard.copyRange({ startRow: 1, startCol: 1, endRow: 0, endCol: 0 });

        expect(data.sourceRange.startRow).toBe(0);
        expect(data.sourceRange.startCol).toBe(0);
        expect(data.sourceRange.endRow).toBe(1);
        expect(data.sourceRange.endCol).toBe(1);
      });

      it('should store original cell references', () => {
        const data = clipboard.copyRange({ startRow: 1, startCol: 1, endRow: 2, endCol: 2 });

        const cell = data.cells.find(c => c.rowOffset === 0 && c.colOffset === 0);
        expect(cell?.originalRef).toEqual({ row: 1, col: 1 });
      });

      it('should include format in copied cells', () => {
        const data = clipboard.copyRange({ startRow: 2, startCol: 0, endRow: 2, endCol: 0 });

        expect(data.cells[0].cell.format?.bold).toBe(true);
      });

      it('should generate plain text representation', () => {
        const data = clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 1 });

        expect(data.plainText).toBe('100\t200');
      });

      it('should generate HTML representation', () => {
        const data = clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

        expect(data.html).toContain('<table>');
        expect(data.html).toContain('100');
        expect(data.html).toContain('</table>');
      });

      it('should deep clone cells', () => {
        const data = clipboard.copyRange({ startRow: 2, startCol: 1, endRow: 2, endCol: 1 });

        // Modify source
        store.setCell(2, 1, { value: 'Modified', type: 'string' });

        // Clipboard should still have original
        expect(data.cells[0].cell.value).toBe('Hello');
      });
    });

    describe('copy() with Selection', () => {
      it('should copy from Selection object', () => {
        const selection = createSelection({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 });
        const data = clipboard.copy(selection);

        expect(data.cells.length).toBe(4);
        expect(data.isMultiRange).toBe(false);
      });

      it('should copy from array of ranges', () => {
        const ranges = [
          { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
          { startRow: 2, startCol: 2, endRow: 2, endCol: 2 },
        ];
        const data = clipboard.copy(ranges);

        expect(data.isMultiRange).toBe(true);
        expect(data.sourceRanges.length).toBe(2);
      });
    });

    describe('copyRanges() - Multi-range', () => {
      it('should copy multiple non-contiguous ranges', () => {
        const ranges = [
          { startRow: 0, startCol: 0, endRow: 0, endCol: 0 }, // A1
          { startRow: 2, startCol: 2, endRow: 2, endCol: 2 }, // C3
        ];
        const data = clipboard.copyRanges(ranges);

        expect(data.isMultiRange).toBe(true);
        expect(data.sourceRanges.length).toBe(2);

        // Bounding box should encompass both
        expect(data.sourceRange).toEqual({
          startRow: 0, startCol: 0, endRow: 2, endCol: 2,
        });
      });

      it('should not duplicate overlapping cells', () => {
        const ranges = [
          { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
          { startRow: 1, startCol: 1, endRow: 2, endCol: 2 },
        ];
        const data = clipboard.copyRanges(ranges);

        // B2 (1,1) should only appear once
        const b2Cells = data.cells.filter(c =>
          c.originalRef.row === 1 && c.originalRef.col === 1
        );
        expect(b2Cells.length).toBe(1);
      });
    });
  });

  // ===========================================================================
  // Cut Operations
  // ===========================================================================

  describe('Cut Operations', () => {
    let store: SparseDataStore;
    let clipboard: ClipboardManager;

    beforeEach(() => {
      store = createTestDataStore();
      clipboard = new ClipboardManager(store);
    });

    describe('cutRange()', () => {
      it('should mark as cut operation', () => {
        clipboard.cutRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

        expect(clipboard.isCutOperation()).toBe(true);
      });

      it('should report cells in cut source', () => {
        clipboard.cutRange({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 });

        expect(clipboard.isCellInCutSource(0, 0)).toBe(true);
        expect(clipboard.isCellInCutSource(1, 1)).toBe(true);
        expect(clipboard.isCellInCutSource(2, 2)).toBe(false);
      });

      it('should preserve source data until paste', () => {
        clipboard.cutRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

        // Source should still exist
        expect(store.getCell(0, 0)?.value).toBe(100);
      });
    });

    describe('cut() with Selection', () => {
      it('should cut from Selection object', () => {
        const selection = createSelection({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
        clipboard.cut(selection);

        expect(clipboard.isCutOperation()).toBe(true);
      });
    });

    describe('cutRanges() - Multi-range', () => {
      it('should cut multiple ranges', () => {
        const ranges = [
          { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
          { startRow: 2, startCol: 2, endRow: 2, endCol: 2 },
        ];
        clipboard.cutRanges(ranges);

        expect(clipboard.isCellInCutSource(0, 0)).toBe(true);
        expect(clipboard.isCellInCutSource(2, 2)).toBe(true);
        expect(clipboard.isCellInCutSource(1, 1)).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Paste Operations
  // ===========================================================================

  describe('Paste Operations', () => {
    let store: SparseDataStore;
    let clipboard: ClipboardManager;

    beforeEach(() => {
      store = createTestDataStore();
      clipboard = new ClipboardManager(store);
    });

    describe('paste() - basic', () => {
      it('should return error if no clipboard data', () => {
        const result = clipboard.paste({ row: 5, col: 5 });

        expect(result.success).toBe(false);
        expect(result.error).toBe('No clipboard data');
      });

      it('should paste single cell', () => {
        clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
        const result = clipboard.paste({ row: 5, col: 5 });

        expect(result.success).toBe(true);
        expect(result.pastedCells.length).toBe(1);
        expect(store.getCell(5, 5)?.value).toBe(100);
      });

      it('should paste range of cells', () => {
        clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 });
        const result = clipboard.paste({ row: 5, col: 5 });

        expect(result.pastedCells.length).toBe(4);
        expect(store.getCell(5, 5)?.value).toBe(100);
        expect(store.getCell(5, 6)?.value).toBe(200);
        expect(store.getCell(6, 5)?.formula).toBeDefined();
        expect(store.getCell(6, 6)?.value).toBe(true);
      });

      it('should return pasted range', () => {
        clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 });
        const result = clipboard.paste({ row: 5, col: 5 });

        expect(result.pastedRanges[0]).toEqual({
          startRow: 5, startCol: 5, endRow: 6, endCol: 6,
        });
      });
    });

    describe('paste() - with PasteType', () => {
      it('should paste values only (no formulas)', () => {
        clipboard.copyRange({ startRow: 1, startCol: 0, endRow: 1, endCol: 0 }); // Formula cell
        const result = clipboard.paste({ row: 5, col: 5 }, 'values');

        expect(result.success).toBe(true);
        const cell = store.getCell(5, 5);
        expect(cell?.formula).toBeUndefined();
        expect(cell?.value).toBe(300); // Formula result
      });

      it('should paste formulas (with adjustment)', () => {
        clipboard.copyRange({ startRow: 1, startCol: 0, endRow: 1, endCol: 0 }); // =A1+B1
        const result = clipboard.paste({ row: 5, col: 5 }, 'formulas');

        expect(result.success).toBe(true);
        const cell = store.getCell(5, 5);
        // Adjusted 4 rows down (1→5) and 5 cols right (0→5)
        // A1 -> F5, B1 -> G5
        expect(cell?.formula).toBe('=F5+G5');
      });

      it('should paste formats only (no values)', () => {
        clipboard.copyRange({ startRow: 2, startCol: 1, endRow: 2, endCol: 1 }); // Cell with format
        clipboard.paste({ row: 5, col: 5 }, 'formats');

        const cell = store.getCell(5, 5);
        expect(cell?.format?.italic).toBe(true);
        expect(cell?.format?.fontColor).toBe('#FF0000');
      });

      it('should paste values and formats (no formulas)', () => {
        // First set a formula cell with formatting
        store.setCell(3, 0, {
          value: '=A1*2',
          formula: '=A1*2',
          type: 'formula',
          formulaResult: 200,
          format: { bold: true },
        });

        clipboard.copyRange({ startRow: 3, startCol: 0, endRow: 3, endCol: 0 });
        clipboard.paste({ row: 5, col: 5 }, 'valuesAndFormats');

        const cell = store.getCell(5, 5);
        expect(cell?.formula).toBeUndefined();
        expect(cell?.value).toBe(200); // Formula result
        expect(cell?.format?.bold).toBe(true);
      });
    });

    describe('paste() - with PasteOptions', () => {
      describe('skipBlanks', () => {
        it('should skip blank cells when skipBlanks is true', () => {
          // Set up destination with existing value
          store.setCell(5, 7, { value: 'Original', type: 'string' });

          // Copy range including blank cell (1,2)
          clipboard.copyRange({ startRow: 1, startCol: 1, endRow: 1, endCol: 2 });
          clipboard.paste({ row: 5, col: 6 }, { type: 'all', skipBlanks: true });

          // Original value should be preserved because source was blank
          expect(store.getCell(5, 7)?.value).toBe('Original');
        });

        it('should overwrite with blanks when skipBlanks is false', () => {
          store.setCell(5, 7, { value: 'Original', type: 'string' });

          clipboard.copyRange({ startRow: 1, startCol: 1, endRow: 1, endCol: 2 });
          clipboard.paste({ row: 5, col: 6 }, { type: 'all', skipBlanks: false });

          // Should be overwritten
          expect(store.getCell(5, 7)?.value).toBeNull();
        });
      });

      describe('transpose', () => {
        it('should transpose rows and columns', () => {
          // Copy 2x3 range: A1:C2
          clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 1, endCol: 2 });
          clipboard.paste({ row: 5, col: 5 }, { type: 'all', transpose: true });

          // Should become 3x2 range
          // Original: (0,0)=100, (0,1)=200, (0,2)=Text
          //           (1,0)=formula, (1,1)=true, (1,2)=null
          // Transposed: (5,5)=100, (5,6)=formula
          //             (6,5)=200, (6,6)=true
          //             (7,5)=Text, (7,6)=null
          expect(store.getCell(5, 5)?.value).toBe(100);
          expect(store.getCell(6, 5)?.value).toBe(200);
          expect(store.getCell(7, 5)?.value).toBe('Text');
          expect(store.getCell(6, 6)?.value).toBe(true);
        });
      });

      describe('operations', () => {
        beforeEach(() => {
          // Set up destination with numbers
          store.setCell(5, 5, { value: 10, type: 'number' });
          store.setCell(5, 6, { value: 20, type: 'number' });

          // Copy source numbers
          store.setCell(10, 0, { value: 3, type: 'number' });
          store.setCell(10, 1, { value: 5, type: 'number' });
          clipboard.copyRange({ startRow: 10, startCol: 0, endRow: 10, endCol: 1 });
        });

        it('should add values', () => {
          clipboard.paste({ row: 5, col: 5 }, { type: 'values', operation: 'add' });

          expect(store.getCell(5, 5)?.value).toBe(13); // 10 + 3
          expect(store.getCell(5, 6)?.value).toBe(25); // 20 + 5
        });

        it('should subtract values', () => {
          clipboard.paste({ row: 5, col: 5 }, { type: 'values', operation: 'subtract' });

          expect(store.getCell(5, 5)?.value).toBe(7); // 10 - 3
          expect(store.getCell(5, 6)?.value).toBe(15); // 20 - 5
        });

        it('should multiply values', () => {
          clipboard.paste({ row: 5, col: 5 }, { type: 'values', operation: 'multiply' });

          expect(store.getCell(5, 5)?.value).toBe(30); // 10 * 3
          expect(store.getCell(5, 6)?.value).toBe(100); // 20 * 5
        });

        it('should divide values', () => {
          clipboard.paste({ row: 5, col: 5 }, { type: 'values', operation: 'divide' });

          expect(store.getCell(5, 5)?.value).toBeCloseTo(3.33, 1); // 10 / 3
          expect(store.getCell(5, 6)?.value).toBe(4); // 20 / 5
        });

        it('should handle divide by zero', () => {
          store.setCell(10, 0, { value: 0, type: 'number' });
          clipboard.copyRange({ startRow: 10, startCol: 0, endRow: 10, endCol: 0 });

          clipboard.paste({ row: 5, col: 5 }, { type: 'values', operation: 'divide' });

          expect(store.getCell(5, 5)?.value).toBe('#DIV/0!');
        });
      });
    });

    describe('paste() - formula adjustment', () => {
      it('should adjust relative references', () => {
        store.setCell(0, 0, { value: '=B1+C1', formula: '=B1+C1', type: 'formula' });
        clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

        clipboard.paste({ row: 5, col: 2 }); // 5 rows down, 2 cols right

        expect(store.getCell(5, 2)?.formula).toBe('=D6+E6');
      });

      it('should preserve absolute row references', () => {
        store.setCell(0, 0, { value: '=A$1', formula: '=A$1', type: 'formula' });
        clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

        clipboard.paste({ row: 5, col: 0 });

        expect(store.getCell(5, 0)?.formula).toBe('=A$1');
      });

      it('should preserve absolute column references', () => {
        store.setCell(0, 0, { value: '=$A1', formula: '=$A1', type: 'formula' });
        clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

        clipboard.paste({ row: 0, col: 5 });

        expect(store.getCell(0, 5)?.formula).toBe('=$A1');
      });

      it('should preserve fully absolute references', () => {
        store.setCell(0, 0, { value: '=$A$1', formula: '=$A$1', type: 'formula' });
        clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

        clipboard.paste({ row: 5, col: 5 });

        expect(store.getCell(5, 5)?.formula).toBe('=$A$1');
      });

      it('should handle multi-cell references', () => {
        store.setCell(0, 0, { value: '=SUM(A1:B2)', formula: '=SUM(A1:B2)', type: 'formula' });
        clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

        clipboard.paste({ row: 3, col: 3 }); // 3 rows down, 3 cols right

        expect(store.getCell(3, 3)?.formula).toBe('=SUM(D4:E5)');
      });

      it('should not adjust to negative row/column', () => {
        store.setCell(1, 1, { value: '=A1', formula: '=A1', type: 'formula' });
        clipboard.copyRange({ startRow: 1, startCol: 1, endRow: 1, endCol: 1 });

        clipboard.paste({ row: 0, col: 0 }); // 1 row up, 1 col left

        // Should clamp to A1 (row 1, col A minimum)
        expect(store.getCell(0, 0)?.formula).toMatch(/=[A-Z]+1/);
      });
    });

    describe('paste() - cut behavior', () => {
      it('should clear source after paste', () => {
        clipboard.cutRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
        clipboard.paste({ row: 5, col: 5 });

        expect(store.getCell(0, 0)).toBeNull();
      });

      it('should clear clipboard after cut-paste', () => {
        clipboard.cutRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
        clipboard.paste({ row: 5, col: 5 });

        expect(clipboard.hasData()).toBe(false);
      });

      it('should allow multiple pastes with copy', () => {
        clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

        clipboard.paste({ row: 5, col: 5 });
        clipboard.paste({ row: 6, col: 6 });
        clipboard.paste({ row: 7, col: 7 });

        expect(store.getCell(5, 5)?.value).toBe(100);
        expect(store.getCell(6, 6)?.value).toBe(100);
        expect(store.getCell(7, 7)?.value).toBe(100);
      });

      it('should only allow one paste with cut', () => {
        clipboard.cutRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

        const result1 = clipboard.paste({ row: 5, col: 5 });
        const result2 = clipboard.paste({ row: 6, col: 6 });

        expect(result1.success).toBe(true);
        expect(result2.success).toBe(false);
        expect(result2.error).toBe('No clipboard data');
      });
    });

    describe('pasteToRange() - pattern fill', () => {
      it('should repeat pattern to fill larger range', () => {
        // Copy 1x2 range
        clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 1 });

        // Paste to 2x4 range
        const result = clipboard.pasteToRange({
          startRow: 5, startCol: 5, endRow: 6, endCol: 8,
        });

        expect(result.success).toBe(true);

        // Pattern should repeat: 100, 200, 100, 200
        expect(store.getCell(5, 5)?.value).toBe(100);
        expect(store.getCell(5, 6)?.value).toBe(200);
        expect(store.getCell(5, 7)?.value).toBe(100);
        expect(store.getCell(5, 8)?.value).toBe(200);

        // Same pattern in second row
        expect(store.getCell(6, 5)?.value).toBe(100);
        expect(store.getCell(6, 6)?.value).toBe(200);
      });

      it('should handle transpose in pattern fill', () => {
        // Copy 2x1 range (column)
        clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 1, endCol: 0 });

        // Paste transposed to 1x4 range (row)
        clipboard.pasteToRange(
          { startRow: 5, startCol: 5, endRow: 5, endCol: 8 },
          { transpose: true }
        );

        // Should repeat horizontally: 100, formula result, 100, formula result
        expect(store.getCell(5, 5)?.value).toBe(100);
        expect(store.getCell(5, 7)?.value).toBe(100);
      });
    });
  });

  // ===========================================================================
  // External Paste
  // ===========================================================================

  describe('External Paste', () => {
    let store: SparseDataStore;
    let clipboard: ClipboardManager;

    beforeEach(() => {
      store = new SparseDataStore();
      clipboard = new ClipboardManager(store);
    });

    it('should paste tab-separated text', () => {
      const text = 'A\tB\tC\n1\t2\t3';
      const result = clipboard.pasteExternal(text, { row: 0, col: 0 });

      expect(result.pastedCells.length).toBe(6);
      expect(store.getCell(0, 0)?.value).toBe('A');
      expect(store.getCell(0, 1)?.value).toBe('B');
      expect(store.getCell(0, 2)?.value).toBe('C');
      expect(store.getCell(1, 0)?.value).toBe(1);
      expect(store.getCell(1, 1)?.value).toBe(2);
      expect(store.getCell(1, 2)?.value).toBe(3);
    });

    it('should detect and parse numbers', () => {
      const text = '100\n200.5\n-300';
      clipboard.pasteExternal(text, { row: 0, col: 0 });

      expect(store.getCell(0, 0)?.type).toBe('number');
      expect(store.getCell(1, 0)?.type).toBe('number');
      expect(store.getCell(1, 0)?.value).toBe(200.5);
      expect(store.getCell(2, 0)?.type).toBe('number');
      expect(store.getCell(2, 0)?.value).toBe(-300);
    });

    it('should detect booleans', () => {
      const text = 'TRUE\nFALSE\ntrue\nfalse';
      clipboard.pasteExternal(text, { row: 0, col: 0 });

      expect(store.getCell(0, 0)?.value).toBe(true);
      expect(store.getCell(1, 0)?.value).toBe(false);
      expect(store.getCell(2, 0)?.value).toBe(true);
      expect(store.getCell(3, 0)?.value).toBe(false);
    });

    it('should handle empty cells', () => {
      const text = 'A\t\tC';
      clipboard.pasteExternal(text, { row: 0, col: 0 });

      expect(store.getCell(0, 0)?.value).toBe('A');
      expect(store.getCell(0, 1)?.value).toBeNull();
      expect(store.getCell(0, 2)?.value).toBe('C');
    });

    it('should return pasted range', () => {
      const text = 'A\tB\nC\tD';
      const result = clipboard.pasteExternal(text, { row: 5, col: 5 });

      expect(result.pastedRange).toEqual({
        startRow: 5, startCol: 5, endRow: 6, endCol: 6,
      });
    });

    it('should handle Windows line endings', () => {
      const text = 'A\r\nB\r\nC';
      clipboard.pasteExternal(text, { row: 0, col: 0 });

      expect(store.getCell(0, 0)?.value).toBe('A');
      expect(store.getCell(1, 0)?.value).toBe('B');
      expect(store.getCell(2, 0)?.value).toBe('C');
    });
  });

  // ===========================================================================
  // Clear
  // ===========================================================================

  describe('Clear', () => {
    let store: SparseDataStore;
    let clipboard: ClipboardManager;

    beforeEach(() => {
      store = createTestDataStore();
      clipboard = new ClipboardManager(store);
    });

    it('should clear clipboard data', () => {
      clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      expect(clipboard.hasData()).toBe(true);

      clipboard.clear();

      expect(clipboard.hasData()).toBe(false);
      expect(clipboard.getData()).toBeNull();
    });

    it('should clear cut operation state', () => {
      clipboard.cutRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      expect(clipboard.isCutOperation()).toBe(true);

      clipboard.clear();

      expect(clipboard.isCutOperation()).toBe(false);
    });
  });

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  describe('Event Handlers', () => {
    let store: SparseDataStore;
    let clipboard: ClipboardManager;

    beforeEach(() => {
      store = createTestDataStore();
      clipboard = new ClipboardManager(store);
    });

    it('should call onClipboardChange on copy', () => {
      const onClipboardChange = vi.fn();
      clipboard.setEventHandlers({ onClipboardChange });

      clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

      expect(onClipboardChange).toHaveBeenCalledTimes(1);
      expect(onClipboardChange).toHaveBeenCalledWith(expect.objectContaining({
        type: 'copy',
      }));
    });

    it('should call onClipboardChange on clear', () => {
      const onClipboardChange = vi.fn();
      clipboard.setEventHandlers({ onClipboardChange });
      clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

      onClipboardChange.mockClear();
      clipboard.clear();

      expect(onClipboardChange).toHaveBeenCalledWith(null);
    });

    it('should call onPaste on paste', () => {
      const onPaste = vi.fn();
      clipboard.setEventHandlers({ onPaste });
      clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

      clipboard.paste({ row: 5, col: 5 });

      expect(onPaste).toHaveBeenCalledTimes(1);
      expect(onPaste).toHaveBeenCalledWith(
        expect.objectContaining({ startRow: 5, startCol: 5 }),
        expect.arrayContaining([{ row: 5, col: 5 }])
      );
    });

    it('should call onCutComplete after cut-paste', () => {
      const onCutComplete = vi.fn();
      clipboard.setEventHandlers({ onCutComplete });
      clipboard.cutRange({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 });

      clipboard.paste({ row: 5, col: 5 });

      expect(onCutComplete).toHaveBeenCalledWith(
        expect.objectContaining({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 })
      );
    });

    it('should call onClipboardChange(null) after cut-paste', () => {
      const onClipboardChange = vi.fn();
      clipboard.setEventHandlers({ onClipboardChange });
      clipboard.cutRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

      onClipboardChange.mockClear();
      clipboard.paste({ row: 5, col: 5 });

      expect(onClipboardChange).toHaveBeenCalledWith(null);
    });

    it('should merge event handlers', () => {
      const onClipboardChange = vi.fn();
      const onPaste = vi.fn();

      clipboard.setEventHandlers({ onClipboardChange });
      clipboard.setEventHandlers({ onPaste });

      clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      clipboard.paste({ row: 5, col: 5 });

      expect(onClipboardChange).toHaveBeenCalled();
      expect(onPaste).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    let store: SparseDataStore;
    let clipboard: ClipboardManager;

    beforeEach(() => {
      store = new SparseDataStore();
      clipboard = new ClipboardManager(store);
    });

    it('should handle empty range copy', () => {
      const data = clipboard.copyRange({ startRow: 100, startCol: 100, endRow: 100, endCol: 100 });

      expect(data.cells.length).toBe(1);
      expect(data.cells[0].cell.type).toBe('empty');
    });

    it('should handle copy of cells with no format', () => {
      store.setCell(0, 0, { value: 'NoFormat', type: 'string' });
      const data = clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

      expect(data.cells[0].cell.format).toBeUndefined();
    });

    it('should handle paste to cell with existing formula', () => {
      store.setCell(5, 5, { value: '=A1', formula: '=A1', type: 'formula' });
      store.setCell(0, 0, { value: 100, type: 'number' });

      clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      clipboard.paste({ row: 5, col: 5 }, 'values');

      const cell = store.getCell(5, 5);
      expect(cell?.value).toBe(100);
      expect(cell?.formula).toBeUndefined();
    });

    it('should handle very large clipboard data', () => {
      // Create 100x100 grid
      for (let row = 0; row < 100; row++) {
        for (let col = 0; col < 100; col++) {
          store.setCell(row, col, { value: row * 100 + col, type: 'number' });
        }
      }

      const data = clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 99, endCol: 99 });

      expect(data.cells.length).toBe(10000);
      expect(data.rows).toBe(100);
      expect(data.cols).toBe(100);
    });

    it('should handle special characters in text', () => {
      store.setCell(0, 0, { value: '<script>alert("xss")</script>', type: 'string' });
      const data = clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

      expect(data.html).toContain('&lt;script&gt;');
      expect(data.html).not.toContain('<script>');
    });

    it('should handle unicode in text', () => {
      store.setCell(0, 0, { value: '你好世界 🌍 Ελληνικά', type: 'string' });
      const data = clipboard.copyRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

      expect(data.plainText).toBe('你好世界 🌍 Ελληνικά');
    });

    it('should handle column letters beyond Z (AA, AB, etc.)', () => {
      store.setCell(0, 26, { value: '=AA1+AB1', formula: '=AA1+AB1', type: 'formula' });
      clipboard.copyRange({ startRow: 0, startCol: 26, endRow: 0, endCol: 26 });

      clipboard.paste({ row: 1, col: 27 }); // 1 row down, 1 col right

      expect(store.getCell(1, 27)?.formula).toBe('=AB2+AC2');
    });

    it('should handle paste at row/col 0', () => {
      store.setCell(5, 5, { value: 'Test', type: 'string' });
      clipboard.copyRange({ startRow: 5, startCol: 5, endRow: 5, endCol: 5 });

      clipboard.paste({ row: 0, col: 0 });

      expect(store.getCell(0, 0)?.value).toBe('Test');
    });

    it('should handle empty source ranges array', () => {
      const data = clipboard.copyRanges([]);

      expect(data.cells.length).toBe(0);
      expect(data.sourceRange).toEqual({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 });
    });
  });
});
