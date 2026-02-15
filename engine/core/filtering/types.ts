/**
 * Filter System Types
 * Type definitions for the filtering subsystem
 */

import type { FormattedText } from '../types/index.js';

/**
 * Cell value types that can be filtered
 */
export type CellValue = string | number | boolean | FormattedText | null | undefined;

/**
 * Predicate types supported by the filter system
 */
export type PredicateType =
  // Text predicates
  | 'text.contains'
  | 'text.beginsWith'
  | 'text.endsWith'
  | 'text.equals'
  | 'text.notEquals'
  // Number predicates
  | 'number.gt'
  | 'number.gte'
  | 'number.lt'
  | 'number.lte'
  | 'number.between'
  | 'number.equals'
  // Date predicates
  | 'date.before'
  | 'date.after'
  | 'date.between'
  | 'date.equals'
  // Null predicates
  | 'null.isEmpty'
  | 'null.isNotEmpty'
  // Composition predicates
  | 'composite.and'
  | 'composite.or';

/**
 * Serialized predicate format for save/load
 */
export interface SerializedPredicate {
  type: PredicateType;
  params: Record<string, unknown>;
}

/**
 * Base interface for all filter predicates
 */
export interface FilterPredicate {
  /**
   * Predicate type identifier
   */
  readonly type: PredicateType;

  /**
   * Human-readable description for UI display
   */
  readonly description: string;

  /**
   * Test if a cell value matches this predicate
   * @param value - Cell value to test
   * @returns true if value matches predicate
   */
  test(value: CellValue): boolean;

  /**
   * Serialize predicate for save/load
   * @returns Serialized predicate data
   */
  serialize(): SerializedPredicate;
}

/**
 * Text comparison options
 */
export interface TextPredicateOptions {
  caseSensitive?: boolean;
}

/**
 * Number range for between predicate
 */
export interface NumberRange {
  min: number;
  max: number;
}

/**
 * Date range for between predicate
 */
export interface DateRange {
  start: Date;
  end: Date;
}
