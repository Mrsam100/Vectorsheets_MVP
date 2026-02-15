/**
 * Filter Predicate Tests
 * Comprehensive test suite for all predicate types
 */

import { describe, it, expect } from 'vitest';
import {
  TextContainsPredicate,
  TextBeginsWithPredicate,
  TextEndsWithPredicate,
  TextEqualsPredicate,
  TextNotEqualsPredicate,
  NumberGreaterThanPredicate,
  NumberGreaterThanOrEqualPredicate,
  NumberLessThanPredicate,
  NumberLessThanOrEqualPredicate,
  NumberBetweenPredicate,
  NumberEqualsPredicate,
  DateBeforePredicate,
  DateAfterPredicate,
  DateBetweenPredicate,
  DateEqualsPredicate,
  IsEmptyPredicate,
  IsNotEmptyPredicate,
  AndPredicate,
  OrPredicate,
  deserializePredicate,
} from './FilterPredicate';
import type { FormattedText } from '../types/index';

// ===========================================================================
// Text Predicates
// ===========================================================================

describe('FilterPredicate - Text Predicates', () => {
  describe('TextContainsPredicate', () => {
    it('should match text containing substring (case-insensitive)', () => {
      const predicate = new TextContainsPredicate('hello');
      expect(predicate.test('hello world')).toBe(true);
      expect(predicate.test('HELLO WORLD')).toBe(true);
      expect(predicate.test('say hello')).toBe(true);
      expect(predicate.test('goodbye')).toBe(false);
    });

    it('should match text containing substring (case-sensitive)', () => {
      const predicate = new TextContainsPredicate('Hello', { caseSensitive: true });
      expect(predicate.test('Hello World')).toBe(true);
      expect(predicate.test('hello world')).toBe(false);
      expect(predicate.test('HELLO WORLD')).toBe(false);
    });

    it('should handle numbers as strings', () => {
      const predicate = new TextContainsPredicate('123');
      expect(predicate.test(123)).toBe(true);
      expect(predicate.test(12345)).toBe(true);
      expect(predicate.test(456)).toBe(false);
    });

    it('should handle FormattedText', () => {
      const predicate = new TextContainsPredicate('test');
      const formattedText: FormattedText = {
        _type: 'FormattedText',
        text: 'this is a test',
        runs: [],
      };
      expect(predicate.test(formattedText)).toBe(true);
    });

    it('should handle empty/null values', () => {
      const predicate = new TextContainsPredicate('test');
      expect(predicate.test(null)).toBe(false);
      expect(predicate.test(undefined)).toBe(false);
      expect(predicate.test('')).toBe(false);
    });
  });

  describe('TextBeginsWithPredicate', () => {
    it('should match text beginning with prefix (case-insensitive)', () => {
      const predicate = new TextBeginsWithPredicate('hello');
      expect(predicate.test('hello world')).toBe(true);
      expect(predicate.test('HELLO WORLD')).toBe(true);
      expect(predicate.test('world hello')).toBe(false);
    });

    it('should match text beginning with prefix (case-sensitive)', () => {
      const predicate = new TextBeginsWithPredicate('Hello', { caseSensitive: true });
      expect(predicate.test('Hello World')).toBe(true);
      expect(predicate.test('hello world')).toBe(false);
    });

    it('should handle empty prefix', () => {
      const predicate = new TextBeginsWithPredicate('');
      expect(predicate.test('anything')).toBe(true); // All strings start with empty string
    });
  });

  describe('TextEndsWithPredicate', () => {
    it('should match text ending with suffix (case-insensitive)', () => {
      const predicate = new TextEndsWithPredicate('world');
      expect(predicate.test('hello world')).toBe(true);
      expect(predicate.test('HELLO WORLD')).toBe(true);
      expect(predicate.test('world hello')).toBe(false);
    });

    it('should match text ending with suffix (case-sensitive)', () => {
      const predicate = new TextEndsWithPredicate('World', { caseSensitive: true });
      expect(predicate.test('Hello World')).toBe(true);
      expect(predicate.test('hello world')).toBe(false);
    });
  });

  describe('TextEqualsPredicate', () => {
    it('should match exact text (case-insensitive)', () => {
      const predicate = new TextEqualsPredicate('hello');
      expect(predicate.test('hello')).toBe(true);
      expect(predicate.test('HELLO')).toBe(true);
      expect(predicate.test('hello world')).toBe(false);
    });

    it('should match exact text (case-sensitive)', () => {
      const predicate = new TextEqualsPredicate('Hello', { caseSensitive: true });
      expect(predicate.test('Hello')).toBe(true);
      expect(predicate.test('hello')).toBe(false);
      expect(predicate.test('HELLO')).toBe(false);
    });
  });

  describe('TextNotEqualsPredicate', () => {
    it('should match non-equal text (case-insensitive)', () => {
      const predicate = new TextNotEqualsPredicate('hello');
      expect(predicate.test('hello')).toBe(false);
      expect(predicate.test('HELLO')).toBe(false);
      expect(predicate.test('world')).toBe(true);
    });

    it('should match non-equal text (case-sensitive)', () => {
      const predicate = new TextNotEqualsPredicate('Hello', { caseSensitive: true });
      expect(predicate.test('Hello')).toBe(false);
      expect(predicate.test('hello')).toBe(true); // Different case
      expect(predicate.test('World')).toBe(true);
    });
  });
});

