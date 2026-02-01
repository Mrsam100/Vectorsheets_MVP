/**
 * VectorSheet Engine - Formula Auto-Complete (Production Grade)
 *
 * Excel-grade formula intelligence with real-time analysis.
 *
 * Features:
 * - 50+ built-in functions with full metadata
 * - Fast, deterministic parsing (only what's needed)
 * - Nested function support with argument tracking
 * - Inline hints with signature highlighting
 * - Framework-agnostic structured data output
 *
 * API:
 * - analyze(formula, cursor): FormulaContext - Parse formula state at cursor
 * - suggest(context): FunctionSuggestion[] - Get contextual suggestions
 *
 * Performance:
 * - O(n) single-pass parsing from start to cursor
 * - No regex in hot paths
 * - Stack-based function tracking
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * Information about a function in the library.
 */
export interface FunctionInfo {
  name: string;
  category: string;
  description: string;
  syntax: string;
  args: FunctionArg[];
  examples?: string[];
}

export interface FunctionArg {
  name: string;
  description: string;
  optional: boolean;
  repeating?: boolean;
  type: 'number' | 'text' | 'logical' | 'reference' | 'any';
}

export interface AutoCompleteSuggestion {
  type: 'function' | 'range' | 'namedRange' | 'table';
  text: string;
  displayText: string;
  description: string;
  insertText: string;
  /** Where to place cursor after insert (offset from start of insertText) */
  cursorOffset?: number;
}

export interface AutoCompleteState {
  isVisible: boolean;
  suggestions: AutoCompleteSuggestion[];
  selectedIndex: number;
  triggerPosition: number;
  currentToken: string;
}

// =============================================================================
// Formula Analysis Types
// =============================================================================

/**
 * Information about a function call at a specific nesting level.
 */
export interface FunctionCallInfo {
  /** Function name (uppercase) */
  name: string;
  /** Function metadata (if known) */
  info: FunctionInfo | null;
  /** Position of the opening parenthesis */
  openParenPos: number;
  /** Current argument index (0-based) */
  argIndex: number;
  /** Start position of current argument */
  argStartPos: number;
}

/**
 * Complete context of the formula at the cursor position.
 * This is the primary output of analyze().
 */
export interface FormulaContext {
  /** Is this a valid formula (starts with =) */
  isFormula: boolean;

  /** The raw formula text */
  formula: string;

  /** Cursor position in the formula */
  cursor: number;

  /** Token being typed at cursor (for autocomplete matching) */
  currentToken: string;

  /** Position where current token starts */
  tokenStartPos: number;

  /** Stack of nested function calls (innermost last) */
  functionStack: FunctionCallInfo[];

  /** The innermost (current) function being edited */
  currentFunction: FunctionCallInfo | null;

  /** Whether cursor is inside a string literal */
  insideString: boolean;

  /** Whether cursor is at a position expecting a cell reference */
  expectsReference: boolean;

  /** Whether we're typing a function name (after = or operator) */
  typingFunctionName: boolean;

  /** Depth of parentheses nesting */
  parenDepth: number;

  /** Any parsing errors encountered */
  error: string | null;
}

/**
 * A function suggestion with context-aware metadata.
 */
export interface FunctionSuggestion {
  /** Function name */
  name: string;

  /** Full function info */
  info: FunctionInfo;

  /** Match score (higher = better match) */
  score: number;

  /** Text to insert (typically "NAME(") */
  insertText: string;

  /** Where to place cursor after insert */
  cursorOffset: number;

  /** Formatted signature for display (e.g., "SUM(number1, [number2], ...)") */
  signature: string;

  /** Short description */
  description: string;

  /** Whether this is a recent/frequent function */
  isRecent: boolean;
}

/**
 * Inline hint for the current function argument.
 * Displayed in the formula bar or tooltip.
 */
export interface ArgumentHint {
  /** Full function signature with current arg highlighted */
  signature: string;

  /** Current argument info */
  currentArg: FunctionArg | null;

  /** Index of current argument */
  argIndex: number;

  /** Total number of arguments (not counting repeating) */
  argCount: number;

  /** Whether more arguments can be added (has repeating arg) */
  hasMoreArgs: boolean;

  /** Text of the signature with current arg wrapped in markers */
  highlightedSignature: string;

  /** Start and end positions of highlighted portion */
  highlightRange: { start: number; end: number } | null;
}

