/**
 * ConditionalFormatting Unit Tests
 *
 * Tests the conditional formatting rule engine including:
 * - Rule management (add, remove, update, get)
 * - Cell value rules with all comparison operators
 * - Text rules (contains, beginsWith, endsWith)
 * - TopBottom rules
 * - Date rules
 * - Color scale computation
 * - Data bar computation
 * - Icon set computation
 * - Simple rules (blanks, errors)
 * - Batch evaluation
 * - Serialization (export/import)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConditionalFormatting,
  createConditionalFormatting,
  createRangeStatistics,
  RuleInput,
  CellValueConfig,
  TextConfig,
  TopBottomConfig,
  DateConfig,
  ColorScaleConfig,
  DataBarConfig,
  IconSetConfig,
  ConditionalFormatRule,
  RangeStatistics,
} from './ConditionalFormatting.js';
import { CellRange, CellRef } from '../types/index.js';

describe('ConditionalFormatting', () => {
  let cf: ConditionalFormatting;

  beforeEach(() => {
    cf = createConditionalFormatting();
  });

  // ===========================================================================
  // Rule Management
  // ===========================================================================

  describe('Rule Management', () => {
    describe('addRule', () => {
      it('should add a rule and return an ID', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 9, endCol: 0 };
        const rule: RuleInput = {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'greaterThan', value1: 50 },
        };

        const id = cf.addRule(range, rule);

        expect(id).toBeTruthy();
        expect(typeof id).toBe('string');
        expect(id.startsWith('cf_')).toBe(true);
      });

      it('should generate unique IDs for multiple rules', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
        const rule: RuleInput = {
          type: 'blanks',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'empty' },
        };

        const id1 = cf.addRule(range, rule);
        const id2 = cf.addRule(range, rule);
        const id3 = cf.addRule(range, rule);

        expect(id1).not.toBe(id2);
        expect(id2).not.toBe(id3);
        expect(id1).not.toBe(id3);
      });

      it('should normalize the range when adding', () => {
        // Reversed range (endRow < startRow)
        const range: CellRange = { startRow: 5, startCol: 3, endRow: 0, endCol: 1 };
        const rule: RuleInput = {
          type: 'blanks',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'empty' },
        };

        const id = cf.addRule(range, rule);
        const retrieved = cf.getRule(id);

        expect(retrieved?.range.startRow).toBe(0);
        expect(retrieved?.range.startCol).toBe(1);
        expect(retrieved?.range.endRow).toBe(5);
        expect(retrieved?.range.endCol).toBe(3);
      });
    });

    describe('removeRule', () => {
      it('should remove an existing rule', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
        const rule: RuleInput = {
          type: 'blanks',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'empty' },
        };

        const id = cf.addRule(range, rule);
        expect(cf.getRuleCount()).toBe(1);

        const removed = cf.removeRule(id);

        expect(removed).toBe(true);
        expect(cf.getRuleCount()).toBe(0);
        expect(cf.getRule(id)).toBeUndefined();
      });

      it('should return false when removing non-existent rule', () => {
        const removed = cf.removeRule('non_existent_id');
        expect(removed).toBe(false);
      });
    });

    describe('updateRule', () => {
      it('should update rule properties', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 9, endCol: 0 };
        const rule: RuleInput = {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'greaterThan', value1: 50 },
        };

        const id = cf.addRule(range, rule);

        const updated = cf.updateRule(id, {
          priority: 5,
          stopIfTrue: true,
        });

        expect(updated).toBe(true);

        const retrieved = cf.getRule(id);
        expect(retrieved?.priority).toBe(5);
        expect(retrieved?.stopIfTrue).toBe(true);
        expect(retrieved?.id).toBe(id); // ID preserved
      });

      it('should update rule range with normalization', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 9, endCol: 0 };
        const rule: RuleInput = {
          type: 'blanks',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'empty' },
        };

        const id = cf.addRule(range, rule);

        cf.updateRule(id, {
          range: { startRow: 10, startCol: 5, endRow: 2, endCol: 0 },
        });

        const retrieved = cf.getRule(id);
        expect(retrieved?.range.startRow).toBe(2);
        expect(retrieved?.range.startCol).toBe(0);
        expect(retrieved?.range.endRow).toBe(10);
        expect(retrieved?.range.endCol).toBe(5);
      });

      it('should return false when updating non-existent rule', () => {
        const updated = cf.updateRule('non_existent', { priority: 10 });
        expect(updated).toBe(false);
      });
    });

    describe('getRule', () => {
      it('should return the rule by ID', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
        const rule: RuleInput = {
          type: 'blanks',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'empty' },
        };

        const id = cf.addRule(range, rule);
        const retrieved = cf.getRule(id);

        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(id);
        expect(retrieved?.type).toBe('blanks');
        expect(retrieved?.priority).toBe(1);
      });

      it('should return undefined for non-existent ID', () => {
        expect(cf.getRule('non_existent')).toBeUndefined();
      });
    });

    describe('getAllRules', () => {
      it('should return all rules sorted by priority', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };

        cf.addRule(range, { type: 'blanks', priority: 3, stopIfTrue: false, config: { type: 'empty' } });
        cf.addRule(range, { type: 'blanks', priority: 1, stopIfTrue: false, config: { type: 'empty' } });
        cf.addRule(range, { type: 'blanks', priority: 2, stopIfTrue: false, config: { type: 'empty' } });

        const rules = cf.getAllRules();

        expect(rules.length).toBe(3);
        expect(rules[0].priority).toBe(1);
        expect(rules[1].priority).toBe(2);
        expect(rules[2].priority).toBe(3);
      });

      it('should return empty array when no rules', () => {
        expect(cf.getAllRules()).toEqual([]);
      });
    });

    describe('getRulesForCell', () => {
      it('should return rules that apply to the cell', () => {
        cf.addRule(
          { startRow: 0, startCol: 0, endRow: 9, endCol: 9 },
          { type: 'blanks', priority: 1, stopIfTrue: false, config: { type: 'empty' } }
        );
        cf.addRule(
          { startRow: 5, startCol: 5, endRow: 15, endCol: 15 },
          { type: 'blanks', priority: 2, stopIfTrue: false, config: { type: 'empty' } }
        );
        cf.addRule(
          { startRow: 20, startCol: 20, endRow: 30, endCol: 30 },
          { type: 'blanks', priority: 3, stopIfTrue: false, config: { type: 'empty' } }
        );

        // Cell at (7, 7) overlaps first two rules
        const rules = cf.getRulesForCell({ row: 7, col: 7 });
        expect(rules.length).toBe(2);

        // Cell at (25, 25) only in third rule
        const rules2 = cf.getRulesForCell({ row: 25, col: 25 });
        expect(rules2.length).toBe(1);

        // Cell at (100, 100) in no rules
        const rules3 = cf.getRulesForCell({ row: 100, col: 100 });
        expect(rules3.length).toBe(0);
      });
    });

    describe('getRulesForRange', () => {
      it('should return rules that overlap the given range', () => {
        cf.addRule(
          { startRow: 0, startCol: 0, endRow: 5, endCol: 5 },
          { type: 'blanks', priority: 1, stopIfTrue: false, config: { type: 'empty' } }
        );
        cf.addRule(
          { startRow: 10, startCol: 10, endRow: 15, endCol: 15 },
          { type: 'blanks', priority: 2, stopIfTrue: false, config: { type: 'empty' } }
        );

        // Range overlapping first rule
        const rules1 = cf.getRulesForRange({ startRow: 3, startCol: 3, endRow: 8, endCol: 8 });
        expect(rules1.length).toBe(1);
        expect(rules1[0].priority).toBe(1);

        // Range overlapping both
        const rules2 = cf.getRulesForRange({ startRow: 0, startCol: 0, endRow: 12, endCol: 12 });
        expect(rules2.length).toBe(2);

        // Range overlapping neither
        const rules3 = cf.getRulesForRange({ startRow: 50, startCol: 50, endRow: 60, endCol: 60 });
        expect(rules3.length).toBe(0);
      });
    });

    describe('clearAllRules', () => {
      it('should remove all rules', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
        cf.addRule(range, { type: 'blanks', priority: 1, stopIfTrue: false, config: { type: 'empty' } });
        cf.addRule(range, { type: 'blanks', priority: 2, stopIfTrue: false, config: { type: 'empty' } });
        cf.addRule(range, { type: 'blanks', priority: 3, stopIfTrue: false, config: { type: 'empty' } });

        expect(cf.getRuleCount()).toBe(3);

        cf.clearAllRules();

        expect(cf.getRuleCount()).toBe(0);
        expect(cf.getAllRules()).toEqual([]);
      });
    });

    describe('getRuleCount', () => {
      it('should return correct count', () => {
        expect(cf.getRuleCount()).toBe(0);

        const range: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
        const id1 = cf.addRule(range, { type: 'blanks', priority: 1, stopIfTrue: false, config: { type: 'empty' } });
        expect(cf.getRuleCount()).toBe(1);

        cf.addRule(range, { type: 'blanks', priority: 2, stopIfTrue: false, config: { type: 'empty' } });
        expect(cf.getRuleCount()).toBe(2);

        cf.removeRule(id1);
        expect(cf.getRuleCount()).toBe(1);
      });
    });
  });

  // ===========================================================================
  // Cell Value Rules
  // ===========================================================================

  describe('Cell Value Rules', () => {
    const range: CellRange = { startRow: 0, startCol: 0, endRow: 9, endCol: 0 };
    const cellRef: CellRef = { row: 0, col: 0 };

    describe('greaterThan', () => {
      it('should match when value is greater', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'greaterThan', value1: 50 },
          format: { bold: true },
        });

        const result = cf.evaluate(cellRef, 75);
        expect(result?.matchedRules.length).toBe(1);
        expect(result?.format?.bold).toBe(true);
      });

      it('should not match when value is equal', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'greaterThan', value1: 50 },
        });

        const result = cf.evaluate(cellRef, 50);
        expect(result).toBeNull();
      });

      it('should not match when value is less', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'greaterThan', value1: 50 },
        });

        const result = cf.evaluate(cellRef, 25);
        expect(result).toBeNull();
      });
    });

    describe('lessThan', () => {
      it('should match when value is less', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'lessThan', value1: 50 },
          format: { italic: true },
        });

        const result = cf.evaluate(cellRef, 25);
        expect(result?.matchedRules.length).toBe(1);
        expect(result?.format?.italic).toBe(true);
      });

      it('should not match when value is equal or greater', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'lessThan', value1: 50 },
        });

        expect(cf.evaluate(cellRef, 50)).toBeNull();
        expect(cf.evaluate(cellRef, 100)).toBeNull();
      });
    });

    describe('greaterThanOrEqual', () => {
      it('should match when value is greater or equal', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'greaterThanOrEqual', value1: 50 },
        });

        expect(cf.evaluate(cellRef, 50)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 75)?.matchedRules.length).toBe(1);
      });

      it('should not match when value is less', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'greaterThanOrEqual', value1: 50 },
        });

        expect(cf.evaluate(cellRef, 49)).toBeNull();
      });
    });

    describe('lessThanOrEqual', () => {
      it('should match when value is less or equal', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'lessThanOrEqual', value1: 50 },
        });

        expect(cf.evaluate(cellRef, 50)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 25)?.matchedRules.length).toBe(1);
      });

      it('should not match when value is greater', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'lessThanOrEqual', value1: 50 },
        });

        expect(cf.evaluate(cellRef, 51)).toBeNull();
      });
    });

    describe('equal', () => {
      it('should match exact numeric value', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'equal', value1: 100 },
        });

        expect(cf.evaluate(cellRef, 100)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 99)).toBeNull();
      });

      it('should match exact string value', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'equal', value1: 'hello' },
        });

        expect(cf.evaluate(cellRef, 'hello')?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 'Hello')).toBeNull(); // case sensitive
      });
    });

    describe('notEqual', () => {
      it('should match when not equal', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'notEqual', value1: 100 },
        });

        expect(cf.evaluate(cellRef, 50)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 100)).toBeNull();
      });
    });

    describe('between', () => {
      it('should match when value is in range (inclusive)', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'between', value1: 10, value2: 20 },
        });

        expect(cf.evaluate(cellRef, 10)?.matchedRules.length).toBe(1); // inclusive
        expect(cf.evaluate(cellRef, 15)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 20)?.matchedRules.length).toBe(1); // inclusive
      });

      it('should not match when outside range', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'between', value1: 10, value2: 20 },
        });

        expect(cf.evaluate(cellRef, 9)).toBeNull();
        expect(cf.evaluate(cellRef, 21)).toBeNull();
      });

      it('should handle reversed value1/value2', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'between', value1: 20, value2: 10 },
        });

        // Should still work (min/max normalized)
        expect(cf.evaluate(cellRef, 15)?.matchedRules.length).toBe(1);
      });
    });

    describe('notBetween', () => {
      it('should match when outside range', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'notBetween', value1: 10, value2: 20 },
        });

        expect(cf.evaluate(cellRef, 5)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 25)?.matchedRules.length).toBe(1);
      });

      it('should not match when in range', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'notBetween', value1: 10, value2: 20 },
        });

        expect(cf.evaluate(cellRef, 15)).toBeNull();
      });
    });

    describe('type coercion', () => {
      it('should handle string numbers', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'greaterThan', value1: 50 },
        });

        // String "75" should be coerced to 75
        expect(cf.evaluate(cellRef, '75')?.matchedRules.length).toBe(1);
      });

      it('should handle boolean values', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'equal', value1: 1 },
        });

        // true -> 1
        expect(cf.evaluate(cellRef, true)?.matchedRules.length).toBe(1);
      });

      it('should not match non-numeric values for numeric comparison', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'greaterThan', value1: 50 },
        });

        expect(cf.evaluate(cellRef, 'hello')).toBeNull();
        expect(cf.evaluate(cellRef, null)).toBeNull();
        expect(cf.evaluate(cellRef, undefined)).toBeNull();
      });
    });

    describe('string comparisons', () => {
      it('should compare strings lexicographically', () => {
        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'cellValue', operator: 'greaterThan', value1: 'banana' },
        });

        expect(cf.evaluate(cellRef, 'cherry')?.matchedRules.length).toBe(1); // c > b
        expect(cf.evaluate(cellRef, 'apple')).toBeNull(); // a < b
      });
    });
  });

  // ===========================================================================
  // Text Rules
  // ===========================================================================

  describe('Text Rules', () => {
    const range: CellRange = { startRow: 0, startCol: 0, endRow: 9, endCol: 0 };
    const cellRef: CellRef = { row: 0, col: 0 };

    describe('contains', () => {
      it('should match when text contains substring', () => {
        cf.addRule(range, {
          type: 'text',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'text', operator: 'contains', text: 'error' },
          format: { backgroundColor: '#FF0000' },
        });

        expect(cf.evaluate(cellRef, 'This is an error message')?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 'ERROR')?.matchedRules.length).toBe(1); // case insensitive by default
      });

      it('should respect caseSensitive option', () => {
        cf.addRule(range, {
          type: 'text',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'text', operator: 'contains', text: 'Error', caseSensitive: true },
        });

        expect(cf.evaluate(cellRef, 'Error occurred')?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 'error occurred')).toBeNull();
        expect(cf.evaluate(cellRef, 'ERROR OCCURRED')).toBeNull();
      });

      it('should not match null or undefined', () => {
        cf.addRule(range, {
          type: 'text',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'text', operator: 'contains', text: 'test' },
        });

        expect(cf.evaluate(cellRef, null)).toBeNull();
        expect(cf.evaluate(cellRef, undefined)).toBeNull();
      });
    });

    describe('notContains', () => {
      it('should match when text does not contain substring', () => {
        cf.addRule(range, {
          type: 'text',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'text', operator: 'notContains', text: 'error' },
        });

        expect(cf.evaluate(cellRef, 'All good')?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 'error found')).toBeNull();
      });
    });

    describe('beginsWith', () => {
      it('should match when text starts with prefix', () => {
        cf.addRule(range, {
          type: 'text',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'text', operator: 'beginsWith', text: 'INV-' },
        });

        expect(cf.evaluate(cellRef, 'INV-12345')?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 'inv-12345')?.matchedRules.length).toBe(1); // case insensitive
        expect(cf.evaluate(cellRef, '12345-INV')).toBeNull();
      });

      it('should respect caseSensitive', () => {
        cf.addRule(range, {
          type: 'text',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'text', operator: 'beginsWith', text: 'INV-', caseSensitive: true },
        });

        expect(cf.evaluate(cellRef, 'INV-12345')?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 'inv-12345')).toBeNull();
      });
    });

    describe('endsWith', () => {
      it('should match when text ends with suffix', () => {
        cf.addRule(range, {
          type: 'text',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'text', operator: 'endsWith', text: '.txt' },
        });

        expect(cf.evaluate(cellRef, 'document.txt')?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 'DOCUMENT.TXT')?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 'document.pdf')).toBeNull();
      });
    });

    describe('numeric values as text', () => {
      it('should convert numbers to strings for text rules', () => {
        cf.addRule(range, {
          type: 'text',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'text', operator: 'contains', text: '42' },
        });

        expect(cf.evaluate(cellRef, 42)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 142)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 4.2)).toBeNull();
      });
    });
  });

  // ===========================================================================
  // Top/Bottom Rules
  // ===========================================================================

  describe('Top/Bottom Rules', () => {
    const range: CellRange = { startRow: 0, startCol: 0, endRow: 9, endCol: 0 };
    const cellRef: CellRef = { row: 0, col: 0 };

    // Values: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
    const rangeStats: RangeStatistics = createRangeStatistics([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);

    describe('top items', () => {
      it('should match top N items', () => {
        cf.addRule(range, {
          type: 'topBottom',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'topBottom', topBottom: 'top', rank: 3, unit: 'items' },
        });

        // Top 3: 80, 90, 100
        expect(cf.evaluate(cellRef, 100, rangeStats)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 90, rangeStats)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 80, rangeStats)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 70, rangeStats)).toBeNull();
      });

      it('should handle rank larger than data count', () => {
        cf.addRule(range, {
          type: 'topBottom',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'topBottom', topBottom: 'top', rank: 100, unit: 'items' },
        });

        // All values should match
        expect(cf.evaluate(cellRef, 10, rangeStats)?.matchedRules.length).toBe(1);
      });
    });

    describe('bottom items', () => {
      it('should match bottom N items', () => {
        cf.addRule(range, {
          type: 'topBottom',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'topBottom', topBottom: 'bottom', rank: 3, unit: 'items' },
        });

        // Bottom 3: 10, 20, 30
        expect(cf.evaluate(cellRef, 10, rangeStats)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 20, rangeStats)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 30, rangeStats)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 40, rangeStats)).toBeNull();
      });
    });

    describe('top percent', () => {
      it('should match top N percent', () => {
        cf.addRule(range, {
          type: 'topBottom',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'topBottom', topBottom: 'top', rank: 20, unit: 'percent' },
        });

        // Top 20% of 10 items = 2 items: 90, 100
        expect(cf.evaluate(cellRef, 100, rangeStats)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 90, rangeStats)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 80, rangeStats)).toBeNull();
      });
    });

    describe('bottom percent', () => {
      it('should match bottom N percent', () => {
        cf.addRule(range, {
          type: 'topBottom',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'topBottom', topBottom: 'bottom', rank: 30, unit: 'percent' },
        });

        // Bottom 30% of 10 items = 3 items: 10, 20, 30
        expect(cf.evaluate(cellRef, 10, rangeStats)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 20, rangeStats)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 30, rangeStats)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 40, rangeStats)).toBeNull();
      });
    });

    describe('edge cases', () => {
      it('should not match without range stats', () => {
        cf.addRule(range, {
          type: 'topBottom',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'topBottom', topBottom: 'top', rank: 3, unit: 'items' },
        });

        expect(cf.evaluate(cellRef, 100)).toBeNull();
      });

      it('should not match non-numeric values', () => {
        cf.addRule(range, {
          type: 'topBottom',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'topBottom', topBottom: 'top', rank: 3, unit: 'items' },
        });

        expect(cf.evaluate(cellRef, 'text', rangeStats)).toBeNull();
      });

      it('should handle empty range stats', () => {
        cf.addRule(range, {
          type: 'topBottom',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'topBottom', topBottom: 'top', rank: 3, unit: 'items' },
        });

        const emptyStats: RangeStatistics = { min: 0, max: 0, values: [], count: 0 };
        expect(cf.evaluate(cellRef, 50, emptyStats)).toBeNull();
      });
    });
  });

  // ===========================================================================
  // Simple Rules (blanks, errors)
  // ===========================================================================

  describe('Simple Rules', () => {
    const range: CellRange = { startRow: 0, startCol: 0, endRow: 9, endCol: 0 };
    const cellRef: CellRef = { row: 0, col: 0 };

    describe('blanks', () => {
      it('should match null values', () => {
        cf.addRule(range, {
          type: 'blanks',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'empty' },
        });

        expect(cf.evaluate(cellRef, null)?.matchedRules.length).toBe(1);
      });

      it('should match undefined values', () => {
        cf.addRule(range, {
          type: 'blanks',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'empty' },
        });

        expect(cf.evaluate(cellRef, undefined)?.matchedRules.length).toBe(1);
      });

      it('should match empty string', () => {
        cf.addRule(range, {
          type: 'blanks',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'empty' },
        });

        expect(cf.evaluate(cellRef, '')?.matchedRules.length).toBe(1);
      });

      it('should not match non-blank values', () => {
        cf.addRule(range, {
          type: 'blanks',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'empty' },
        });

        expect(cf.evaluate(cellRef, 0)).toBeNull();
        expect(cf.evaluate(cellRef, 'text')).toBeNull();
        expect(cf.evaluate(cellRef, false)).toBeNull();
      });
    });

    describe('noBlanks', () => {
      it('should match non-blank values', () => {
        cf.addRule(range, {
          type: 'noBlanks',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'empty' },
        });

        expect(cf.evaluate(cellRef, 0)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 'text')?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, false)?.matchedRules.length).toBe(1);
      });

      it('should not match blank values', () => {
        cf.addRule(range, {
          type: 'noBlanks',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'empty' },
        });

        expect(cf.evaluate(cellRef, null)).toBeNull();
        expect(cf.evaluate(cellRef, undefined)).toBeNull();
        expect(cf.evaluate(cellRef, '')).toBeNull();
      });
    });

    describe('errors', () => {
      it('should match error values', () => {
        cf.addRule(range, {
          type: 'errors',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'empty' },
        });

        expect(cf.evaluate(cellRef, '#VALUE!')?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, '#REF!')?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, '#NAME?')?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, '#DIV/0!')?.matchedRules.length).toBe(1);
      });

      it('should not match non-error values', () => {
        cf.addRule(range, {
          type: 'errors',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'empty' },
        });

        expect(cf.evaluate(cellRef, 'normal text')).toBeNull();
        expect(cf.evaluate(cellRef, 100)).toBeNull();
        expect(cf.evaluate(cellRef, null)).toBeNull();
      });
    });

    describe('noErrors', () => {
      it('should match non-error values', () => {
        cf.addRule(range, {
          type: 'noErrors',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'empty' },
        });

        expect(cf.evaluate(cellRef, 'normal text')?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, 100)?.matchedRules.length).toBe(1);
        expect(cf.evaluate(cellRef, null)?.matchedRules.length).toBe(1);
      });

      it('should not match error values', () => {
        cf.addRule(range, {
          type: 'noErrors',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'empty' },
        });

        expect(cf.evaluate(cellRef, '#VALUE!')).toBeNull();
        expect(cf.evaluate(cellRef, '#REF!')).toBeNull();
      });
    });

    describe('duplicates and unique', () => {
      it('should return false (requires range context)', () => {
        cf.addRule(range, {
          type: 'duplicates',
          priority: 1,
          stopIfTrue: false,
          config: { type: 'empty' },
        });

        // These rule types need range-level context, return false by default
        expect(cf.evaluate(cellRef, 'any value')).toBeNull();
      });
    });
  });

  // ===========================================================================
  // Color Scale Rules
  // ===========================================================================

  describe('Color Scale Rules', () => {
    const range: CellRange = { startRow: 0, startCol: 0, endRow: 9, endCol: 0 };
    const cellRef: CellRef = { row: 0, col: 0 };
    const rangeStats: RangeStatistics = createRangeStatistics([0, 25, 50, 75, 100]);

    describe('2-color scale', () => {
      it('should compute color for minimum value', () => {
        cf.addRule(range, {
          type: 'colorScale',
          priority: 1,
          stopIfTrue: false,
          config: {
            type: 'colorScale',
            minType: 'min',
            minColor: '#FF0000', // Red
            maxType: 'max',
            maxColor: '#00FF00', // Green
          },
        });

        const result = cf.evaluate(cellRef, 0, rangeStats);
        expect(result?.colorScaleBackground).toBe('#ff0000');
      });

      it('should compute color for maximum value', () => {
        cf.addRule(range, {
          type: 'colorScale',
          priority: 1,
          stopIfTrue: false,
          config: {
            type: 'colorScale',
            minType: 'min',
            minColor: '#FF0000',
            maxType: 'max',
            maxColor: '#00FF00',
          },
        });

        const result = cf.evaluate(cellRef, 100, rangeStats);
        expect(result?.colorScaleBackground).toBe('#00ff00');
      });

      it('should compute interpolated color for middle value', () => {
        cf.addRule(range, {
          type: 'colorScale',
          priority: 1,
          stopIfTrue: false,
          config: {
            type: 'colorScale',
            minType: 'min',
            minColor: '#FF0000',
            maxType: 'max',
            maxColor: '#00FF00',
          },
        });

        const result = cf.evaluate(cellRef, 50, rangeStats);
        // 50% between red and green should be yellow-ish (#808000) or similar
        expect(result?.colorScaleBackground).toBeDefined();
        expect(result?.colorScaleBackground).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });

    describe('3-color scale', () => {
      it('should compute colors for three-point gradient', () => {
        cf.addRule(range, {
          type: 'colorScale',
          priority: 1,
          stopIfTrue: false,
          config: {
            type: 'colorScale',
            minType: 'min',
            minColor: '#FF0000', // Red
            midType: 'percent',
            midValue: 50,
            midColor: '#FFFF00', // Yellow
            maxType: 'max',
            maxColor: '#00FF00', // Green
          },
        });

        const minResult = cf.evaluate(cellRef, 0, rangeStats);
        expect(minResult?.colorScaleBackground).toBe('#ff0000');

        const midResult = cf.evaluate(cellRef, 50, rangeStats);
        expect(midResult?.colorScaleBackground).toBe('#ffff00');

        const maxResult = cf.evaluate(cellRef, 100, rangeStats);
        expect(maxResult?.colorScaleBackground).toBe('#00ff00');
      });
    });

    describe('edge cases', () => {
      it('should handle same min and max (zero range)', () => {
        cf.addRule(range, {
          type: 'colorScale',
          priority: 1,
          stopIfTrue: false,
          config: {
            type: 'colorScale',
            minType: 'min',
            minColor: '#FF0000',
            maxType: 'max',
            maxColor: '#00FF00',
          },
        });

        const singleValueStats = createRangeStatistics([50]);
        const result = cf.evaluate(cellRef, 50, singleValueStats);
        expect(result?.colorScaleBackground).toBe('#FF0000'); // Returns min color
      });

      it('should not compute for non-numeric values', () => {
        cf.addRule(range, {
          type: 'colorScale',
          priority: 1,
          stopIfTrue: false,
          config: {
            type: 'colorScale',
            minType: 'min',
            minColor: '#FF0000',
            maxType: 'max',
            maxColor: '#00FF00',
          },
        });

        const result = cf.evaluate(cellRef, 'text', rangeStats);
        expect(result).toBeNull();
      });
    });
  });

  // ===========================================================================
  // Data Bar Rules
  // ===========================================================================

  describe('Data Bar Rules', () => {
    const range: CellRange = { startRow: 0, startCol: 0, endRow: 9, endCol: 0 };
    const cellRef: CellRef = { row: 0, col: 0 };
    const rangeStats: RangeStatistics = createRangeStatistics([0, 25, 50, 75, 100]);

    it('should compute data bar for minimum value', () => {
      cf.addRule(range, {
        type: 'dataBar',
        priority: 1,
        stopIfTrue: false,
        config: {
          type: 'dataBar',
          minType: 'min',
          maxType: 'max',
          color: '#3366FF',
          showValue: true,
          gradient: true,
        },
      });

      const result = cf.evaluate(cellRef, 0, rangeStats);
      expect(result?.dataBar?.percent).toBe(0);
      expect(result?.dataBar?.color).toBe('#3366FF');
      expect(result?.dataBar?.gradient).toBe(true);
    });

    it('should compute data bar for maximum value', () => {
      cf.addRule(range, {
        type: 'dataBar',
        priority: 1,
        stopIfTrue: false,
        config: {
          type: 'dataBar',
          minType: 'min',
          maxType: 'max',
          color: '#3366FF',
          showValue: true,
          gradient: false,
        },
      });

      const result = cf.evaluate(cellRef, 100, rangeStats);
      expect(result?.dataBar?.percent).toBe(100);
    });

    it('should compute data bar for middle value', () => {
      cf.addRule(range, {
        type: 'dataBar',
        priority: 1,
        stopIfTrue: false,
        config: {
          type: 'dataBar',
          minType: 'min',
          maxType: 'max',
          color: '#3366FF',
          showValue: true,
          gradient: true,
        },
      });

      const result = cf.evaluate(cellRef, 50, rangeStats);
      expect(result?.dataBar?.percent).toBe(50);
    });

    it('should use negative fill color for negative values', () => {
      cf.addRule(range, {
        type: 'dataBar',
        priority: 1,
        stopIfTrue: false,
        config: {
          type: 'dataBar',
          minType: 'min',
          maxType: 'max',
          color: '#3366FF',
          negativeFillColor: '#FF0000',
          showValue: true,
          gradient: true,
        },
      });

      const negStats = createRangeStatistics([-50, 0, 50, 100]);
      const result = cf.evaluate(cellRef, -25, negStats);
      expect(result?.dataBar?.isNegative).toBe(true);
      expect(result?.dataBar?.color).toBe('#FF0000');
    });

    it('should handle fixed min/max values', () => {
      cf.addRule(range, {
        type: 'dataBar',
        priority: 1,
        stopIfTrue: false,
        config: {
          type: 'dataBar',
          minType: 'number',
          minValue: 0,
          maxType: 'number',
          maxValue: 200,
          color: '#3366FF',
          showValue: true,
          gradient: true,
        },
      });

      // With fixed 0-200 range, value 100 should be 50%
      const result = cf.evaluate(cellRef, 100, rangeStats);
      expect(result?.dataBar?.percent).toBe(50);
    });
  });

  // ===========================================================================
  // Icon Set Rules
  // ===========================================================================

  describe('Icon Set Rules', () => {
    const range: CellRange = { startRow: 0, startCol: 0, endRow: 9, endCol: 0 };
    const cellRef: CellRef = { row: 0, col: 0 };
    const rangeStats: RangeStatistics = createRangeStatistics([0, 25, 50, 75, 100]);

    it('should compute icon for 3-icon set', () => {
      cf.addRule(range, {
        type: 'iconSet',
        priority: 1,
        stopIfTrue: false,
        config: {
          type: 'iconSet',
          iconStyle: '3Arrows',
          reverseOrder: false,
          showIconOnly: false,
          thresholds: [
            { type: 'percent', value: 67, operator: '>=' },
            { type: 'percent', value: 33, operator: '>=' },
          ],
        },
      });

      const result = cf.evaluate(cellRef, 100, rangeStats);
      expect(result?.icon?.set).toBe('3Arrows');
      expect(result?.icon?.index).toBeGreaterThanOrEqual(0);
      expect(result?.icon?.index).toBeLessThanOrEqual(2);
    });

    it('should respect showIconOnly option', () => {
      cf.addRule(range, {
        type: 'iconSet',
        priority: 1,
        stopIfTrue: false,
        config: {
          type: 'iconSet',
          iconStyle: '3TrafficLights',
          reverseOrder: false,
          showIconOnly: true,
          thresholds: [
            { type: 'percent', value: 67, operator: '>=' },
            { type: 'percent', value: 33, operator: '>=' },
          ],
        },
      });

      const result = cf.evaluate(cellRef, 50, rangeStats);
      expect(result?.icon?.showOnly).toBe(true);
    });

    it('should handle reverse order', () => {
      cf.addRule(range, {
        type: 'iconSet',
        priority: 1,
        stopIfTrue: false,
        config: {
          type: 'iconSet',
          iconStyle: '3Arrows',
          reverseOrder: true,
          showIconOnly: false,
          thresholds: [
            { type: 'percent', value: 67, operator: '>=' },
            { type: 'percent', value: 33, operator: '>=' },
          ],
        },
      });

      const result = cf.evaluate(cellRef, 100, rangeStats);
      expect(result?.icon).toBeDefined();
      // With reverse, high values get low icons
    });

    it('should handle 5-icon sets', () => {
      cf.addRule(range, {
        type: 'iconSet',
        priority: 1,
        stopIfTrue: false,
        config: {
          type: 'iconSet',
          iconStyle: '5Arrows',
          reverseOrder: false,
          showIconOnly: false,
          thresholds: [
            { type: 'percent', value: 80, operator: '>=' },
            { type: 'percent', value: 60, operator: '>=' },
            { type: 'percent', value: 40, operator: '>=' },
            { type: 'percent', value: 20, operator: '>=' },
          ],
        },
      });

      const result = cf.evaluate(cellRef, 50, rangeStats);
      expect(result?.icon?.set).toBe('5Arrows');
      expect(result?.icon?.index).toBeGreaterThanOrEqual(0);
      expect(result?.icon?.index).toBeLessThanOrEqual(4);
    });
  });

  // ===========================================================================
  // Formula Rules
  // ===========================================================================

  describe('Formula Rules', () => {
    const range: CellRange = { startRow: 0, startCol: 0, endRow: 9, endCol: 0 };
    const cellRef: CellRef = { row: 0, col: 0 };

    it('should return false (external evaluation needed)', () => {
      cf.addRule(range, {
        type: 'formula',
        priority: 1,
        stopIfTrue: false,
        config: { type: 'formula', formula: '=A1>50' },
      });

      // Formula rules require external evaluation
      expect(cf.evaluate(cellRef, 100)).toBeNull();
    });
  });

  // ===========================================================================
  // Rule Priority and stopIfTrue
  // ===========================================================================

  describe('Rule Priority and stopIfTrue', () => {
    const range: CellRange = { startRow: 0, startCol: 0, endRow: 9, endCol: 0 };
    const cellRef: CellRef = { row: 0, col: 0 };

    it('should evaluate rules in priority order', () => {
      // Priority 1 (highest)
      cf.addRule(range, {
        type: 'cellValue',
        priority: 1,
        stopIfTrue: false,
        config: { type: 'cellValue', operator: 'greaterThan', value1: 0 },
        format: { bold: true },
      });

      // Priority 2
      cf.addRule(range, {
        type: 'cellValue',
        priority: 2,
        stopIfTrue: false,
        config: { type: 'cellValue', operator: 'greaterThan', value1: 50 },
        format: { italic: true },
      });

      const result = cf.evaluate(cellRef, 75);

      // Both rules should match
      expect(result?.matchedRules.length).toBe(2);
      expect(result?.format?.bold).toBe(true);
      expect(result?.format?.italic).toBe(true);
    });

    it('should stop evaluation when stopIfTrue is true', () => {
      // Priority 1 with stopIfTrue
      cf.addRule(range, {
        type: 'cellValue',
        priority: 1,
        stopIfTrue: true,
        config: { type: 'cellValue', operator: 'greaterThan', value1: 0 },
        format: { bold: true },
      });

      // Priority 2 (should not be evaluated if first matches)
      cf.addRule(range, {
        type: 'cellValue',
        priority: 2,
        stopIfTrue: false,
        config: { type: 'cellValue', operator: 'greaterThan', value1: 50 },
        format: { italic: true },
      });

      const result = cf.evaluate(cellRef, 75);

      // Only first rule should match (stopped)
      expect(result?.matchedRules.length).toBe(1);
      expect(result?.format?.bold).toBe(true);
      expect(result?.format?.italic).toBeUndefined();
    });

    it('should continue to next rule if stopIfTrue rule does not match', () => {
      // Priority 1 with stopIfTrue but won't match
      cf.addRule(range, {
        type: 'cellValue',
        priority: 1,
        stopIfTrue: true,
        config: { type: 'cellValue', operator: 'greaterThan', value1: 100 },
        format: { bold: true },
      });

      // Priority 2 should be evaluated
      cf.addRule(range, {
        type: 'cellValue',
        priority: 2,
        stopIfTrue: false,
        config: { type: 'cellValue', operator: 'greaterThan', value1: 50 },
        format: { italic: true },
      });

      const result = cf.evaluate(cellRef, 75);

      // Only second rule should match
      expect(result?.matchedRules.length).toBe(1);
      expect(result?.format?.bold).toBeUndefined();
      expect(result?.format?.italic).toBe(true);
    });

    it('should merge formats from multiple matching rules', () => {
      cf.addRule(range, {
        type: 'blanks',
        priority: 1,
        stopIfTrue: false,
        config: { type: 'empty' },
        format: { bold: true },
      });

      // This won't match null
      cf.addRule(range, {
        type: 'noBlanks',
        priority: 2,
        stopIfTrue: false,
        config: { type: 'empty' },
        format: { italic: true, underline: true },
      });

      // Add another blanks rule
      cf.addRule(range, {
        type: 'blanks',
        priority: 3,
        stopIfTrue: false,
        config: { type: 'empty' },
        format: { fontSize: 14 },
      });

      const result = cf.evaluate(cellRef, null);

      expect(result?.matchedRules.length).toBe(2);
      expect(result?.format?.bold).toBe(true);
      expect(result?.format?.fontSize).toBe(14);
    });
  });

  // ===========================================================================
  // Batch Evaluation
  // ===========================================================================

  describe('Batch Evaluation', () => {
    it('should evaluate multiple cells efficiently', () => {
      const range: CellRange = { startRow: 0, startCol: 0, endRow: 9, endCol: 0 };

      cf.addRule(range, {
        type: 'cellValue',
        priority: 1,
        stopIfTrue: false,
        config: { type: 'cellValue', operator: 'greaterThan', value1: 50 },
        format: { bold: true },
      });

      const cells = [
        { ref: { row: 0, col: 0 }, value: 25 },
        { ref: { row: 1, col: 0 }, value: 50 },
        { ref: { row: 2, col: 0 }, value: 75 },
        { ref: { row: 3, col: 0 }, value: 100 },
      ];

      const results = cf.evaluateBatch(cells);

      // Only values > 50 should have results
      expect(results.has('0_0')).toBe(false);
      expect(results.has('1_0')).toBe(false);
      expect(results.has('2_0')).toBe(true);
      expect(results.has('3_0')).toBe(true);

      expect(results.get('2_0')?.format?.bold).toBe(true);
    });

    it('should pass range stats to all evaluations', () => {
      const range: CellRange = { startRow: 0, startCol: 0, endRow: 9, endCol: 0 };

      cf.addRule(range, {
        type: 'topBottom',
        priority: 1,
        stopIfTrue: false,
        config: { type: 'topBottom', topBottom: 'top', rank: 2, unit: 'items' },
        format: { bold: true },
      });

      const cells = [
        { ref: { row: 0, col: 0 }, value: 10 },
        { ref: { row: 1, col: 0 }, value: 20 },
        { ref: { row: 2, col: 0 }, value: 30 },
        { ref: { row: 3, col: 0 }, value: 40 },
      ];

      const rangeStats = createRangeStatistics([10, 20, 30, 40]);
      const results = cf.evaluateBatch(cells, rangeStats);

      // Top 2: 30, 40
      expect(results.has('0_0')).toBe(false);
      expect(results.has('1_0')).toBe(false);
      expect(results.has('2_0')).toBe(true);
      expect(results.has('3_0')).toBe(true);
    });
  });

  // ===========================================================================
  // Serialization
  // ===========================================================================

  describe('Serialization', () => {
    describe('exportRules', () => {
      it('should export all rules sorted by priority', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };

        cf.addRule(range, { type: 'blanks', priority: 3, stopIfTrue: false, config: { type: 'empty' } });
        cf.addRule(range, { type: 'blanks', priority: 1, stopIfTrue: false, config: { type: 'empty' } });
        cf.addRule(range, { type: 'blanks', priority: 2, stopIfTrue: false, config: { type: 'empty' } });

        const exported = cf.exportRules();

        expect(exported.length).toBe(3);
        expect(exported[0].priority).toBe(1);
        expect(exported[1].priority).toBe(2);
        expect(exported[2].priority).toBe(3);
      });

      it('should return empty array when no rules', () => {
        expect(cf.exportRules()).toEqual([]);
      });
    });

    describe('importRules', () => {
      it('should import rules and clear existing by default', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
        cf.addRule(range, { type: 'blanks', priority: 1, stopIfTrue: false, config: { type: 'empty' } });
        expect(cf.getRuleCount()).toBe(1);

        const rulesToImport: ConditionalFormatRule[] = [
          {
            id: 'imported_1',
            type: 'blanks',
            range: { startRow: 0, startCol: 0, endRow: 5, endCol: 5 },
            priority: 1,
            stopIfTrue: false,
            config: { type: 'empty' },
          },
          {
            id: 'imported_2',
            type: 'errors',
            range: { startRow: 0, startCol: 0, endRow: 5, endCol: 5 },
            priority: 2,
            stopIfTrue: true,
            config: { type: 'empty' },
          },
        ];

        cf.importRules(rulesToImport);

        expect(cf.getRuleCount()).toBe(2);
        expect(cf.getRule('imported_1')).toBeDefined();
        expect(cf.getRule('imported_2')).toBeDefined();
      });

      it('should preserve existing rules when clearExisting is false', () => {
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
        const existingId = cf.addRule(range, { type: 'blanks', priority: 1, stopIfTrue: false, config: { type: 'empty' } });

        const rulesToImport: ConditionalFormatRule[] = [
          {
            id: 'imported_1',
            type: 'errors',
            range: { startRow: 0, startCol: 0, endRow: 5, endCol: 5 },
            priority: 2,
            stopIfTrue: false,
            config: { type: 'empty' },
          },
        ];

        cf.importRules(rulesToImport, false);

        expect(cf.getRuleCount()).toBe(2);
        expect(cf.getRule(existingId)).toBeDefined();
        expect(cf.getRule('imported_1')).toBeDefined();
      });

      it('should update ID counter to avoid collisions', () => {
        const rulesToImport: ConditionalFormatRule[] = [
          {
            id: 'cf_100_123456789',
            type: 'blanks',
            range: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
            priority: 1,
            stopIfTrue: false,
            config: { type: 'empty' },
          },
        ];

        cf.importRules(rulesToImport);

        // Add a new rule - should get ID higher than 100
        const range: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
        const newId = cf.addRule(range, { type: 'blanks', priority: 2, stopIfTrue: false, config: { type: 'empty' } });

        const match = newId.match(/cf_(\d+)/);
        expect(match).not.toBeNull();
        expect(parseInt(match![1], 10)).toBeGreaterThan(100);
      });
    });

    describe('round-trip serialization', () => {
      it('should preserve all rule data through export/import', () => {
        const range: CellRange = { startRow: 1, startCol: 2, endRow: 10, endCol: 5 };

        cf.addRule(range, {
          type: 'cellValue',
          priority: 1,
          stopIfTrue: true,
          config: { type: 'cellValue', operator: 'between', value1: 10, value2: 20 },
          format: { bold: true, fontSize: 14, backgroundColor: '#FFFF00' },
        });

        cf.addRule(range, {
          type: 'text',
          priority: 2,
          stopIfTrue: false,
          config: { type: 'text', operator: 'contains', text: 'error', caseSensitive: true },
          format: { textColor: '#FF0000' },
        });

        const exported = cf.exportRules();

        // Create new instance and import
        const cf2 = createConditionalFormatting();
        cf2.importRules(exported);

        const reimported = cf2.exportRules();

        expect(reimported.length).toBe(2);
        expect(reimported[0].type).toBe('cellValue');
        expect(reimported[0].priority).toBe(1);
        expect(reimported[0].stopIfTrue).toBe(true);
        expect(reimported[0].format?.bold).toBe(true);

        expect(reimported[1].type).toBe('text');
        expect((reimported[1].config as TextConfig).caseSensitive).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Helper Functions
  // ===========================================================================

  describe('createRangeStatistics', () => {
    it('should compute min, max, and sorted values', () => {
      const stats = createRangeStatistics([50, 10, 30, 90, 70]);

      expect(stats.min).toBe(10);
      expect(stats.max).toBe(90);
      expect(stats.count).toBe(5);
      expect(stats.values).toEqual([10, 30, 50, 70, 90]);
    });

    it('should filter out NaN values', () => {
      const stats = createRangeStatistics([10, NaN, 30, NaN, 50]);

      expect(stats.count).toBe(3);
      expect(stats.values).toEqual([10, 30, 50]);
    });

    it('should handle empty array', () => {
      const stats = createRangeStatistics([]);

      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.count).toBe(0);
      expect(stats.values).toEqual([]);
    });

    it('should handle single value', () => {
      const stats = createRangeStatistics([42]);

      expect(stats.min).toBe(42);
      expect(stats.max).toBe(42);
      expect(stats.count).toBe(1);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    const range: CellRange = { startRow: 0, startCol: 0, endRow: 9, endCol: 0 };
    const cellRef: CellRef = { row: 0, col: 0 };

    it('should return null when cell is outside all rule ranges', () => {
      cf.addRule(range, {
        type: 'blanks',
        priority: 1,
        stopIfTrue: false,
        config: { type: 'empty' },
      });

      const outsideCell: CellRef = { row: 100, col: 100 };
      expect(cf.evaluate(outsideCell, null)).toBeNull();
    });

    it('should return null when no rules match', () => {
      cf.addRule(range, {
        type: 'cellValue',
        priority: 1,
        stopIfTrue: false,
        config: { type: 'cellValue', operator: 'greaterThan', value1: 100 },
      });

      expect(cf.evaluate(cellRef, 50)).toBeNull();
    });

    it('should handle rules with no format', () => {
      cf.addRule(range, {
        type: 'blanks',
        priority: 1,
        stopIfTrue: false,
        config: { type: 'empty' },
        // No format specified
      });

      const result = cf.evaluate(cellRef, null);
      expect(result?.matchedRules.length).toBe(1);
      expect(result?.format).toBeUndefined();
    });

    it('should handle very large number of rules', () => {
      for (let i = 0; i < 100; i++) {
        cf.addRule(
          { startRow: 0, startCol: 0, endRow: 999, endCol: 999 },
          {
            type: 'cellValue',
            priority: i,
            stopIfTrue: false,
            config: { type: 'cellValue', operator: 'greaterThan', value1: i },
          }
        );
      }

      expect(cf.getRuleCount()).toBe(100);

      // Should still evaluate correctly
      const result = cf.evaluate(cellRef, 50);
      expect(result?.matchedRules.length).toBe(50); // 50 rules with threshold 0-49
    });
  });
});