// ===========================================================================
// Number Predicates
// ===========================================================================

describe('FilterPredicate - Number Predicates', () => {
  describe('NumberGreaterThanPredicate', () => {
    it('should match numbers greater than threshold', () => {
      const predicate = new NumberGreaterThanPredicate(10);
      expect(predicate.test(11)).toBe(true);
      expect(predicate.test(100)).toBe(true);
      expect(predicate.test(10)).toBe(false);
      expect(predicate.test(9)).toBe(false);
    });

    it('should handle numeric strings', () => {
      const predicate = new NumberGreaterThanPredicate(10);
      expect(predicate.test('11')).toBe(true);
      expect(predicate.test('9')).toBe(false);
    });

    it('should reject non-numeric values', () => {
      const predicate = new NumberGreaterThanPredicate(10);
      expect(predicate.test('not a number')).toBe(false);
      expect(predicate.test(null)).toBe(false);
      expect(predicate.test(undefined)).toBe(false);
    });
  });

  describe('NumberGreaterThanOrEqualPredicate', () => {
    it('should match numbers >= threshold', () => {
      const predicate = new NumberGreaterThanOrEqualPredicate(10);
      expect(predicate.test(11)).toBe(true);
      expect(predicate.test(10)).toBe(true);
      expect(predicate.test(9)).toBe(false);
    });
  });

  describe('NumberLessThanPredicate', () => {
    it('should match numbers less than threshold', () => {
      const predicate = new NumberLessThanPredicate(10);
      expect(predicate.test(9)).toBe(true);
      expect(predicate.test(0)).toBe(true);
      expect(predicate.test(10)).toBe(false);
      expect(predicate.test(11)).toBe(false);
    });
  });

  describe('NumberLessThanOrEqualPredicate', () => {
    it('should match numbers <= threshold', () => {
      const predicate = new NumberLessThanOrEqualPredicate(10);
      expect(predicate.test(9)).toBe(true);
      expect(predicate.test(10)).toBe(true);
      expect(predicate.test(11)).toBe(false);
    });
  });

  describe('NumberBetweenPredicate', () => {
    it('should match numbers in range (inclusive)', () => {
      const predicate = new NumberBetweenPredicate({ min: 10, max: 20 });
      expect(predicate.test(10)).toBe(true);
      expect(predicate.test(15)).toBe(true);
      expect(predicate.test(20)).toBe(true);
      expect(predicate.test(9)).toBe(false);
      expect(predicate.test(21)).toBe(false);
    });

    it('should handle numeric strings', () => {
      const predicate = new NumberBetweenPredicate({ min: 10, max: 20 });
      expect(predicate.test('15')).toBe(true);
      expect(predicate.test('5')).toBe(false);
    });
  });

  describe('NumberEqualsPredicate', () => {
    it('should match exact number', () => {
      const predicate = new NumberEqualsPredicate(42);
      expect(predicate.test(42)).toBe(true);
      expect(predicate.test('42')).toBe(true);
      expect(predicate.test(42.0)).toBe(true);
      expect(predicate.test(43)).toBe(false);
    });

    it('should handle booleans as numbers', () => {
      const predicate = new NumberEqualsPredicate(1);
      expect(predicate.test(true)).toBe(true);
      const predicate2 = new NumberEqualsPredicate(0);
      expect(predicate2.test(false)).toBe(true);
    });
  });
});

