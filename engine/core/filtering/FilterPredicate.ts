/**
 * Filter Predicate Implementations
 * High-performance predicates for filtering cells
 */

import type {
  FilterPredicate,
  CellValue,
  SerializedPredicate,
  PredicateType,
  TextPredicateOptions,
  NumberRange,
  DateRange,
} from './types.js';
import type { FormattedText } from '../types/index.js';

// ===========================================================================
// Helper Functions
// ===========================================================================

/**
 * Convert CellValue to plain string for text comparison
 */
function toPlainText(value: CellValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  // FormattedText
  if (typeof value === 'object' && '_type' in value && value._type === 'FormattedText') {
    return (value as FormattedText).text;
  }
  return '';
}

/**
 * Convert CellValue to number (returns NaN if not convertible)
 */
function toNumber(value: CellValue): number {
  if (value === null || value === undefined) {
    return NaN;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    // Try parsing as number
    const num = Number(value);
    return num;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  // FormattedText - try parsing text
  if (typeof value === 'object' && '_type' in value && value._type === 'FormattedText') {
    const num = Number((value as FormattedText).text);
    return num;
  }
  return NaN;
}

/**
 * Convert CellValue to Date (returns Invalid Date if not convertible)
 */
function toDate(value: CellValue): Date {
  if (value === null || value === undefined) {
    return new Date(NaN);
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'number') {
    // Excel serial date or timestamp
    // For now, treat as timestamp
    return new Date(value);
  }
  if (typeof value === 'string') {
    return new Date(value);
  }
  // FormattedText
  if (typeof value === 'object' && '_type' in value && value._type === 'FormattedText') {
    return new Date((value as FormattedText).text);
  }
  return new Date(NaN);
}

/**
 * Check if value is empty (null, undefined, or empty string)
 */
function isEmpty(value: CellValue): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return true;
  }
  if (typeof value === 'object' && '_type' in value && value._type === 'FormattedText') {
    return (value as FormattedText).text.trim() === '';
  }
  return false;
}

// ===========================================================================
// Text Predicates
// ===========================================================================

/**
 * Text contains predicate
 */
export class TextContainsPredicate implements FilterPredicate {
  readonly type: PredicateType = 'text.contains';
  readonly description: string;
  private readonly searchText: string;
  private readonly caseSensitive: boolean;

  constructor(searchText: string, options: TextPredicateOptions = {}) {
    this.caseSensitive = options.caseSensitive ?? false;
    this.searchText = this.caseSensitive ? searchText : searchText.toLowerCase();
    this.description = `Contains "${searchText}"${this.caseSensitive ? ' (case-sensitive)' : ''}`;
  }

  test(value: CellValue): boolean {
    const text = toPlainText(value);
    const testText = this.caseSensitive ? text : text.toLowerCase();
    return testText.includes(this.searchText);
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: {
        searchText: this.searchText,
        caseSensitive: this.caseSensitive,
      },
    };
  }
}

/**
 * Text begins with predicate
 */
export class TextBeginsWithPredicate implements FilterPredicate {
  readonly type: PredicateType = 'text.beginsWith';
  readonly description: string;
  private readonly prefix: string;
  private readonly caseSensitive: boolean;

  constructor(prefix: string, options: TextPredicateOptions = {}) {
    this.caseSensitive = options.caseSensitive ?? false;
    this.prefix = this.caseSensitive ? prefix : prefix.toLowerCase();
    this.description = `Begins with "${prefix}"${this.caseSensitive ? ' (case-sensitive)' : ''}`;
  }

  test(value: CellValue): boolean {
    const text = toPlainText(value);
    const testText = this.caseSensitive ? text : text.toLowerCase();
    return testText.startsWith(this.prefix);
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: {
        prefix: this.prefix,
        caseSensitive: this.caseSensitive,
      },
    };
  }
}

/**
 * Text ends with predicate
 */
export class TextEndsWithPredicate implements FilterPredicate {
  readonly type: PredicateType = 'text.endsWith';
  readonly description: string;
  private readonly suffix: string;
  private readonly caseSensitive: boolean;

  constructor(suffix: string, options: TextPredicateOptions = {}) {
    this.caseSensitive = options.caseSensitive ?? false;
    this.suffix = this.caseSensitive ? suffix : suffix.toLowerCase();
    this.description = `Ends with "${suffix}"${this.caseSensitive ? ' (case-sensitive)' : ''}`;
  }

