/**
 * VectorSheet Engine - Rich Text Operations Tests
 * Comprehensive unit tests for character-level formatting
 */

import { describe, it, expect } from 'vitest';
import type { FormattedText, CharacterFormat } from './index.js';
import {
  createFormattedText,
  stringToFormattedText,
  formattedTextToString,
  insertText,
  deleteText,
  applyFormat,
  optimizeRuns,
  getFormatAtPosition,
  formatsEqual,
  mergeFormats,
  validateFormattedText,
  repairFormattedText,
  ensureFormattedText,
  hasCharacterFormatting,
  getTextLength,
  substring,
  shouldStoreAsFormattedText,
  optimizeToValue,
} from './richtext.js';

// ============================================================================
// Helper Functions
// ============================================================================

const boldFormat: CharacterFormat = { bold: true };
const italicFormat: CharacterFormat = { italic: true };
const redFormat: CharacterFormat = { fontColor: '#FF0000' };
const boldItalicFormat: CharacterFormat = { bold: true, italic: true };

// ============================================================================
// Utility Functions Tests
// ============================================================================

describe('formatsEqual', () => {
  it('should return true for identical formats', () => {
    expect(formatsEqual(boldFormat, { bold: true })).toBe(true);
  });

  it('should return true for both undefined', () => {
    expect(formatsEqual(undefined, undefined)).toBe(true);
  });

  it('should return false for different formats', () => {
    expect(formatsEqual(boldFormat, italicFormat)).toBe(false);
  });

  it('should return false for undefined vs defined', () => {
    expect(formatsEqual(undefined, boldFormat)).toBe(false);
  });
});

describe('mergeFormats', () => {
  it('should merge formats with override', () => {
    const result = mergeFormats(boldFormat, { italic: true });
    expect(result).toEqual({ bold: true, italic: true });
  });

  it('should override existing properties', () => {
    const result = mergeFormats(boldFormat, { bold: false });
    expect(result.bold).toBe(false);
  });

  it('should handle undefined base', () => {
    const result = mergeFormats(undefined, boldFormat);
    expect(result).toEqual(boldFormat);
  });
});

describe('createFormattedText', () => {
  it('should create FormattedText with optimized runs', () => {
    const ft = createFormattedText('Hello', [
      { start: 0, end: 3, format: boldFormat },
      { start: 3, end: 5, format: boldFormat }, // Adjacent, same format
    ]);

    expect(ft.text).toBe('Hello');
    expect(ft.runs).toHaveLength(1); // Should be merged
    expect(ft.runs[0]).toEqual({ start: 0, end: 5, format: boldFormat });
  });
});

describe('stringToFormattedText', () => {
  it('should convert plain string to FormattedText', () => {
    const ft = stringToFormattedText('Test');
    expect(ft._type).toBe('FormattedText');
    expect(ft.text).toBe('Test');
    expect(ft.runs).toHaveLength(1);
    expect(ft.runs[0]).toEqual({ start: 0, end: 4 });
  });

  it('should handle empty string', () => {
    const ft = stringToFormattedText('');
    expect(ft.text).toBe('');
    expect(ft.runs).toHaveLength(0);
  });
});

describe('formattedTextToString', () => {
  it('should extract plain text', () => {
    const ft = createFormattedText('Hello', [
      { start: 0, end: 5, format: boldFormat },
    ]);
    expect(formattedTextToString(ft)).toBe('Hello');
  });
});

describe('getFormatAtPosition', () => {
  it('should return format at position', () => {
    const ft = createFormattedText('Hello', [
      { start: 0, end: 3, format: boldFormat },
      { start: 3, end: 5, format: italicFormat },
    ]);

    expect(getFormatAtPosition(ft, 0)).toEqual(boldFormat);
    expect(getFormatAtPosition(ft, 2)).toEqual(boldFormat);
    expect(getFormatAtPosition(ft, 3)).toEqual(italicFormat);
    expect(getFormatAtPosition(ft, 4)).toEqual(italicFormat);
  });

  it('should return undefined for position outside runs', () => {
    const ft = createFormattedText('Hello', []);
    expect(getFormatAtPosition(ft, 0)).toBeUndefined();
  });
});

// ============================================================================
// insertText Tests
// ============================================================================

