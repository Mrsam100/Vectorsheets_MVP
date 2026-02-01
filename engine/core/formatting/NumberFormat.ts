/**
 * VectorSheet Engine - Number Format Engine
 *
 * Production-grade number formatting with Excel-compatible format strings.
 * Designed for per-cell rendering performance.
 *
 * Supported formats:
 * - General
 * - Number (0, 0.00, #,##0, #,##0.00)
 * - Currency ($, €, £, ¥ with various patterns)
 * - Percentage (0%, 0.00%)
 * - Date (yyyy, mm, dd, etc.)
 * - Time (hh, mm, ss, AM/PM)
 * - Scientific (0.00E+00)
 * - Fraction (# ?/?, # ??/??)
 * - Custom tokens and sections
 *
 * Design:
 * - Deterministic: Same inputs always produce same outputs
 * - Fast: O(tokens) formatting with cached parsing
 * - Locale-ready: All locale-specific strings abstracted
 * - Pure: No side effects, no engine coupling
 */

// =============================================================================
// Types - Format Tokens
// =============================================================================

export type FormatToken =
  | { type: 'literal'; value: string }
  | { type: 'digit'; char: '0' | '#' | '?' }
  | { type: 'decimal' }
  | { type: 'thousands' }
  | { type: 'percent' }
  | { type: 'scientific'; sign: '+' | '-' | '' }
  | { type: 'fraction'; numerator: string; denominator: string }
  | { type: 'date'; pattern: DatePattern }
  | { type: 'time'; pattern: TimePattern }
  | { type: 'elapsed'; unit: 'h' | 'm' | 's' }
  | { type: 'ampm'; upper: boolean }
  | { type: 'text' }
  | { type: 'fill'; char: string }
  | { type: 'skip'; width: number }
  | { type: 'currency'; symbol: string }
  | { type: 'color'; color: string }
  | { type: 'condition'; operator: ConditionOperator; value: number };

export type DatePattern =
  | 'yyyy' | 'yy'
  | 'mmmm' | 'mmm' | 'mm' | 'm'
  | 'dddd' | 'ddd' | 'dd' | 'd';

export type TimePattern =
  | 'hh' | 'h'
  | 'mm' | 'm'
  | 'ss' | 's'
  | 'ss.0' | 'ss.00' | 'ss.000';

export type ConditionOperator = '<' | '<=' | '>' | '>=' | '=' | '<>';

// =============================================================================
// Types - Parsed Format
// =============================================================================

export interface FormatSection {
  /** Tokens for this section */
  tokens: FormatToken[];
  /** Color override (from [Red], [Blue], etc.) */
  color?: string;
  /** Condition for this section (from [>100], etc.) */
  condition?: { operator: ConditionOperator; value: number };
  /** Whether this section is for negative values (has implicit negation) */
  isNegativeSection: boolean;
  /** Scaling factor (thousands divisor from trailing commas) */
  scale: number;
  /** Number of integer digit positions */
  integerDigits: { zeros: number; hashes: number; questions: number };
  /** Number of decimal digit positions */
  decimalDigits: { zeros: number; hashes: number; questions: number };
  /** Has thousands separator */
  hasThousands: boolean;
  /** Has percent symbol */
  hasPercent: boolean;
  /** Is scientific notation */
  isScientific: boolean;
  /** Is fraction format */
  isFraction: boolean;
}

export interface ParsedFormat {
  /** Original format string */
  original: string;
  /** Format sections (up to 4: positive, negative, zero, text) */
  sections: FormatSection[];
  /** Is this a date/time format */
  isDateTime: boolean;
  /** Is this a text-only format */
  isText: boolean;
  /** Is this the General format */
  isGeneral: boolean;
}

// =============================================================================
// Types - Format Result
// =============================================================================

export interface FormatResult {
  /** Formatted display text */
  text: string;
  /** Text color (if specified in format) */
  color?: string;
  /** Is the original value negative */
  isNegative: boolean;
  /** Alignment hint ('left' for text, 'right' for numbers) */
  align: 'left' | 'right' | 'center';
}

// =============================================================================
// Types - Locale
// =============================================================================

export interface FormatLocale {
  /** Decimal separator */
  decimal: string;
  /** Thousands separator */
  thousands: string;
  /** Currency symbol */
  currency: string;
  /** Month names (full) */
  monthsFull: string[];
  /** Month names (abbreviated) */
  monthsShort: string[];
  /** Day names (full) */
  daysFull: string[];
  /** Day names (abbreviated) */
  daysShort: string[];
  /** AM string */
  am: string;
  /** PM string */
  pm: string;
  /** Date order: 'mdy', 'dmy', 'ymd' */
  dateOrder: 'mdy' | 'dmy' | 'ymd';
}