// ===========================================================================
// Date Predicates
// ===========================================================================

describe('FilterPredicate - Date Predicates', () => {
  const date1 = new Date('2024-01-15');
  const date2 = new Date('2024-02-15');
  const date3 = new Date('2024-03-15');

  describe('DateBeforePredicate', () => {
    it('should match dates before threshold', () => {
      const predicate = new DateBeforePredicate(date2);
      expect(predicate.test(date1)).toBe(true);
      expect(predicate.test(date2)).toBe(false);
      expect(predicate.test(date3)).toBe(false);
    });

    it('should handle date strings', () => {
      const predicate = new DateBeforePredicate(date2);
      expect(predicate.test('2024-01-01')).toBe(true);
      expect(predicate.test('2024-03-01')).toBe(false);
    });

    it('should reject invalid dates', () => {
      const predicate = new DateBeforePredicate(date2);
      expect(predicate.test('not a date')).toBe(false);
      expect(predicate.test(null)).toBe(false);
    });
  });

  describe('DateAfterPredicate', () => {
    it('should match dates after threshold', () => {
      const predicate = new DateAfterPredicate(date2);
      expect(predicate.test(date3)).toBe(true);
      expect(predicate.test(date2)).toBe(false);
      expect(predicate.test(date1)).toBe(false);
    });
  });

  describe('DateBetweenPredicate', () => {
    it('should match dates in range (inclusive)', () => {
      const predicate = new DateBetweenPredicate({ start: date1, end: date3 });
      expect(predicate.test(date1)).toBe(true);
      expect(predicate.test(date2)).toBe(true);
      expect(predicate.test(date3)).toBe(true);
      expect(predicate.test(new Date('2023-12-01'))).toBe(false);
      expect(predicate.test(new Date('2024-04-01'))).toBe(false);
    });
  });

  describe('DateEqualsPredicate', () => {
    it('should match same date (ignore time)', () => {
      const predicate = new DateEqualsPredicate(new Date('2024-02-15'));
      expect(predicate.test(new Date('2024-02-15T00:00:00'))).toBe(true);
      expect(predicate.test(new Date('2024-02-15T23:59:59'))).toBe(true);
      expect(predicate.test(new Date('2024-02-16'))).toBe(false);
      expect(predicate.test(new Date('2024-02-14'))).toBe(false);
    });

    it('should handle date strings', () => {
      const predicate = new DateEqualsPredicate(new Date('2024-02-15'));
      expect(predicate.test('2024-02-15')).toBe(true);
      expect(predicate.test('2024-02-16')).toBe(false);
    });
  });
});

// ===========================================================================
// Null Predicates
// ===========================================================================

describe('FilterPredicate - Null Predicates', () => {
  describe('IsEmptyPredicate', () => {
    it('should match empty values', () => {
      const predicate = new IsEmptyPredicate();
      expect(predicate.test(null)).toBe(true);
      expect(predicate.test(undefined)).toBe(true);
      expect(predicate.test('')).toBe(true);
      expect(predicate.test('   ')).toBe(true); // Whitespace only
    });

    it('should not match non-empty values', () => {
      const predicate = new IsEmptyPredicate();
      expect(predicate.test('text')).toBe(false);
      expect(predicate.test(0)).toBe(false);
      expect(predicate.test(false)).toBe(false);
    });

    it('should handle FormattedText', () => {
      const predicate = new IsEmptyPredicate();
      const emptyFT: FormattedText = {
        _type: 'FormattedText',
        text: '   ',
        runs: [],
      };
      const nonEmptyFT: FormattedText = {
        _type: 'FormattedText',
        text: 'text',
        runs: [],
      };
      expect(predicate.test(emptyFT)).toBe(true);
      expect(predicate.test(nonEmptyFT)).toBe(false);
    });
  });

  describe('IsNotEmptyPredicate', () => {
    it('should match non-empty values', () => {
      const predicate = new IsNotEmptyPredicate();
      expect(predicate.test('text')).toBe(true);
      expect(predicate.test(0)).toBe(true);
      expect(predicate.test(false)).toBe(true);
    });

    it('should not match empty values', () => {
      const predicate = new IsNotEmptyPredicate();
      expect(predicate.test(null)).toBe(false);
      expect(predicate.test(undefined)).toBe(false);
      expect(predicate.test('')).toBe(false);
      expect(predicate.test('   ')).toBe(false);
    });
  });
});

