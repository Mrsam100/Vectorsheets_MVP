/**
 * VectorSheet Headless Test Harness - Command Parser
 *
 * Parses text commands into structured command objects.
 *
 * Command syntax:
 *   COMMAND [args...] [key=value...]
 *
 * Cell Operations:
 *   SET A1 100                             - Set cell value
 *   SET A1 "Hello World"                   - Set string value
 *   SET A1 =SUM(B1:B10)                    - Set formula
 *   GET A1                                 - Get cell value
 *   DELETE A1:B10                          - Delete cells
 *   CLEAR A1:B10                           - Clear range
 *
 * Clipboard Operations:
 *   COPY A1:B3                             - Copy range to clipboard
 *   CUT A1:B3                              - Cut range to clipboard
 *   PASTE C1 [all|values|formats|formulas] - Paste at target
 *
 * Fill Operations:
 *   FILL <up|down|left|right> <count>      - Fill from selection
 *
 * Format Operations:
 *   FORMAT A1:B10 {"bold":true,"fontSize":14}
 *   PAINTER_PICK A1 [persistent]           - Pick format
 *   PAINTER_APPLY C1:D4                    - Apply format
 *
 * Merge Operations:
 *   MERGE A1:C3                            - Merge cells
 *   UNMERGE A1:C3                          - Unmerge cells
 *
 * Conditional Formatting:
 *   COND_ADD A1:A10 {"type":"gt","value":100,"format":{"backgroundColor":"#ff0000"}}
 *   COND_REMOVE <ruleId>
 *
 * Data Validation:
 *   VALIDATE_ADD A1:A10 {"type":"list","values":["Yes","No"]}
 *   VALIDATE_REMOVE <ruleId>
 *
 * Sort/Filter:
 *   SORT A1:C100 [{"col":"B","dir":"asc"}]
 *   FILTER A1:D10 {"col":0,"values":["a","b"]}
 *   CLEAR_FILTER A1:D10
 *
 * History:
 *   UNDO / REDO / BEGIN_BATCH / END_BATCH
 *
 * State Inspection:
 *   SNAPSHOT / DIFF / STATS / DUMP A1:B10
 */

import { CommandType, ParsedCommand } from './types.js';

// =============================================================================
// Cell Reference Utilities
// =============================================================================

/**
 * Parse A1-style cell reference to row/col.
 */
export function parseA1Reference(ref: string): { row: number; col: number } | null {
  const match = ref.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;

  const colStr = match[1].toUpperCase();
  const rowNum = parseInt(match[2], 10) - 1; // 0-based

  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  col -= 1; // 0-based

  return { row: rowNum, col };
}

/**
 * Parse A1:B10 range to startRow/startCol/endRow/endCol.
 */
export function parseA1Range(range: string): {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
} | null {
  const parts = range.split(':');
  if (parts.length === 1) {
    // Single cell
    const cell = parseA1Reference(parts[0]);
    if (!cell) return null;
    return {
      startRow: cell.row,
      startCol: cell.col,
      endRow: cell.row,
      endCol: cell.col,
    };
  }

  if (parts.length === 2) {
    const start = parseA1Reference(parts[0]);
    const end = parseA1Reference(parts[1]);
    if (!start || !end) return null;
    return {
      startRow: Math.min(start.row, end.row),
      startCol: Math.min(start.col, end.col),
      endRow: Math.max(start.row, end.row),
      endCol: Math.max(start.col, end.col),
    };
  }

  return null;
}

/**
 * Convert row/col to A1-style reference.
 */
export function toA1Reference(row: number, col: number): string {
  let colStr = '';
  let c = col;
  while (c >= 0) {
    colStr = String.fromCharCode((c % 26) + 65) + colStr;
    c = Math.floor(c / 26) - 1;
  }
  return `${colStr}${row + 1}`;
}

// =============================================================================
// Command Parser
// =============================================================================