// Excel-compatible function library
const FUNCTION_LIBRARY: FunctionInfo[] = [
  // Math & Trig
  {
    name: 'SUM',
    category: 'Math & Trig',
    description: 'Adds all the numbers in a range of cells',
    syntax: 'SUM(number1, [number2], ...)',
    args: [
      { name: 'number1', description: 'The first number or range', optional: false, type: 'number' },
      { name: 'number2', description: 'Additional numbers or ranges', optional: true, repeating: true, type: 'number' },
    ],
    examples: ['=SUM(A1:A10)', '=SUM(A1, B1, C1)'],
  },
  {
    name: 'AVERAGE',
    category: 'Statistical',
    description: 'Returns the average of the arguments',
    syntax: 'AVERAGE(number1, [number2], ...)',
    args: [
      { name: 'number1', description: 'The first number or range', optional: false, type: 'number' },
      { name: 'number2', description: 'Additional numbers or ranges', optional: true, repeating: true, type: 'number' },
    ],
  },
  {
    name: 'COUNT',
    category: 'Statistical',
    description: 'Counts the number of cells that contain numbers',
    syntax: 'COUNT(value1, [value2], ...)',
    args: [
      { name: 'value1', description: 'The first value or range', optional: false, type: 'any' },
      { name: 'value2', description: 'Additional values or ranges', optional: true, repeating: true, type: 'any' },
    ],
  },
  {
    name: 'COUNTA',
    category: 'Statistical',
    description: 'Counts the number of non-empty cells',
    syntax: 'COUNTA(value1, [value2], ...)',
    args: [
      { name: 'value1', description: 'The first value or range', optional: false, type: 'any' },
      { name: 'value2', description: 'Additional values or ranges', optional: true, repeating: true, type: 'any' },
    ],
  },
  {
    name: 'MAX',
    category: 'Statistical',
    description: 'Returns the largest value in a set of values',
    syntax: 'MAX(number1, [number2], ...)',
    args: [
      { name: 'number1', description: 'The first number or range', optional: false, type: 'number' },
      { name: 'number2', description: 'Additional numbers or ranges', optional: true, repeating: true, type: 'number' },
    ],
  },
  {
    name: 'MIN',
    category: 'Statistical',
    description: 'Returns the smallest value in a set of values',
    syntax: 'MIN(number1, [number2], ...)',
    args: [
      { name: 'number1', description: 'The first number or range', optional: false, type: 'number' },
      { name: 'number2', description: 'Additional numbers or ranges', optional: true, repeating: true, type: 'number' },
    ],
  },
  {
    name: 'IF',
    category: 'Logical',
    description: 'Performs a logical test and returns one value if TRUE, another if FALSE',
    syntax: 'IF(logical_test, value_if_true, [value_if_false])',
    args: [
      { name: 'logical_test', description: 'The condition to evaluate', optional: false, type: 'logical' },
      { name: 'value_if_true', description: 'Value if condition is TRUE', optional: false, type: 'any' },
      { name: 'value_if_false', description: 'Value if condition is FALSE', optional: true, type: 'any' },
    ],
    examples: ['=IF(A1>10, "High", "Low")'],
  },
  {
    name: 'IFS',
    category: 'Logical',
    description: 'Checks multiple conditions and returns a value for the first TRUE condition',
    syntax: 'IFS(logical_test1, value1, [logical_test2, value2], ...)',
    args: [
      { name: 'logical_test1', description: 'First condition', optional: false, type: 'logical' },
      { name: 'value1', description: 'Value if first condition is TRUE', optional: false, type: 'any' },
    ],
  },
  {
    name: 'AND',
    category: 'Logical',
    description: 'Returns TRUE if all arguments are TRUE',
    syntax: 'AND(logical1, [logical2], ...)',
    args: [
      { name: 'logical1', description: 'First condition', optional: false, type: 'logical' },
      { name: 'logical2', description: 'Additional conditions', optional: true, repeating: true, type: 'logical' },
    ],
  },
  {
    name: 'OR',
    category: 'Logical',
    description: 'Returns TRUE if any argument is TRUE',
    syntax: 'OR(logical1, [logical2], ...)',
    args: [
      { name: 'logical1', description: 'First condition', optional: false, type: 'logical' },
      { name: 'logical2', description: 'Additional conditions', optional: true, repeating: true, type: 'logical' },
    ],
  },
  {
    name: 'NOT',
    category: 'Logical',
    description: 'Reverses the logic of its argument',
    syntax: 'NOT(logical)',
    args: [
      { name: 'logical', description: 'Value or expression to negate', optional: false, type: 'logical' },
    ],
  },
  {
    name: 'VLOOKUP',
    category: 'Lookup & Reference',
    description: 'Looks up a value in the first column and returns a value in the same row',
    syntax: 'VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])',
    args: [
      { name: 'lookup_value', description: 'The value to search for', optional: false, type: 'any' },
      { name: 'table_array', description: 'The range to search in', optional: false, type: 'reference' },
      { name: 'col_index_num', description: 'Column number to return', optional: false, type: 'number' },
      { name: 'range_lookup', description: 'TRUE for approximate, FALSE for exact match', optional: true, type: 'logical' },
    ],
    examples: ['=VLOOKUP(A1, B:D, 2, FALSE)'],
  },
  {
    name: 'HLOOKUP',
    category: 'Lookup & Reference',
    description: 'Looks up a value in the first row and returns a value in the same column',
    syntax: 'HLOOKUP(lookup_value, table_array, row_index_num, [range_lookup])',
    args: [
      { name: 'lookup_value', description: 'The value to search for', optional: false, type: 'any' },
      { name: 'table_array', description: 'The range to search in', optional: false, type: 'reference' },
      { name: 'row_index_num', description: 'Row number to return', optional: false, type: 'number' },
      { name: 'range_lookup', description: 'TRUE for approximate, FALSE for exact match', optional: true, type: 'logical' },
    ],
  },
  {
    name: 'XLOOKUP',
    category: 'Lookup & Reference',
    description: 'Searches a range and returns an item corresponding to the first match',
    syntax: 'XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode])',
    args: [
      { name: 'lookup_value', description: 'The value to search for', optional: false, type: 'any' },
      { name: 'lookup_array', description: 'The range to search in', optional: false, type: 'reference' },
      { name: 'return_array', description: 'The range to return from', optional: false, type: 'reference' },
      { name: 'if_not_found', description: 'Value if no match found', optional: true, type: 'any' },
      { name: 'match_mode', description: '0=exact, -1=exact or smaller, 1=exact or larger, 2=wildcard', optional: true, type: 'number' },
      { name: 'search_mode', description: '1=first-to-last, -1=last-to-first, 2=binary ascending, -2=binary descending', optional: true, type: 'number' },
    ],
  },
  {
    name: 'INDEX',
    category: 'Lookup & Reference',
    description: 'Returns a value at a given position in a range',
    syntax: 'INDEX(array, row_num, [col_num])',
    args: [
      { name: 'array', description: 'The range of cells', optional: false, type: 'reference' },
      { name: 'row_num', description: 'Row position', optional: false, type: 'number' },
      { name: 'col_num', description: 'Column position', optional: true, type: 'number' },
    ],
  },
  {
    name: 'MATCH',
    category: 'Lookup & Reference',
    description: 'Returns the position of a value in a range',
    syntax: 'MATCH(lookup_value, lookup_array, [match_type])',
    args: [
      { name: 'lookup_value', description: 'The value to search for', optional: false, type: 'any' },
      { name: 'lookup_array', description: 'The range to search in', optional: false, type: 'reference' },
      { name: 'match_type', description: '1=less than, 0=exact, -1=greater than', optional: true, type: 'number' },
    ],
  },
  {
    name: 'CONCATENATE',
    category: 'Text',
    description: 'Joins several text strings into one',
    syntax: 'CONCATENATE(text1, [text2], ...)',
    args: [
      { name: 'text1', description: 'First text', optional: false, type: 'text' },
      { name: 'text2', description: 'Additional text', optional: true, repeating: true, type: 'text' },
    ],
  },
  {
    name: 'CONCAT',
    category: 'Text',
    description: 'Joins text from multiple ranges',
    syntax: 'CONCAT(text1, [text2], ...)',
    args: [
      { name: 'text1', description: 'First text or range', optional: false, type: 'text' },
      { name: 'text2', description: 'Additional text or ranges', optional: true, repeating: true, type: 'text' },
    ],
  },
  {
    name: 'LEFT',
    category: 'Text',
    description: 'Returns the leftmost characters from a text string',
    syntax: 'LEFT(text, [num_chars])',
    args: [
      { name: 'text', description: 'The text string', optional: false, type: 'text' },
      { name: 'num_chars', description: 'Number of characters (default 1)', optional: true, type: 'number' },
    ],
  },
  {
    name: 'RIGHT',
    category: 'Text',
    description: 'Returns the rightmost characters from a text string',
    syntax: 'RIGHT(text, [num_chars])',
    args: [
      { name: 'text', description: 'The text string', optional: false, type: 'text' },
      { name: 'num_chars', description: 'Number of characters (default 1)', optional: true, type: 'number' },
    ],
  },
  {
    name: 'MID',
    category: 'Text',
    description: 'Returns characters from the middle of a text string',
    syntax: 'MID(text, start_num, num_chars)',
    args: [
      { name: 'text', description: 'The text string', optional: false, type: 'text' },
      { name: 'start_num', description: 'Starting position', optional: false, type: 'number' },
      { name: 'num_chars', description: 'Number of characters', optional: false, type: 'number' },
    ],
  },
  {
    name: 'LEN',
    category: 'Text',
    description: 'Returns the number of characters in a text string',
    syntax: 'LEN(text)',
    args: [
      { name: 'text', description: 'The text string', optional: false, type: 'text' },
    ],
  },
  {
    name: 'TRIM',
    category: 'Text',
    description: 'Removes extra spaces from text',
    syntax: 'TRIM(text)',
    args: [
      { name: 'text', description: 'The text to trim', optional: false, type: 'text' },
    ],
  },
  {
    name: 'UPPER',
    category: 'Text',
    description: 'Converts text to uppercase',
    syntax: 'UPPER(text)',
    args: [
      { name: 'text', description: 'The text to convert', optional: false, type: 'text' },
    ],
  },
  {
    name: 'LOWER',
    category: 'Text',
    description: 'Converts text to lowercase',
    syntax: 'LOWER(text)',
    args: [
      { name: 'text', description: 'The text to convert', optional: false, type: 'text' },
    ],
  },
  {
    name: 'PROPER',
    category: 'Text',
    description: 'Capitalizes the first letter of each word',
    syntax: 'PROPER(text)',
    args: [
      { name: 'text', description: 'The text to convert', optional: false, type: 'text' },
    ],
  },
  {
    name: 'TEXT',
    category: 'Text',
    description: 'Formats a number as text with a specified format',
    syntax: 'TEXT(value, format_text)',
    args: [
      { name: 'value', description: 'The number to format', optional: false, type: 'number' },
      { name: 'format_text', description: 'The format pattern', optional: false, type: 'text' },
    ],
    examples: ['=TEXT(1234.5, "$#,##0.00")'],
  },
  {
    name: 'VALUE',
    category: 'Text',
    description: 'Converts a text string to a number',
    syntax: 'VALUE(text)',
    args: [
      { name: 'text', description: 'The text to convert', optional: false, type: 'text' },
    ],
  },
  {
    name: 'FIND',
    category: 'Text',
    description: 'Finds one text string within another (case-sensitive)',
    syntax: 'FIND(find_text, within_text, [start_num])',
    args: [
      { name: 'find_text', description: 'Text to find', optional: false, type: 'text' },
      { name: 'within_text', description: 'Text to search in', optional: false, type: 'text' },
      { name: 'start_num', description: 'Starting position', optional: true, type: 'number' },
    ],
  },
  {
    name: 'SEARCH',
    category: 'Text',
    description: 'Finds one text string within another (case-insensitive)',
    syntax: 'SEARCH(find_text, within_text, [start_num])',
    args: [
      { name: 'find_text', description: 'Text to find', optional: false, type: 'text' },
      { name: 'within_text', description: 'Text to search in', optional: false, type: 'text' },
      { name: 'start_num', description: 'Starting position', optional: true, type: 'number' },
    ],
  },
  {
    name: 'SUBSTITUTE',
    category: 'Text',
    description: 'Substitutes new text for old text in a string',
    syntax: 'SUBSTITUTE(text, old_text, new_text, [instance_num])',
    args: [
      { name: 'text', description: 'The text string', optional: false, type: 'text' },
      { name: 'old_text', description: 'Text to replace', optional: false, type: 'text' },
      { name: 'new_text', description: 'Replacement text', optional: false, type: 'text' },
      { name: 'instance_num', description: 'Which occurrence to replace', optional: true, type: 'number' },
    ],
  },
  {
    name: 'REPLACE',
    category: 'Text',
    description: 'Replaces part of a text string with another string',
    syntax: 'REPLACE(old_text, start_num, num_chars, new_text)',
    args: [
      { name: 'old_text', description: 'The original text', optional: false, type: 'text' },
      { name: 'start_num', description: 'Starting position', optional: false, type: 'number' },
      { name: 'num_chars', description: 'Number of characters to replace', optional: false, type: 'number' },
      { name: 'new_text', description: 'Replacement text', optional: false, type: 'text' },
    ],
  },
  {
    name: 'TODAY',
    category: 'Date & Time',
    description: 'Returns the current date',
    syntax: 'TODAY()',
    args: [],
  },
  {
    name: 'NOW',
    category: 'Date & Time',
    description: 'Returns the current date and time',
    syntax: 'NOW()',
    args: [],
  },
  {
    name: 'DATE',
    category: 'Date & Time',
    description: 'Creates a date from year, month, and day',
    syntax: 'DATE(year, month, day)',
    args: [
      { name: 'year', description: 'The year', optional: false, type: 'number' },
      { name: 'month', description: 'The month (1-12)', optional: false, type: 'number' },
      { name: 'day', description: 'The day (1-31)', optional: false, type: 'number' },
    ],
  },
  {
    name: 'YEAR',
    category: 'Date & Time',
    description: 'Returns the year of a date',
    syntax: 'YEAR(serial_number)',
    args: [
      { name: 'serial_number', description: 'A date value', optional: false, type: 'number' },
    ],
  },
  {
    name: 'MONTH',
    category: 'Date & Time',
    description: 'Returns the month of a date',
    syntax: 'MONTH(serial_number)',
    args: [
      { name: 'serial_number', description: 'A date value', optional: false, type: 'number' },
    ],
  },
  {
    name: 'DAY',
    category: 'Date & Time',
    description: 'Returns the day of a date',
    syntax: 'DAY(serial_number)',
    args: [
      { name: 'serial_number', description: 'A date value', optional: false, type: 'number' },
    ],
  },
  {
    name: 'DATEDIF',
    category: 'Date & Time',
    description: 'Calculates the difference between two dates',
    syntax: 'DATEDIF(start_date, end_date, unit)',
    args: [
      { name: 'start_date', description: 'The start date', optional: false, type: 'number' },
      { name: 'end_date', description: 'The end date', optional: false, type: 'number' },
      { name: 'unit', description: '"Y", "M", "D", "MD", "YM", or "YD"', optional: false, type: 'text' },
    ],
  },
  {
    name: 'ROUND',
    category: 'Math & Trig',
    description: 'Rounds a number to a specified number of digits',
    syntax: 'ROUND(number, num_digits)',
    args: [
      { name: 'number', description: 'The number to round', optional: false, type: 'number' },
      { name: 'num_digits', description: 'Number of decimal places', optional: false, type: 'number' },
    ],
  },
  {
    name: 'ROUNDUP',
    category: 'Math & Trig',
    description: 'Rounds a number up, away from zero',
    syntax: 'ROUNDUP(number, num_digits)',
    args: [
      { name: 'number', description: 'The number to round', optional: false, type: 'number' },
      { name: 'num_digits', description: 'Number of decimal places', optional: false, type: 'number' },
    ],
  },
  {
    name: 'ROUNDDOWN',
    category: 'Math & Trig',
    description: 'Rounds a number down, toward zero',
    syntax: 'ROUNDDOWN(number, num_digits)',
    args: [
      { name: 'number', description: 'The number to round', optional: false, type: 'number' },
      { name: 'num_digits', description: 'Number of decimal places', optional: false, type: 'number' },
    ],
  },
  {
    name: 'ABS',
    category: 'Math & Trig',
    description: 'Returns the absolute value of a number',
    syntax: 'ABS(number)',
    args: [
      { name: 'number', description: 'The number', optional: false, type: 'number' },
    ],
  },
  {
    name: 'SQRT',
    category: 'Math & Trig',
    description: 'Returns the square root of a number',
    syntax: 'SQRT(number)',
    args: [
      { name: 'number', description: 'The number', optional: false, type: 'number' },
    ],
  },
  {
    name: 'POWER',
    category: 'Math & Trig',
    description: 'Returns the result of a number raised to a power',
    syntax: 'POWER(number, power)',
    args: [
      { name: 'number', description: 'The base number', optional: false, type: 'number' },
      { name: 'power', description: 'The exponent', optional: false, type: 'number' },
    ],
  },
  {
    name: 'MOD',
    category: 'Math & Trig',
    description: 'Returns the remainder after division',
    syntax: 'MOD(number, divisor)',
    args: [
      { name: 'number', description: 'The dividend', optional: false, type: 'number' },
      { name: 'divisor', description: 'The divisor', optional: false, type: 'number' },
    ],
  },
  {
    name: 'INT',
    category: 'Math & Trig',
    description: 'Rounds a number down to the nearest integer',
    syntax: 'INT(number)',
    args: [
      { name: 'number', description: 'The number to round', optional: false, type: 'number' },
    ],
  },
  {
    name: 'RAND',
    category: 'Math & Trig',
    description: 'Returns a random number between 0 and 1',
    syntax: 'RAND()',
    args: [],
  },
  {
    name: 'RANDBETWEEN',
    category: 'Math & Trig',
    description: 'Returns a random integer between two numbers',
    syntax: 'RANDBETWEEN(bottom, top)',
    args: [
      { name: 'bottom', description: 'The minimum value', optional: false, type: 'number' },
      { name: 'top', description: 'The maximum value', optional: false, type: 'number' },
    ],
  },
  {
    name: 'SUMIF',
    category: 'Math & Trig',
    description: 'Sums cells that meet a criterion',
    syntax: 'SUMIF(range, criteria, [sum_range])',
    args: [
      { name: 'range', description: 'Range to evaluate', optional: false, type: 'reference' },
      { name: 'criteria', description: 'Condition to apply', optional: false, type: 'any' },
      { name: 'sum_range', description: 'Cells to sum', optional: true, type: 'reference' },
    ],
    examples: ['=SUMIF(A1:A10, ">5")', '=SUMIF(A1:A10, "Apple", B1:B10)'],
  },
  {
    name: 'SUMIFS',
    category: 'Math & Trig',
    description: 'Sums cells that meet multiple criteria',
    syntax: 'SUMIFS(sum_range, criteria_range1, criteria1, [criteria_range2, criteria2], ...)',
    args: [
      { name: 'sum_range', description: 'Cells to sum', optional: false, type: 'reference' },
      { name: 'criteria_range1', description: 'First range to evaluate', optional: false, type: 'reference' },
      { name: 'criteria1', description: 'First condition', optional: false, type: 'any' },
    ],
  },
  {
    name: 'COUNTIF',
    category: 'Statistical',
    description: 'Counts cells that meet a criterion',
    syntax: 'COUNTIF(range, criteria)',
    args: [
      { name: 'range', description: 'Range to evaluate', optional: false, type: 'reference' },
      { name: 'criteria', description: 'Condition to apply', optional: false, type: 'any' },
    ],
  },
  {
    name: 'COUNTIFS',
    category: 'Statistical',
    description: 'Counts cells that meet multiple criteria',
    syntax: 'COUNTIFS(criteria_range1, criteria1, [criteria_range2, criteria2], ...)',
    args: [
      { name: 'criteria_range1', description: 'First range to evaluate', optional: false, type: 'reference' },
      { name: 'criteria1', description: 'First condition', optional: false, type: 'any' },
    ],
  },
  {
    name: 'AVERAGEIF',
    category: 'Statistical',
    description: 'Averages cells that meet a criterion',
    syntax: 'AVERAGEIF(range, criteria, [average_range])',
    args: [
      { name: 'range', description: 'Range to evaluate', optional: false, type: 'reference' },
      { name: 'criteria', description: 'Condition to apply', optional: false, type: 'any' },
      { name: 'average_range', description: 'Cells to average', optional: true, type: 'reference' },
    ],
  },
  {
    name: 'IFERROR',
    category: 'Logical',
    description: 'Returns a value if an error, otherwise returns the result',
    syntax: 'IFERROR(value, value_if_error)',
    args: [
      { name: 'value', description: 'Value or formula to check', optional: false, type: 'any' },
      { name: 'value_if_error', description: 'Value to return if error', optional: false, type: 'any' },
    ],
    examples: ['=IFERROR(A1/B1, 0)'],
  },
  {
    name: 'ISBLANK',
    category: 'Information',
    description: 'Returns TRUE if a cell is empty',
    syntax: 'ISBLANK(value)',
    args: [
      { name: 'value', description: 'The value to check', optional: false, type: 'any' },
    ],
  },
  {
    name: 'ISNUMBER',
    category: 'Information',
    description: 'Returns TRUE if value is a number',
    syntax: 'ISNUMBER(value)',
    args: [
      { name: 'value', description: 'The value to check', optional: false, type: 'any' },
    ],
  },
  {
    name: 'ISTEXT',
    category: 'Information',
    description: 'Returns TRUE if value is text',
    syntax: 'ISTEXT(value)',
    args: [
      { name: 'value', description: 'The value to check', optional: false, type: 'any' },
    ],
  },
];