  test(value: CellValue): boolean {
    const text = toPlainText(value);
    const testText = this.caseSensitive ? text : text.toLowerCase();
    return testText.endsWith(this.suffix);
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: {
        suffix: this.suffix,
        caseSensitive: this.caseSensitive,
      },
    };
  }
}

/**
 * Text equals predicate
 */
export class TextEqualsPredicate implements FilterPredicate {
  readonly type: PredicateType = 'text.equals';
  readonly description: string;
  private readonly targetText: string;
  private readonly caseSensitive: boolean;

  constructor(targetText: string, options: TextPredicateOptions = {}) {
    this.caseSensitive = options.caseSensitive ?? false;
    this.targetText = this.caseSensitive ? targetText : targetText.toLowerCase();
    this.description = `Equals "${targetText}"${this.caseSensitive ? ' (case-sensitive)' : ''}`;
  }

  test(value: CellValue): boolean {
    const text = toPlainText(value);
    const testText = this.caseSensitive ? text : text.toLowerCase();
    return testText === this.targetText;
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: {
        targetText: this.targetText,
        caseSensitive: this.caseSensitive,
      },
    };
  }
}

/**
 * Text not equals predicate
 */
export class TextNotEqualsPredicate implements FilterPredicate {
  readonly type: PredicateType = 'text.notEquals';
  readonly description: string;
  private readonly targetText: string;
  private readonly caseSensitive: boolean;

  constructor(targetText: string, options: TextPredicateOptions = {}) {
    this.caseSensitive = options.caseSensitive ?? false;
    this.targetText = this.caseSensitive ? targetText : targetText.toLowerCase();
    this.description = `Not equals "${targetText}"${this.caseSensitive ? ' (case-sensitive)' : ''}`;
  }

  test(value: CellValue): boolean {
    const text = toPlainText(value);
    const testText = this.caseSensitive ? text : text.toLowerCase();
    return testText !== this.targetText;
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: {
        targetText: this.targetText,
        caseSensitive: this.caseSensitive,
      },
    };
  }
}

// ===========================================================================
// Number Predicates
// ===========================================================================

/**
 * Number greater than predicate
 */
export class NumberGreaterThanPredicate implements FilterPredicate {
  readonly type: PredicateType = 'number.gt';
  readonly description: string;
  private readonly threshold: number;

  constructor(threshold: number) {
    this.threshold = threshold;
    this.description = `Greater than ${threshold}`;
  }

  test(value: CellValue): boolean {
    const num = toNumber(value);
    if (isNaN(num)) return false;
    return num > this.threshold;
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: { threshold: this.threshold },
    };
  }
}

/**
 * Number greater than or equal predicate
 */
export class NumberGreaterThanOrEqualPredicate implements FilterPredicate {
  readonly type: PredicateType = 'number.gte';
  readonly description: string;
  private readonly threshold: number;

  constructor(threshold: number) {
    this.threshold = threshold;
    this.description = `Greater than or equal to ${threshold}`;
  }

  test(value: CellValue): boolean {
    const num = toNumber(value);
    if (isNaN(num)) return false;
    return num >= this.threshold;
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: { threshold: this.threshold },
    };
  }
}

/**
 * Number less than predicate
 */
export class NumberLessThanPredicate implements FilterPredicate {
  readonly type: PredicateType = 'number.lt';
  readonly description: string;
  private readonly threshold: number;

  constructor(threshold: number) {
    this.threshold = threshold;
    this.description = `Less than ${threshold}`;
  }

  test(value: CellValue): boolean {
    const num = toNumber(value);
    if (isNaN(num)) return false;
    return num < this.threshold;
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: { threshold: this.threshold },
    };
  }
}

/**
 * Number less than or equal predicate
 */
export class NumberLessThanOrEqualPredicate implements FilterPredicate {
  readonly type: PredicateType = 'number.lte';
  readonly description: string;
  private readonly threshold: number;

  constructor(threshold: number) {
    this.threshold = threshold;
    this.description = `Less than or equal to ${threshold}`;
  }

  test(value: CellValue): boolean {
    const num = toNumber(value);
    if (isNaN(num)) return false;
    return num <= this.threshold;
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: { threshold: this.threshold },
    };
  }
}

/**
 * Number between predicate (inclusive)
 */
