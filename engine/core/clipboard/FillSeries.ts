/**
 * VectorSheet Engine - Fill Series (Production Grade)
 *
 * Pure pattern inference engine for Excel-like auto-fill operations.
 * NO data store mutation. NO UI dependencies. Pure computation.
 *
 * Features:
 * - Linear numeric sequences (1, 2 → 3, 4, 5)
 * - Growth/geometric sequences (2, 4 → 8, 16, 32)
 * - Date sequences (with configurable units)
 * - Weekday sequences (Mon → Tue → Wed)
 * - Month sequences (Jan → Feb → Mar)
 * - Custom list sequences (Q1 → Q2 → Q3 → Q4)
 * - Text with number (Item1 → Item2 → Item3)
 * - Repeated values (copy pattern)
 * - Formula propagation (with reference adjustment)
 *
 * API:
 * - analyze(sourceCells): Detect pattern from source data
 * - generate(pattern, length, direction): Generate fill values
 *
 * Design:
 * - Deterministic: Same input always produces same output
 * - Extensible: Custom series via addCustomList()
 * - Excel-like: Matches Excel behavior for common patterns
 * - No side effects: Returns new data, never mutates
 */

import { Cell, valueToPlainValue, isFormattedText, type FormattedText } from '../types/index.js';

// =============================================================================
// Types
// =============================================================================

export type FillDirection = 'down' | 'up' | 'right' | 'left';

export type SeriesType =
  | 'copy'           // Just copy the values (repeat pattern)
  | 'linear'         // Linear progression (1, 2, 3)
  | 'growth'         // Growth/geometric (2, 4, 8)
  | 'date'           // Date progression
  | 'autoFill';      // Auto-detect pattern

export type DateUnit = 'day' | 'weekday' | 'month' | 'year';

export interface FillOptions {
  /** Series type (autoFill to auto-detect) */
  type: SeriesType;
  /** Step value for linear/growth series */
  step?: number;
  /** Date unit for date series */
  dateUnit?: DateUnit;
  /** Stop value for bounded series */
  stopValue?: number;
  /** Whether to adjust formula references */
  adjustFormulas?: boolean;
}

/**
 * Detected pattern from source cells.
 * This is the primary output of analyze().
 */
export interface DetectedPattern {
  /** Pattern type */
  type: PatternType;

  /** Source values (for repeat patterns) */
  sourceValues: SourceValue[];

  /** Step value for numeric progressions */
  step: number;

  /** Whether this is a linear sequence */
  isLinear: boolean;

  /** Whether this is a growth/geometric sequence */
  isGrowth: boolean;

  /** Growth ratio (for geometric sequences) */
  growthRatio: number;

  /** Custom list reference (for day/month/custom lists) */
  customList: string[] | null;

  /** Starting index in custom list */
  customListStartIndex: number;

  /** For text-with-number patterns */
  textPattern: TextNumberPattern | null;

  /** Whether source contains formulas */
  hasFormulas: boolean;

  /** Number of source cells (pattern repeat length) */
  sourceLength: number;

  /** Confidence score (0-1) for pattern detection */
  confidence: number;
}

export type PatternType =
  | 'number'          // Pure numeric sequence
  | 'date'            // Date sequence
  | 'text'            // Pure text (copy)
  | 'textWithNumber'  // Text with incrementing number
  | 'dayName'         // Day of week names
  | 'monthName'       // Month names
  | 'custom'          // Custom list match
  | 'formula'         // Formula propagation
  | 'mixed'           // Mixed types (copy)
  | 'copy';           // No pattern (repeat)

/**
 * Source value with metadata.
 */
export interface SourceValue {
  /** Raw cell value (plain text if FormattedText) */
  value: string | number | boolean | null;
  /** Cell type */
  type: Cell['type'];
  /** Formula (if present) */
  formula?: string;
  /** Original cell format */
  format?: Cell['format'];
  /** Original FormattedText value (if cell had rich text) */
  richTextValue?: import('../types/index.js').FormattedText;
  /** Position in source (0-indexed) */
  index: number;
}

/**
 * Text with number pattern info.
 */