describe('insertText', () => {
  it('should insert text at start', () => {
    const ft = stringToFormattedText('World');
    const result = insertText(ft, 0, 'Hello ');

    expect(result.text).toBe('Hello World');
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toEqual({ start: 0, end: 11 });
  });

  it('should insert text at end', () => {
    const ft = stringToFormattedText('Hello');
    const result = insertText(ft, 5, ' World');

    expect(result.text).toBe('Hello World');
  });

  it('should insert text in middle', () => {
    const ft = stringToFormattedText('HeoWorld');
    const result = insertText(ft, 2, 'll');

    expect(result.text).toBe('HelloWorld');
  });

  it('should inherit format from previous character', () => {
    const ft = createFormattedText('Hello', [
      { start: 0, end: 5, format: boldFormat },
    ]);
    const result = insertText(ft, 5, ' World');

    expect(result.text).toBe('Hello World');
    // New text should inherit bold
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].format).toEqual(boldFormat);
  });

  it('should split runs when inserting within a run', () => {
    const ft = createFormattedText('HelloWorld', [
      { start: 0, end: 10, format: boldFormat },
    ]);
    const result = insertText(ft, 5, ' ');

    expect(result.text).toBe('Hello World');
    // Should be a single run (merged)
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toEqual({ start: 0, end: 11, format: boldFormat });
  });

  it('should handle insertion between different formats', () => {
    const ft = createFormattedText('HelloWorld', [
      { start: 0, end: 5, format: boldFormat },
      { start: 5, end: 10, format: italicFormat },
    ]);
    const result = insertText(ft, 5, ' ');

    expect(result.text).toBe('Hello World');
    // Should inherit from previous (bold)
    expect(result.runs).toHaveLength(2);
    expect(result.runs[0].format).toEqual(boldFormat);
    expect(result.runs[1].format).toEqual(italicFormat);
  });

  it('should handle empty text insertion', () => {
    const ft = stringToFormattedText('Hello');
    const result = insertText(ft, 2, '');

    expect(result).toEqual(ft);
  });

  it('should clamp position to text bounds', () => {
    const ft = stringToFormattedText('Hello');
    const result = insertText(ft, 100, ' World');

    expect(result.text).toBe('Hello World');
  });

  it('should handle insertion at position 0 with no runs', () => {
    const ft = createFormattedText('Hello', []);
    const result = insertText(ft, 0, 'Hi ');

    expect(result.text).toBe('Hi Hello');
  });

  it('should handle multiple format runs', () => {
    const ft = createFormattedText('ABCDEF', [
      { start: 0, end: 2, format: boldFormat },
      { start: 2, end: 4, format: italicFormat },
      { start: 4, end: 6, format: redFormat },
    ]);
    const result = insertText(ft, 3, 'X');

    expect(result.text).toBe('ABCXDEF');
    expect(result.runs).toHaveLength(3);
  });

  it('should handle emoji insertion', () => {
    const ft = stringToFormattedText('Hello');
    const result = insertText(ft, 5, ' 😊');

    expect(result.text).toBe('Hello 😊');
  });

  it('should handle Unicode insertion', () => {
    const ft = stringToFormattedText('Hello');
    const result = insertText(ft, 5, ' 你好');

    expect(result.text).toBe('Hello 你好');
  });

  it('should preserve format when inserting at run boundary', () => {
    const ft = createFormattedText('AB', [
      { start: 0, end: 1, format: boldFormat },
      { start: 1, end: 2, format: italicFormat },
    ]);
    const result = insertText(ft, 1, 'X');

    expect(result.text).toBe('AXB');
    // X should inherit from previous (bold)
    expect(result.runs[0].format).toEqual(boldFormat);
  });
});

// ============================================================================
// deleteText Tests
// ============================================================================