export class NumberBetweenPredicate implements FilterPredicate {
  readonly type: PredicateType = 'number.between';
  readonly description: string;
  private readonly min: number;
  private readonly max: number;

  constructor(range: NumberRange) {
    this.min = range.min;
    this.max = range.max;
    this.description = `Between ${this.min} and ${this.max}`;
  }

  test(value: CellValue): boolean {
    const num = toNumber(value);
    if (isNaN(num)) return false;
    return num >= this.min && num <= this.max;
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: { min: this.min, max: this.max },
    };
  }
}

/**
 * Number equals predicate
 */
export class NumberEqualsPredicate implements FilterPredicate {
  readonly type: PredicateType = 'number.equals';
  readonly description: string;
  private readonly target: number;

  constructor(target: number) {
    this.target = target;
    this.description = `Equals ${target}`;
  }

  test(value: CellValue): boolean {
    const num = toNumber(value);
    if (isNaN(num)) return false;
    return num === this.target;
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: { target: this.target },
    };
  }
}

// ===========================================================================
// Date Predicates
// ===========================================================================

/**
 * Date before predicate
 */
export class DateBeforePredicate implements FilterPredicate {
  readonly type: PredicateType = 'date.before';
  readonly description: string;
  private readonly threshold: Date;

  constructor(threshold: Date) {
    this.threshold = threshold;
    this.description = `Before ${threshold.toLocaleDateString()}`;
  }

  test(value: CellValue): boolean {
    const date = toDate(value);
    if (isNaN(date.getTime())) return false;
    return date < this.threshold;
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: { threshold: this.threshold.toISOString() },
    };
  }
}

/**
 * Date after predicate
 */
export class DateAfterPredicate implements FilterPredicate {
  readonly type: PredicateType = 'date.after';
  readonly description: string;
  private readonly threshold: Date;

  constructor(threshold: Date) {
    this.threshold = threshold;
    this.description = `After ${threshold.toLocaleDateString()}`;
  }

  test(value: CellValue): boolean {
    const date = toDate(value);
    if (isNaN(date.getTime())) return false;
    return date > this.threshold;
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: { threshold: this.threshold.toISOString() },
    };
  }
}

/**
 * Date between predicate (inclusive)
 */
export class DateBetweenPredicate implements FilterPredicate {
  readonly type: PredicateType = 'date.between';
  readonly description: string;
  private readonly start: Date;
  private readonly end: Date;

  constructor(range: DateRange) {
    this.start = range.start;
    this.end = range.end;
    this.description = `Between ${this.start.toLocaleDateString()} and ${this.end.toLocaleDateString()}`;
  }

  test(value: CellValue): boolean {
    const date = toDate(value);
    if (isNaN(date.getTime())) return false;
    return date >= this.start && date <= this.end;
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: {
        start: this.start.toISOString(),
        end: this.end.toISOString(),
      },
    };
  }
}

/**
 * Date equals predicate (same day, ignores time)
 */
export class DateEqualsPredicate implements FilterPredicate {
  readonly type: PredicateType = 'date.equals';
  readonly description: string;
  private readonly target: Date;

  constructor(target: Date) {
    this.target = target;
    this.description = `Equals ${target.toLocaleDateString()}`;
  }

  test(value: CellValue): boolean {
    const date = toDate(value);
    if (isNaN(date.getTime())) return false;
    // Compare date parts only (ignore time)
    return (
      date.getFullYear() === this.target.getFullYear() &&
      date.getMonth() === this.target.getMonth() &&
      date.getDate() === this.target.getDate()
    );
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: { target: this.target.toISOString() },
    };
  }
}

// ===========================================================================
// Null Predicates
// ===========================================================================

/**
 * Is empty predicate (null, undefined, or empty string)
 */
export class IsEmptyPredicate implements FilterPredicate {
  readonly type: PredicateType = 'null.isEmpty';
  readonly description = 'Is empty';

  test(value: CellValue): boolean {
    return isEmpty(value);
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: {},
    };
  }
}

/**
 * Is not empty predicate
 */
export class IsNotEmptyPredicate implements FilterPredicate {
  readonly type: PredicateType = 'null.isNotEmpty';
  readonly description = 'Is not empty';

  test(value: CellValue): boolean {
    return !isEmpty(value);
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: {},
    };
  }
}

// ===========================================================================
// Composite Predicates
// ===========================================================================