export interface TextNumberPattern {
  /** Text prefix before number */
  prefix: string;
  /** Text suffix after number */
  suffix: string;
  /** Starting number */
  startNumber: number;
  /** Number step */
  step: number;
  /** Minimum digit width (for padding) */
  minDigits: number;
}

/**
 * Result of generate() - fill values ready to apply.
 */
export interface FillResult {
  /** Generated values in order */
  values: GeneratedValue[];
  /** Pattern used for generation */
  pattern: DetectedPattern;
  /** Direction of fill */
  direction: FillDirection;
  /** Number of values generated */
  count: number;
}

/**
 * A single generated value.
 */
export interface GeneratedValue {
  /** The cell value */
  value: string | number | boolean | null;
  /** Cell type */
  type: Cell['type'];
  /** Adjusted formula (if applicable) */
  formula?: string;
  /** Format to apply (copied from source) */
  format?: Cell['format'];
  /** FormattedText value (if source had rich text, deep cloned) */
  richTextValue?: import('../types/index.js').FormattedText;
  /** Index in fill sequence (0-indexed) */
  index: number;
  /** Source value index this was derived from */
  sourceIndex: number;
  /** Row offset from fill origin (for formula adjustment) */
  rowOffset: number;
  /** Column offset from fill origin (for formula adjustment) */
  colOffset: number;
}

// =============================================================================
// Constants - Built-in Lists
// =============================================================================

/** Day names for auto-fill (full and abbreviated). */
const DAY_NAMES: readonly string[][] = [
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
];

/** Month names for auto-fill (full and abbreviated). */
const MONTH_NAMES: readonly string[][] = [
  ['January', 'February', 'March', 'April', 'May', 'June',
   'July', 'August', 'September', 'October', 'November', 'December'],
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
];

/** Quarter names. */
const QUARTER_NAMES: readonly string[][] = [
  ['Q1', 'Q2', 'Q3', 'Q4'],
  ['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4'],
  ['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'],
];

// =============================================================================
// FillSeries - Pure Pattern Engine
// =============================================================================

export class FillSeries {
  private customLists: string[][] = [];

  constructor() {
    // Initialize with default custom lists
    this.customLists = [
      ...DAY_NAMES.map(list => [...list]),
      ...MONTH_NAMES.map(list => [...list]),
      ...QUARTER_NAMES.map(list => [...list]),
    ];
  }

  // ===========================================================================
  // FormattedText Support
  // ===========================================================================

  /**
   * Deep clone FormattedText to prevent mutation bugs during fill operations.
   * Creates a new object with cloned runs array and format objects.
   */
  private deepCloneFormattedText(ft: FormattedText): FormattedText {
    return {
      _type: 'FormattedText',
      text: ft.text,
      runs: ft.runs.map(run => ({
        start: run.start,
        end: run.end,
        format: run.format ? { ...run.format } : undefined,
      })),
    };
  }

  // ===========================================================================
  // Custom Lists Management
  // ===========================================================================

  /**
   * Add a custom list for pattern detection.
   * Lists are checked in order, so add most specific lists first.
   *
   * @param list - Array of strings forming a sequence
   */
  addCustomList(list: string[]): void {
    if (list.length >= 2) {
      this.customLists.push([...list]);
    }
  }