describe('deleteText', () => {
  it('should delete text from start', () => {
    const ft = stringToFormattedText('Hello World');
    const result = deleteText(ft, 0, 6);

    expect(result.text).toBe('World');
  });

  it('should delete text from end', () => {
    const ft = stringToFormattedText('Hello World');
    const result = deleteText(ft, 5, 11);

    expect(result.text).toBe('Hello');
  });

  it('should delete text from middle', () => {
    const ft = stringToFormattedText('Hello World');
    const result = deleteText(ft, 5, 6);

    expect(result.text).toBe('HelloWorld');
  });

  it('should delete entire text', () => {
    const ft = stringToFormattedText('Hello');
    const result = deleteText(ft, 0, 5);

    expect(result.text).toBe('');
    expect(result.runs).toHaveLength(0);
  });

  it('should remove runs entirely within deletion', () => {
    const ft = createFormattedText('ABCDEF', [
      { start: 0, end: 2, format: boldFormat },
      { start: 2, end: 4, format: italicFormat },
      { start: 4, end: 6, format: redFormat },
    ]);
    const result = deleteText(ft, 2, 4);

    expect(result.text).toBe('ABEF');
    expect(result.runs).toHaveLength(2);
    expect(result.runs[0].format).toEqual(boldFormat);
    expect(result.runs[1].format).toEqual(redFormat);
  });

  it('should truncate runs partially overlapping deletion', () => {
    const ft = createFormattedText('Hello', [
      { start: 0, end: 5, format: boldFormat },
    ]);
    const result = deleteText(ft, 2, 5);

    expect(result.text).toBe('He');
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toEqual({ start: 0, end: 2, format: boldFormat });
  });

  it('should shrink run containing entire deletion', () => {
    const ft = createFormattedText('Hello World', [
      { start: 0, end: 11, format: boldFormat },
    ]);
    const result = deleteText(ft, 5, 6);

    expect(result.text).toBe('HelloWorld');
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toEqual({ start: 0, end: 10, format: boldFormat });
  });

  it('should shift runs after deletion', () => {
    const ft = createFormattedText('ABCDEF', [
      { start: 0, end: 2, format: boldFormat },
      { start: 4, end: 6, format: italicFormat },
    ]);
    const result = deleteText(ft, 2, 4);

    expect(result.text).toBe('ABEF');
    expect(result.runs).toHaveLength(2);
    expect(result.runs[1]).toEqual({ start: 2, end: 4, format: italicFormat });
  });

  it('should handle zero-length deletion', () => {
    const ft = stringToFormattedText('Hello');
    const result = deleteText(ft, 2, 2);

    expect(result).toEqual(ft);
  });

  it('should clamp bounds', () => {
    const ft = stringToFormattedText('Hello');
    const result = deleteText(ft, -5, 100);

    expect(result.text).toBe('');
  });

  it('should handle deletion with emoji', () => {
    const ft = stringToFormattedText('Hello 😊 World');
    const result = deleteText(ft, 6, 8);

    expect(result.text).toBe('Hello  World');
  });
});

// ============================================================================
// applyFormat Tests
// ============================================================================

