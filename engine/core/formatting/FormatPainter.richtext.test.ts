/**
 * FormatPainter - Character-Level Formatting Tests
 * Week 5 Implementation: Format painter copies character-level formats
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FormatPainter, type FormatReader, type FormatWriter } from './FormatPainter.js';
import type { CellFormat, CellBorders, FormatRun } from '../types/index.js';

describe('FormatPainter - Character-Level Formatting', () => {
  let formatPainter: FormatPainter;
  let mockReader: FormatReader;
  let mockWriter: FormatWriter;
  let writtenFormats: Map<string, CellFormat | undefined>;
  let writtenBorders: Map<string, CellBorders | undefined>;
  let writtenCharacterFormats: Map<string, FormatRun[] | null>;

  beforeEach(() => {
    formatPainter = new FormatPainter();
    writtenFormats = new Map();
    writtenBorders = new Map();
    writtenCharacterFormats = new Map();

    // Mock reader with character format support
    mockReader = {
      getFormat: (row: number, col: number) => {
        const key = `${row},${col}`;
        return writtenFormats.get(key);
      },
      getBorders: (row: number, col: number) => {
        const key = `${row},${col}`;
        return writtenBorders.get(key);
      },
      getCharacterFormats: (row: number, col: number) => {
        const key = `${row},${col}`;
        return writtenCharacterFormats.get(key) ?? null;
      },
    };

    // Mock writer with character format support
    mockWriter = {
      setFormat: (row: number, col: number, format: CellFormat | undefined) => {
        writtenFormats.set(`${row},${col}`, format);
      },
      setBorders: (row: number, col: number, borders: CellBorders | undefined) => {
        writtenBorders.set(`${row},${col}`, borders);
      },
      setCharacterFormats: (row: number, col: number, runs: FormatRun[] | null) => {
        writtenCharacterFormats.set(`${row},${col}`, runs);
      },
    };
  });

  // ===========================================================================
  // Pick Character Formats
  // ===========================================================================

  describe('Pick Character Formats', () => {
    it('should pick character formats from source cell', () => {
      // Setup: Source cell with character formats
      const sourceRuns: FormatRun[] = [
        { start: 0, end: 5, format: { bold: true } },
        { start: 5, end: 10, format: { italic: true } },
      ];

      writtenCharacterFormats.set('0,0', sourceRuns);

      // Action: Pick format
      formatPainter.pick(
        { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
        mockReader
      );

      // Assert: Format painter is active
      expect(formatPainter.isActive()).toBe(true);

      // Assert: Character formats are stored
      const state = formatPainter.getState();
      expect(state.formats).toHaveLength(1);
      expect(state.formats[0].characterFormats).not.toBeNull();
      expect(state.formats[0].characterFormats).toHaveLength(2);
      expect(state.formats[0].characterFormats![0].format?.bold).toBe(true);
      expect(state.formats[0].characterFormats![1].format?.italic).toBe(true);
    });

    it('should deep clone character formats (prevent mutation)', () => {
      // Setup: Source runs
      const sourceRuns: FormatRun[] = [
        { start: 0, end: 5, format: { bold: true } },
      ];

      writtenCharacterFormats.set('0,0', sourceRuns);

      // Action: Pick format
      formatPainter.pick(
        { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
        mockReader
      );

      // Modify source runs
      sourceRuns[0].format!.italic = true;

      // Assert: Stored formats unchanged
      const state = formatPainter.getState();
      expect(state.formats[0].characterFormats![0].format?.italic).toBeUndefined();
    });

    it('should handle cell with no character formats', () => {
      // Setup: Cell with no character formats
      writtenCharacterFormats.set('0,0', null);

      // Action: Pick format
      formatPainter.pick(
        { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
        mockReader
      );

      // Assert: Format painter stores null for character formats
      const state = formatPainter.getState();
      expect(state.formats[0].characterFormats).toBeNull();
    });
  });

  // ===========================================================================
  // Apply Character Formats
  // ===========================================================================

  describe('Apply Character Formats', () => {
    it('should apply character formats to target cell', () => {
      // Setup: Source cell with character formats
      const sourceRuns: FormatRun[] = [
        { start: 0, end: 5, format: { bold: true } },
        { start: 5, end: 12, format: { fontColor: '#FF0000' } },
      ];

      writtenCharacterFormats.set('0,0', sourceRuns);

      // Action: Pick and apply
      formatPainter.pick(
        { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
        mockReader
      );

      const result = formatPainter.apply(
        { startRow: 1, startCol: 0, endRow: 1, endCol: 0 },
        mockWriter
      );

      // Assert: Character formats applied
      expect(result.modifiedCells).toHaveLength(1);

      const appliedRuns = writtenCharacterFormats.get('1,0');
      expect(appliedRuns).not.toBeNull();
      expect(appliedRuns).toHaveLength(2);
      expect(appliedRuns![0].format?.bold).toBe(true);
      expect(appliedRuns![1].format?.fontColor).toBe('#FF0000');
    });

    it('should deep clone character formats when applying (prevent mutation)', () => {
      // Setup: Source runs
      const sourceRuns: FormatRun[] = [
        { start: 0, end: 5, format: { bold: true } },
      ];

      writtenCharacterFormats.set('0,0', sourceRuns);

      // Action: Pick (persistent mode to allow multiple applies)
      formatPainter.pick(
        { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
        mockReader,
        { persistent: true }
      );

      formatPainter.apply(
        { startRow: 1, startCol: 0, endRow: 1, endCol: 0 },
        mockWriter
      );

      // Modify applied runs
      const appliedRuns = writtenCharacterFormats.get('1,0');
      appliedRuns![0].format!.italic = true;

      // Assert: Can apply again without mutation
      formatPainter.apply(
        { startRow: 2, startCol: 0, endRow: 2, endCol: 0 },
        mockWriter
      );

      const secondApplied = writtenCharacterFormats.get('2,0');
      expect(secondApplied![0].format?.italic).toBeUndefined();
      expect(secondApplied![0].format?.bold).toBe(true);
    });

    it('should tile character formats when applying to larger range', () => {
      // Setup: 2x1 source with different character formats
      const runs1: FormatRun[] = [
        { start: 0, end: 5, format: { bold: true } },
      ];
      const runs2: FormatRun[] = [
        { start: 0, end: 5, format: { italic: true } },
      ];

      writtenCharacterFormats.set('0,0', runs1);
      writtenCharacterFormats.set('0,1', runs2);

      // Action: Pick 2 cells and apply to 4 cells
      formatPainter.pick(
        { startRow: 0, startCol: 0, endRow: 0, endCol: 1 },
        mockReader
      );

      formatPainter.apply(
        { startRow: 1, startCol: 0, endRow: 1, endCol: 3 },
        mockWriter
      );

      // Assert: Pattern tiles (bold, italic, bold, italic)
      expect(writtenCharacterFormats.get('1,0')![0].format?.bold).toBe(true);
      expect(writtenCharacterFormats.get('1,1')![0].format?.italic).toBe(true);
      expect(writtenCharacterFormats.get('1,2')![0].format?.bold).toBe(true);
      expect(writtenCharacterFormats.get('1,3')![0].format?.italic).toBe(true);
    });

    it('should handle complex character formats (all properties)', () => {
      // Setup: Complex character format
      const sourceRuns: FormatRun[] = [
        {
          start: 0,
          end: 10,
          format: {
            fontFamily: 'Arial',
            fontSize: 14,
            fontColor: '#0000FF',
            bold: true,
            italic: true,
            underline: 1,
            strikethrough: true,
          },
        },
      ];

      writtenCharacterFormats.set('0,0', sourceRuns);

      // Action: Pick and apply
      formatPainter.pick(
        { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
        mockReader
      );

      formatPainter.apply(
        { startRow: 1, startCol: 0, endRow: 1, endCol: 0 },
        mockWriter
      );

      // Assert: All format properties copied
      const appliedRuns = writtenCharacterFormats.get('1,0');
      const format = appliedRuns![0].format!;

      expect(format.fontFamily).toBe('Arial');
      expect(format.fontSize).toBe(14);
      expect(format.fontColor).toBe('#0000FF');
      expect(format.bold).toBe(true);
      expect(format.italic).toBe(true);
      expect(format.underline).toBe(1);
      expect(format.strikethrough).toBe(true);
    });
  });

  // ===========================================================================
  // Mode Handling
  // ===========================================================================

  describe('Mode Handling', () => {
    it('should clear after single apply (single-use mode)', () => {
      // Setup: Source with character formats
      const sourceRuns: FormatRun[] = [
        { start: 0, end: 5, format: { bold: true } },
      ];

      writtenCharacterFormats.set('0,0', sourceRuns);

      // Action: Pick (single-use mode)
      formatPainter.pick(
        { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
        mockReader
      );

      // Apply once
      formatPainter.apply(
        { startRow: 1, startCol: 0, endRow: 1, endCol: 0 },
        mockWriter
      );

      // Assert: Format painter cleared
      expect(formatPainter.isActive()).toBe(false);
    });

    it('should stay active in persistent mode', () => {
      // Setup: Source with character formats
      const sourceRuns: FormatRun[] = [
        { start: 0, end: 5, format: { bold: true } },
      ];

      writtenCharacterFormats.set('0,0', sourceRuns);

      // Action: Pick (persistent mode)
      formatPainter.pick(
        { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
        mockReader,
        { persistent: true }
      );

      // Apply twice
      formatPainter.apply(
        { startRow: 1, startCol: 0, endRow: 1, endCol: 0 },
        mockWriter
      );

      formatPainter.apply(
        { startRow: 2, startCol: 0, endRow: 2, endCol: 0 },
        mockWriter
      );

      // Assert: Still active
      expect(formatPainter.isActive()).toBe(true);

      // Assert: Both applies worked
      expect(writtenCharacterFormats.get('1,0')).not.toBeNull();
      expect(writtenCharacterFormats.get('2,0')).not.toBeNull();
    });
  });

  // ===========================================================================
  // Excel Compatibility
  // ===========================================================================

  describe('Excel Compatibility', () => {
    it('should match Excel: copy cell format + character formats together', () => {
      // Setup: Cell with both cell format and character formats
      const cellFormat: CellFormat = {
        backgroundColor: '#FFFF00',
      };

      const characterFormats: FormatRun[] = [
        { start: 0, end: 5, format: { bold: true } },
      ];

      writtenFormats.set('0,0', cellFormat);
      writtenCharacterFormats.set('0,0', characterFormats);

      // Action: Pick and apply
      formatPainter.pick(
        { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
        mockReader
      );

      formatPainter.apply(
        { startRow: 1, startCol: 0, endRow: 1, endCol: 0 },
        mockWriter
      );

      // Assert: Both cell format and character formats applied
      const appliedFormat = writtenFormats.get('1,0');
      const appliedCharFormats = writtenCharacterFormats.get('1,0');

      expect(appliedFormat?.backgroundColor).toBe('#FFFF00');
      expect(appliedCharFormats).not.toBeNull();
      expect(appliedCharFormats![0].format?.bold).toBe(true);
    });

    it('should match Excel: character formats independent of cell format', () => {
      // Setup: Cell with character formats but no cell format
      const characterFormats: FormatRun[] = [
        { start: 0, end: 5, format: { fontColor: '#FF0000' } },
      ];

      writtenFormats.set('0,0', undefined);
      writtenCharacterFormats.set('0,0', characterFormats);

      // Action: Pick and apply
      formatPainter.pick(
        { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
        mockReader
      );

      formatPainter.apply(
        { startRow: 1, startCol: 0, endRow: 1, endCol: 0 },
        mockWriter
      );

      // Assert: Character formats applied even without cell format
      const appliedCharFormats = writtenCharacterFormats.get('1,0');
      expect(appliedCharFormats).not.toBeNull();
      expect(appliedCharFormats![0].format?.fontColor).toBe('#FF0000');
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle empty character format runs array', () => {
      // Setup: Cell with empty runs array
      writtenCharacterFormats.set('0,0', []);

      // Action: Pick and apply
      formatPainter.pick(
        { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
        mockReader
      );

      formatPainter.apply(
        { startRow: 1, startCol: 0, endRow: 1, endCol: 0 },
        mockWriter
      );

      // Assert: Empty array preserved
      const appliedRuns = writtenCharacterFormats.get('1,0');
      expect(appliedRuns).toEqual([]);
    });

    it('should handle writer without setCharacterFormats support (backward compatibility)', () => {
      // Setup: Writer without character format support
      const basicWriter: FormatWriter = {
        setFormat: (row: number, col: number, format: CellFormat | undefined) => {
          writtenFormats.set(`${row},${col}`, format);
        },
        setBorders: (row: number, col: number, borders: CellBorders | undefined) => {
          writtenBorders.set(`${row},${col}`, borders);
        },
        // No setCharacterFormats method
      };

      const sourceRuns: FormatRun[] = [
        { start: 0, end: 5, format: { bold: true } },
      ];

      writtenCharacterFormats.set('0,0', sourceRuns);

      // Action: Pick and apply
      formatPainter.pick(
        { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
        mockReader
      );

      // Should not throw
      expect(() => {
        formatPainter.apply(
          { startRow: 1, startCol: 0, endRow: 1, endCol: 0 },
          basicWriter
        );
      }).not.toThrow();
    });

    it('should handle reader without getCharacterFormats support (backward compatibility)', () => {
      // Setup: Reader without character format support
      const basicReader: FormatReader = {
        getFormat: (row: number, col: number) => undefined,
        getBorders: (row: number, col: number) => undefined,
        // No getCharacterFormats method
      };

      // Should not throw
      expect(() => {
        formatPainter.pick(
          { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
          basicReader
        );
      }).not.toThrow();

      // Assert: Character formats are null
      const state = formatPainter.getState();
      expect(state.formats[0].characterFormats).toBeNull();
    });
  });
});
