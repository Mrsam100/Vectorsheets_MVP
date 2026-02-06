/**
 * FillHandle - FormattedText Support Tests
 * Week 5 Implementation: Fill operations preserve character-level formatting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FillHandle } from './FillHandle.js';
import { SparseDataStore } from '../data/SparseDataStore.js';
import type { Cell, CellRange, FormattedText } from '../types/index.js';

describe('FillHandle - FormattedText Support', () => {
  let dataStore: SparseDataStore;
  let fillHandle: FillHandle;

  beforeEach(() => {
    dataStore = new SparseDataStore();
    fillHandle = new FillHandle(dataStore);
  });

  /**
   * Helper function to perform a fill operation.
   * FillHandle uses drag-based API, so we simulate the drag workflow.
   */
  function performFill(sourceRange: CellRange, targetRange: CellRange): number {
    // Start drag from source
    fillHandle.startDrag(sourceRange);

    // Determine target cell based on target range and direction
    // For down/right: use end of target range
    // For up/left: use start of target range
    const isDown = targetRange.startRow > sourceRange.endRow;
    const isRight = targetRange.startCol > sourceRange.endCol;

    const targetCell = {
      row: isDown ? targetRange.endRow : targetRange.startRow,
      col: isRight ? targetRange.endCol : targetRange.startCol,
    };

    // Update drag to target
    fillHandle.updateDrag(targetCell);

    // End drag (performs the fill)
    const filledCells = fillHandle.endDrag();

    return filledCells.length;
  }

  // ===========================================================================
  // Fill Down with FormattedText
  // ===========================================================================

  describe('Fill Down - Copy FormattedText', () => {
    it('should preserve FormattedText when filling down (copy pattern)', () => {
      // Setup: Cell with FormattedText (bold text)
      const sourceCell: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'Good morning',
          runs: [{ start: 5, end: 12, format: { bold: true } }],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, sourceCell);

      // Action: Fill down 3 cells
      const sourceRange: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
      const targetRange: CellRange = { startRow: 1, startCol: 0, endRow: 3, endCol: 0 };

      const filledCount = performFill(sourceRange, targetRange);

      // Assert: All filled cells have FormattedText
      expect(filledCount).toBe(3);

      for (let row = 1; row <= 3; row++) {
        const cell = dataStore.getCell(row, 0);
        expect(cell).toBeDefined();

        const value = cell!.value as FormattedText;
        expect(value._type).toBe('FormattedText');
        expect(value.text).toBe('Good morning');
        expect(value.runs).toHaveLength(1);
        expect(value.runs[0].start).toBe(5);
        expect(value.runs[0].end).toBe(12);
        expect(value.runs[0].format?.bold).toBe(true);
      }
    });

    it('should deep clone FormattedText (no mutation of source)', () => {
      // Setup: Cell with FormattedText
      const originalValue: FormattedText = {
        _type: 'FormattedText',
        text: 'Original',
        runs: [{ start: 0, end: 8, format: { italic: true } }],
      };

      const sourceCell: Cell = {
        value: originalValue,
        type: 'string',
      };

      dataStore.setCell(0, 0, sourceCell);

      // Action: Fill down
      const sourceRange: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
      const targetRange: CellRange = { startRow: 1, startCol: 0, endRow: 1, endCol: 0 };

      performFill(sourceRange, targetRange);

      // Modify filled cell
      const filledCell = dataStore.getCell(1, 0);
      const filledValue = filledCell!.value as FormattedText;
      filledValue.text = 'Modified';
      filledValue.runs[0].format!.bold = true;

      // Assert: Original is unchanged
      const sourceCell2 = dataStore.getCell(0, 0);
      const sourceValue = sourceCell2!.value as FormattedText;
      expect(sourceValue.text).toBe('Original');
      expect(sourceValue.runs[0].format?.bold).toBeUndefined();
      expect(sourceValue.runs[0].format?.italic).toBe(true);
    });

    it('should handle FormattedText with multiple runs', () => {
      // Setup: Cell with multiple format runs
      const sourceCell: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'Red Bold Blue',
          runs: [
            { start: 0, end: 3, format: { fontColor: '#FF0000' } },
            { start: 4, end: 8, format: { bold: true } },
            { start: 9, end: 13, format: { fontColor: '#0000FF' } },
          ],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, sourceCell);

      // Action: Fill down
      const sourceRange: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
      const targetRange: CellRange = { startRow: 1, startCol: 0, endRow: 2, endCol: 0 };

      performFill(sourceRange, targetRange);

      // Assert: All runs preserved
      for (let row = 1; row <= 2; row++) {
        const cell = dataStore.getCell(row, 0);
        const value = cell!.value as FormattedText;

        expect(value.runs).toHaveLength(3);
        expect(value.runs[0].format?.fontColor).toBe('#FF0000');
        expect(value.runs[1].format?.bold).toBe(true);
        expect(value.runs[2].format?.fontColor).toBe('#0000FF');
      }
    });

    it('should handle FormattedText with complex character formats', () => {
      // Setup: Cell with font family, size, underline, strikethrough
      const sourceCell: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'Complex formatting',
          runs: [
            {
              start: 0,
              end: 18,
              format: {
                fontFamily: 'Arial',
                fontSize: 14,
                bold: true,
                italic: true,
                underline: 1,
                strikethrough: true,
                fontColor: '#00FF00',
              },
            },
          ],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, sourceCell);

      // Action: Fill down
      const sourceRange: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
      const targetRange: CellRange = { startRow: 1, startCol: 0, endRow: 1, endCol: 0 };

      performFill(sourceRange, targetRange);

      // Assert: All format properties preserved
      const cell = dataStore.getCell(1, 0);
      const value = cell!.value as FormattedText;
      const format = value.runs[0].format!;

      expect(format.fontFamily).toBe('Arial');
      expect(format.fontSize).toBe(14);
      expect(format.bold).toBe(true);
      expect(format.italic).toBe(true);
      expect(format.underline).toBe(1);
      expect(format.strikethrough).toBe(true);
      expect(format.fontColor).toBe('#00FF00');
    });
  });

  // ===========================================================================
  // Fill Right with FormattedText
  // ===========================================================================

  describe('Fill Right - Copy FormattedText', () => {
    it('should preserve FormattedText when filling right', () => {
      // Setup: Cell with FormattedText
      const sourceCell: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'Horizontal',
          runs: [{ start: 0, end: 10, format: { italic: true } }],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, sourceCell);

      // Action: Fill right 3 cells
      const sourceRange: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
      const targetRange: CellRange = { startRow: 0, startCol: 1, endRow: 0, endCol: 3 };

      const filledCount = performFill(sourceRange, targetRange);

      // Assert: All filled cells have FormattedText
      expect(filledCount).toBe(3);

      for (let col = 1; col <= 3; col++) {
        const cell = dataStore.getCell(0, col);
        const value = cell!.value as FormattedText;

        expect(value._type).toBe('FormattedText');
        expect(value.text).toBe('Horizontal');
        expect(value.runs[0].format?.italic).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Fill Up with FormattedText
  // ===========================================================================

  describe('Fill Up - Copy FormattedText', () => {
    it('should preserve FormattedText when filling up', () => {
      // Setup: Cell with FormattedText at row 3
      const sourceCell: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'Upward',
          runs: [{ start: 0, end: 6, format: { fontColor: '#FF0000' } }],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(3, 0, sourceCell);

      // Action: Fill up to row 0
      const sourceRange: CellRange = { startRow: 3, startCol: 0, endRow: 3, endCol: 0 };
      const targetRange: CellRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 0 };

      performFill(sourceRange, targetRange);

      // Assert: All filled cells have FormattedText
      for (let row = 0; row <= 2; row++) {
        const cell = dataStore.getCell(row, 0);
        const value = cell!.value as FormattedText;

        expect(value._type).toBe('FormattedText');
        expect(value.text).toBe('Upward');
        expect(value.runs[0].format?.fontColor).toBe('#FF0000');
      }
    });
  });

  // ===========================================================================
  // Fill Left with FormattedText
  // ===========================================================================

  describe('Fill Left - Copy FormattedText', () => {
    it('should preserve FormattedText when filling left', () => {
      // Setup: Cell with FormattedText at col 3
      const sourceCell: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'Leftward',
          runs: [{ start: 0, end: 8, format: { underline: 1 } }],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 3, sourceCell);

      // Action: Fill left to col 0
      const sourceRange: CellRange = { startRow: 0, startCol: 3, endRow: 0, endCol: 3 };
      const targetRange: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 2 };

      performFill(sourceRange, targetRange);

      // Assert: All filled cells have FormattedText
      for (let col = 0; col <= 2; col++) {
        const cell = dataStore.getCell(0, col);
        const value = cell!.value as FormattedText;

        expect(value._type).toBe('FormattedText');
        expect(value.text).toBe('Leftward');
        expect(value.runs[0].format?.underline).toBe(1);
      }
    });
  });

  // ===========================================================================
  // Multiple Source Cells (Pattern Repeat)
  // ===========================================================================

  describe('Multiple Source Cells - Pattern Repeat', () => {
    it('should repeat FormattedText pattern when filling from multiple sources', () => {
      // Setup: Two cells with different FormattedText
      const cell1: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'First',
          runs: [{ start: 0, end: 5, format: { bold: true } }],
        } as FormattedText,
        type: 'string',
      };

      const cell2: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'Second',
          runs: [{ start: 0, end: 6, format: { italic: true } }],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, cell1);
      dataStore.setCell(1, 0, cell2);

      // Action: Fill down from 2-cell pattern
      const sourceRange: CellRange = { startRow: 0, startCol: 0, endRow: 1, endCol: 0 };
      const targetRange: CellRange = { startRow: 2, startCol: 0, endRow: 5, endCol: 0 };

      performFill(sourceRange, targetRange);

      // Assert: Pattern repeats (First, Second, First, Second)
      // Row 2: First
      let cell = dataStore.getCell(2, 0);
      let value = cell!.value as FormattedText;
      expect(value.text).toBe('First');
      expect(value.runs[0].format?.bold).toBe(true);

      // Row 3: Second
      cell = dataStore.getCell(3, 0);
      value = cell!.value as FormattedText;
      expect(value.text).toBe('Second');
      expect(value.runs[0].format?.italic).toBe(true);

      // Row 4: First
      cell = dataStore.getCell(4, 0);
      value = cell!.value as FormattedText;
      expect(value.text).toBe('First');
      expect(value.runs[0].format?.bold).toBe(true);

      // Row 5: Second
      cell = dataStore.getCell(5, 0);
      value = cell!.value as FormattedText;
      expect(value.text).toBe('Second');
      expect(value.runs[0].format?.italic).toBe(true);
    });
  });

  // ===========================================================================
  // Backward Compatibility (Plain Text)
  // ===========================================================================

  describe('Backward Compatibility - Plain Text', () => {
    it('should handle plain text cells (no FormattedText)', () => {
      // Setup: Plain text cell
      const sourceCell: Cell = {
        value: 'Plain text',
        type: 'string',
      };

      dataStore.setCell(0, 0, sourceCell);

      // Action: Fill down
      const sourceRange: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
      const targetRange: CellRange = { startRow: 1, startCol: 0, endRow: 2, endCol: 0 };

      performFill(sourceRange, targetRange);

      // Assert: Filled cells have plain text
      for (let row = 1; row <= 2; row++) {
        const cell = dataStore.getCell(row, 0);
        expect(cell!.value).toBe('Plain text');
        expect(typeof cell!.value).toBe('string');
      }
    });

    it('should handle numeric cells', () => {
      // Setup: Numeric cells (linear pattern)
      dataStore.setCell(0, 0, { value: 1, type: 'number' });
      dataStore.setCell(1, 0, { value: 2, type: 'number' });

      // Action: Fill down (should continue pattern: 3, 4, 5)
      const sourceRange: CellRange = { startRow: 0, startCol: 0, endRow: 1, endCol: 0 };
      const targetRange: CellRange = { startRow: 2, startCol: 0, endRow: 4, endCol: 0 };

      performFill(sourceRange, targetRange);

      // Assert: Pattern continues
      expect(dataStore.getCell(2, 0)!.value).toBe(3);
      expect(dataStore.getCell(3, 0)!.value).toBe(4);
      expect(dataStore.getCell(4, 0)!.value).toBe(5);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle empty FormattedText', () => {
      // Setup: Empty FormattedText
      const sourceCell: Cell = {
        value: {
          _type: 'FormattedText',
          text: '',
          runs: [],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, sourceCell);

      // Action: Fill down
      const sourceRange: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
      const targetRange: CellRange = { startRow: 1, startCol: 0, endRow: 1, endCol: 0 };

      performFill(sourceRange, targetRange);

      // Assert: Filled cell has empty FormattedText
      const cell = dataStore.getCell(1, 0);
      const value = cell!.value as FormattedText;
      expect(value._type).toBe('FormattedText');
      expect(value.text).toBe('');
      expect(value.runs).toHaveLength(0);
    });

    it('should handle FormattedText with no runs (plain text equivalent)', () => {
      // Setup: FormattedText with no runs
      const sourceCell: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'No formatting',
          runs: [],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, sourceCell);

      // Action: Fill down
      const sourceRange: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
      const targetRange: CellRange = { startRow: 1, startCol: 0, endRow: 1, endCol: 0 };

      performFill(sourceRange, targetRange);

      // Assert: Filled cell preserves FormattedText structure
      const cell = dataStore.getCell(1, 0);
      const value = cell!.value as FormattedText;
      expect(value._type).toBe('FormattedText');
      expect(value.text).toBe('No formatting');
      expect(value.runs).toHaveLength(0);
    });

    it('should handle FormattedText with gaps between runs', () => {
      // Setup: FormattedText with gaps
      const sourceCell: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'Hello World',
          runs: [
            { start: 0, end: 5, format: { bold: true } },
            // Gap: " " (space at index 5)
            { start: 6, end: 11, format: { italic: true } },
          ],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, sourceCell);

      // Action: Fill down
      const sourceRange: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
      const targetRange: CellRange = { startRow: 1, startCol: 0, endRow: 1, endCol: 0 };

      performFill(sourceRange, targetRange);

      // Assert: Filled cell preserves gaps
      const cell = dataStore.getCell(1, 0);
      const value = cell!.value as FormattedText;
      expect(value.runs).toHaveLength(2);
      expect(value.runs[0].start).toBe(0);
      expect(value.runs[0].end).toBe(5);
      expect(value.runs[1].start).toBe(6);
      expect(value.runs[1].end).toBe(11);
    });
  });

  // ===========================================================================
  // Auto-Fill (Double-Click Behavior)
  // ===========================================================================

  describe('Auto-Fill - FormattedText', () => {
    it('should preserve FormattedText when auto-filling down', () => {
      // Setup: Cell with FormattedText in column A
      // Adjacent column B has data in rows 0-5 (guide for auto-fill)
      const sourceCell: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'Auto',
          runs: [{ start: 0, end: 4, format: { bold: true } }],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, sourceCell);

      // Add guide data in adjacent column
      for (let row = 0; row < 5; row++) {
        dataStore.setCell(row, 1, { value: `Guide${row}`, type: 'string' });
      }

      // Action: Auto-fill (double-click fill handle)
      const sourceRange: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
      const filledCells = fillHandle.autoFill(sourceRange);

      // Assert: Auto-filled cells have FormattedText
      expect(filledCells.length).toBeGreaterThan(0);

      for (const cellRef of filledCells) {
        const cell = dataStore.getCell(cellRef.row, cellRef.col);
        const value = cell!.value as FormattedText;

        expect(value._type).toBe('FormattedText');
        expect(value.text).toBe('Auto');
        expect(value.runs[0].format?.bold).toBe(true);
      }
    });
  });
});