describe('applyFormat', () => {
  it('should apply format to entire text', () => {
    const ft = stringToFormattedText('Hello');
    const result = applyFormat(ft, 0, 5, boldFormat);

    expect(result.text).toBe('Hello');
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].format).toEqual(boldFormat);
  });

  it('should apply format to selection', () => {
    const ft = stringToFormattedText('Hello World');
    const result = applyFormat(ft, 6, 11, boldFormat);

    expect(result.text).toBe('Hello World');
    expect(result.runs).toHaveLength(2);
    expect(result.runs[1].format).toEqual(boldFormat);
  });

  it('should split run when applying format to middle', () => {
    const ft = stringToFormattedText('Hello');
    const result = applyFormat(ft, 2, 4, boldFormat);

    expect(result.text).toBe('Hello');
    expect(result.runs).toHaveLength(3);
    expect(result.runs[1].format).toEqual(boldFormat);
  });

  it('should merge format with existing format', () => {
    const ft = createFormattedText('Hello', [
      { start: 0, end: 5, format: boldFormat },
    ]);
    const result = applyFormat(ft, 0, 5, { italic: true });

    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].format).toEqual(boldItalicFormat);
  });

  it('should handle overlapping formats', () => {
    const ft = createFormattedText('ABCDEF', [
      { start: 0, end: 3, format: boldFormat },
      { start: 3, end: 6, format: italicFormat },
    ]);
    const result = applyFormat(ft, 2, 5, redFormat);

    expect(result.text).toBe('ABCDEF');
    expect(result.runs).toHaveLength(4);
    // Check formats are merged
    expect(result.runs[1].format).toMatchObject({ bold: true, fontColor: '#FF0000' });
    expect(result.runs[2].format).toMatchObject({ italic: true, fontColor: '#FF0000' });
  });

  it('should handle zero-length selection', () => {
    const ft = stringToFormattedText('Hello');
    const result = applyFormat(ft, 2, 2, boldFormat);

    expect(result).toEqual(ft);
  });

  it('should clamp selection bounds', () => {
    const ft = stringToFormattedText('Hello');
    const result = applyFormat(ft, -5, 100, boldFormat);

    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toEqual({ start: 0, end: 5, format: boldFormat });
  });

  it('should create runs for empty FormattedText', () => {
    const ft = createFormattedText('Hello', []);
    const result = applyFormat(ft, 1, 4, boldFormat);

    expect(result.runs).toHaveLength(3);
    expect(result.runs[1].format).toEqual(boldFormat);
  });

  it('should handle format at start boundary', () => {
    const ft = createFormattedText('ABC', [
      { start: 0, end: 3, format: italicFormat },
    ]);
    const result = applyFormat(ft, 0, 1, boldFormat);

    expect(result.runs).toHaveLength(2);
    expect(result.runs[0].format).toEqual({ ...italicFormat, ...boldFormat });
  });

  it('should handle format at end boundary', () => {
    const ft = createFormattedText('ABC', [
      { start: 0, end: 3, format: italicFormat },
    ]);
    const result = applyFormat(ft, 2, 3, boldFormat);

    expect(result.runs).toHaveLength(2);
    expect(result.runs[1].format).toEqual({ ...italicFormat, ...boldFormat });
  });

  it('should handle multiple overlapping runs', () => {
    const ft = createFormattedText('ABCDEFGH', [
      { start: 0, end: 2, format: boldFormat },
      { start: 2, end: 4, format: italicFormat },
      { start: 4, end: 6, format: redFormat },
      { start: 6, end: 8 },
    ]);
    const result = applyFormat(ft, 1, 7, { underline: 1 });

    expect(result.runs.length).toBeGreaterThan(0);
    // All runs in range should have underline
    result.runs.forEach(run => {
      if (run.start >= 1 && run.end <= 7) {
        expect(run.format?.underline).toBe(1);
      }
    });
  });

  it('should handle format override', () => {
    const ft = createFormattedText('Hello', [
      { start: 0, end: 5, format: { bold: true } },
    ]);
    const result = applyFormat(ft, 0, 5, { bold: false });

    expect(result.runs[0].format?.bold).toBe(false);
  });

  it('should optimize after applying format', () => {
    const ft = createFormattedText('ABC', [
      { start: 0, end: 1, format: boldFormat },
      { start: 1, end: 2, format: boldFormat },
      { start: 2, end: 3, format: boldFormat },
    ]);
    const result = applyFormat(ft, 0, 3, boldFormat);

    // Should merge into single run
    expect(result.runs).toHaveLength(1);
  });

  it('should handle partial run at start', () => {
    const ft = createFormattedText('ABCD', [
      { start: 0, end: 2, format: boldFormat },
      { start: 2, end: 4 },
    ]);
    const result = applyFormat(ft, 1, 3, italicFormat);

    expect(result.runs.length).toBeGreaterThanOrEqual(3);
  });

  it('should handle partial run at end', () => {
    const ft = createFormattedText('ABCD', [
      { start: 0, end: 2 },
      { start: 2, end: 4, format: boldFormat },
    ]);
    const result = applyFormat(ft, 1, 3, italicFormat);

    expect(result.runs.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// optimizeRuns Tests
// ============================================================================

describe('optimizeRuns', () => {
  it('should merge adjacent runs with same format', () => {
    const runs = [
      { start: 0, end: 2, format: boldFormat },
      { start: 2, end: 4, format: boldFormat },
      { start: 4, end: 6, format: boldFormat },
    ];
    const result = optimizeRuns(runs);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ start: 0, end: 6, format: boldFormat });
  });

  it('should not merge runs with different formats', () => {
    const runs = [
      { start: 0, end: 2, format: boldFormat },
      { start: 2, end: 4, format: italicFormat },
    ];
    const result = optimizeRuns(runs);

    expect(result).toHaveLength(2);
  });

  it('should remove empty runs', () => {
    const runs = [
      { start: 0, end: 2, format: boldFormat },
      { start: 2, end: 2, format: italicFormat }, // Empty
      { start: 2, end: 4, format: redFormat },
    ];
    const result = optimizeRuns(runs);

    expect(result).toHaveLength(2);
  });

  it('should sort runs by start position', () => {
    const runs = [
      { start: 4, end: 6, format: redFormat },
      { start: 0, end: 2, format: boldFormat },
      { start: 2, end: 4, format: italicFormat },
    ];
    const result = optimizeRuns(runs);

    expect(result[0].start).toBe(0);
    expect(result[1].start).toBe(2);
    expect(result[2].start).toBe(4);
  });

  it('should handle empty array', () => {
    const result = optimizeRuns([]);
    expect(result).toHaveLength(0);
  });

  it('should handle single run', () => {
    const runs = [{ start: 0, end: 5, format: boldFormat }];
    const result = optimizeRuns(runs);

    expect(result).toEqual(runs);
  });

  it('should handle runs with gaps', () => {
    const runs = [
      { start: 0, end: 2, format: boldFormat },
      { start: 4, end: 6, format: boldFormat }, // Gap at 2-4
    ];
    const result = optimizeRuns(runs);

    expect(result).toHaveLength(2); // Cannot merge due to gap
  });

  it('should merge runs with undefined format', () => {
    const runs = [
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ];
    const result = optimizeRuns(runs);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ start: 0, end: 4 });
  });

  it('should handle overlapping runs defensively', () => {
    const runs = [
      { start: 0, end: 4, format: boldFormat },
      { start: 2, end: 6, format: italicFormat }, // Overlaps
    ];
    const result = optimizeRuns(runs);

    // Should produce valid non-overlapping runs
    expect(result.length).toBeGreaterThan(0);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].start).toBeGreaterThanOrEqual(result[i - 1].end);
    }
  });
});