export class FormulaAutoComplete {
  private state: AutoCompleteState;
  private namedRanges: Map<string, string> = new Map();
  private recentFunctions: string[] = [];
  private maxRecentFunctions = 10;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): AutoCompleteState {
    return {
      isVisible: false,
      suggestions: [],
      selectedIndex: 0,
      triggerPosition: 0,
      currentToken: '',
    };
  }

  // ===========================================================================
  // Primary API: analyze() and suggest()
  // ===========================================================================

  /**
   * Analyze a formula at the cursor position.
   * Returns complete context including:
   * - Nested function stack
   * - Current argument index
   * - Token being typed
   * - Whether expecting a reference
   *
   * Performance: O(n) single pass from start to cursor.
   *
   * @param formula - The formula text (should start with =)
   * @param cursor - Cursor position (0-based)
   * @returns FormulaContext with complete parsing state
   */
  analyze(formula: string, cursor: number): FormulaContext {
    // Initialize context
    const context: FormulaContext = {
      isFormula: formula.startsWith('='),
      formula,
      cursor,
      currentToken: '',
      tokenStartPos: cursor,
      functionStack: [],
      currentFunction: null,
      insideString: false,
      expectsReference: false,
      typingFunctionName: false,
      parenDepth: 0,
      error: null,
    };

    if (!context.isFormula) {
      return context;
    }

    // Parse from after '=' to cursor position
    const parseEnd = Math.min(cursor, formula.length);
    let pos = 1; // Start after '='
    let tokenStart = 1;
    let inString = false;
    let stringChar = '';
    const functionStack: FunctionCallInfo[] = [];

    // Characters that break tokens
    const isTokenBreaker = (c: string): boolean => {
      return '+-*/^&=<>(),: \t\n'.includes(c);
    };

    // Characters that indicate expecting a reference
    const expectsRefAfter = (c: string): boolean => {
      return '=+-*/^&<>(:,'.includes(c);
    };

    while (pos < parseEnd) {
      const char = formula[pos];

      // Handle string literals
      if (inString) {
        if (char === stringChar) {
          // Check for escaped quote (double quote in strings)
          if (pos + 1 < parseEnd && formula[pos + 1] === stringChar) {
            pos += 2;
            continue;
          }
          inString = false;
        }
        pos++;
        continue;
      }

      // Start of string
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        tokenStart = pos + 1;
        pos++;
        continue;
      }

      // Opening parenthesis - might be a function call
      if (char === '(') {
        // Check if we have a function name before the paren
        const tokenBefore = formula.slice(tokenStart, pos).trim().toUpperCase();

        if (tokenBefore && /^[A-Z_][A-Z0-9_.]*$/.test(tokenBefore)) {
          // This is a function call
          const funcInfo = this.getFunctionInfo(tokenBefore);
          functionStack.push({
            name: tokenBefore,
            info: funcInfo,
            openParenPos: pos,
            argIndex: 0,
            argStartPos: pos + 1,
          });
        } else {
          // Just a grouping parenthesis, push a placeholder
          functionStack.push({
            name: '',
            info: null,
            openParenPos: pos,
            argIndex: 0,
            argStartPos: pos + 1,
          });
        }

        context.parenDepth++;
        tokenStart = pos + 1;
        pos++;
        continue;
      }

      // Closing parenthesis
      if (char === ')') {
        if (functionStack.length > 0) {
          functionStack.pop();
        }
        context.parenDepth = Math.max(0, context.parenDepth - 1);
        tokenStart = pos + 1;
        pos++;
        continue;
      }

      // Comma - next argument
      if (char === ',') {
        if (functionStack.length > 0) {
          const currentFunc = functionStack[functionStack.length - 1];
          currentFunc.argIndex++;
          currentFunc.argStartPos = pos + 1;
        }
        tokenStart = pos + 1;
        pos++;
        continue;
      }

      // Other token breakers
      if (isTokenBreaker(char)) {
        tokenStart = pos + 1;
        pos++;
        continue;
      }

      // Regular character - part of a token
      pos++;
    }

    // Calculate the current token (from tokenStart to cursor)
    let currentToken = formula.slice(tokenStart, cursor);

    // Skip leading whitespace in token
    const trimmedStart = currentToken.search(/\S/);
    if (trimmedStart > 0) {
      tokenStart += trimmedStart;
      currentToken = currentToken.slice(trimmedStart);
    }

    // Set context values
    context.currentToken = currentToken;
    context.tokenStartPos = tokenStart;
    context.insideString = inString;
    context.functionStack = [...functionStack];
    context.currentFunction = functionStack.length > 0
      ? functionStack[functionStack.length - 1]
      : null;

    // Determine if we're typing a function name
    // This is true after '=', '(', ',', or operators when the token looks like a function name start
    if (currentToken.length > 0) {
      const charBefore = tokenStart > 1 ? formula[tokenStart - 1] : '=';
      context.typingFunctionName = expectsRefAfter(charBefore) &&
        /^[A-Z_]/i.test(currentToken);
    }

    // Determine if we expect a reference
    if (!inString && tokenStart > 1) {
      const charBefore = formula[tokenStart - 1];
      context.expectsReference = expectsRefAfter(charBefore);
    }

    return context;
  }

  /**
   * Get function suggestions based on the formula context.
   *
   * @param context - FormulaContext from analyze()
   * @returns Array of function suggestions sorted by relevance
   */
  suggest(context: FormulaContext): FunctionSuggestion[] {
    if (!context.isFormula || context.insideString) {
      return [];
    }

    const token = context.currentToken.toUpperCase();

    // If we're not typing anything or the token is too short, no suggestions
    if (token.length === 0) {
      return [];
    }

    // Don't suggest if token looks like a cell reference (e.g., A1, B$2)
    if (/^[A-Z]{1,3}\$?\d/.test(token) || /^\$[A-Z]{1,3}/.test(token)) {
      return [];
    }

    const suggestions: FunctionSuggestion[] = [];

    for (const func of FUNCTION_LIBRARY) {
      const nameUpper = func.name.toUpperCase();

      // Check for match
      let score = 0;

      if (nameUpper === token) {
        // Exact match
        score = 1000;
      } else if (nameUpper.startsWith(token)) {
        // Prefix match - higher score for shorter functions (more relevant)
        score = 100 - func.name.length;
      } else if (nameUpper.includes(token)) {
        // Contains match
        score = 10;
      } else {
        continue; // No match
      }

      // Boost recent functions
      const recentIndex = this.recentFunctions.indexOf(func.name);
      const isRecent = recentIndex !== -1;
      if (isRecent) {
        score += 50 - recentIndex * 5;
      }

      suggestions.push({
        name: func.name,
        info: func,
        score,
        insertText: func.name + '(',
        cursorOffset: func.name.length + 1,
        signature: func.syntax,
        description: func.description,
        isRecent,
      });
    }

    // Sort by score descending
    suggestions.sort((a, b) => b.score - a.score);

    // Limit results
    return suggestions.slice(0, 10);
  }

  /**
   * Get argument hint for the current function context.
   *
   * @param context - FormulaContext from analyze()
   * @returns ArgumentHint with highlighted signature, or null if not in a function
   */
  getArgumentHint(context: FormulaContext): ArgumentHint | null {
    const func = context.currentFunction;
    if (!func || !func.info || !func.name) {
      return null;
    }

    const info = func.info;
    const argIndex = func.argIndex;

    // Get current argument info
    let currentArg: FunctionArg | null = null;
    if (argIndex < info.args.length) {
      currentArg = info.args[argIndex];
    } else if (info.args.length > 0) {
      // Check for repeating last argument
      const lastArg = info.args[info.args.length - 1];
      if (lastArg.repeating) {
        currentArg = lastArg;
      }
    }

    // Build highlighted signature
    const parts: string[] = [info.name, '('];
    let highlightStart = -1;
    let highlightEnd = -1;

    for (let i = 0; i < info.args.length; i++) {
      if (i > 0) {
        parts.push(', ');
      }

      const arg = info.args[i];
      const argText = arg.optional ? `[${arg.name}]` : arg.name;

      // Mark highlight position
      if (i === argIndex || (argIndex >= info.args.length && arg.repeating)) {
        highlightStart = parts.join('').length;
        parts.push(argText);
        highlightEnd = parts.join('').length;
      } else {
        parts.push(argText);
      }

      if (arg.repeating) {
        parts.push(', ...');
        break;
      }
    }

    parts.push(')');
    const signature = parts.join('');

    // Create highlighted version with markers
    let highlightedSignature = signature;
    let highlightRange: { start: number; end: number } | null = null;

    if (highlightStart >= 0 && highlightEnd > highlightStart) {
      highlightRange = { start: highlightStart, end: highlightEnd };
      // Insert markers for highlighting (UI layer interprets these)
      highlightedSignature =
        signature.slice(0, highlightStart) +
        '«' + signature.slice(highlightStart, highlightEnd) + '»' +
        signature.slice(highlightEnd);
    }

    return {
      signature,
      currentArg,
      argIndex,
      argCount: info.args.length,
      hasMoreArgs: info.args.length > 0 && info.args[info.args.length - 1].repeating === true,
      highlightedSignature,
      highlightRange,
    };
  }

  // ===========================================================================
  // State Management
  // ===========================================================================

  getState(): Readonly<AutoCompleteState> {
    return { ...this.state };
  }

  isVisible(): boolean {
    return this.state.isVisible;
  }

  getSuggestions(): AutoCompleteSuggestion[] {
    return [...this.state.suggestions];
  }

  getSelectedSuggestion(): AutoCompleteSuggestion | null {
    if (!this.state.isVisible || this.state.suggestions.length === 0) {
      return null;
    }
    return this.state.suggestions[this.state.selectedIndex];
  }

  // ===========================================================================
  // Named Ranges
  // ===========================================================================

  setNamedRanges(namedRanges: Map<string, string>): void {
    this.namedRanges = new Map(namedRanges);
  }

  addNamedRange(name: string, reference: string): void {
    this.namedRanges.set(name, reference);
  }

  // ===========================================================================
  // Update Suggestions
  // ===========================================================================

  /**
   * Update auto-complete based on current formula text and cursor position
   */
  update(formulaText: string, cursorPosition: number): void {
    // Only show for formulas
    if (!formulaText.startsWith('=')) {
      this.hide();
      return;
    }

    // Extract the token being typed
    const textBeforeCursor = formulaText.slice(1, cursorPosition); // Remove leading =
    const token = this.extractCurrentToken(textBeforeCursor);

    if (!token || token.length < 1) {
      this.hide();
      return;
    }

    // Get suggestions based on token
    const suggestions = this.getSuggestionsForToken(token);

    if (suggestions.length === 0) {
      this.hide();
      return;
    }

    this.state = {
      isVisible: true,
      suggestions,
      selectedIndex: 0,
      triggerPosition: cursorPosition - token.length,
      currentToken: token,
    };
  }

  /**
   * Hide auto-complete
   */
  hide(): void {
    this.state = this.createInitialState();
  }

  // ===========================================================================
  // Navigation
  // ===========================================================================

  /**
   * Move selection up
   */
  selectPrevious(): void {
    if (!this.state.isVisible || this.state.suggestions.length === 0) return;

    this.state.selectedIndex =
      (this.state.selectedIndex - 1 + this.state.suggestions.length) %
      this.state.suggestions.length;
  }

  /**
   * Move selection down
   */
  selectNext(): void {
    if (!this.state.isVisible || this.state.suggestions.length === 0) return;

    this.state.selectedIndex =
      (this.state.selectedIndex + 1) % this.state.suggestions.length;
  }

  /**
   * Select by index
   */
  selectIndex(index: number): void {
    if (!this.state.isVisible) return;
    if (index >= 0 && index < this.state.suggestions.length) {
      this.state.selectedIndex = index;
    }
  }

  // ===========================================================================
  // Accept Suggestion
  // ===========================================================================

  /**
   * Accept the currently selected suggestion
   * Returns the text to insert and cursor offset
   */
  accept(): { insertText: string; cursorOffset: number; replaceLength: number } | null {
    const suggestion = this.getSelectedSuggestion();
    if (!suggestion) return null;

    // Track recently used functions
    if (suggestion.type === 'function') {
      this.trackRecentFunction(suggestion.text);
    }

    const result = {
      insertText: suggestion.insertText,
      cursorOffset: suggestion.cursorOffset ?? suggestion.insertText.length,
      replaceLength: this.state.currentToken.length,
    };

    this.hide();
    return result;
  }

  // ===========================================================================
  // Function Info
  // ===========================================================================

  /**
   * Get function info for a function name
   */
  getFunctionInfo(functionName: string): FunctionInfo | null {
    return FUNCTION_LIBRARY.find(
      f => f.name.toUpperCase() === functionName.toUpperCase()
    ) ?? null;
  }

  /**
   * Get argument info for a function at a given argument index.
   * Simpler alternative to getArgumentHint() when you don't have full context.
   *
   * @param functionName - The function name
   * @param argIndex - The 0-based argument index
   * @returns FunctionArg info or null
   */
  getArgumentAtIndex(functionName: string, argIndex: number): FunctionArg | null {
    const funcInfo = this.getFunctionInfo(functionName);
    if (!funcInfo) return null;

    if (argIndex < funcInfo.args.length) {
      return funcInfo.args[argIndex];
    }

    // Check for repeating last argument
    const lastArg = funcInfo.args[funcInfo.args.length - 1];
    if (lastArg?.repeating) {
      return lastArg;
    }

    return null;
  }

  /**
   * Get all functions in a category
   */
  getFunctionsByCategory(category: string): FunctionInfo[] {
    return FUNCTION_LIBRARY.filter(f => f.category === category);
  }

  /**
   * Get all function categories
   */
  getCategories(): string[] {
    const categories = new Set(FUNCTION_LIBRARY.map(f => f.category));
    return Array.from(categories).sort();
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private extractCurrentToken(text: string): string {
    // Find the start of the current token
    // A token ends at operators, parentheses, commas, or spaces
    const tokenBreakers = /[+\-*/%^&=<>(),\s:]/;

    let start = text.length;
    for (let i = text.length - 1; i >= 0; i--) {
      if (tokenBreakers.test(text[i])) {
        break;
      }
      start = i;
    }

    return text.slice(start);
  }

  private getSuggestionsForToken(token: string): AutoCompleteSuggestion[] {
    const tokenUpper = token.toUpperCase();
    const suggestions: AutoCompleteSuggestion[] = [];

    // Add matching functions
    const matchingFunctions = FUNCTION_LIBRARY.filter(f =>
      f.name.toUpperCase().startsWith(tokenUpper)
    );

    // Sort: recent functions first, then alphabetically
    matchingFunctions.sort((a, b) => {
      const aRecent = this.recentFunctions.indexOf(a.name);
      const bRecent = this.recentFunctions.indexOf(b.name);

      if (aRecent !== -1 && bRecent === -1) return -1;
      if (aRecent === -1 && bRecent !== -1) return 1;
      if (aRecent !== -1 && bRecent !== -1) return aRecent - bRecent;

      return a.name.localeCompare(b.name);
    });

    for (const func of matchingFunctions.slice(0, 10)) {
      suggestions.push({
        type: 'function',
        text: func.name,
        displayText: func.name,
        description: func.description,
        insertText: func.name + '(',
        cursorOffset: func.name.length + 1, // Place cursor inside parentheses
      });
    }

    // Add matching named ranges
    for (const [name, reference] of this.namedRanges) {
      if (name.toUpperCase().startsWith(tokenUpper)) {
        suggestions.push({
          type: 'namedRange',
          text: name,
          displayText: name,
          description: `Named range: ${reference}`,
          insertText: name,
        });
      }
    }

    return suggestions;
  }

  private trackRecentFunction(name: string): void {
    // Remove if already in list
    const existingIndex = this.recentFunctions.indexOf(name);
    if (existingIndex !== -1) {
      this.recentFunctions.splice(existingIndex, 1);
    }

    // Add to front
    this.recentFunctions.unshift(name);

    // Trim to max size
    if (this.recentFunctions.length > this.maxRecentFunctions) {
      this.recentFunctions.pop();
    }
  }
}

// Export the function library for external use
export { FUNCTION_LIBRARY };