/** Default locale (US English) */
export const DEFAULT_LOCALE: FormatLocale = {
  decimal: '.',
  thousands: ',',
  currency: '$',
  monthsFull: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
  monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  daysFull: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  am: 'AM',
  pm: 'PM',
  dateOrder: 'mdy',
};

// =============================================================================
// Built-in Format Codes
// =============================================================================

export const BUILTIN_FORMATS: Record<number, string> = {
  0: 'General',
  1: '0',
  2: '0.00',
  3: '#,##0',
  4: '#,##0.00',
  5: '$#,##0_);($#,##0)',
  6: '$#,##0_);[Red]($#,##0)',
  7: '$#,##0.00_);($#,##0.00)',
  8: '$#,##0.00_);[Red]($#,##0.00)',
  9: '0%',
  10: '0.00%',
  11: '0.00E+00',
  12: '# ?/?',
  13: '# ??/??',
  14: 'mm-dd-yy',
  15: 'd-mmm-yy',
  16: 'd-mmm',
  17: 'mmm-yy',
  18: 'h:mm AM/PM',
  19: 'h:mm:ss AM/PM',
  20: 'h:mm',
  21: 'h:mm:ss',
  22: 'm/d/yy h:mm',
  37: '#,##0_);(#,##0)',
  38: '#,##0_);[Red](#,##0)',
  39: '#,##0.00_);(#,##0.00)',
  40: '#,##0.00_);[Red](#,##0.00)',
  45: 'mm:ss',
  46: '[h]:mm:ss',
  47: 'mmss.0',
  48: '##0.0E+0',
  49: '@',
};

// =============================================================================
// NumberFormat Class
// =============================================================================

export class NumberFormat {
  /** Cache for parsed formats */
  private cache: Map<string, ParsedFormat> = new Map();

  /** Current locale */
  private locale: FormatLocale;

  constructor(locale: FormatLocale = DEFAULT_LOCALE) {
    this.locale = locale;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Parse a format string into an internal representation.
   * Results are cached for performance.
   *
   * @param formatString Excel-style format string
   * @returns Parsed format structure
   */
  parse(formatString: string): ParsedFormat {
    const cached = this.cache.get(formatString);
    if (cached) return cached;

    const parsed = this.parseFormatString(formatString);
    this.cache.set(formatString, parsed);
    return parsed;
  }

  /**
   * Format a value using a pre-parsed format.
   *
   * @param value The raw value to format
   * @param parsedFormat Pre-parsed format from parse()
   * @returns Formatted result with text and metadata
   */
  format(
    value: number | string | boolean | null | undefined,
    parsedFormat: ParsedFormat
  ): FormatResult {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return { text: '', isNegative: false, align: 'right' };
    }

    // Handle General format
    if (parsedFormat.isGeneral) {
      return this.formatGeneral(value);
    }

    // Handle text format
    if (parsedFormat.isText) {
      return this.formatAsText(value, parsedFormat);
    }

    // Handle boolean
    if (typeof value === 'boolean') {
      return { text: value ? 'TRUE' : 'FALSE', isNegative: false, align: 'center' };
    }

    // Handle string input
    if (typeof value === 'string') {
      // Try to parse as number for numeric formats
      const num = parseFloat(value);
      if (!isNaN(num) && !parsedFormat.isDateTime) {
        return this.formatNumber(num, parsedFormat);
      }
      return this.formatAsText(value, parsedFormat);
    }

    // Handle number
    if (typeof value === 'number') {
      if (!isFinite(value)) {
        return { text: isNaN(value) ? '#NUM!' : (value > 0 ? '∞' : '-∞'), isNegative: value < 0, align: 'right' };
      }

      if (parsedFormat.isDateTime) {
        return this.formatDateTime(value, parsedFormat);
      }

      return this.formatNumber(value, parsedFormat);
    }

    return { text: String(value), isNegative: false, align: 'left' };
  }

  /**
   * Convenience method: parse and format in one call.
   */
  formatValue(
    value: number | string | boolean | null | undefined,
    formatString: string
  ): FormatResult {
    return this.format(value, this.parse(formatString));
  }

  /**
   * Get built-in format string by ID.
   */
  getBuiltinFormat(id: number): string {
    return BUILTIN_FORMATS[id] ?? 'General';
  }

  /**
   * Check if a format string is a date/time format.
   */
  isDateTimeFormat(formatString: string): boolean {
    return this.parse(formatString).isDateTime;
  }