// ============================================================================
// Validation & Repair Tests
// ============================================================================

describe('validateFormattedText', () => {
  it('should validate correct FormattedText', () => {
    const ft = createFormattedText('Hello', [
      { start: 0, end: 5, format: boldFormat },
    ]);
    expect(validateFormattedText(ft)).toBe(true);
  });

  it('should reject missing _type', () => {
    const invalid = { text: 'Hello', runs: [] } as any;
    expect(validateFormattedText(invalid)).toBe(false);
  });

  it('should reject non-string text', () => {
    const invalid = { _type: 'FormattedText', text: 123, runs: [] } as any;
    expect(validateFormattedText(invalid)).toBe(false);
  });

  it('should reject out-of-bounds runs', () => {
    const invalid = {
      _type: 'FormattedText',
      text: 'Hello',
      runs: [{ start: 0, end: 10 }], // end > text.length
    } as any;
    expect(validateFormattedText(invalid)).toBe(false);
  });

  it('should reject overlapping runs', () => {
    const invalid = {
      _type: 'FormattedText',
      text: 'Hello',
      runs: [
        { start: 0, end: 3 },
        { start: 2, end: 5 }, // Overlaps
      ],
    } as any;
    expect(validateFormattedText(invalid)).toBe(false);
  });

  it('should reject empty runs', () => {
    const invalid = {
      _type: 'FormattedText',
      text: 'Hello',
      runs: [{ start: 2, end: 2 }], // Empty
    } as any;
    expect(validateFormattedText(invalid)).toBe(false);
  });
});

describe('repairFormattedText', () => {
  it('should clamp out-of-bounds runs', () => {
    const invalid = {
      _type: 'FormattedText',
      text: 'Hello',
      runs: [{ start: 0, end: 10 }], // end > text.length
    } as FormattedText;

    const repaired = repairFormattedText(invalid);
    expect(repaired.runs[0].end).toBe(5);
  });

  it('should remove empty runs', () => {
    const invalid = {
      _type: 'FormattedText',
      text: 'Hello',
      runs: [
        { start: 0, end: 2 },
        { start: 2, end: 2 }, // Empty
        { start: 2, end: 5 },
      ],
    } as FormattedText;

    const repaired = repairFormattedText(invalid);
    // Adjacent runs with same format (undefined) get merged by optimizeRuns
    expect(repaired.runs).toHaveLength(1);
    expect(repaired.runs[0]).toEqual({ start: 0, end: 5 });
  });

  it('should handle null text', () => {
    const invalid = { _type: 'FormattedText', text: null, runs: [] } as any;
    const repaired = repairFormattedText(invalid);

    expect(repaired.text).toBe('');
    expect(repaired.runs).toHaveLength(0);
  });

  it('should optimize repaired runs', () => {
    const invalid = {
      _type: 'FormattedText',
      text: 'Hello',
      runs: [
        { start: 0, end: 2, format: boldFormat },
        { start: 2, end: 5, format: boldFormat },
      ],
    } as FormattedText;

    const repaired = repairFormattedText(invalid);
    expect(repaired.runs).toHaveLength(1); // Merged
  });
});