/**
 * AND composite predicate (all predicates must match)
 */
export class AndPredicate implements FilterPredicate {
  readonly type: PredicateType = 'composite.and';
  readonly description: string;
  private readonly predicates: FilterPredicate[];

  constructor(predicates: FilterPredicate[]) {
    if (predicates.length === 0) {
      throw new Error('AndPredicate requires at least one predicate');
    }
    this.predicates = predicates;
    this.description = predicates.map((p) => p.description).join(' AND ');
  }

  test(value: CellValue): boolean {
    // All predicates must pass
    for (const predicate of this.predicates) {
      if (!predicate.test(value)) {
        return false;
      }
    }
    return true;
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: {
        predicates: this.predicates.map((p) => p.serialize()),
      },
    };
  }
}

/**
 * OR composite predicate (any predicate must match)
 */
export class OrPredicate implements FilterPredicate {
  readonly type: PredicateType = 'composite.or';
  readonly description: string;
  private readonly predicates: FilterPredicate[];

  constructor(predicates: FilterPredicate[]) {
    if (predicates.length === 0) {
      throw new Error('OrPredicate requires at least one predicate');
    }
    this.predicates = predicates;
    this.description = predicates.map((p) => p.description).join(' OR ');
  }

  test(value: CellValue): boolean {
    // Any predicate must pass
    for (const predicate of this.predicates) {
      if (predicate.test(value)) {
        return true;
      }
    }
    return false;
  }

  serialize(): SerializedPredicate {
    return {
      type: this.type,
      params: {
        predicates: this.predicates.map((p) => p.serialize()),
      },
    };
  }
}

// ===========================================================================
// Factory Function
// ===========================================================================

/**
 * Create a predicate from serialized data
 */
export function deserializePredicate(data: SerializedPredicate): FilterPredicate {
  switch (data.type) {
    // Text predicates
    case 'text.contains':
      return new TextContainsPredicate(data.params.searchText as string, {
        caseSensitive: data.params.caseSensitive as boolean,
      });
    case 'text.beginsWith':
      return new TextBeginsWithPredicate(data.params.prefix as string, {
        caseSensitive: data.params.caseSensitive as boolean,
      });
    case 'text.endsWith':
      return new TextEndsWithPredicate(data.params.suffix as string, {
        caseSensitive: data.params.caseSensitive as boolean,
      });
    case 'text.equals':
      return new TextEqualsPredicate(data.params.targetText as string, {
        caseSensitive: data.params.caseSensitive as boolean,
      });
    case 'text.notEquals':
      return new TextNotEqualsPredicate(data.params.targetText as string, {
        caseSensitive: data.params.caseSensitive as boolean,
      });

    // Number predicates
    case 'number.gt':
      return new NumberGreaterThanPredicate(data.params.threshold as number);
    case 'number.gte':
      return new NumberGreaterThanOrEqualPredicate(data.params.threshold as number);
    case 'number.lt':
      return new NumberLessThanPredicate(data.params.threshold as number);
    case 'number.lte':
      return new NumberLessThanOrEqualPredicate(data.params.threshold as number);
    case 'number.between':
      return new NumberBetweenPredicate({
        min: data.params.min as number,
        max: data.params.max as number,
      });
    case 'number.equals':
      return new NumberEqualsPredicate(data.params.target as number);

    // Date predicates
    case 'date.before':
      return new DateBeforePredicate(new Date(data.params.threshold as string));
    case 'date.after':
      return new DateAfterPredicate(new Date(data.params.threshold as string));
    case 'date.between':
      return new DateBetweenPredicate({
        start: new Date(data.params.start as string),
        end: new Date(data.params.end as string),
      });
    case 'date.equals':
      return new DateEqualsPredicate(new Date(data.params.target as string));

    // Null predicates
    case 'null.isEmpty':
      return new IsEmptyPredicate();
    case 'null.isNotEmpty':
      return new IsNotEmptyPredicate();

    // Composite predicates
    case 'composite.and':
      return new AndPredicate(
        (data.params.predicates as SerializedPredicate[]).map(deserializePredicate)
      );
    case 'composite.or':
      return new OrPredicate(
        (data.params.predicates as SerializedPredicate[]).map(deserializePredicate)
      );

    default:
      throw new Error(`Unknown predicate type: ${data.type}`);
  }
}