// ===========================================================================
// Composite Predicates
// ===========================================================================

describe('FilterPredicate - Composite Predicates', () => {
  describe('AndPredicate', () => {
    it('should match when all predicates match', () => {
      const predicate = new AndPredicate([
        new NumberGreaterThanPredicate(10),
        new NumberLessThanPredicate(20),
      ]);
      expect(predicate.test(15)).toBe(true);
      expect(predicate.test(5)).toBe(false); // Fails first predicate
      expect(predicate.test(25)).toBe(false); // Fails second predicate
    });

    it('should handle text and number predicates together', () => {
      const predicate = new AndPredicate([
        new TextContainsPredicate('test'),
        new IsNotEmptyPredicate(),
      ]);
      expect(predicate.test('this is a test')).toBe(true);
      expect(predicate.test('no match')).toBe(false);
      expect(predicate.test('')).toBe(false);
    });

    it('should throw on empty predicate list', () => {
      expect(() => new AndPredicate([])).toThrow();
    });

    it('should short-circuit on first failure', () => {
      let secondCalled = false;
      const first = new NumberGreaterThanPredicate(10);
      const second = new class extends NumberLessThanPredicate {
        test(value: any): boolean {
          secondCalled = true;
          return super.test(value);
        }
      }(20);

      const predicate = new AndPredicate([first, second]);
      predicate.test(5); // Fails first, should not call second
      expect(secondCalled).toBe(false);
    });
  });

  describe('OrPredicate', () => {
    it('should match when any predicate matches', () => {
      const predicate = new OrPredicate([
        new TextContainsPredicate('hello'),
        new TextContainsPredicate('world'),
      ]);
      expect(predicate.test('hello there')).toBe(true);
      expect(predicate.test('world peace')).toBe(true);
      expect(predicate.test('goodbye')).toBe(false);
    });

    it('should handle mixed predicate types', () => {
      const predicate = new OrPredicate([
        new IsEmptyPredicate(),
        new NumberEqualsPredicate(0),
      ]);
      expect(predicate.test(null)).toBe(true);
      expect(predicate.test(0)).toBe(true);
      expect(predicate.test(5)).toBe(false);
    });

    it('should throw on empty predicate list', () => {
      expect(() => new OrPredicate([])).toThrow();
    });

    it('should short-circuit on first success', () => {
      let secondCalled = false;
      const first = new TextEqualsPredicate('match');
      const second = new class extends TextEqualsPredicate {
        test(value: any): boolean {
          secondCalled = true;
          return super.test(value);
        }
      }('other');

      const predicate = new OrPredicate([first, second]);
      predicate.test('match'); // Passes first, should not call second
      expect(secondCalled).toBe(false);
    });
  });

  describe('Nested Composite Predicates', () => {
    it('should handle nested AND/OR', () => {
      // (value > 10 AND value < 20) OR value === 100
      const predicate = new OrPredicate([
        new AndPredicate([
          new NumberGreaterThanPredicate(10),
          new NumberLessThanPredicate(20),
        ]),
        new NumberEqualsPredicate(100),
      ]);

      expect(predicate.test(15)).toBe(true); // Matches first AND
      expect(predicate.test(100)).toBe(true); // Matches second condition
      expect(predicate.test(5)).toBe(false); // Matches neither
      expect(predicate.test(25)).toBe(false); // Matches neither
    });
  });
});

// ===========================================================================
// Serialization
// ===========================================================================