// ============================================================================
// Conversion Helper Tests
// ============================================================================

describe('ensureFormattedText', () => {
  it('should pass through FormattedText', () => {
    const ft = stringToFormattedText('Hello');
    expect(ensureFormattedText(ft)).toEqual(ft);
  });

  it('should convert string', () => {
    const result = ensureFormattedText('Hello');
    expect(result._type).toBe('FormattedText');
    expect(result.text).toBe('Hello');
  });

  it('should convert number', () => {
    const result = ensureFormattedText(123);
    expect(result.text).toBe('123');
  });

  it('should convert boolean', () => {
    const result = ensureFormattedText(true);
    expect(result.text).toBe('true');
  });

  it('should convert null', () => {
    const result = ensureFormattedText(null);
    expect(result.text).toBe('');
  });
});

describe('hasCharacterFormatting', () => {
  it('should return false for single format', () => {
    const ft = createFormattedText('Hello', [
      { start: 0, end: 5, format: boldFormat },
    ]);
    expect(hasCharacterFormatting(ft)).toBe(false);
  });

  it('should return true for multiple formats', () => {
    const ft = createFormattedText('Hello', [
      { start: 0, end: 3, format: boldFormat },
      { start: 3, end: 5, format: italicFormat },
    ]);
    expect(hasCharacterFormatting(ft)).toBe(true);
  });

  it('should return false for no runs', () => {
    const ft = createFormattedText('Hello', []);
    expect(hasCharacterFormatting(ft)).toBe(false);
  });
});

describe('getTextLength', () => {
  it('should return text length', () => {
    const ft = stringToFormattedText('Hello');
    expect(getTextLength(ft)).toBe(5);
  });

  it('should handle emoji correctly', () => {
    const ft = stringToFormattedText('😊');
    expect(getTextLength(ft)).toBe(2); // Emoji is 2 code units
  });
});

describe('substring', () => {
  it('should extract substring with format', () => {
    const ft = createFormattedText('Hello World', [
      { start: 0, end: 5, format: boldFormat },
      { start: 6, end: 11, format: italicFormat },
    ]);
    const result = substring(ft, 6, 11);

    expect(result.text).toBe('World');
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toEqual({ start: 0, end: 5, format: italicFormat });
  });

  it('should handle substring spanning multiple formats', () => {
    const ft = createFormattedText('ABCDEF', [
      { start: 0, end: 2, format: boldFormat },
      { start: 2, end: 4, format: italicFormat },
      { start: 4, end: 6, format: redFormat },
    ]);
    const result = substring(ft, 1, 5);

    expect(result.text).toBe('BCDE');
    expect(result.runs).toHaveLength(3);
  });

  it('should clamp bounds', () => {
    const ft = stringToFormattedText('Hello');
    const result = substring(ft, -5, 100);

    expect(result.text).toBe('Hello');
  });

  it('should handle default end parameter', () => {
    const ft = stringToFormattedText('Hello');
    const result = substring(ft, 2);

    expect(result.text).toBe('llo');
  });
});

// ============================================================================
// Edge Cases & Stress Tests
// ============================================================================