  /**
   * Set locale for formatting.
   */
  setLocale(locale: FormatLocale): void {
    this.locale = locale;
    // Clear cache when locale changes
    this.cache.clear();
  }

  /**
   * Get current locale.
   */
  getLocale(): FormatLocale {
    return this.locale;
  }

  /**
   * Clear the format cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ===========================================================================
  // Format Parsing
  // ===========================================================================

  private parseFormatString(formatString: string): ParsedFormat {
    // Handle General format
    if (formatString === 'General' || formatString === '') {
      return {
        original: formatString,
        sections: [],
        isDateTime: false,
        isText: false,
        isGeneral: true,
      };
    }

    // Split into sections (up to 4: positive; negative; zero; text)
    const sectionStrings = this.splitSections(formatString);
    const sections = sectionStrings.map((s, i) => this.parseSection(s, i === 1));

    // Detect if this is a date/time format
    const isDateTime = sections.some((section) =>
      section.tokens.some((t) =>
        t.type === 'date' || t.type === 'time' || t.type === 'ampm' || t.type === 'elapsed'
      )
    );

    // Detect if this is a text-only format
    const isText =
      formatString === '@' ||
      (sections.length === 1 &&
        sections[0].tokens.length === 1 &&
        sections[0].tokens[0].type === 'text');

    return {
      original: formatString,
      sections,
      isDateTime,
      isText,
      isGeneral: false,
    };
  }

  private splitSections(formatString: string): string[] {
    const sections: string[] = [];
    let current = '';
    let inQuotes = false;
    let inBrackets = false;

    for (let i = 0; i < formatString.length; i++) {
      const char = formatString[i];

      if (char === '"' && !inBrackets) {
        inQuotes = !inQuotes;
        current += char;
      } else if (char === '[' && !inQuotes) {
        inBrackets = true;
        current += char;
      } else if (char === ']' && !inQuotes) {
        inBrackets = false;
        current += char;
      } else if (char === ';' && !inQuotes && !inBrackets) {
        sections.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    sections.push(current);
    return sections;
  }

  private parseSection(sectionStr: string, isNegativeSection: boolean): FormatSection {
    const tokens: FormatToken[] = [];
    let color: string | undefined;
    let condition: { operator: ConditionOperator; value: number } | undefined;
    let scale = 0;
    let hasThousands = false;
    let hasPercent = false;
    let isScientific = false;
    let isFraction = false;

    const integerDigits = { zeros: 0, hashes: 0, questions: 0 };
    const decimalDigits = { zeros: 0, hashes: 0, questions: 0 };
    let inDecimal = false;
    let inFraction = false;

    let i = 0;
    while (i < sectionStr.length) {
      const char = sectionStr[i];

      // Bracket content: [Red], [>100], [h], [$-409], etc.
      if (char === '[') {
        const endBracket = sectionStr.indexOf(']', i);
        if (endBracket !== -1) {
          const content = sectionStr.slice(i + 1, endBracket);
          const parsed = this.parseBracketContent(content);

          if (parsed.color) {
            color = parsed.color;
            tokens.push({ type: 'color', color: parsed.color });
          } else if (parsed.condition) {
            condition = parsed.condition;
            tokens.push({ type: 'condition', ...parsed.condition });
          } else if (parsed.elapsed) {
            tokens.push({ type: 'elapsed', unit: parsed.elapsed });
          } else if (parsed.currency) {
            tokens.push({ type: 'currency', symbol: parsed.currency });
          }

          i = endBracket + 1;
          continue;
        }
      }

      // Quoted literal
      if (char === '"') {
        const endQuote = sectionStr.indexOf('"', i + 1);
        if (endQuote !== -1) {
          tokens.push({ type: 'literal', value: sectionStr.slice(i + 1, endQuote) });
          i = endQuote + 1;
          continue;
        }
      }

      // Escaped character
      if (char === '\\') {
        if (i + 1 < sectionStr.length) {
          tokens.push({ type: 'literal', value: sectionStr[i + 1] });
          i += 2;
          continue;
        }
      }

      // Underscore (space for character width alignment)
      if (char === '_') {
        if (i + 1 < sectionStr.length) {
          tokens.push({ type: 'skip', width: 1 });
          i += 2;
          continue;
        }
      }

      // Asterisk (repeat to fill)
      if (char === '*') {
        if (i + 1 < sectionStr.length) {
          tokens.push({ type: 'fill', char: sectionStr[i + 1] });
          i += 2;
          continue;
        }
      }

      // Digit placeholders
      if (char === '0' || char === '#' || char === '?') {
        tokens.push({ type: 'digit', char });

        if (inFraction) {
          // Fraction digits handled separately
        } else if (inDecimal) {
          if (char === '0') decimalDigits.zeros++;
          else if (char === '#') decimalDigits.hashes++;
          else decimalDigits.questions++;
        } else {
          if (char === '0') integerDigits.zeros++;
          else if (char === '#') integerDigits.hashes++;
          else integerDigits.questions++;
        }

        i++;
        continue;
      }

      // Decimal point
      if (char === '.') {
        tokens.push({ type: 'decimal' });
        inDecimal = true;
        i++;
        continue;
      }

      // Thousands separator or scaling
      if (char === ',') {
        // Check if this is a scaling comma (at end or followed by more commas)
        const nextChar = sectionStr[i + 1];
        const isScaling =
          nextChar === ',' ||
          nextChar === ')' ||
          nextChar === undefined ||
          nextChar === ';' ||
          (nextChar === '.' && !sectionStr.slice(i + 2).match(/[0#?]/));

        if (isScaling) {
          scale++;
        } else {
          hasThousands = true;
          tokens.push({ type: 'thousands' });
        }
        i++;
        continue;
      }

      // Percentage
      if (char === '%') {
        hasPercent = true;
        tokens.push({ type: 'percent' });
        i++;
        continue;
      }

      // Scientific notation
      if ((char === 'E' || char === 'e') && i + 1 < sectionStr.length) {
        const nextChar = sectionStr[i + 1];
        if (nextChar === '+' || nextChar === '-') {
          isScientific = true;
          tokens.push({ type: 'scientific', sign: nextChar });
          i += 2;
          continue;
        } else if (nextChar === '0' || nextChar === '#') {
          isScientific = true;
          tokens.push({ type: 'scientific', sign: '' });
          i++;
          continue;
        }
      }

      // Fraction
      if (char === '/') {
        isFraction = true;
        inFraction = true;
        // Parse numerator and denominator patterns
        // For simplicity, mark this and handle in formatting
        tokens.push({ type: 'fraction', numerator: '?', denominator: '?' });
        i++;
        continue;
      }

      // Text placeholder
      if (char === '@') {
        tokens.push({ type: 'text' });
        i++;
        continue;
      }

      // Date/Time patterns
      const dateTimeResult = this.parseDateTimePattern(sectionStr, i);
      if (dateTimeResult) {
        tokens.push(dateTimeResult.token);
        i += dateTimeResult.length;
        continue;
      }

      // Currency symbols
      if ('$€£¥₹₽¢'.includes(char)) {
        tokens.push({ type: 'currency', symbol: char });
        i++;
        continue;
      }

      // Other characters as literals
      if (char !== ' ' || tokens.length > 0) {
        tokens.push({ type: 'literal', value: char });
      }
      i++;
    }

    return {
      tokens,
      color,
      condition,
      isNegativeSection,
      scale,
      integerDigits,
      decimalDigits,
      hasThousands,
      hasPercent,
      isScientific,
      isFraction,
    };
  }

  private parseBracketContent(content: string): {
    color?: string;
    condition?: { operator: ConditionOperator; value: number };
    elapsed?: 'h' | 'm' | 's';
    currency?: string;
  } {
    // Color names
    const colorMap: Record<string, string> = {
      red: '#FF0000',
      green: '#00FF00',
      blue: '#0000FF',
      yellow: '#FFFF00',
      cyan: '#00FFFF',
      magenta: '#FF00FF',
      white: '#FFFFFF',
      black: '#000000',
    };

    const lowerContent = content.toLowerCase();
    if (colorMap[lowerContent]) {
      return { color: colorMap[lowerContent] };
    }

    // Color by index [Color1] through [Color56]
    const colorIndexMatch = content.match(/^Color(\d+)$/i);
    if (colorIndexMatch) {
      // Return a placeholder - real implementation would use Excel's color palette
      return { color: `color${colorIndexMatch[1]}` };
    }

    // Condition: [>100], [<=50], etc.
    const conditionMatch = content.match(/^(<>|<=|>=|<|>|=)(-?\d+\.?\d*)$/);
    if (conditionMatch) {
      return {
        condition: {
          operator: conditionMatch[1] as ConditionOperator,
          value: parseFloat(conditionMatch[2]),
        },
      };
    }

    // Elapsed time: [h], [m], [s]
    if (content.toLowerCase() === 'h' || content.toLowerCase() === 'm' || content.toLowerCase() === 's') {
      return { elapsed: content.toLowerCase() as 'h' | 'm' | 's' };
    }

    // Currency with locale: [$€-407]
    const currencyMatch = content.match(/^\$([^-]*)/);
    if (currencyMatch) {
      return { currency: currencyMatch[1] || this.locale.currency };
    }

    return {};
  }

  private parseDateTimePattern(
    str: string,
    pos: number
  ): { token: FormatToken; length: number } | null {
    const remaining = str.slice(pos);

    // AM/PM patterns (check first due to length)
    const ampmPatterns = ['AM/PM', 'am/pm', 'A/P', 'a/p'];
    for (const pattern of ampmPatterns) {
      if (remaining.toLowerCase().startsWith(pattern.toLowerCase())) {
        return {
          token: { type: 'ampm', upper: pattern[0] === 'A' },
          length: pattern.length,
        };
      }
    }

    // Date patterns (longest first)
    const datePatterns: DatePattern[] = ['yyyy', 'yy', 'mmmm', 'mmm', 'mm', 'm', 'dddd', 'ddd', 'dd', 'd'];
    for (const pattern of datePatterns) {
      if (remaining.toLowerCase().startsWith(pattern)) {
        return {
          token: { type: 'date', pattern },
          length: pattern.length,
        };
      }
    }

    // Time patterns (check for fractional seconds)
    if (remaining.toLowerCase().startsWith('ss.000')) {
      return { token: { type: 'time', pattern: 'ss.000' }, length: 6 };
    }
    if (remaining.toLowerCase().startsWith('ss.00')) {
      return { token: { type: 'time', pattern: 'ss.00' }, length: 5 };
    }
    if (remaining.toLowerCase().startsWith('ss.0')) {
      return { token: { type: 'time', pattern: 'ss.0' }, length: 4 };
    }

    const timePatterns: TimePattern[] = ['hh', 'h', 'ss', 's'];
    for (const pattern of timePatterns) {
      if (remaining.toLowerCase().startsWith(pattern)) {
        return {
          token: { type: 'time', pattern },
          length: pattern.length,
        };
      }
    }

    return null;
  }

  // ===========================================================================
  // General Format
  // ===========================================================================

  private formatGeneral(value: number | string | boolean | null | undefined): FormatResult {
    if (value === null || value === undefined) {
      return { text: '', isNegative: false, align: 'right' };
    }

    if (typeof value === 'boolean') {
      return { text: value ? 'TRUE' : 'FALSE', isNegative: false, align: 'center' };
    }

    if (typeof value === 'string') {
      return { text: value, isNegative: false, align: 'left' };
    }

    if (typeof value === 'number') {
      if (!isFinite(value)) {
        return {
          text: isNaN(value) ? '#NUM!' : (value > 0 ? '∞' : '-∞'),
          isNegative: value < 0,
          align: 'right',
        };
      }

      const isNegative = value < 0;
      const absValue = Math.abs(value);

      // General format rules:
      // - Up to 11 significant digits
      // - Scientific notation for very large/small numbers
      // - No trailing zeros after decimal

      if (absValue === 0) {
        return { text: '0', isNegative: false, align: 'right' };
      }

      if (absValue >= 1e11 || (absValue < 1e-4 && absValue > 0)) {
        // Use scientific notation
        const exp = Math.floor(Math.log10(absValue));
        const mantissa = absValue / Math.pow(10, exp);
        const mantissaStr = mantissa.toPrecision(6).replace(/\.?0+$/, '');
        const text = `${isNegative ? '-' : ''}${mantissaStr}E${exp >= 0 ? '+' : ''}${exp}`;
        return { text, isNegative, align: 'right' };
      }

      // Regular number formatting
      let text: string;
      if (Number.isInteger(absValue)) {
        text = absValue.toString();
      } else {
        // Limit to reasonable precision and remove trailing zeros
        text = absValue.toPrecision(10).replace(/\.?0+$/, '');
        // Handle scientific notation from toPrecision
        if (text.includes('e')) {
          text = absValue.toString();
        }
      }

      if (isNegative) {
        text = '-' + text;
      }

      return { text, isNegative, align: 'right' };
    }

    return { text: String(value), isNegative: false, align: 'left' };
  }

  // ===========================================================================
  // Number Formatting
  // ===========================================================================

  private formatNumber(value: number, parsedFormat: ParsedFormat): FormatResult {
    const section = this.selectSection(parsedFormat, value);
    const isNegative = value < 0;

    // For negative section, use absolute value (sign is implicit in format)
    let num = section.isNegativeSection ? Math.abs(value) : value;

    // Apply percent transformation
    if (section.hasPercent) {
      num *= 100;
    }

    // Apply scaling (thousands divisor)
    if (section.scale > 0) {
      num /= Math.pow(1000, section.scale);
    }

    // Handle scientific notation
    if (section.isScientific) {
      return this.formatScientific(num, section, isNegative);
    }

    // Handle fraction
    if (section.isFraction) {
      return this.formatFraction(num, section, isNegative);
    }

    // Standard number formatting
    return this.formatStandardNumber(num, section, isNegative);
  }

  private formatStandardNumber(
    value: number,
    section: FormatSection,
    isNegative: boolean
  ): FormatResult {
    const absValue = Math.abs(value);

    // Calculate decimal places
    const decimalPlaces = section.decimalDigits.zeros + section.decimalDigits.hashes + section.decimalDigits.questions;

    // Round to required precision
    const rounded = this.roundToPrecision(absValue, decimalPlaces);

    // Split into integer and decimal parts
    const [intPart, decPart = ''] = rounded.toFixed(decimalPlaces).split('.');

    // Format integer part
    const formattedInt = this.formatIntegerPart(
      intPart,
      section.integerDigits,
      section.hasThousands
    );

    // Format decimal part
    const formattedDec = this.formatDecimalPart(decPart, section.decimalDigits);

    // Build result from tokens
    let result = '';
    let intInserted = false;

    for (const token of section.tokens) {
      switch (token.type) {
        case 'literal':
          result += token.value;
          break;
        case 'currency':
          result += token.symbol;
          break;
        case 'digit':
          if (!intInserted) {
            result += formattedInt;
            intInserted = true;
          }
          break;
        case 'decimal':
          if (decimalPlaces > 0 || section.decimalDigits.questions > 0) {
            result += this.locale.decimal;
            result += formattedDec;
          }
          break;
        case 'thousands':
          // Already handled in formatIntegerPart
          break;
        case 'percent':
          result += '%';
          break;
        case 'skip':
          result += ' '.repeat(token.width);
          break;
        case 'fill':
          result += token.char;
          break;
        case 'color':
        case 'condition':
          // Metadata tokens, don't add to output
          break;
        default:
          break;
      }
    }

    // If no digit tokens processed, just use formatted number
    if (!intInserted) {
      result = formattedInt + (decimalPlaces > 0 ? this.locale.decimal + formattedDec : '');
    }

    return {
      text: result,
      color: section.color,
      isNegative,
      align: 'right',
    };
  }

  private formatIntegerPart(
    intPart: string,
    digits: { zeros: number; hashes: number; questions: number },
    hasThousands: boolean
  ): string {
    let result = intPart;

    // Pad with leading zeros if needed
    const minDigits = digits.zeros;
    if (result.length < minDigits) {
      result = result.padStart(minDigits, '0');
    }

    // Handle ? placeholder (space padding)
    const totalPositions = digits.zeros + digits.hashes + digits.questions;
    if (digits.questions > 0 && result.length < totalPositions) {
      result = result.padStart(totalPositions, ' ');
    }

    // Add thousands separators
    if (hasThousands && result.length > 3) {
      result = result.replace(/\B(?=(\d{3})+(?!\d))/g, this.locale.thousands);
    }

    return result;
  }

  private formatDecimalPart(
    decPart: string,
    digits: { zeros: number; hashes: number; questions: number }
  ): string {
    let result = decPart;

    // Ensure minimum digits (zeros)
    if (result.length < digits.zeros) {
      result = result.padEnd(digits.zeros, '0');
    }

    // Remove trailing zeros beyond required
    const totalRequired = digits.zeros;
    const totalAllowed = digits.zeros + digits.hashes + digits.questions;

    while (result.length > totalRequired && result.endsWith('0')) {
      result = result.slice(0, -1);
    }

    // Handle ? placeholder (space padding)
    if (digits.questions > 0 && result.length < totalAllowed) {
      result = result.padEnd(totalAllowed, ' ');
    }

    return result;
  }

  private formatScientific(
    value: number,
    section: FormatSection,
    isNegative: boolean
  ): FormatResult {
    const absValue = Math.abs(value);

    // Calculate exponent
    let exponent = 0;
    let mantissa = absValue;

    if (absValue !== 0) {
      exponent = Math.floor(Math.log10(absValue));
      mantissa = absValue / Math.pow(10, exponent);
    }

    // Format mantissa
    const decimalPlaces = section.decimalDigits.zeros + section.decimalDigits.hashes;
    const mantissaStr = mantissa.toFixed(decimalPlaces);

    // Format exponent
    let expStr = Math.abs(exponent).toString();
    // Count exponent digit positions
    const expDigits = section.tokens.filter(
      (t) => t.type === 'digit' && section.tokens.indexOf(t) > section.tokens.findIndex((t2) => t2.type === 'scientific')
    ).length;
    if (expDigits > 0) {
      expStr = expStr.padStart(expDigits, '0');
    }

    // Find the sign specification
    const sciToken = section.tokens.find((t) => t.type === 'scientific');
    const sign = sciToken && sciToken.type === 'scientific' ? sciToken.sign : '+';
    const expSign = exponent >= 0 ? (sign === '+' ? '+' : '') : '-';

    const text = `${mantissaStr}E${expSign}${expStr}`;

    return {
      text,
      color: section.color,
      isNegative,
      align: 'right',
    };
  }

  private formatFraction(
    value: number,
    section: FormatSection,
    isNegative: boolean
  ): FormatResult {
    const absValue = Math.abs(value);
    const intPart = Math.floor(absValue);
    const fracPart = absValue - intPart;

    // Simple fraction approximation
    const maxDenom = 99; // For ??/??
    let bestNum = 0;
    let bestDenom = 1;
    let bestError = fracPart;

    for (let denom = 1; denom <= maxDenom; denom++) {
      const num = Math.round(fracPart * denom);
      const error = Math.abs(fracPart - num / denom);
      if (error < bestError) {
        bestError = error;
        bestNum = num;
        bestDenom = denom;
      }
    }

    let text = '';
    if (intPart > 0) {
      text = `${intPart} `;
    }

    if (bestNum > 0) {
      text += `${bestNum}/${bestDenom}`;
    } else if (intPart === 0) {
      text = '0';
    } else {
      text = text.trim();
    }

    return {
      text,
      color: section.color,
      isNegative,
      align: 'right',
    };
  }

  // ===========================================================================
  // DateTime Formatting
  // ===========================================================================

  private formatDateTime(serialDate: number, parsedFormat: ParsedFormat): FormatResult {
    const section = parsedFormat.sections[0];
    if (!section) {
      return { text: String(serialDate), isNegative: false, align: 'right' };
    }

    // Convert Excel serial date to components
    const { year, month, day, hours, minutes, seconds, milliseconds } = this.serialToComponents(serialDate);

    // Check for 12-hour format
    const is12Hour = section.tokens.some((t) => t.type === 'ampm');
    const isPM = hours >= 12;
    const hour12 = hours % 12 || 12;

    let result = '';

    for (const token of section.tokens) {
      switch (token.type) {
        case 'literal':
          result += token.value;
          break;
        case 'date':
          result += this.formatDateComponent(token.pattern, year, month, day);
          break;
        case 'time':
          result += this.formatTimeComponent(
            token.pattern,
            is12Hour ? hour12 : hours,
            minutes,
            seconds,
            milliseconds
          );
          break;
        case 'elapsed':
          result += this.formatElapsedTime(serialDate, token.unit);
          break;
        case 'ampm':
          result += isPM
            ? (token.upper ? this.locale.pm : this.locale.pm.toLowerCase())
            : (token.upper ? this.locale.am : this.locale.am.toLowerCase());
          break;
        case 'skip':
          result += ' '.repeat(token.width);
          break;
        default:
          break;
      }
    }

    return {
      text: result,
      color: section.color,
      isNegative: false,
      align: 'right',
    };
  }

  private serialToComponents(serial: number): {
    year: number;
    month: number;
    day: number;
    hours: number;
    minutes: number;
    seconds: number;
    milliseconds: number;
  } {
    // Excel serial date: days since December 30, 1899
    // Note: Excel incorrectly treats 1900 as a leap year
    const daysPart = Math.floor(serial);
    const timePart = serial - daysPart;

    // Convert days to date
    // Using JavaScript Date for simplicity
    const baseDate = new Date(1899, 11, 30); // December 30, 1899
    const targetDate = new Date(baseDate.getTime() + daysPart * 24 * 60 * 60 * 1000);

    // Convert time fraction to components
    const totalSeconds = timePart * 24 * 60 * 60;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secondsWithFrac = totalSeconds % 60;
    const seconds = Math.floor(secondsWithFrac);
    const milliseconds = Math.round((secondsWithFrac - seconds) * 1000);

    return {
      year: targetDate.getFullYear(),
      month: targetDate.getMonth() + 1,
      day: targetDate.getDate(),
      hours,
      minutes,
      seconds,
      milliseconds,
    };
  }

  private formatDateComponent(pattern: DatePattern, year: number, month: number, day: number): string {
    switch (pattern) {
      case 'yyyy':
        return year.toString();
      case 'yy':
        return (year % 100).toString().padStart(2, '0');
      case 'mmmm':
        return this.locale.monthsFull[month - 1];
      case 'mmm':
        return this.locale.monthsShort[month - 1];
      case 'mm':
        return month.toString().padStart(2, '0');
      case 'm':
        return month.toString();
      case 'dddd':
        // Need day of week
        const date = new Date(year, month - 1, day);
        return this.locale.daysFull[date.getDay()];
      case 'ddd':
        const date2 = new Date(year, month - 1, day);
        return this.locale.daysShort[date2.getDay()];
      case 'dd':
        return day.toString().padStart(2, '0');
      case 'd':
        return day.toString();
      default:
        return pattern;
    }
  }

  private formatTimeComponent(
    pattern: TimePattern,
    hours: number,
    minutes: number,
    seconds: number,
    milliseconds: number
  ): string {
    switch (pattern) {
      case 'hh':
        return hours.toString().padStart(2, '0');
      case 'h':
        return hours.toString();
      case 'mm':
        return minutes.toString().padStart(2, '0');
      case 'm':
        return minutes.toString();
      case 'ss':
        return seconds.toString().padStart(2, '0');
      case 's':
        return seconds.toString();
      case 'ss.0':
        return seconds.toString().padStart(2, '0') + '.' + Math.floor(milliseconds / 100).toString();
      case 'ss.00':
        return seconds.toString().padStart(2, '0') + '.' + Math.floor(milliseconds / 10).toString().padStart(2, '0');
      case 'ss.000':
        return seconds.toString().padStart(2, '0') + '.' + milliseconds.toString().padStart(3, '0');
      default:
        return pattern;
    }
  }

  private formatElapsedTime(serialDate: number, unit: 'h' | 'm' | 's'): string {
    const totalSeconds = serialDate * 24 * 60 * 60;

    switch (unit) {
      case 'h':
        return Math.floor(totalSeconds / 3600).toString();
      case 'm':
        return Math.floor(totalSeconds / 60).toString();
      case 's':
        return Math.floor(totalSeconds).toString();
      default:
        return '';
    }
  }

  // ===========================================================================
  // Text Formatting
  // ===========================================================================

  private formatAsText(
    value: number | string | boolean | null | undefined,
    parsedFormat: ParsedFormat
  ): FormatResult {
    const textValue = value === null || value === undefined ? '' : String(value);

    // Use the last section (text section) or first section
    const section = parsedFormat.sections[parsedFormat.sections.length - 1] ?? parsedFormat.sections[0];

    if (!section) {
      return { text: textValue, isNegative: false, align: 'left' };
    }

    let result = '';

    for (const token of section.tokens) {
      if (token.type === 'text') {
        result += textValue;
      } else if (token.type === 'literal') {
        result += token.value;
      }
    }

    return {
      text: result || textValue,
      color: section.color,
      isNegative: false,
      align: 'left',
    };
  }

  // ===========================================================================
  // Section Selection
  // ===========================================================================

  private selectSection(parsedFormat: ParsedFormat, value: number): FormatSection {
    const { sections } = parsedFormat;

    if (sections.length === 0) {
      // Shouldn't happen, but return a default
      return {
        tokens: [],
        isNegativeSection: false,
        scale: 0,
        integerDigits: { zeros: 0, hashes: 0, questions: 0 },
        decimalDigits: { zeros: 0, hashes: 0, questions: 0 },
        hasThousands: false,
        hasPercent: false,
        isScientific: false,
        isFraction: false,
      };
    }

    if (sections.length === 1) {
      return sections[0];
    }

    // Check for conditional sections first
    for (const section of sections) {
      if (section.condition) {
        if (this.evaluateCondition(value, section.condition)) {
          return section;
        }
      }
    }

    // Standard section selection: positive; negative; zero; text
    if (value > 0) {
      return sections[0];
    } else if (value < 0) {
      return sections[1] ?? sections[0];
    } else {
      return sections[2] ?? sections[0];
    }
  }

  private evaluateCondition(value: number, condition: { operator: ConditionOperator; value: number }): boolean {
    switch (condition.operator) {
      case '<':
        return value < condition.value;
      case '<=':
        return value <= condition.value;
      case '>':
        return value > condition.value;
      case '>=':
        return value >= condition.value;
      case '=':
        return value === condition.value;
      case '<>':
        return value !== condition.value;
      default:
        return false;
    }
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private roundToPrecision(value: number, decimals: number): number {
    if (decimals === 0) {
      return Math.round(value);
    }
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/** Default NumberFormat instance for convenience */
export const numberFormat = new NumberFormat();

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new NumberFormat instance.
 */
export function createNumberFormat(locale?: FormatLocale): NumberFormat {
  return new NumberFormat(locale);
}