describe('FilterPredicate - Serialization', () => {
  it('should serialize and deserialize text predicates', () => {
    const original = new TextContainsPredicate('test', { caseSensitive: true });
    const serialized = original.serialize();
    const deserialized = deserializePredicate(serialized);

    expect(deserialized.type).toBe('text.contains');
    expect(deserialized.test('this is a test')).toBe(true);
    expect(deserialized.test('this is a TEST')).toBe(false); // Case-sensitive
  });

  it('should serialize and deserialize number predicates', () => {
    const original = new NumberBetweenPredicate({ min: 10, max: 20 });
    const serialized = original.serialize();
    const deserialized = deserializePredicate(serialized);

    expect(deserialized.type).toBe('number.between');
    expect(deserialized.test(15)).toBe(true);
    expect(deserialized.test(5)).toBe(false);
  });

  it('should serialize and deserialize date predicates', () => {
    const date = new Date('2024-02-15');
    const original = new DateBeforePredicate(date);
    const serialized = original.serialize();
    const deserialized = deserializePredicate(serialized);

    expect(deserialized.type).toBe('date.before');
    expect(deserialized.test(new Date('2024-01-01'))).toBe(true);
    expect(deserialized.test(new Date('2024-03-01'))).toBe(false);
  });

  it('should serialize and deserialize composite predicates', () => {
    const original = new AndPredicate([
      new NumberGreaterThanPredicate(10),
      new NumberLessThanPredicate(20),
    ]);
    const serialized = original.serialize();
    const deserialized = deserializePredicate(serialized);

    expect(deserialized.type).toBe('composite.and');
    expect(deserialized.test(15)).toBe(true);
    expect(deserialized.test(5)).toBe(false);
  });

  it('should serialize and deserialize nested composites', () => {
    const original = new OrPredicate([
      new AndPredicate([
        new NumberGreaterThanPredicate(10),
        new NumberLessThanPredicate(20),
      ]),
      new NumberEqualsPredicate(100),
    ]);
    const serialized = original.serialize();
    const deserialized = deserializePredicate(serialized);

    expect(deserialized.type).toBe('composite.or');
    expect(deserialized.test(15)).toBe(true);
    expect(deserialized.test(100)).toBe(true);
    expect(deserialized.test(50)).toBe(false);
  });

  it('should preserve all predicate types through serialization', () => {
    const predicates = [
      new TextBeginsWithPredicate('start'),
      new TextEndsWithPredicate('end'),
      new TextEqualsPredicate('exact'),
      new TextNotEqualsPredicate('not'),
      new NumberGreaterThanOrEqualPredicate(5),
      new NumberLessThanOrEqualPredicate(15),
      new DateAfterPredicate(new Date('2024-01-01')),
      new DateBetweenPredicate({
        start: new Date('2024-01-01'),
        end: new Date('2024-12-31'),
      }),
      new IsEmptyPredicate(),
      new IsNotEmptyPredicate(),
    ];

    for (const predicate of predicates) {
      const serialized = predicate.serialize();
      const deserialized = deserializePredicate(serialized);
      expect(deserialized.type).toBe(predicate.type);
      expect(deserialized.description).toBeTruthy();
    }
  });
});

// ===========================================================================
// Edge Cases
// ===========================================================================

describe('FilterPredicate - Edge Cases', () => {
  it('should handle very long strings', () => {
    const longString = 'a'.repeat(10000);
    const predicate = new TextContainsPredicate('aaa');
    expect(predicate.test(longString)).toBe(true);
  });

  it('should handle special characters', () => {
    const predicate = new TextContainsPredicate('$test@');
    expect(predicate.test('value $test@ here')).toBe(true);
  });

  it('should handle unicode characters', () => {
    const predicate = new TextContainsPredicate('测试');
    expect(predicate.test('这是一个测试')).toBe(true);
  });

  it('should handle negative numbers', () => {
    const predicate = new NumberGreaterThanPredicate(-10);
    expect(predicate.test(-5)).toBe(true);
    expect(predicate.test(-15)).toBe(false);
  });

  it('should handle floating point numbers', () => {
    const predicate = new NumberBetweenPredicate({ min: 0.1, max: 0.9 });
    expect(predicate.test(0.5)).toBe(true);
    expect(predicate.test(1.5)).toBe(false);
  });

  it('should handle very large numbers', () => {
    const predicate = new NumberGreaterThanPredicate(1e10);
    expect(predicate.test(1e11)).toBe(true);
    expect(predicate.test(1e9)).toBe(false);
  });

  it('should handle scientific notation', () => {
    const predicate = new NumberEqualsPredicate(1e5);
    expect(predicate.test(100000)).toBe(true);
    expect(predicate.test('1e5')).toBe(true);
  });

  it('should handle dates at boundaries', () => {
    const predicate = new DateBetweenPredicate({
      start: new Date('2024-01-01T00:00:00'),
      end: new Date('2024-12-31T23:59:59'),
    });
    expect(predicate.test(new Date('2024-01-01T00:00:00'))).toBe(true);
    expect(predicate.test(new Date('2024-12-31T23:59:59'))).toBe(true);
  });
});