describe('Edge Cases', () => {
  it('should handle very long text', () => {
    const longText = 'A'.repeat(10000);
    const ft = stringToFormattedText(longText);
    const result = applyFormat(ft, 1000, 2000, boldFormat);

    expect(result.text.length).toBe(10000);
    expect(result.runs.length).toBeGreaterThan(0);
  });

  it('should handle many format runs', () => {
    const runs = [];
    for (let i = 0; i < 1000; i += 2) {
      runs.push({ start: i, end: i + 1, format: boldFormat });
    }

    const ft = createFormattedText('A'.repeat(1000), runs);
    expect(ft.runs.length).toBeLessThanOrEqual(runs.length);
  });

  it('should handle RTL text', () => {
    const rtlText = 'مرحبا';
    const ft = stringToFormattedText(rtlText);
    const result = applyFormat(ft, 0, 5, boldFormat);

    expect(result.text).toBe(rtlText);
  });

  it('should handle mixed LTR/RTL', () => {
    const mixedText = 'Hello مرحبا World';
    const ft = stringToFormattedText(mixedText);
    const result = insertText(ft, 5, ' ');

    expect(result.text).toContain('مرحبا');
  });

  it('should handle emoji sequences', () => {
    const emojiText = '👨‍👩‍👧‍👦'; // Family emoji (multiple code points)
    const ft = stringToFormattedText(emojiText);

    expect(ft.text).toBe(emojiText);
  });

  it('should handle zero-width characters', () => {
    const text = 'A\u200BB'; // Zero-width space
    const ft = stringToFormattedText(text);

    expect(ft.text.length).toBe(3);
  });
});

// ============================================================================
// Excel Compatibility Tests
// ============================================================================

describe('Excel Compatibility', () => {
  it('should inherit format from AFTER cursor when inserting at position 0', () => {
    const ft = createFormattedText('World', [
      { start: 0, end: 5, format: boldFormat },
    ]);
    const result = insertText(ft, 0, 'Hello ');

    expect(result.text).toBe('Hello World');
    // "Hello " should inherit bold from "World"
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].format).toEqual(boldFormat);
  });

  it('should handle empty text format inheritance', () => {
    const ft = createFormattedText('', [
      { start: 0, end: 0, format: boldFormat },
    ]);
    const result = insertText(ft, 0, 'Test');

    expect(result.text).toBe('Test');
  });

  it('should optimize memory by detecting uniform formatting', () => {
    const ft1 = createFormattedText('Hello', [
      { start: 0, end: 5 }, // No format
    ]);
    expect(shouldStoreAsFormattedText(ft1)).toBe(false);

    const ft2 = createFormattedText('Hello', [
      { start: 0, end: 5, format: boldFormat },
    ]);
    expect(shouldStoreAsFormattedText(ft2)).toBe(true);
  });

  it('should optimize to plain string when appropriate', () => {
    const ft = createFormattedText('Plain text', [
      { start: 0, end: 10 }, // No formatting
    ]);
    const optimized = optimizeToValue(ft);
    expect(typeof optimized).toBe('string');
    expect(optimized).toBe('Plain text');
  });

  it('should preserve FormattedText when has character formatting', () => {
    const ft = createFormattedText('Bold text', [
      { start: 0, end: 4, format: boldFormat },
      { start: 4, end: 9 },
    ]);
    const optimized = optimizeToValue(ft);
    expect(typeof optimized).toBe('object');
    expect((optimized as FormattedText)._type).toBe('FormattedText');
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration Scenarios', () => {
  it('should handle complex editing sequence', () => {
    // Start with plain text
    let ft = stringToFormattedText('');

    // Type "Hello"
    ft = insertText(ft, 0, 'Hello');
    expect(ft.text).toBe('Hello');

    // Apply bold to all
    ft = applyFormat(ft, 0, 5, boldFormat);

    // Type " World" at end
    ft = insertText(ft, 5, ' World');
    expect(ft.text).toBe('Hello World');

    // Apply italic to "World"
    ft = applyFormat(ft, 6, 11, italicFormat);

    // Should have 2 runs: "Hello " (bold), "World" (bold+italic)
    expect(ft.runs.length).toBeGreaterThan(0);
  });

  it('should handle Excel-style formatting workflow', () => {
    // Type text
    let ft = stringToFormattedText('Good morning');

    // Select "morning" and make it bold
    ft = applyFormat(ft, 5, 12, boldFormat);

    // Should match Excel behavior
    expect(ft.runs).toHaveLength(2);
    expect(ft.runs[1].format).toEqual(boldFormat);
  });

  it('should handle undo/redo simulation', () => {
    const original = stringToFormattedText('Hello');
    const modified = applyFormat(original, 0, 5, boldFormat);
    const undone = original;
    const redone = modified;

    expect(undone.text).toBe('Hello');
    expect(redone.runs[0].format).toEqual(boldFormat);
  });
});