const VALID_COMMANDS: Set<string> = new Set([
  // Cell operations
  'SET', 'GET', 'DELETE', 'CLEAR',
  'GET_RANGE', 'FILL',
  // Clipboard
  'COPY', 'CUT', 'PASTE',
  // Format operations
  'FORMAT', 'FORMAT_RANGE', 'NUMBER_FORMAT',
  'PAINTER_PICK', 'PAINTER_APPLY',
  // Merge
  'MERGE', 'UNMERGE', 'GET_MERGE',
  // Selection
  'SELECT', 'GET_SELECTION',
  // Find/Replace
  'FIND', 'REPLACE', 'REPLACE_ALL',
  // Sort/Filter
  'SORT', 'FILTER', 'CLEAR_FILTER',
  // Validation
  'VALIDATE', 'VALIDATE_ADD', 'VALIDATE_REMOVE',
  'ADD_VALIDATION', 'REMOVE_VALIDATION', // legacy
  // Conditional formatting
  'COND_ADD', 'COND_REMOVE',
  'ADD_CF_RULE', 'REMOVE_CF_RULE', 'EVAL_CF', // legacy
  // History
  'UNDO', 'REDO', 'BEGIN_BATCH', 'END_BATCH',
  // State inspection
  'SNAPSHOT', 'DIFF', 'STATS', 'DUMP',
  // Utility
  'ECHO', 'SLEEP', 'ASSERT', 'ASSERT_ERROR',
  // Control
  'RESET', 'QUIT',
]);

export class CommandParser {
  /**
   * Parse a single command line.
   */
  parse(line: string, lineNumber: number = 0): ParsedCommand | null {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      return null;
    }

    // Tokenize the line
    const tokens = this.tokenize(trimmed);
    if (tokens.length === 0) return null;

    // First token is the command
    const commandStr = tokens[0].toUpperCase();

    if (!VALID_COMMANDS.has(commandStr)) {
      throw new ParseError(`Unknown command: ${commandStr}`, lineNumber, trimmed);
    }

    const type = commandStr as CommandType;
    const args: string[] = [];
    const options: Record<string, string | boolean | number> = {};

    // Process remaining tokens
    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];

      // Check if it's a key=value option
      // Key must be alphanumeric identifier (not operators like !=, >=, <=)
      const eqIndex = token.indexOf('=');
      if (eqIndex > 0 && !token.startsWith('"') && !token.startsWith("'")) {
        const key = token.substring(0, eqIndex);
        // Only treat as option if key is a valid identifier (alphanumeric + underscore)
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
          const value = token.substring(eqIndex + 1);
          options[key] = this.parseOptionValue(value);
        } else {
          args.push(token);
        }
      } else {
        args.push(token);
      }
    }

    return {
      type,
      args,
      options,
      raw: trimmed,
      lineNumber,
    };
  }

  /**
   * Parse multiple lines.
   */
  parseLines(lines: string[]): ParsedCommand[] {
    const commands: ParsedCommand[] = [];

    for (let i = 0; i < lines.length; i++) {
      const cmd = this.parse(lines[i], i + 1);
      if (cmd) {
        commands.push(cmd);
      }
    }

    return commands;
  }

  /**
   * Parse a script (multiline string).
   */
  parseScript(script: string): ParsedCommand[] {
    return this.parseLines(script.split('\n'));
  }

  /**
   * Tokenize a command line, respecting quoted strings.
   */
  private tokenize(line: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (inQuotes) {
        if (char === quoteChar) {
          // End of quoted string
          tokens.push(current);
          current = '';
          inQuotes = false;
          quoteChar = '';
        } else if (char === '\\' && i + 1 < line.length) {
          // Escape sequence
          const next = line[i + 1];
          if (next === quoteChar || next === '\\' || next === 'n' || next === 't') {
            if (next === 'n') current += '\n';
            else if (next === 't') current += '\t';
            else current += next;
            i++;
          } else {
            current += char;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"' || char === "'") {
          // Start of quoted string
          if (current !== '') {
            tokens.push(current);
            current = '';
          }
          inQuotes = true;
          quoteChar = char;
        } else if (char === ' ' || char === '\t') {
          // Whitespace separator
          if (current !== '') {
            tokens.push(current);
            current = '';
          }
        } else {
          current += char;
        }
      }
    }

    // Don't forget the last token
    if (current !== '') {
      tokens.push(current);
    }

    if (inQuotes) {
      throw new ParseError(`Unterminated string`, 0, line);
    }

    return tokens;
  }

  /**
   * Parse an option value to appropriate type.
   */
  private parseOptionValue(value: string): string | boolean | number {
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    // Boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Number
    const num = parseFloat(value);
    if (!isNaN(num) && value.match(/^-?\d+\.?\d*$/)) {
      return num;
    }

    // String
    return value;
  }
}

// =============================================================================
// Parse Error
// =============================================================================

export class ParseError extends Error {
  lineNumber: number;
  line: string;

  constructor(message: string, lineNumber: number, line: string) {
    super(`Parse error at line ${lineNumber}: ${message}\n  ${line}`);
    this.name = 'ParseError';
    this.lineNumber = lineNumber;
    this.line = line;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createCommandParser(): CommandParser {
  return new CommandParser();
}
