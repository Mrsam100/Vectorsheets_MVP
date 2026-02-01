/**
 * VectorSheet Engine - DataValidation Unit Tests
 *
 * Production-grade tests for the data validation rule engine.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DataValidation,
  createDataValidation,
  ValidationRuleConfig,
  ValidationRule,
  FormulaEvaluator,
  ValidationResult,
} from './DataValidation.js';
import { CellRange, CellRef } from '../types/index.js';

describe('DataValidation', () => {
  let dv: DataValidation;
  const singleCell: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
  const smallRange: CellRange = { startRow: 0, startCol: 0, endRow: 5, endCol: 3 };

  beforeEach(() => {
    dv = createDataValidation();
  });

  // ===========================================================================
  // Basic Rule Management
  // ===========================================================================

  describe('rule management', () => {
    it('should add a rule and return rule ID', () => {
      const ruleId = dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      expect(ruleId).toMatch(/^val_\d+_\d+$/);
    });

    it('should retrieve added rule by ID', () => {
      const ruleId = dv.addRule(singleCell, { type: 'decimal', operator: 'between', value1: 1, value2: 10 });
      const rule = dv.getRule(ruleId);
      expect(rule).not.toBeNull();
      expect(rule!.type).toBe('decimal');
      expect(rule!.operator).toBe('between');
      expect(rule!.value1).toBe(1);
      expect(rule!.value2).toBe(10);
    });

    it('should return null for non-existent rule ID', () => {
      expect(dv.getRule('non_existent')).toBeNull();
    });

    it('should set default values for optional properties', () => {
      const ruleId = dv.addRule(singleCell, { type: 'list', listItems: ['A', 'B'] });
      const rule = dv.getRule(ruleId);
      expect(rule!.allowBlank).toBe(true);
      expect(rule!.showDropdown).toBe(true);
      expect(rule!.showInputMessage).toBe(false);
      expect(rule!.showErrorAlert).toBe(true);
      expect(rule!.errorStyle).toBe('stop');
    });

    it('should remove a rule', () => {
      const ruleId = dv.addRule(singleCell, { type: 'wholeNumber', operator: 'equal', value1: 5 });
      expect(dv.removeRule(ruleId)).toBe(true);
      expect(dv.getRule(ruleId)).toBeNull();
    });

    it('should return false when removing non-existent rule', () => {
      expect(dv.removeRule('non_existent')).toBe(false);
    });

    it('should update an existing rule', () => {
      const ruleId = dv.addRule(singleCell, { type: 'decimal', operator: 'lessThan', value1: 100 });
      const updated = dv.updateRule(ruleId, { value1: 200, errorMessage: 'Too large!' });
      expect(updated).toBe(true);
      const rule = dv.getRule(ruleId);
      expect(rule!.value1).toBe(200);
      expect(rule!.errorMessage).toBe('Too large!');
    });

    it('should return false when updating non-existent rule', () => {
      expect(dv.updateRule('non_existent', { value1: 50 })).toBe(false);
    });

    it('should get all rules', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      dv.addRule(smallRange, { type: 'decimal', operator: 'between', value1: 1, value2: 10 });
      const rules = dv.getAllRules();
      expect(rules).toHaveLength(2);
    });

    it('should clear all rules', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      dv.addRule(smallRange, { type: 'decimal', operator: 'between', value1: 1, value2: 10 });
      dv.clear();
      expect(dv.getAllRules()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Cell-Rule Association
  // ===========================================================================

  describe('cell-rule association', () => {
    it('should detect validation on cell with rule', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      expect(dv.hasValidation({ row: 0, col: 0 })).toBe(true);
    });

    it('should not detect validation on cell without rule', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      expect(dv.hasValidation({ row: 10, col: 10 })).toBe(false);
    });

    it('should get rules for cell in range', () => {
      const ruleId = dv.addRule(smallRange, { type: 'decimal', operator: 'lessThan', value1: 100 });
      const rules = dv.getRulesForCell({ row: 2, col: 2 });
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe(ruleId);
    });

    it('should get primary rule for cell', () => {
      const ruleId = dv.addRule(smallRange, { type: 'decimal', operator: 'lessThan', value1: 100 });
      const rule = dv.getRuleForCell(2, 2);
      expect(rule!.id).toBe(ruleId);
    });

    it('should return null for cell without rule', () => {
      expect(dv.getRuleForCell(10, 10)).toBeNull();
    });

    it('should handle overlapping rules', () => {
      const range1: CellRange = { startRow: 0, startCol: 0, endRow: 5, endCol: 5 };
      const range2: CellRange = { startRow: 3, startCol: 3, endRow: 10, endCol: 10 };

      dv.addRule(range1, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      dv.addRule(range2, { type: 'decimal', operator: 'lessThan', value1: 100 });

      // Cell (4,4) is in both ranges
      const rules = dv.getRulesForCell({ row: 4, col: 4 });
      expect(rules).toHaveLength(2);
    });

    it('should clear validation when entire rule range is cleared', () => {
      // smallRange is (0,0) to (5,3)
      dv.addRule(smallRange, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      expect(dv.hasValidation({ row: 0, col: 0 })).toBe(true);

      // Clear the entire range
      dv.clearValidation(smallRange);

      // Rule should be removed when all cells are cleared
      expect(dv.getAllRules()).toHaveLength(0);
      expect(dv.hasValidation({ row: 0, col: 0 })).toBe(false);
    });
  });

  // ===========================================================================
  // Whole Number Validation
  // ===========================================================================

  describe('whole number validation', () => {
    it('should accept valid whole numbers', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      expect(dv.validateCell(0, 0, 5).isValid).toBe(true);
      expect(dv.validateCell(0, 0, 100).isValid).toBe(true);
    });

    it('should reject non-integer numbers', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      const result = dv.validateCell(0, 0, 5.5);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('whole number');
    });

    it('should reject non-numeric values', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      const result = dv.validateCell(0, 0, 'text');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('number');
    });

    it('should validate with between operator', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'between', value1: 1, value2: 10 });
      expect(dv.validateCell(0, 0, 1).isValid).toBe(true);
      expect(dv.validateCell(0, 0, 5).isValid).toBe(true);
      expect(dv.validateCell(0, 0, 10).isValid).toBe(true);
      expect(dv.validateCell(0, 0, 0).isValid).toBe(false);
      expect(dv.validateCell(0, 0, 11).isValid).toBe(false);
    });

    it('should validate with notBetween operator', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'notBetween', value1: 1, value2: 10 });
      expect(dv.validateCell(0, 0, 0).isValid).toBe(true);
      expect(dv.validateCell(0, 0, 11).isValid).toBe(true);
      expect(dv.validateCell(0, 0, 5).isValid).toBe(false);
    });

    it('should validate with equal operator', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'equal', value1: 42 });
      expect(dv.validateCell(0, 0, 42).isValid).toBe(true);
      expect(dv.validateCell(0, 0, 41).isValid).toBe(false);
    });

    it('should validate with notEqual operator', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'notEqual', value1: 42 });
      expect(dv.validateCell(0, 0, 41).isValid).toBe(true);
      expect(dv.validateCell(0, 0, 42).isValid).toBe(false);
    });

    it('should validate with lessThan operator', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'lessThan', value1: 10 });
      expect(dv.validateCell(0, 0, 9).isValid).toBe(true);
      expect(dv.validateCell(0, 0, 10).isValid).toBe(false);
    });

    it('should validate with lessThanOrEqual operator', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'lessThanOrEqual', value1: 10 });
      expect(dv.validateCell(0, 0, 10).isValid).toBe(true);
      expect(dv.validateCell(0, 0, 11).isValid).toBe(false);
    });

    it('should validate with greaterThanOrEqual operator', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThanOrEqual', value1: 5 });
      expect(dv.validateCell(0, 0, 5).isValid).toBe(true);
      expect(dv.validateCell(0, 0, 4).isValid).toBe(false);
    });

    it('should parse string numbers', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'equal', value1: 42 });
      expect(dv.validateCell(0, 0, '42').isValid).toBe(true);
    });
  });

  // ===========================================================================
  // Decimal Validation
  // ===========================================================================

  describe('decimal validation', () => {
    it('should accept valid decimal numbers', () => {
      dv.addRule(singleCell, { type: 'decimal', operator: 'between', value1: 0, value2: 100 });
      expect(dv.validateCell(0, 0, 0.5).isValid).toBe(true);
      expect(dv.validateCell(0, 0, 99.99).isValid).toBe(true);
      expect(dv.validateCell(0, 0, 50).isValid).toBe(true);
    });

    it('should reject non-numeric values', () => {
      dv.addRule(singleCell, { type: 'decimal', operator: 'greaterThan', value1: 0 });
      expect(dv.validateCell(0, 0, 'text').isValid).toBe(false);
    });

    it('should validate decimal with all operators', () => {
      dv.addRule(singleCell, { type: 'decimal', operator: 'lessThan', value1: 3.14 });
      expect(dv.validateCell(0, 0, 3.13).isValid).toBe(true);
      expect(dv.validateCell(0, 0, 3.15).isValid).toBe(false);
    });
  });

  // ===========================================================================
  // List Validation
  // ===========================================================================

  describe('list validation', () => {
    it('should accept values in the list', () => {
      dv.addRule(singleCell, { type: 'list', listItems: ['Red', 'Green', 'Blue'] });
      expect(dv.validateCell(0, 0, 'Red').isValid).toBe(true);
      expect(dv.validateCell(0, 0, 'Green').isValid).toBe(true);
      expect(dv.validateCell(0, 0, 'Blue').isValid).toBe(true);
    });

    it('should reject values not in the list', () => {
      dv.addRule(singleCell, { type: 'list', listItems: ['Red', 'Green', 'Blue'] });
      const result = dv.validateCell(0, 0, 'Yellow');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('list');
    });

    it('should be case-insensitive', () => {
      dv.addRule(singleCell, { type: 'list', listItems: ['Red', 'Green', 'Blue'] });
      expect(dv.validateCell(0, 0, 'red').isValid).toBe(true);
      expect(dv.validateCell(0, 0, 'RED').isValid).toBe(true);
      expect(dv.validateCell(0, 0, 'ReD').isValid).toBe(true);
    });

    it('should trim whitespace', () => {
      dv.addRule(singleCell, { type: 'list', listItems: ['Red', 'Green', 'Blue'] });
      expect(dv.validateCell(0, 0, ' Red ').isValid).toBe(true);
    });

    it('should accept any value if list is empty', () => {
      dv.addRule(singleCell, { type: 'list', listItems: [] });
      expect(dv.validateCell(0, 0, 'anything').isValid).toBe(true);
    });

    it('should accept any value if listItems is undefined', () => {
      dv.addRule(singleCell, { type: 'list' });
      expect(dv.validateCell(0, 0, 'anything').isValid).toBe(true);
    });
  });

  // ===========================================================================
  // Date Validation
  // ===========================================================================

  describe('date validation', () => {
    it('should accept valid Date objects', () => {
      const minDate = new Date('2024-01-01');
      const maxDate = new Date('2024-12-31');
      dv.addRule(singleCell, { type: 'date', operator: 'between', value1: minDate, value2: maxDate });

      expect(dv.validateCell(0, 0, new Date('2024-06-15')).isValid).toBe(true);
    });

    it('should accept date strings', () => {
      const minDate = new Date('2024-01-01');
      dv.addRule(singleCell, { type: 'date', operator: 'greaterThanOrEqual', value1: minDate });

      expect(dv.validateCell(0, 0, '2024-06-15').isValid).toBe(true);
      expect(dv.validateCell(0, 0, '2023-12-31').isValid).toBe(false);
    });

    it('should reject invalid date strings', () => {
      const minDate = new Date('2024-01-01');
      dv.addRule(singleCell, { type: 'date', operator: 'greaterThan', value1: minDate });

      const result = dv.validateCell(0, 0, 'not-a-date');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('date');
    });

    it('should validate exact date equality', () => {
      const targetDate = new Date('2024-06-15T00:00:00.000Z');
      dv.addRule(singleCell, { type: 'date', operator: 'equal', value1: targetDate });

      expect(dv.validateCell(0, 0, new Date('2024-06-15T00:00:00.000Z')).isValid).toBe(true);
    });

    it('should handle Excel serial date numbers', () => {
      // Excel serial date: 45000 is roughly 2023-03-15
      const minDate = new Date('2023-01-01');
      dv.addRule(singleCell, { type: 'date', operator: 'greaterThan', value1: minDate });

      expect(dv.validateCell(0, 0, 45000).isValid).toBe(true);
    });
  });

  // ===========================================================================
  // Time Validation
  // ===========================================================================

  describe('time validation', () => {
    it('should accept time as fraction of day', () => {
      // 0.5 = 12:00 (noon)
      dv.addRule(singleCell, { type: 'time', operator: 'lessThan', value1: 0.75 }); // before 6 PM
      expect(dv.validateCell(0, 0, 0.5).isValid).toBe(true); // noon
      expect(dv.validateCell(0, 0, 0.8).isValid).toBe(false); // after 6 PM
    });

    it('should parse time strings in HH:MM format', () => {
      dv.addRule(singleCell, { type: 'time', operator: 'between', value1: '09:00', value2: '17:00' });
      expect(dv.validateCell(0, 0, '12:00').isValid).toBe(true);
      expect(dv.validateCell(0, 0, '08:00').isValid).toBe(false);
      expect(dv.validateCell(0, 0, '18:00').isValid).toBe(false);
    });

    it('should parse time strings with AM/PM', () => {
      dv.addRule(singleCell, { type: 'time', operator: 'lessThan', value1: '5:00 PM' });
      expect(dv.validateCell(0, 0, '2:00 PM').isValid).toBe(true);
      expect(dv.validateCell(0, 0, '6:00 PM').isValid).toBe(false);
    });

    it('should parse time strings with seconds', () => {
      dv.addRule(singleCell, { type: 'time', operator: 'greaterThan', value1: '12:30:00' });
      expect(dv.validateCell(0, 0, '12:30:01').isValid).toBe(true);
    });

    it('should handle invalid time strings', () => {
      dv.addRule(singleCell, { type: 'time', operator: 'between', value1: '09:00', value2: '17:00' });
      const result = dv.validateCell(0, 0, 'not-a-time');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('time');
    });
  });

  // ===========================================================================
  // Text Length Validation
  // ===========================================================================

  describe('text length validation', () => {
    it('should validate minimum length', () => {
      dv.addRule(singleCell, { type: 'textLength', operator: 'greaterThanOrEqual', value1: 3 });
      expect(dv.validateCell(0, 0, 'abc').isValid).toBe(true);
      expect(dv.validateCell(0, 0, 'ab').isValid).toBe(false);
    });

    it('should validate maximum length', () => {
      dv.addRule(singleCell, { type: 'textLength', operator: 'lessThanOrEqual', value1: 10 });
      expect(dv.validateCell(0, 0, 'short').isValid).toBe(true);
      expect(dv.validateCell(0, 0, 'this is too long').isValid).toBe(false);
    });

    it('should validate exact length', () => {
      dv.addRule(singleCell, { type: 'textLength', operator: 'equal', value1: 5 });
      expect(dv.validateCell(0, 0, 'hello').isValid).toBe(true);
      expect(dv.validateCell(0, 0, 'hi').isValid).toBe(false);
      expect(dv.validateCell(0, 0, 'hello!').isValid).toBe(false);
    });

    it('should validate length range', () => {
      dv.addRule(singleCell, { type: 'textLength', operator: 'between', value1: 3, value2: 10 });
      expect(dv.validateCell(0, 0, 'abc').isValid).toBe(true);
      expect(dv.validateCell(0, 0, 'ab').isValid).toBe(false);
      expect(dv.validateCell(0, 0, '12345678901').isValid).toBe(false);
    });

    it('should convert non-strings to string for length check', () => {
      dv.addRule(singleCell, { type: 'textLength', operator: 'equal', value1: 3 });
      expect(dv.validateCell(0, 0, 123).isValid).toBe(true); // "123" has length 3
    });
  });

  // ===========================================================================
  // Custom Formula Validation
  // ===========================================================================

  describe('custom formula validation', () => {
    it('should skip validation without formula evaluator', () => {
      dv.addRule(singleCell, { type: 'custom', formula: 'A1>0' });
      expect(dv.validateCell(0, 0, -1).isValid).toBe(true); // skipped
    });

    it('should validate with formula evaluator returning true', () => {
      const mockEvaluator: FormulaEvaluator = {
        evaluate: vi.fn().mockReturnValue(true),
      };
      dv.setFormulaEvaluator(mockEvaluator);
      dv.addRule(singleCell, { type: 'custom', formula: 'A1>0' });

      expect(dv.validateCell(0, 0, 5).isValid).toBe(true);
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith('A1>0', { row: 0, col: 0 });
    });

    it('should fail validation when formula returns false', () => {
      const mockEvaluator: FormulaEvaluator = {
        evaluate: vi.fn().mockReturnValue(false),
      };
      dv.setFormulaEvaluator(mockEvaluator);
      dv.addRule(singleCell, { type: 'custom', formula: 'A1>0', errorMessage: 'Must be positive' });

      const result = dv.validateCell(0, 0, -1);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Must be positive');
    });

    it('should handle formula evaluation errors', () => {
      const mockEvaluator: FormulaEvaluator = {
        evaluate: vi.fn().mockImplementation(() => { throw new Error('Formula error'); }),
      };
      dv.setFormulaEvaluator(mockEvaluator);
      dv.addRule(singleCell, { type: 'custom', formula: 'INVALID()' });

      const result = dv.validateCell(0, 0, 5);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('formula');
    });

    it('should ignore errors when ignoreError is true', () => {
      const mockEvaluator: FormulaEvaluator = {
        evaluate: vi.fn().mockImplementation(() => { throw new Error('Formula error'); }),
      };
      dv.setFormulaEvaluator(mockEvaluator);
      dv.addRule(singleCell, { type: 'custom', formula: 'INVALID()', ignoreError: true });

      expect(dv.validateCell(0, 0, 5).isValid).toBe(true);
    });

    it('should pass without formula defined', () => {
      const mockEvaluator: FormulaEvaluator = {
        evaluate: vi.fn(),
      };
      dv.setFormulaEvaluator(mockEvaluator);
      dv.addRule(singleCell, { type: 'custom' }); // no formula

      expect(dv.validateCell(0, 0, 5).isValid).toBe(true);
      expect(mockEvaluator.evaluate).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Blank Handling
  // ===========================================================================

  describe('blank value handling', () => {
    it('should allow blank by default', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      expect(dv.validateCell(0, 0, null).isValid).toBe(true);
      expect(dv.validateCell(0, 0, undefined).isValid).toBe(true);
      expect(dv.validateCell(0, 0, '').isValid).toBe(true);
    });

    it('should reject blank when allowBlank is false', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0, allowBlank: false });
      const result = dv.validateCell(0, 0, null);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('cannot be empty');
    });
  });

  // ===========================================================================
  // Any Type Validation
  // ===========================================================================

  describe('any type validation', () => {
    it('should accept any value with type "any"', () => {
      dv.addRule(singleCell, { type: 'any' });
      expect(dv.validateCell(0, 0, 'text').isValid).toBe(true);
      expect(dv.validateCell(0, 0, 123).isValid).toBe(true);
      expect(dv.validateCell(0, 0, null).isValid).toBe(true);
    });
  });

  // ===========================================================================
  // Error Messages and Styles
  // ===========================================================================

  describe('error messages and styles', () => {
    it('should include custom error title', () => {
      dv.addRule(singleCell, {
        type: 'wholeNumber',
        operator: 'greaterThan',
        value1: 0,
        errorTitle: 'Invalid Input',
      });
      const result = dv.validateCell(0, 0, -1);
      expect(result.title).toBe('Invalid Input');
    });

    it('should include custom error message', () => {
      dv.addRule(singleCell, {
        type: 'wholeNumber',
        operator: 'greaterThan',
        value1: 0,
        errorMessage: 'Please enter a positive number',
      });
      const result = dv.validateCell(0, 0, -1);
      expect(result.message).toBe('Please enter a positive number');
    });

    it('should set severity to stop by default', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      const result = dv.validateCell(0, 0, -1);
      expect(result.severity).toBe('stop');
      expect(result.allowAnyway).toBe(false);
    });

    it('should allow value with warning style', () => {
      dv.addRule(singleCell, {
        type: 'wholeNumber',
        operator: 'greaterThan',
        value1: 0,
        errorStyle: 'warning',
      });
      const result = dv.validateCell(0, 0, -1);
      expect(result.severity).toBe('warning');
      expect(result.allowAnyway).toBe(true);
    });

    it('should allow value with information style', () => {
      dv.addRule(singleCell, {
        type: 'wholeNumber',
        operator: 'greaterThan',
        value1: 0,
        errorStyle: 'information',
      });
      const result = dv.validateCell(0, 0, -1);
      expect(result.severity).toBe('information');
      expect(result.allowAnyway).toBe(true);
    });

    it('should include rule ID in failure result', () => {
      const ruleId = dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      const result = dv.validateCell(0, 0, -1);
      expect(result.ruleId).toBe(ruleId);
    });

    it('should not include message when showErrorAlert is false', () => {
      dv.addRule(singleCell, {
        type: 'wholeNumber',
        operator: 'greaterThan',
        value1: 0,
        showErrorAlert: false,
      });
      const result = dv.validateCell(0, 0, -1);
      expect(result.isValid).toBe(false);
      expect(result.message).toBeUndefined();
    });
  });

  // ===========================================================================
  // Input Messages
  // ===========================================================================

  describe('input messages', () => {
    it('should return input message when configured', () => {
      dv.addRule(singleCell, {
        type: 'wholeNumber',
        operator: 'greaterThan',
        value1: 0,
        showInputMessage: true,
        inputTitle: 'Enter Number',
        inputMessage: 'Please enter a positive whole number',
      });

      const msg = dv.getInputMessage({ row: 0, col: 0 });
      expect(msg).not.toBeNull();
      expect(msg!.title).toBe('Enter Number');
      expect(msg!.message).toBe('Please enter a positive whole number');
    });

    it('should return null when showInputMessage is false', () => {
      dv.addRule(singleCell, {
        type: 'wholeNumber',
        operator: 'greaterThan',
        value1: 0,
        showInputMessage: false,
        inputTitle: 'Enter Number',
        inputMessage: 'Please enter a positive whole number',
      });

      expect(dv.getInputMessage({ row: 0, col: 0 })).toBeNull();
    });

    it('should return null for cell without validation', () => {
      expect(dv.getInputMessage({ row: 10, col: 10 })).toBeNull();
    });
  });

  // ===========================================================================
  // Dropdown Items
  // ===========================================================================

  describe('dropdown items', () => {
    it('should return dropdown items for list type', () => {
      dv.addRule(singleCell, { type: 'list', listItems: ['A', 'B', 'C'], showDropdown: true });
      const items = dv.getDropdownItems({ row: 0, col: 0 });
      expect(items).toEqual(['A', 'B', 'C']);
    });

    it('should return null when showDropdown is false', () => {
      dv.addRule(singleCell, { type: 'list', listItems: ['A', 'B', 'C'], showDropdown: false });
      expect(dv.getDropdownItems({ row: 0, col: 0 })).toBeNull();
    });

    it('should return null for non-list type', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      expect(dv.getDropdownItems({ row: 0, col: 0 })).toBeNull();
    });

    it('should return copy of items (not reference)', () => {
      dv.addRule(singleCell, { type: 'list', listItems: ['A', 'B', 'C'] });
      const items1 = dv.getDropdownItems({ row: 0, col: 0 });
      const items2 = dv.getDropdownItems({ row: 0, col: 0 });
      expect(items1).not.toBe(items2);
    });
  });

  // ===========================================================================
  // Convenience Rule Creators
  // ===========================================================================

  describe('convenience rule creators', () => {
    it('should create dropdown rule', () => {
      const ruleId = dv.createDropdownRule(singleCell, ['Yes', 'No']);
      const rule = dv.getRule(ruleId);
      expect(rule!.type).toBe('list');
      expect(rule!.listItems).toEqual(['Yes', 'No']);
      expect(rule!.showDropdown).toBe(true);
    });

    it('should create whole number rule', () => {
      const ruleId = dv.createWholeNumberRule(singleCell, 'between', 1, 100);
      const rule = dv.getRule(ruleId);
      expect(rule!.type).toBe('wholeNumber');
      expect(rule!.operator).toBe('between');
      expect(rule!.value1).toBe(1);
      expect(rule!.value2).toBe(100);
    });

    it('should create decimal rule', () => {
      const ruleId = dv.createDecimalRule(singleCell, 'lessThan', 99.99);
      const rule = dv.getRule(ruleId);
      expect(rule!.type).toBe('decimal');
      expect(rule!.operator).toBe('lessThan');
      expect(rule!.value1).toBe(99.99);
    });

    it('should create date rule', () => {
      const date = new Date('2024-01-01');
      const ruleId = dv.createDateRule(singleCell, 'greaterThanOrEqual', date);
      const rule = dv.getRule(ruleId);
      expect(rule!.type).toBe('date');
      expect(rule!.value1).toEqual(date);
    });

    it('should create time rule', () => {
      const ruleId = dv.createTimeRule(singleCell, 'between', '09:00', '17:00');
      const rule = dv.getRule(ruleId);
      expect(rule!.type).toBe('time');
      expect(rule!.value1).toBe('09:00');
      expect(rule!.value2).toBe('17:00');
    });

    it('should create text length rule', () => {
      const ruleId = dv.createTextLengthRule(singleCell, 'lessThanOrEqual', 100);
      const rule = dv.getRule(ruleId);
      expect(rule!.type).toBe('textLength');
      expect(rule!.value1).toBe(100);
    });

    it('should create custom rule', () => {
      const ruleId = dv.createCustomRule(singleCell, 'AND(A1>0,A1<100)');
      const rule = dv.getRule(ruleId);
      expect(rule!.type).toBe('custom');
      expect(rule!.formula).toBe('AND(A1>0,A1<100)');
    });

    it('should accept options in convenience creators', () => {
      const ruleId = dv.createWholeNumberRule(singleCell, 'greaterThan', 0, undefined, {
        errorTitle: 'Custom Title',
        errorMessage: 'Custom Message',
      });
      const rule = dv.getRule(ruleId);
      expect(rule!.errorTitle).toBe('Custom Title');
      expect(rule!.errorMessage).toBe('Custom Message');
    });
  });

  // ===========================================================================
  // Events
  // ===========================================================================

  describe('events', () => {
    it('should emit onRuleAdd event', () => {
      const onRuleAdd = vi.fn();
      dv.setEventHandlers({ onRuleAdd });

      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });

      expect(onRuleAdd).toHaveBeenCalledTimes(1);
      expect(onRuleAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'wholeNumber' }));
    });

    it('should emit onRuleRemove event', () => {
      const onRuleRemove = vi.fn();
      dv.setEventHandlers({ onRuleRemove });

      const ruleId = dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      dv.removeRule(ruleId);

      expect(onRuleRemove).toHaveBeenCalledWith(ruleId);
    });

    it('should emit onRuleUpdate event', () => {
      const onRuleUpdate = vi.fn();
      dv.setEventHandlers({ onRuleUpdate });

      const ruleId = dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      dv.updateRule(ruleId, { value1: 10 });

      expect(onRuleUpdate).toHaveBeenCalledWith(expect.objectContaining({ value1: 10 }));
    });

    it('should emit onValidationFail event', () => {
      const onValidationFail = vi.fn();
      dv.setEventHandlers({ onValidationFail });

      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      dv.validateCell(0, 0, -1);

      expect(onValidationFail).toHaveBeenCalledTimes(1);
      expect(onValidationFail).toHaveBeenCalledWith(
        { row: 0, col: 0 },
        expect.objectContaining({ isValid: false })
      );
    });

    it('should not emit onValidationFail for valid values', () => {
      const onValidationFail = vi.fn();
      dv.setEventHandlers({ onValidationFail });

      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      dv.validateCell(0, 0, 5);

      expect(onValidationFail).not.toHaveBeenCalled();
    });

    it('should merge event handlers', () => {
      const onRuleAdd = vi.fn();
      const onRuleRemove = vi.fn();

      dv.setEventHandlers({ onRuleAdd });
      dv.setEventHandlers({ onRuleRemove });

      const ruleId = dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      dv.removeRule(ruleId);

      expect(onRuleAdd).toHaveBeenCalled();
      expect(onRuleRemove).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Serialization
  // ===========================================================================

  describe('serialization', () => {
    it('should export all rules', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      dv.addRule(smallRange, { type: 'list', listItems: ['A', 'B'] });

      const exported = dv.exportRules();
      expect(exported).toHaveLength(2);
    });

    it('should convert Date to ISO string on export', () => {
      const date = new Date('2024-06-15T12:00:00.000Z');
      dv.addRule(singleCell, { type: 'date', operator: 'greaterThan', value1: date });

      const exported = dv.exportRules();
      expect(exported[0].value1).toBe('2024-06-15T12:00:00.000Z');
    });

    it('should import rules', () => {
      const rules: ValidationRule[] = [
        {
          id: 'val_1_123',
          range: singleCell,
          type: 'wholeNumber',
          operator: 'greaterThan',
          value1: 0,
          allowBlank: true,
          showDropdown: true,
          showInputMessage: false,
          showErrorAlert: true,
          errorStyle: 'stop',
        },
      ];

      dv.importRules(rules);
      expect(dv.getAllRules()).toHaveLength(1);
      expect(dv.validateCell(0, 0, 5).isValid).toBe(true);
    });

    it('should clear existing rules on import', () => {
      dv.addRule(singleCell, { type: 'decimal', operator: 'lessThan', value1: 100 });

      const rules: ValidationRule[] = [
        {
          id: 'val_10_456',
          range: smallRange,
          type: 'list',
          listItems: ['X', 'Y'],
          allowBlank: true,
          showDropdown: true,
          showInputMessage: false,
          showErrorAlert: true,
          errorStyle: 'stop',
        },
      ];

      dv.importRules(rules);
      expect(dv.getAllRules()).toHaveLength(1);
      expect(dv.getAllRules()[0].type).toBe('list');
    });

    it('should update ID counter to avoid collisions', () => {
      const rules: ValidationRule[] = [
        {
          id: 'val_100_789',
          range: singleCell,
          type: 'wholeNumber',
          operator: 'equal',
          value1: 42,
          allowBlank: true,
          showDropdown: true,
          showInputMessage: false,
          showErrorAlert: true,
          errorStyle: 'stop',
        },
      ];

      dv.importRules(rules);

      // New rule should have higher ID number
      const newRuleId = dv.addRule(smallRange, { type: 'decimal', operator: 'greaterThan', value1: 0 });
      const match = newRuleId.match(/^val_(\d+)_/);
      expect(parseInt(match![1], 10)).toBeGreaterThan(100);
    });
  });

  // ===========================================================================
  // Validation with Multiple Rules
  // ===========================================================================

  describe('validation with multiple rules', () => {
    it('should fail on first rule violation', () => {
      const range1: CellRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 2 };

      dv.addRule(range1, {
        type: 'wholeNumber',
        operator: 'greaterThan',
        value1: 0,
        errorMessage: 'Must be positive',
      });
      dv.addRule(range1, {
        type: 'wholeNumber',
        operator: 'lessThan',
        value1: 100,
        errorMessage: 'Must be less than 100',
      });

      // Value violates first rule
      const result = dv.validateCell(0, 0, -1);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Must be positive');
    });

    it('should pass when all rules are satisfied', () => {
      const range: CellRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 2 };

      dv.addRule(range, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      dv.addRule(range, { type: 'wholeNumber', operator: 'lessThan', value1: 100 });

      expect(dv.validateCell(0, 0, 50).isValid).toBe(true);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should return valid for cell without rules', () => {
      expect(dv.validateCell(0, 0, 'anything').isValid).toBe(true);
    });

    it('should handle large ranges without indexing all cells', () => {
      const largeRange: CellRange = { startRow: 0, startCol: 0, endRow: 1000, endCol: 100 };
      dv.addRule(largeRange, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });

      // Should still validate correctly
      expect(dv.validateCell(500, 50, 5).isValid).toBe(true);
      expect(dv.validateCell(500, 50, -1).isValid).toBe(false);
    });

    it('should handle validate() with CellRef object', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      const result = dv.validate({ row: 0, col: 0 }, 5);
      expect(result.isValid).toBe(true);
    });

    it('should handle between with swapped values', () => {
      // value1 > value2, should still work
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'between', value1: 10, value2: 1 });
      expect(dv.validateCell(0, 0, 5).isValid).toBe(true);
      expect(dv.validateCell(0, 0, 0).isValid).toBe(false);
    });

    it('should return valid result with no message when value is valid', () => {
      dv.addRule(singleCell, { type: 'wholeNumber', operator: 'greaterThan', value1: 0 });
      const result = dv.validateCell(0, 0, 5);
      expect(result.isValid).toBe(true);
      expect(result.message).toBeUndefined();
      expect(result.ruleId).toBeUndefined();
    });
  });

  // ===========================================================================
  // Factory Function
  // ===========================================================================

  describe('factory function', () => {
    it('should create DataValidation with createDataValidation()', () => {
      const validation = createDataValidation();
      expect(validation).toBeInstanceOf(DataValidation);
    });

    it('should accept formula evaluator in constructor', () => {
      const mockEvaluator: FormulaEvaluator = {
        evaluate: vi.fn().mockReturnValue(true),
      };
      const validation = createDataValidation(mockEvaluator);
      validation.addRule(singleCell, { type: 'custom', formula: 'TEST()' });
      validation.validateCell(0, 0, 5);
      expect(mockEvaluator.evaluate).toHaveBeenCalled();
    });
  });
});