  /**
   * Remove a custom list.
   *
   * @param list - The list to remove
   * @returns Whether the list was found and removed
   */
  removeCustomList(list: string[]): boolean {
    const index = this.customLists.findIndex(
      l => l.length === list.length && l.every((v, i) => v === list[i])
    );
    if (index !== -1) {
      this.customLists.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all registered custom lists.
   */
  getCustomLists(): readonly string[][] {
    return this.customLists.map(list => [...list]);
  }

  /**
   * Clear all custom lists (keeps built-in lists).
   */
  resetCustomLists(): void {
    this.customLists = [
      ...DAY_NAMES.map(list => [...list]),
      ...MONTH_NAMES.map(list => [...list]),
      ...QUARTER_NAMES.map(list => [...list]),
    ];
  }

  // ===========================================================================
  // Primary API: analyze()
  // ===========================================================================

  /**
   * Analyze source cells to detect a fill pattern.
   *
   * This is the primary entry point for pattern detection.
   * Pass an array of cells (from a row or column) and get back
   * a DetectedPattern describing the sequence.
   *
   * @param sourceCells - Array of source cells to analyze
   * @returns DetectedPattern with full pattern information
   *
   * @example
   * ```typescript
   * const fillSeries = new FillSeries();
   *
   * // Numeric sequence
   * const cells = [{ value: 1, type: 'number' }, { value: 2, type: 'number' }];
   * const pattern = fillSeries.analyze(cells);
   * // pattern.type === 'number', pattern.step === 1, pattern.isLinear === true
   *
   * // Day names
   * const days = [{ value: 'Monday', type: 'string' }, { value: 'Tuesday', type: 'string' }];
   * const dayPattern = fillSeries.analyze(days);
   * // dayPattern.type === 'dayName', dayPattern.customList === ['Sunday', ...]
   * ```
   */
  analyze(sourceCells: (Cell | null)[]): DetectedPattern {
    // Convert to source values (extract plain text from FormattedText for pattern detection)
    const sourceValues: SourceValue[] = sourceCells.map((cell, index) => {
      const cellValue = cell?.value ?? null;
      return {
        value: valueToPlainValue(cellValue),
        type: cell?.type ?? 'empty',
        formula: cell?.formula,
        format: cell?.format,
        // Preserve original FormattedText for copy operations
        richTextValue: isFormattedText(cellValue) ? cellValue : undefined,
        index,
      };
    });

    // Create base pattern
    const basePattern: DetectedPattern = {
      type: 'copy',
      sourceValues,
      step: 0,
      isLinear: false,
      isGrowth: false,
      growthRatio: 1,
      customList: null,
      customListStartIndex: -1,
      textPattern: null,
      hasFormulas: sourceValues.some(v => v.formula !== undefined),
      sourceLength: sourceValues.length,
      confidence: 0,
    };

    // Empty input
    if (sourceValues.length === 0) {
      return basePattern;
    }

    // Check for formula-only pattern
    if (basePattern.hasFormulas && sourceValues.every(v => v.formula !== undefined)) {
      return {
        ...basePattern,
        type: 'formula',
        confidence: 1,
      };
    }

    // Single value - special handling
    if (sourceValues.length === 1) {
      return this.analyzeSingleValue(sourceValues[0], basePattern);
    }

    // Multiple values - detect pattern
    return this.analyzeMultipleValues(sourceValues, basePattern);
  }

  /**
   * Analyze a single source value.
   */
  private analyzeSingleValue(
    source: SourceValue,
    base: DetectedPattern
  ): DetectedPattern {
    // Formula
    if (source.formula) {
      return { ...base, type: 'formula', confidence: 1 };
    }

    // Null/empty
    if (source.value === null || source.type === 'empty') {
      return { ...base, type: 'copy', confidence: 1 };
    }

    // Number - assume linear with step 1
    if (typeof source.value === 'number') {
      return {
        ...base,
        type: 'number',
        step: 1,
        isLinear: true,
        confidence: 0.5, // Lower confidence for single value
      };
    }

    // String - check for custom lists or text-with-number
    if (typeof source.value === 'string') {
      // Check custom lists first
      const listMatch = this.findInCustomList(source.value);
      if (listMatch) {
        return {
          ...base,
          type: this.getListPatternType(listMatch.list),
          customList: listMatch.list,
          customListStartIndex: listMatch.index,
          confidence: 0.8,
        };
      }

      // Check for text with number
      const textNumMatch = this.parseTextWithNumber(source.value);
      if (textNumMatch) {
        return {
          ...base,
          type: 'textWithNumber',
          step: 1,
          isLinear: true,
          textPattern: {
            prefix: textNumMatch.prefix,
            suffix: textNumMatch.suffix,
            startNumber: textNumMatch.number,
            step: 1,
            minDigits: textNumMatch.digits,
          },
          confidence: 0.6,
        };
      }

      // Plain text - copy
      return { ...base, type: 'text', confidence: 1 };
    }

    // Boolean or other - copy
    return { ...base, type: 'copy', confidence: 1 };
  }

  /**
   * Analyze multiple source values to detect pattern.
   */
  private analyzeMultipleValues(
    sources: SourceValue[],
    base: DetectedPattern
  ): DetectedPattern {
    const values = sources.map(s => s.value);

    // All numbers?
    if (values.every(v => typeof v === 'number')) {
      const nums = values as number[];

      // Check linear pattern
      const linearStep = this.detectLinearStep(nums);
      if (linearStep !== null) {
        return {
          ...base,
          type: 'number',
          step: linearStep,
          isLinear: true,
          confidence: 1,
        };
      }

      // Check growth pattern
      const growthRatio = this.detectGrowthRatio(nums);
      if (growthRatio !== null) {
        return {
          ...base,
          type: 'number',
          growthRatio,
          isGrowth: true,
          confidence: 1,
        };
      }

      // Numbers with no clear pattern - copy
      return { ...base, type: 'copy', confidence: 1 };
    }

    // All strings?
    if (values.every(v => typeof v === 'string')) {
      const strs = values as string[];

      // Check custom list match
      const listMatch = this.detectCustomListSequence(strs);
      if (listMatch) {
        return {
          ...base,
          type: this.getListPatternType(listMatch.list),
          customList: listMatch.list,
          customListStartIndex: listMatch.startIndex,
          step: listMatch.step,
          confidence: 1,
        };
      }

      // Check text-with-number pattern
      const textNumPattern = this.detectTextWithNumberSequence(strs);
      if (textNumPattern) {
        return {
          ...base,
          type: 'textWithNumber',
          step: textNumPattern.step,
          isLinear: true,
          textPattern: textNumPattern,
          confidence: 1,
        };
      }

      // Plain text - copy pattern
      return { ...base, type: 'text', confidence: 1 };
    }

    // Mixed types - copy pattern
    return { ...base, type: 'mixed', confidence: 1 };
  }

  // ===========================================================================
  // Primary API: generate()
  // ===========================================================================

  /**
   * Generate fill values based on a detected pattern.
   *
   * This is the primary entry point for value generation.
   * Pass a pattern from analyze() and get back an array of
   * values ready to be written to cells.
   *
   * @param pattern - Pattern from analyze()
   * @param length - Number of values to generate
   * @param direction - Fill direction (affects formula adjustment)
   * @returns FillResult with generated values
   *
   * @example
   * ```typescript
   * const fillSeries = new FillSeries();
   *
   * // Analyze and generate
   * const cells = [{ value: 1, type: 'number' }, { value: 2, type: 'number' }];
   * const pattern = fillSeries.analyze(cells);
   * const result = fillSeries.generate(pattern, 3, 'down');
   * // result.values = [{ value: 3 }, { value: 4 }, { value: 5 }]
   * ```
   */
  generate(
    pattern: DetectedPattern,
    length: number,
    direction: FillDirection
  ): FillResult {
    const values: GeneratedValue[] = [];

    for (let i = 0; i < length; i++) {
      const sourceIndex = i % pattern.sourceLength;
      const cycleNumber = Math.floor(i / pattern.sourceLength);
      const absoluteIndex = i; // 0-based index in generated sequence

      const generated = this.generateValue(
        pattern,
        sourceIndex,
        cycleNumber,
        absoluteIndex,
        direction
      );

      values.push(generated);
    }

    return {
      values,
      pattern,
      direction,
      count: length,
    };
  }

  /**
   * Generate a single value.
   */
  private generateValue(
    pattern: DetectedPattern,
    sourceIndex: number,
    cycleNumber: number,
    absoluteIndex: number,
    direction: FillDirection
  ): GeneratedValue {
    const source = pattern.sourceValues[sourceIndex];

    // Calculate offsets for formula adjustment
    const rowOffset = direction === 'down' ? absoluteIndex + 1 :
                      direction === 'up' ? -(absoluteIndex + 1) : 0;
    const colOffset = direction === 'right' ? absoluteIndex + 1 :
                      direction === 'left' ? -(absoluteIndex + 1) : 0;

    const base: GeneratedValue = {
      value: source.value,
      type: source.type,
      format: source.format,
      // Deep clone FormattedText to prevent mutation
      richTextValue: source.richTextValue ? this.deepCloneFormattedText(source.richTextValue) : undefined,
      index: absoluteIndex,
      sourceIndex,
      rowOffset,
      colOffset,
    };

    // Handle formula
    if (source.formula) {
      return {
        ...base,
        formula: this.adjustFormula(source.formula, rowOffset, colOffset),
        type: 'formula',
      };
    }

    // Generate based on pattern type
    switch (pattern.type) {
      case 'number':
        return this.generateNumber(pattern, source, cycleNumber, absoluteIndex, base);

      case 'textWithNumber':
        return this.generateTextWithNumber(pattern, source, cycleNumber, absoluteIndex, base);

      case 'dayName':
      case 'monthName':
      case 'custom':
        return this.generateFromCustomList(pattern, sourceIndex, cycleNumber, base);

      case 'formula':
        // Formulas handled above
        return base;

      case 'copy':
      case 'text':
      case 'mixed':
      case 'date':
      default:
        // Copy pattern - just repeat the source
        return base;
    }
  }

  /**
   * Generate numeric value.
   */
  private generateNumber(
    pattern: DetectedPattern,
    source: SourceValue,
    _cycleNumber: number,
    absoluteIndex: number,
    base: GeneratedValue
  ): GeneratedValue {
    if (typeof source.value !== 'number') {
      return base;
    }

    let newValue: number;

    if (pattern.isGrowth) {
      // Geometric growth: v * ratio^n
      const firstValue = pattern.sourceValues[0].value as number;
      newValue = firstValue * Math.pow(pattern.growthRatio, pattern.sourceLength + absoluteIndex);
    } else if (pattern.isLinear) {
      // Linear: start + step * n
      const startValue = pattern.sourceValues[0].value as number;
      const totalSteps = pattern.sourceLength + absoluteIndex;
      newValue = startValue + pattern.step * totalSteps;
    } else {
      // No pattern - repeat
      return base;
    }

    return {
      ...base,
      value: newValue,
      type: 'number',
    };
  }

  /**
   * Generate text with number value.
   */
  private generateTextWithNumber(
    pattern: DetectedPattern,
    source: SourceValue,
    _cycleNumber: number,
    absoluteIndex: number,
    base: GeneratedValue
  ): GeneratedValue {
    if (!pattern.textPattern || typeof source.value !== 'string') {
      return base;
    }

    const tp = pattern.textPattern;
    const totalSteps = pattern.sourceLength + absoluteIndex;
    const newNumber = tp.startNumber + tp.step * totalSteps;

    // Pad number if needed
    let numStr = String(newNumber);
    if (tp.minDigits > 1) {
      numStr = numStr.padStart(tp.minDigits, '0');
    }

    const newValue = `${tp.prefix}${numStr}${tp.suffix}`;

    return {
      ...base,
      value: newValue,
      type: 'string',
    };
  }

  /**
   * Generate value from custom list.
   */
  private generateFromCustomList(
    pattern: DetectedPattern,
    sourceIndex: number,
    cycleNumber: number,
    base: GeneratedValue
  ): GeneratedValue {
    if (!pattern.customList) {
      return base;
    }

    const list = pattern.customList;
    const startIndex = pattern.customListStartIndex;
    const step = pattern.step || 1;

    // Calculate position in list
    const totalSteps = pattern.sourceLength + sourceIndex + cycleNumber * pattern.sourceLength;
    const listIndex = (startIndex + totalSteps * step) % list.length;

    // Get value and match case from source
    const source = pattern.sourceValues[sourceIndex];
    const listValue = list[listIndex >= 0 ? listIndex : list.length + listIndex];
    const matchedValue = typeof source.value === 'string'
      ? this.matchCase(listValue, source.value)
      : listValue;

    return {
      ...base,
      value: matchedValue,
      type: 'string',
    };
  }

  // ===========================================================================
  // Convenience API
  // ===========================================================================

  /**
   * Analyze and generate in one call.
   *
   * @param sourceCells - Source cells to analyze
   * @param length - Number of values to generate
   * @param direction - Fill direction
   * @returns FillResult with generated values
   */
  fill(
    sourceCells: (Cell | null)[],
    length: number,
    direction: FillDirection
  ): FillResult {
    const pattern = this.analyze(sourceCells);
    return this.generate(pattern, length, direction);
  }

  /**
   * Generate values for a range fill operation.
   *
   * @param sourceCells - 2D array of source cells [rows][cols]
   * @param targetRows - Number of target rows
   * @param targetCols - Number of target columns
   * @param direction - Fill direction
   * @returns 2D array of GeneratedValue [rows][cols]
   */
  fillRange(
    sourceCells: (Cell | null)[][],
    targetRows: number,
    targetCols: number,
    direction: FillDirection
  ): GeneratedValue[][] {
    const result: GeneratedValue[][] = [];

    if (direction === 'down' || direction === 'up') {
      // Fill each column independently
      for (let col = 0; col < sourceCells[0].length; col++) {
        const colCells = sourceCells.map(row => row[col]);
        const pattern = this.analyze(colCells);
        const fillResult = this.generate(pattern, targetRows, direction);

        for (let row = 0; row < targetRows; row++) {
          if (!result[row]) result[row] = [];
          result[row][col] = fillResult.values[row];
        }
      }
    } else {
      // Fill each row independently
      for (let row = 0; row < sourceCells.length; row++) {
        const rowCells = sourceCells[row];
        const pattern = this.analyze(rowCells);
        const fillResult = this.generate(pattern, targetCols, direction);
        result[row] = fillResult.values;
      }
    }

    return result;
  }

  // ===========================================================================
  // Pattern Detection Helpers
  // ===========================================================================

  /**
   * Detect linear step from numeric array.
   * Returns null if not a linear sequence.
   */
  private detectLinearStep(nums: number[]): number | null {
    if (nums.length < 2) return null;

    const step = nums[1] - nums[0];

    // Verify all steps are consistent
    for (let i = 2; i < nums.length; i++) {
      const actualStep = nums[i] - nums[i - 1];
      // Allow small floating point tolerance
      if (Math.abs(actualStep - step) > 1e-10) {
        return null;
      }
    }

    return step;
  }

  /**
   * Detect growth ratio from numeric array.
   * Returns null if not a geometric sequence.
   */
  private detectGrowthRatio(nums: number[]): number | null {
    if (nums.length < 2) return null;

    // Can't have zero in geometric sequence
    if (nums.some(n => n === 0)) return null;

    const ratio = nums[1] / nums[0];

    // Verify all ratios are consistent
    for (let i = 2; i < nums.length; i++) {
      const actualRatio = nums[i] / nums[i - 1];
      if (Math.abs(actualRatio - ratio) > 1e-10) {
        return null;
      }
    }

    // Ratio of 1 is just copying
    if (Math.abs(ratio - 1) < 1e-10) {
      return null;
    }

    return ratio;
  }

  /**
   * Find a value in custom lists.
   */
  private findInCustomList(value: string): { list: string[]; index: number } | null {
    const valueLower = value.toLowerCase();

    for (const list of this.customLists) {
      const listLower = list.map(s => s.toLowerCase());
      const index = listLower.indexOf(valueLower);
      if (index !== -1) {
        return { list, index };
      }
    }

    return null;
  }

  /**
   * Detect if strings follow a custom list sequence.
   */
  private detectCustomListSequence(
    strs: string[]
  ): { list: string[]; startIndex: number; step: number } | null {
    if (strs.length < 1) return null;

    const firstMatch = this.findInCustomList(strs[0]);
    if (!firstMatch) return null;

    const list = firstMatch.list;
    const listLower = list.map(s => s.toLowerCase());
    const startIndex = firstMatch.index;

    // Single value - assume step of 1
    if (strs.length === 1) {
      return { list, startIndex, step: 1 };
    }

    // Calculate expected step from first two values
    const secondLower = strs[1].toLowerCase();
    const secondIndex = listLower.indexOf(secondLower);

    if (secondIndex === -1) return null;

    // Calculate step (handle wrap-around)
    let step = secondIndex - startIndex;
    if (step <= 0) step += list.length;

    // Verify remaining values follow the pattern
    for (let i = 2; i < strs.length; i++) {
      const expectedIndex = (startIndex + i * step) % list.length;
      const actualValue = strs[i].toLowerCase();
      if (actualValue !== listLower[expectedIndex]) {
        return null;
      }
    }

    return { list, startIndex, step };
  }

  /**
   * Parse text with embedded number.
   */
  private parseTextWithNumber(
    text: string
  ): { prefix: string; number: number; suffix: string; digits: number } | null {
    // Match pattern like "Item1", "Row 5", "Step-003"
    const match = text.match(/^(.*?)(\d+)(.*?)$/);
    if (!match) return null;

    const numStr = match[2];
    return {
      prefix: match[1],
      number: parseInt(numStr, 10),
      suffix: match[3],
      digits: numStr.length,
    };
  }

  /**
   * Detect text-with-number sequence.
   */
  private detectTextWithNumberSequence(strs: string[]): TextNumberPattern | null {
    if (strs.length < 1) return null;

    // Parse all values
    const parsed = strs.map(s => this.parseTextWithNumber(s));

    // All must parse successfully
    if (parsed.some(p => p === null)) return null;

    const parts = parsed as NonNullable<typeof parsed[0]>[];

    // All must have same prefix and suffix
    const prefix = parts[0].prefix;
    const suffix = parts[0].suffix;
    const minDigits = Math.max(...parts.map(p => p.digits));

    if (!parts.every(p => p.prefix === prefix && p.suffix === suffix)) {
      return null;
    }

    // Detect numeric step
    const nums = parts.map(p => p.number);
    const step = this.detectLinearStep(nums);

    if (step === null) return null;

    return {
      prefix,
      suffix,
      startNumber: nums[0],
      step,
      minDigits,
    };
  }

  /**
   * Determine pattern type from custom list.
   */
  private getListPatternType(list: string[]): PatternType {
    // Check if it's a day list
    for (const dayList of DAY_NAMES) {
      if (list === dayList || list.every((v, i) => v === dayList[i])) {
        return 'dayName';
      }
    }

    // Check if it's a month list
    for (const monthList of MONTH_NAMES) {
      if (list === monthList || list.every((v, i) => v === monthList[i])) {
        return 'monthName';
      }
    }

    return 'custom';
  }

  // ===========================================================================
  // Formula Adjustment
  // ===========================================================================

  /**
   * Adjust formula references by row/column delta.
   * Handles relative ($) and absolute references.
   *
   * @param formula - Original formula
   * @param rowDelta - Row offset (positive = down)
   * @param colDelta - Column offset (positive = right)
   * @returns Adjusted formula
   */
  adjustFormula(formula: string, rowDelta: number, colDelta: number): string {
    // Match cell references: A1, $A1, A$1, $A$1, AA100, etc.
    const cellRefRegex = /(\$?)([A-Z]+)(\$?)(\d+)/gi;

    return formula.replace(cellRefRegex, (_match, colAbs, col, rowAbs, row) => {
      let newCol = col;
      let newRow = parseInt(row, 10);

      // Adjust column if not absolute
      if (!colAbs && colDelta !== 0) {
        const colIndex = this.columnLetterToIndex(col);
        const newColIndex = Math.max(0, colIndex + colDelta);
        newCol = this.indexToColumnLetter(newColIndex);
      }

      // Adjust row if not absolute
      if (!rowAbs && rowDelta !== 0) {
        newRow = Math.max(1, newRow + rowDelta);
      }

      return `${colAbs}${newCol}${rowAbs}${newRow}`;
    });
  }

  /**
   * Convert column letter(s) to 0-based index.
   * A=0, B=1, ..., Z=25, AA=26, etc.
   */
  private columnLetterToIndex(letters: string): number {
    let col = 0;
    for (let i = 0; i < letters.length; i++) {
      col = col * 26 + (letters.toUpperCase().charCodeAt(i) - 64);
    }
    return col - 1;
  }

  /**
   * Convert 0-based index to column letter(s).
   */
  private indexToColumnLetter(index: number): string {
    let result = '';
    let n = index + 1;
    while (n > 0) {
      const remainder = (n - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Match case style of source string.
   */
  private matchCase(value: string, source: string): string {
    if (source === source.toUpperCase()) {
      return value.toUpperCase();
    }
    if (source === source.toLowerCase()) {
      return value.toLowerCase();
    }
    if (source.length > 0 && source[0] === source[0].toUpperCase()) {
      return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    }
    return value;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new FillSeries instance.
 */
export function createFillSeries(): FillSeries {
  return new FillSeries();
}
