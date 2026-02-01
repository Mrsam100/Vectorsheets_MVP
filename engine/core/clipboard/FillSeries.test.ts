/**
 * VectorSheet Engine - FillSeries Unit Tests
 *
 * Tests Excel-like auto-fill pattern inference engine.
 * Covers:
 * - Pattern detection (numeric, text, custom lists)
 * - Linear and growth sequences
 * - Day/Month/Quarter name sequences
 * - Text with number patterns (Item1, Item2, ...)
 * - Formula propagation with reference adjustment
 * - Custom list management
 * - Multi-cell range fills
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FillSeries,
  createFillSeries,
  DetectedPattern,
  FillResult,
} from './FillSeries.js';
import { Cell } from '../types/index.js';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a cell with minimal properties.
 */
function createCell(value: string | number | boolean | null, type?: Cell['type'], formula?: string): Cell {
  const cellType: Cell['type'] = type ?? (
    value === null ? 'empty' :
    typeof value === 'number' ? 'number' :
    typeof value === 'boolean' ? 'boolean' :
    (typeof value === 'string' && value.startsWith('=')) ? 'formula' : 'string'
  );

  return {
    value,
    type: cellType,
    formula,
  };
}

/**
 * Create array of number cells.
 */
function numCells(...nums: number[]): Cell[] {
  return nums.map(n => createCell(n, 'number'));
}

/**
 * Create array of string cells.
 */
function strCells(...strs: string[]): Cell[] {
  return strs.map(s => createCell(s, 'string'));
}

/**
 * Create a formula cell.
 */
function formulaCell(formula: string): Cell {
  return createCell(formula, 'formula', formula);
}

// =============================================================================
// Custom Lists Management
// =============================================================================

describe('FillSeries', () => {
  describe('Custom Lists Management', () => {
    let fill: FillSeries;

    beforeEach(() => {
      fill = new FillSeries();
    });

    it('should have built-in lists by default', () => {
      const lists = fill.getCustomLists();

      // Should have day names, month names, quarter names
      expect(lists.length).toBeGreaterThan(0);

      // Check for day names
      const hasDays = lists.some(l =>
        l.includes('Monday') || l.includes('Mon')
      );
      expect(hasDays).toBe(true);

      // Check for month names
      const hasMonths = lists.some(l =>
        l.includes('January') || l.includes('Jan')
      );
      expect(hasMonths).toBe(true);
    });

    it('should add custom list', () => {
      const customList = ['Apple', 'Banana', 'Cherry'];
      fill.addCustomList(customList);

      const lists = fill.getCustomLists();
      const hasCustom = lists.some(l =>
        l.length === 3 && l[0] === 'Apple' && l[1] === 'Banana'
      );
      expect(hasCustom).toBe(true);
    });

    it('should not add list with fewer than 2 items', () => {
      const before = fill.getCustomLists().length;
      fill.addCustomList(['Single']);
      const after = fill.getCustomLists().length;

      expect(after).toBe(before);
    });

    it('should remove custom list', () => {
      const customList = ['One', 'Two', 'Three'];
      fill.addCustomList(customList);

      const removed = fill.removeCustomList(customList);
      expect(removed).toBe(true);

      const lists = fill.getCustomLists();
      const hasCustom = lists.some(l =>
        l.length === 3 && l[0] === 'One'
      );
      expect(hasCustom).toBe(false);
    });

    it('should return false when removing non-existent list', () => {
      const result = fill.removeCustomList(['NotExists']);
      expect(result).toBe(false);
    });

    it('should reset to built-in lists', () => {
      fill.addCustomList(['Custom1', 'Custom2']);
      const before = fill.getCustomLists().length;

      fill.resetCustomLists();
      const after = fill.getCustomLists().length;

      expect(after).toBeLessThan(before);
    });

    it('should return copies of lists (not references)', () => {
      const lists1 = fill.getCustomLists();
      const lists2 = fill.getCustomLists();

      expect(lists1).not.toBe(lists2);
      if (lists1.length > 0) {
        expect(lists1[0]).not.toBe(lists2[0]);
      }
    });
  });

  // ===========================================================================
  // Pattern Analysis - Empty and Single Values
  // ===========================================================================

  describe('Pattern Analysis - Empty/Single', () => {
    let fill: FillSeries;

    beforeEach(() => {
      fill = new FillSeries();
    });

    it('should return copy pattern for empty input', () => {
      const pattern = fill.analyze([]);

      expect(pattern.type).toBe('copy');
      expect(pattern.sourceLength).toBe(0);
    });

    it('should return copy pattern for null cell', () => {
      const pattern = fill.analyze([null]);

      expect(pattern.type).toBe('copy');
      expect(pattern.confidence).toBe(1);
    });

    it('should return number pattern for single number', () => {
      const pattern = fill.analyze(numCells(100));

      expect(pattern.type).toBe('number');
      expect(pattern.step).toBe(1);
      expect(pattern.isLinear).toBe(true);
      expect(pattern.confidence).toBe(0.5); // Lower confidence for single value
    });

    it('should return text pattern for single text', () => {
      const pattern = fill.analyze(strCells('Hello'));

      expect(pattern.type).toBe('text');
      expect(pattern.confidence).toBe(1);
    });

    it('should detect day name from single value', () => {
      const pattern = fill.analyze(strCells('Monday'));

      expect(pattern.type).toBe('dayName');
      expect(pattern.customList).toBeDefined();
      expect(pattern.customListStartIndex).toBe(1); // Monday is index 1
    });

    it('should detect month name from single value', () => {
      const pattern = fill.analyze(strCells('January'));

      expect(pattern.type).toBe('monthName');
      expect(pattern.customListStartIndex).toBe(0);
    });

    it('should detect text with number from single value', () => {
      const pattern = fill.analyze(strCells('Item1'));

      expect(pattern.type).toBe('textWithNumber');
      expect(pattern.textPattern).toBeDefined();
      expect(pattern.textPattern?.prefix).toBe('Item');
      expect(pattern.textPattern?.startNumber).toBe(1);
    });

    it('should return formula pattern for single formula', () => {
      const pattern = fill.analyze([formulaCell('=A1+B1')]);

      expect(pattern.type).toBe('formula');
      expect(pattern.hasFormulas).toBe(true);
    });
  });

  // ===========================================================================
  // Pattern Analysis - Numeric Sequences
  // ===========================================================================

  describe('Pattern Analysis - Numeric Sequences', () => {
    let fill: FillSeries;

    beforeEach(() => {
      fill = new FillSeries();
    });

    it('should detect linear sequence with step 1', () => {
      const pattern = fill.analyze(numCells(1, 2, 3));

      expect(pattern.type).toBe('number');
      expect(pattern.isLinear).toBe(true);
      expect(pattern.step).toBe(1);
      expect(pattern.confidence).toBe(1);
    });

    it('should detect linear sequence with step 5', () => {
      const pattern = fill.analyze(numCells(10, 15, 20, 25));

      expect(pattern.isLinear).toBe(true);
      expect(pattern.step).toBe(5);
    });

    it('should detect linear sequence with negative step', () => {
      const pattern = fill.analyze(numCells(100, 90, 80));

      expect(pattern.isLinear).toBe(true);
      expect(pattern.step).toBe(-10);
    });

    it('should detect linear sequence with step 0 (copy)', () => {
      const pattern = fill.analyze(numCells(5, 5, 5));

      expect(pattern.isLinear).toBe(true);
      expect(pattern.step).toBe(0);
    });

    it('should detect linear sequence with decimals', () => {
      const pattern = fill.analyze(numCells(1.5, 2.0, 2.5, 3.0));

      expect(pattern.isLinear).toBe(true);
      expect(pattern.step).toBeCloseTo(0.5, 10);
    });

    it('should detect growth/geometric sequence', () => {
      const pattern = fill.analyze(numCells(2, 4, 8, 16));

      expect(pattern.type).toBe('number');
      expect(pattern.isGrowth).toBe(true);
      expect(pattern.growthRatio).toBe(2);
    });

    it('should detect growth sequence with ratio 0.5', () => {
      const pattern = fill.analyze(numCells(64, 32, 16, 8));

      expect(pattern.isGrowth).toBe(true);
      expect(pattern.growthRatio).toBe(0.5);
    });

    it('should return copy for non-linear, non-growth numbers', () => {
      const pattern = fill.analyze(numCells(1, 3, 7, 15));

      expect(pattern.type).toBe('copy');
    });

    it('should handle two-value sequence', () => {
      const pattern = fill.analyze(numCells(10, 20));

      expect(pattern.isLinear).toBe(true);
      expect(pattern.step).toBe(10);
    });
  });

  // ===========================================================================
  // Pattern Analysis - Day and Month Names
  // ===========================================================================

  describe('Pattern Analysis - Day/Month Names', () => {
    let fill: FillSeries;

    beforeEach(() => {
      fill = new FillSeries();
    });

    it('should detect full day name sequence', () => {
      const pattern = fill.analyze(strCells('Monday', 'Tuesday', 'Wednesday'));

      expect(pattern.type).toBe('dayName');
      expect(pattern.customList?.length).toBe(7);
      expect(pattern.step).toBe(1);
    });

    it('should detect abbreviated day name sequence', () => {
      const pattern = fill.analyze(strCells('Mon', 'Tue', 'Wed'));

      expect(pattern.type).toBe('dayName');
    });

    it('should detect day names with step 2', () => {
      const pattern = fill.analyze(strCells('Monday', 'Wednesday', 'Friday'));

      expect(pattern.type).toBe('dayName');
      expect(pattern.step).toBe(2);
    });

    it('should handle day name wrap-around', () => {
      const pattern = fill.analyze(strCells('Friday', 'Saturday', 'Sunday'));

      expect(pattern.type).toBe('dayName');
      expect(pattern.step).toBe(1);
    });

    it('should detect full month name sequence', () => {
      const pattern = fill.analyze(strCells('January', 'February', 'March'));

      expect(pattern.type).toBe('monthName');
      expect(pattern.step).toBe(1);
    });

    it('should detect abbreviated month name sequence', () => {
      const pattern = fill.analyze(strCells('Jan', 'Feb', 'Mar'));

      expect(pattern.type).toBe('monthName');
    });

    it('should detect quarter sequence', () => {
      const pattern = fill.analyze(strCells('Q1', 'Q2', 'Q3'));

      expect(pattern.type).toBe('custom');
      expect(pattern.customList).toBeDefined();
    });

    it('should be case-insensitive for list matching', () => {
      const pattern = fill.analyze(strCells('MONDAY', 'TUESDAY'));

      expect(pattern.type).toBe('dayName');
    });
  });

  // ===========================================================================
  // Pattern Analysis - Text with Numbers
  // ===========================================================================

  describe('Pattern Analysis - Text with Numbers', () => {
    let fill: FillSeries;

    beforeEach(() => {
      fill = new FillSeries();
    });

    it('should detect text with trailing number', () => {
      const pattern = fill.analyze(strCells('Item1', 'Item2', 'Item3'));

      expect(pattern.type).toBe('textWithNumber');
      expect(pattern.textPattern?.prefix).toBe('Item');
      expect(pattern.textPattern?.suffix).toBe('');
      expect(pattern.textPattern?.startNumber).toBe(1);
      expect(pattern.textPattern?.step).toBe(1);
    });

    it('should detect text with leading number', () => {
      // Note: '1st', '2nd', '3rd' have different suffixes so don't match
      // Use consistent suffix pattern instead
      const pattern = fill.analyze(strCells('1x', '2x', '3x'));

      expect(pattern.type).toBe('textWithNumber');
      expect(pattern.textPattern?.prefix).toBe('');
      expect(pattern.textPattern?.suffix).toBe('x');
    });

    it('should detect text with number in middle', () => {
      const pattern = fill.analyze(strCells('Row1Cell', 'Row2Cell', 'Row3Cell'));

      expect(pattern.type).toBe('textWithNumber');
      expect(pattern.textPattern?.prefix).toBe('Row');
      expect(pattern.textPattern?.suffix).toBe('Cell');
    });

    it('should detect step in text with number', () => {
      const pattern = fill.analyze(strCells('Step5', 'Step10', 'Step15'));

      expect(pattern.type).toBe('textWithNumber');
      expect(pattern.textPattern?.step).toBe(5);
    });

    it('should preserve digit padding', () => {
      const pattern = fill.analyze(strCells('File001', 'File002', 'File003'));

      expect(pattern.textPattern?.minDigits).toBe(3);
    });

    it('should return text for non-matching prefix/suffix', () => {
      const pattern = fill.analyze(strCells('A1', 'B2', 'C3'));

      expect(pattern.type).toBe('text'); // Different prefixes
    });
  });

  // ===========================================================================
  // Pattern Analysis - Formulas
  // ===========================================================================

  describe('Pattern Analysis - Formulas', () => {
    let fill: FillSeries;

    beforeEach(() => {
      fill = new FillSeries();
    });

    it('should detect all-formula pattern', () => {
      const pattern = fill.analyze([
        formulaCell('=A1'),
        formulaCell('=A2'),
      ]);

      expect(pattern.type).toBe('formula');
      expect(pattern.hasFormulas).toBe(true);
    });

    it('should store formula in source values', () => {
      const pattern = fill.analyze([formulaCell('=SUM(A1:B1)')]);

      expect(pattern.sourceValues[0].formula).toBe('=SUM(A1:B1)');
    });
  });

  // ===========================================================================
  // Pattern Analysis - Mixed Types
  // ===========================================================================

  describe('Pattern Analysis - Mixed Types', () => {
    let fill: FillSeries;

    beforeEach(() => {
      fill = new FillSeries();
    });

    it('should return mixed for number and string', () => {
      const pattern = fill.analyze([
        createCell(1, 'number'),
        createCell('Two', 'string'),
      ]);

      expect(pattern.type).toBe('mixed');
    });

    it('should return mixed for number and boolean', () => {
      const pattern = fill.analyze([
        createCell(1, 'number'),
        createCell(true, 'boolean'),
      ]);

      expect(pattern.type).toBe('mixed');
    });

    it('should handle cells with format', () => {
      const cell: Cell = {
        value: 100,
        type: 'number',
        format: { bold: true },
      };
      const pattern = fill.analyze([cell]);

      expect(pattern.sourceValues[0].format?.bold).toBe(true);
    });
  });

  // ===========================================================================
  // Value Generation - Numeric
  // ===========================================================================

  describe('Value Generation - Numeric', () => {
    let fill: FillSeries;

    beforeEach(() => {
      fill = new FillSeries();
    });

    it('should generate linear sequence', () => {
      const pattern = fill.analyze(numCells(1, 2, 3));
      const result = fill.generate(pattern, 3, 'down');

      expect(result.values.length).toBe(3);
      expect(result.values[0].value).toBe(4);
      expect(result.values[1].value).toBe(5);
      expect(result.values[2].value).toBe(6);
    });

    it('should generate sequence with negative step', () => {
      const pattern = fill.analyze(numCells(10, 8, 6));
      const result = fill.generate(pattern, 3, 'down');

      expect(result.values[0].value).toBe(4);
      expect(result.values[1].value).toBe(2);
      expect(result.values[2].value).toBe(0);
    });

    it('should generate growth sequence', () => {
      const pattern = fill.analyze(numCells(1, 2, 4));
      const result = fill.generate(pattern, 3, 'down');

      expect(result.values[0].value).toBe(8);
      expect(result.values[1].value).toBe(16);
      expect(result.values[2].value).toBe(32);
    });

    it('should include source index in generated values', () => {
      const pattern = fill.analyze(numCells(1, 2));
      const result = fill.generate(pattern, 4, 'down');

      // Source has 2 values, so indices cycle: 0, 1, 0, 1
      expect(result.values[0].sourceIndex).toBe(0);
      expect(result.values[1].sourceIndex).toBe(1);
      expect(result.values[2].sourceIndex).toBe(0);
      expect(result.values[3].sourceIndex).toBe(1);
    });
  });

  // ===========================================================================
  // Value Generation - Text with Numbers
  // ===========================================================================

  describe('Value Generation - Text with Numbers', () => {
    let fill: FillSeries;

    beforeEach(() => {
      fill = new FillSeries();
    });

    it('should generate text with incrementing numbers', () => {
      const pattern = fill.analyze(strCells('Item1', 'Item2'));
      const result = fill.generate(pattern, 3, 'down');

      expect(result.values[0].value).toBe('Item3');
      expect(result.values[1].value).toBe('Item4');
      expect(result.values[2].value).toBe('Item5');
    });

    it('should preserve number padding', () => {
      const pattern = fill.analyze(strCells('File001', 'File002'));
      const result = fill.generate(pattern, 2, 'down');

      expect(result.values[0].value).toBe('File003');
      expect(result.values[1].value).toBe('File004');
    });

    it('should handle step in text with number', () => {
      const pattern = fill.analyze(strCells('Row10', 'Row20'));
      const result = fill.generate(pattern, 2, 'down');

      expect(result.values[0].value).toBe('Row30');
      expect(result.values[1].value).toBe('Row40');
    });
  });

  // ===========================================================================
  // Value Generation - Custom Lists
  // ===========================================================================

  describe('Value Generation - Custom Lists', () => {
    let fill: FillSeries;

    beforeEach(() => {
      fill = new FillSeries();
    });

    it('should generate day names sequence', () => {
      const pattern = fill.analyze(strCells('Monday', 'Tuesday'));
      const result = fill.generate(pattern, 5, 'down');

      expect(result.values[0].value).toBe('Wednesday');
      expect(result.values[1].value).toBe('Thursday');
      expect(result.values[2].value).toBe('Friday');
      expect(result.values[3].value).toBe('Saturday');
      expect(result.values[4].value).toBe('Sunday');
    });

    it('should wrap around day names', () => {
      const pattern = fill.analyze(strCells('Saturday', 'Sunday'));
      const result = fill.generate(pattern, 2, 'down');

      expect(result.values[0].value).toBe('Monday');
      expect(result.values[1].value).toBe('Tuesday');
    });

    it('should generate month names sequence', () => {
      const pattern = fill.analyze(strCells('October', 'November'));
      const result = fill.generate(pattern, 3, 'down');

      expect(result.values[0].value).toBe('December');
      expect(result.values[1].value).toBe('January');
      expect(result.values[2].value).toBe('February');
    });

    it('should preserve case from source', () => {
      const pattern = fill.analyze(strCells('MONDAY', 'TUESDAY'));
      const result = fill.generate(pattern, 1, 'down');

      expect(result.values[0].value).toBe('WEDNESDAY');
    });

    it('should generate from custom added list', () => {
      fill.addCustomList(['Red', 'Green', 'Blue']);
      const pattern = fill.analyze(strCells('Red', 'Green'));
      const result = fill.generate(pattern, 2, 'down');

      expect(result.values[0].value).toBe('Blue');
      expect(result.values[1].value).toBe('Red'); // Wraps around
    });
  });

  // ===========================================================================
  // Value Generation - Formulas
  // ===========================================================================

  describe('Value Generation - Formulas', () => {
    let fill: FillSeries;

    beforeEach(() => {
      fill = new FillSeries();
    });

    it('should adjust formula references going down', () => {
      const pattern = fill.analyze([formulaCell('=A1')]);
      const result = fill.generate(pattern, 3, 'down');

      expect(result.values[0].formula).toBe('=A2');
      expect(result.values[1].formula).toBe('=A3');
      expect(result.values[2].formula).toBe('=A4');
    });

    it('should adjust formula references going right', () => {
      const pattern = fill.analyze([formulaCell('=A1')]);
      const result = fill.generate(pattern, 3, 'right');

      expect(result.values[0].formula).toBe('=B1');
      expect(result.values[1].formula).toBe('=C1');
      expect(result.values[2].formula).toBe('=D1');
    });

    it('should adjust formula references going up', () => {
      const pattern = fill.analyze([formulaCell('=A5')]);
      const result = fill.generate(pattern, 3, 'up');

      expect(result.values[0].formula).toBe('=A4');
      expect(result.values[1].formula).toBe('=A3');
      expect(result.values[2].formula).toBe('=A2');
    });

    it('should adjust formula references going left', () => {
      const pattern = fill.analyze([formulaCell('=E1')]);
      const result = fill.generate(pattern, 3, 'left');

      expect(result.values[0].formula).toBe('=D1');
      expect(result.values[1].formula).toBe('=C1');
      expect(result.values[2].formula).toBe('=B1');
    });

    it('should preserve absolute row references', () => {
      const pattern = fill.analyze([formulaCell('=A$1')]);
      const result = fill.generate(pattern, 2, 'down');

      expect(result.values[0].formula).toBe('=A$1');
      expect(result.values[1].formula).toBe('=A$1');
    });

    it('should preserve absolute column references', () => {
      const pattern = fill.analyze([formulaCell('=$A1')]);
      const result = fill.generate(pattern, 2, 'right');

      expect(result.values[0].formula).toBe('=$A1');
      expect(result.values[1].formula).toBe('=$A1');
    });

    it('should preserve fully absolute references', () => {
      const pattern = fill.analyze([formulaCell('=$A$1')]);
      const result = fill.generate(pattern, 2, 'down');

      expect(result.values[0].formula).toBe('=$A$1');
      expect(result.values[1].formula).toBe('=$A$1');
    });

    it('should handle complex formulas', () => {
      const pattern = fill.analyze([formulaCell('=SUM(A1:B1)+C1*D$1')]);
      const result = fill.generate(pattern, 1, 'down');

      // A1:B1 -> A2:B2, C1 -> C2, D$1 stays D$1
      expect(result.values[0].formula).toBe('=SUM(A2:B2)+C2*D$1');
    });

    it('should handle multi-letter columns', () => {
      const pattern = fill.analyze([formulaCell('=AA1+AB1')]);
      const result = fill.generate(pattern, 1, 'right');

      expect(result.values[0].formula).toBe('=AB1+AC1');
    });

    it('should not generate negative row references', () => {
      const pattern = fill.analyze([formulaCell('=A1')]);
      const result = fill.generate(pattern, 3, 'up');

      // Row should be clamped to 1
      expect(result.values[2].formula).toMatch(/=A\d+/);
      const rowMatch = result.values[2].formula?.match(/A(\d+)/);
      if (rowMatch) {
        expect(parseInt(rowMatch[1])).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // ===========================================================================
  // Value Generation - Copy/Repeat Pattern
  // ===========================================================================

  describe('Value Generation - Copy Pattern', () => {
    let fill: FillSeries;

    beforeEach(() => {
      fill = new FillSeries();
    });

    it('should repeat single value', () => {
      const pattern = fill.analyze(strCells('Hello'));
      const result = fill.generate(pattern, 3, 'down');

      expect(result.values[0].value).toBe('Hello');
      expect(result.values[1].value).toBe('Hello');
      expect(result.values[2].value).toBe('Hello');
    });

    it('should cycle through multiple values', () => {
      // Numbers with no linear pattern
      const pattern = fill.analyze(numCells(1, 5, 3));
      const result = fill.generate(pattern, 6, 'down');

      expect(result.values[0].value).toBe(1);
      expect(result.values[1].value).toBe(5);
      expect(result.values[2].value).toBe(3);
      expect(result.values[3].value).toBe(1);
      expect(result.values[4].value).toBe(5);
      expect(result.values[5].value).toBe(3);
    });

    it('should preserve format in copy pattern', () => {
      const cell: Cell = {
        value: 'Test',
        type: 'string',
        format: { bold: true, italic: true },
      };
      const pattern = fill.analyze([cell]);
      const result = fill.generate(pattern, 1, 'down');

      expect(result.values[0].format?.bold).toBe(true);
      expect(result.values[0].format?.italic).toBe(true);
    });
  });

  // ===========================================================================
  // Convenience API - fill()
  // ===========================================================================

  describe('Convenience API - fill()', () => {
    let fs: FillSeries;

    beforeEach(() => {
      fs = new FillSeries();
    });

    it('should analyze and generate in one call', () => {
      const result = fs.fill(numCells(1, 2, 3), 3, 'down');

      expect(result.values.length).toBe(3);
      expect(result.values[0].value).toBe(4);
      expect(result.values[1].value).toBe(5);
      expect(result.values[2].value).toBe(6);
    });

    it('should include pattern in result', () => {
      const result = fs.fill(numCells(10, 20), 2, 'down');

      expect(result.pattern.type).toBe('number');
      expect(result.pattern.step).toBe(10);
    });

    it('should include direction in result', () => {
      const result = fs.fill(numCells(1), 1, 'right');

      expect(result.direction).toBe('right');
    });

    it('should include count in result', () => {
      const result = fs.fill(numCells(1), 5, 'down');

      expect(result.count).toBe(5);
    });
  });

  // ===========================================================================
  // Convenience API - fillRange()
  // ===========================================================================

  describe('Convenience API - fillRange()', () => {
    let fs: FillSeries;

    beforeEach(() => {
      fs = new FillSeries();
    });

    it('should fill columns independently when going down', () => {
      // Source: 2 rows x 2 cols
      // Col 0: 1, 2 (linear +1)
      // Col 1: 10, 20 (linear +10)
      const source = [
        [createCell(1, 'number'), createCell(10, 'number')],
        [createCell(2, 'number'), createCell(20, 'number')],
      ];

      const result = fs.fillRange(source, 2, 2, 'down');

      // Should generate 2 more rows
      expect(result.length).toBe(2);

      // Column 0: 3, 4
      expect(result[0][0].value).toBe(3);
      expect(result[1][0].value).toBe(4);

      // Column 1: 30, 40
      expect(result[0][1].value).toBe(30);
      expect(result[1][1].value).toBe(40);
    });

    it('should fill rows independently when going right', () => {
      // Source: 2 rows x 2 cols
      const source = [
        [createCell(1, 'number'), createCell(2, 'number')],
        [createCell(10, 'number'), createCell(20, 'number')],
      ];

      const result = fs.fillRange(source, 2, 2, 'right');

      // Row 0: 3, 4
      expect(result[0][0].value).toBe(3);
      expect(result[0][1].value).toBe(4);

      // Row 1: 30, 40
      expect(result[1][0].value).toBe(30);
      expect(result[1][1].value).toBe(40);
    });
  });

  // ===========================================================================
  // Formula Adjustment (Direct API)
  // ===========================================================================

  describe('Formula Adjustment', () => {
    let fill: FillSeries;

    beforeEach(() => {
      fill = new FillSeries();
    });

    it('should adjust relative row reference', () => {
      const result = fill.adjustFormula('=A1', 5, 0);
      expect(result).toBe('=A6');
    });

    it('should adjust relative column reference', () => {
      const result = fill.adjustFormula('=A1', 0, 3);
      expect(result).toBe('=D1');
    });

    it('should adjust both row and column', () => {
      const result = fill.adjustFormula('=B2', 2, 2);
      expect(result).toBe('=D4');
    });

    it('should preserve absolute row', () => {
      const result = fill.adjustFormula('=A$1', 5, 3);
      expect(result).toBe('=D$1');
    });

    it('should preserve absolute column', () => {
      const result = fill.adjustFormula('=$A1', 5, 3);
      expect(result).toBe('=$A6');
    });

    it('should preserve fully absolute reference', () => {
      const result = fill.adjustFormula('=$A$1', 10, 10);
      expect(result).toBe('=$A$1');
    });

    it('should handle negative row delta', () => {
      const result = fill.adjustFormula('=A10', -5, 0);
      expect(result).toBe('=A5');
    });

    it('should handle negative column delta', () => {
      const result = fill.adjustFormula('=E1', 0, -3);
      expect(result).toBe('=B1');
    });

    it('should clamp to row 1 minimum', () => {
      const result = fill.adjustFormula('=A2', -5, 0);
      expect(result).toBe('=A1');
    });

    it('should clamp to column A minimum', () => {
      const result = fill.adjustFormula('=B1', 0, -5);
      expect(result).toBe('=A1');
    });

    it('should handle multi-letter columns going up', () => {
      const result = fill.adjustFormula('=AA1', 0, 1);
      expect(result).toBe('=AB1');
    });

    it('should handle range references', () => {
      const result = fill.adjustFormula('=SUM(A1:B5)', 2, 1);
      expect(result).toBe('=SUM(B3:C7)');
    });

    it('should handle mixed references in formula', () => {
      const result = fill.adjustFormula('=A1+$B$2+C$3+$D4', 1, 1);
      expect(result).toBe('=B2+$B$2+D$3+$D5');
    });
  });

  // ===========================================================================
  // Factory Function
  // ===========================================================================

  describe('Factory Function', () => {
    it('createFillSeries should create instance', () => {
      const fill = createFillSeries();

      expect(fill).toBeInstanceOf(FillSeries);
    });

    it('createFillSeries should create independent instances', () => {
      const fill1 = createFillSeries();
      const fill2 = createFillSeries();

      fill1.addCustomList(['A', 'B']);

      const lists1 = fill1.getCustomLists();
      const lists2 = fill2.getCustomLists();

      // fill2 should not have the custom list
      expect(lists1.length).toBeGreaterThan(lists2.length);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    let fill: FillSeries;

    beforeEach(() => {
      fill = new FillSeries();
    });

    it('should handle empty cell in array', () => {
      const cells = [
        createCell(null, 'empty'),
        createCell(1, 'number'),
      ];
      const pattern = fill.analyze(cells);

      expect(pattern.type).toBe('mixed');
    });

    it('should handle very large numbers', () => {
      const pattern = fill.analyze(numCells(1e15, 2e15));
      const result = fill.generate(pattern, 1, 'down');

      expect(result.values[0].value).toBe(3e15);
    });

    it('should handle very small step', () => {
      const pattern = fill.analyze(numCells(0, 0.001, 0.002));
      const result = fill.generate(pattern, 1, 'down');

      expect(result.values[0].value).toBeCloseTo(0.003, 10);
    });

    it('should handle boolean cells as copy', () => {
      const cells = [
        createCell(true, 'boolean'),
        createCell(false, 'boolean'),
      ];
      const pattern = fill.analyze(cells);
      const result = fill.generate(pattern, 2, 'down');

      expect(result.values[0].value).toBe(true);
      expect(result.values[1].value).toBe(false);
    });

    it('should handle unicode in text', () => {
      const pattern = fill.analyze(strCells('项目1', '项目2'));
      const result = fill.generate(pattern, 1, 'down');

      expect(result.values[0].value).toBe('项目3');
    });

    it('should handle long custom lists', () => {
      const longList = Array.from({ length: 100 }, (_, i) => `Item${i}`);
      fill.addCustomList(longList);

      const pattern = fill.analyze(strCells('Item0', 'Item1'));
      const result = fill.generate(pattern, 3, 'down');

      expect(result.values[0].value).toBe('Item2');
      expect(result.values[1].value).toBe('Item3');
      expect(result.values[2].value).toBe('Item4');
    });

    it('should handle zero in source for linear pattern', () => {
      const pattern = fill.analyze(numCells(0, 5, 10));
      const result = fill.generate(pattern, 2, 'down');

      expect(result.values[0].value).toBe(15);
      expect(result.values[1].value).toBe(20);
    });

    it('should generate zero values', () => {
      const result = fill.generate(fill.analyze(numCells(1)), 0, 'down');

      expect(result.values.length).toBe(0);
      expect(result.count).toBe(0);
    });
  });
});
