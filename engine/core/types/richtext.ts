/**
 * VectorSheet Engine - Rich Text Operations
 * Core algorithms for character-level formatting
 */

import type { FormattedText, FormatRun, CharacterFormat } from './index.js';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Compare two CharacterFormats for equality
 */
export function formatsEqual(
  a: CharacterFormat | undefined,
  b: CharacterFormat | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  return (
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.fontColor === b.fontColor &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strikethrough === b.strikethrough
  );
}

/**
 * Merge two CharacterFormats (b overrides a)
 */
export function mergeFormats(
  base: CharacterFormat | undefined,
  override: Partial<CharacterFormat>
): CharacterFormat {
  if (!base) return { ...override } as CharacterFormat;

  return {
    fontFamily: override.fontFamily ?? base.fontFamily,
    fontSize: override.fontSize ?? base.fontSize,
    fontColor: override.fontColor ?? base.fontColor,
    bold: override.bold ?? base.bold,
    italic: override.italic ?? base.italic,
    underline: override.underline ?? base.underline,
    strikethrough: override.strikethrough ?? base.strikethrough,
  };
}

/**
 * Get format at a specific position in FormattedText
 */
export function getFormatAtPosition(
  ft: FormattedText,
  position: number
): CharacterFormat | undefined {
  // Find the run containing this position
  for (const run of ft.runs) {
    if (position >= run.start && position < run.end) {
      return run.format;
    }
  }

  return undefined;
}

/**
 * Create a FormattedText from plain text
 */
export function createFormattedText(
  text: string,
  runs: FormatRun[] = []
): FormattedText {
  return {
    _type: 'FormattedText',
    text,
    runs: optimizeRuns(runs),
  };
}

/**
 * Convert plain string to FormattedText
 */
export function stringToFormattedText(text: string): FormattedText {
  return {
    _type: 'FormattedText',
    text,
    runs: text.length > 0 ? [{ start: 0, end: text.length }] : [],
  };
}

/**
 * Convert FormattedText to plain string
 */
export function formattedTextToString(ft: FormattedText): string {
  return ft.text;
}

// ============================================================================
// Core Algorithms
// ============================================================================

/**
 * Insert text at position, inheriting format from previous character
 * Time: O(n) where n = number of runs
 * Space: O(n)
 */
export function insertText(
  ft: FormattedText,
  position: number,
  text: string
): FormattedText {
  if (text.length === 0) return ft;

  // Clamp position
  position = Math.max(0, Math.min(position, ft.text.length));

  // 1. Insert text into plain text string
  const newText = ft.text.slice(0, position) + text + ft.text.slice(position);

  // 2. Determine format to inherit (Excel-compatible behavior)
  let inheritFormat: CharacterFormat | undefined;

  if (position > 0) {
    // Inherit from character before position
    inheritFormat = getFormatAtPosition(ft, position - 1);
  } else if (ft.text.length > 0) {
    // At start: inherit from first character (after cursor) - Excel behavior
    inheritFormat = getFormatAtPosition(ft, 0);
  } else if (ft.runs.length > 0) {
    // Empty text: inherit from first run
    inheritFormat = ft.runs[0].format;
  }

  // 3. Adjust runs
  const newRuns: FormatRun[] = [];
  let insertionHandled = false;

  for (const run of ft.runs) {
    if (position <= run.start) {
      // Run is entirely after insertion point - shift it forward
      if (!insertionHandled) {
        // Add new run for inserted text
        newRuns.push({
          start: position,
          end: position + text.length,
          format: inheritFormat,
        });
        insertionHandled = true;
      }

      newRuns.push({
        start: run.start + text.length,
        end: run.end + text.length,
        format: run.format,
      });
    } else if (position >= run.end) {
      // Run is entirely before insertion point - keep as-is
      newRuns.push({ ...run });
    } else {
      // Position is within this run - split it
      // Keep part before insertion
      newRuns.push({
        start: run.start,
        end: position,
        format: run.format,
      });

      // Add new run for inserted text
      newRuns.push({
        start: position,
        end: position + text.length,
        format: inheritFormat,
      });
      insertionHandled = true;

      // Keep part after insertion
      newRuns.push({
        start: position + text.length,
        end: run.end + text.length,
        format: run.format,
      });
    }
  }

  // Handle case where insertion is after all runs
  if (!insertionHandled) {
    newRuns.push({
      start: position,
      end: position + text.length,
      format: inheritFormat,
    });
  }

  // 4. Optimize and return
  return createFormattedText(newText, newRuns);
}

/**
 * Delete text range, adjust runs accordingly
 * Time: O(n) where n = number of runs
 * Space: O(n)
 */
export function deleteText(
  ft: FormattedText,
  start: number,
  end: number
): FormattedText {
  // Clamp and validate
  start = Math.max(0, Math.min(start, ft.text.length));
  end = Math.max(start, Math.min(end, ft.text.length));

  const deleteLength = end - start;
  if (deleteLength === 0) return ft;

  // 1. Delete from plain text
  const newText = ft.text.slice(0, start) + ft.text.slice(end);

  // 2. Adjust runs
  const newRuns: FormatRun[] = [];

  for (const run of ft.runs) {
    if (run.end <= start) {
      // Run is entirely before deletion - keep as-is
      newRuns.push({ ...run });
    } else if (run.start >= end) {
      // Run is entirely after deletion - shift it backward
      newRuns.push({
        start: run.start - deleteLength,
        end: run.end - deleteLength,
        format: run.format,
      });
    } else if (run.start < start && run.end > end) {
      // Run contains entire deletion - shrink it
      newRuns.push({
        start: run.start,
        end: run.end - deleteLength,
        format: run.format,
      });
    } else if (run.start >= start && run.end <= end) {
      // Run is entirely within deletion - remove it
      continue;
    } else if (run.start < start) {
      // Run partially overlaps deletion on left - truncate right
      newRuns.push({
        start: run.start,
        end: start,
        format: run.format,
      });
    } else {
      // Run partially overlaps deletion on right - truncate left and shift
      newRuns.push({
        start: start,
        end: run.end - deleteLength,
        format: run.format,
      });
    }
  }

  // 3. Optimize and return
  return createFormattedText(newText, newRuns);
}

/**
 * Apply character format to text selection
 * Time: O(n) where n = number of runs
 * Space: O(n)
 */
export function applyFormat(
  ft: FormattedText,
  start: number,
  end: number,
  format: Partial<CharacterFormat>
): FormattedText {
  // Clamp and validate
  start = Math.max(0, Math.min(start, ft.text.length));
  end = Math.max(start, Math.min(end, ft.text.length));

  if (start === end) return ft;

  const newRuns: FormatRun[] = [];

  // If no runs exist, create initial run
  if (ft.runs.length === 0) {
    if (ft.text.length > 0) {
      // Create runs for: before selection, selection, after selection
      if (start > 0) {
        newRuns.push({ start: 0, end: start });
      }
      newRuns.push({ start, end, format: format as CharacterFormat });
      if (end < ft.text.length) {
        newRuns.push({ start: end, end: ft.text.length });
      }
    }
    return createFormattedText(ft.text, newRuns);
  }

  // Process existing runs
  for (const run of ft.runs) {
    if (run.end <= start || run.start >= end) {
      // Run is outside selection - keep as-is
      newRuns.push({ ...run });
    } else if (run.start >= start && run.end <= end) {
      // Run is entirely within selection - apply format
      newRuns.push({
        start: run.start,
        end: run.end,
        format: mergeFormats(run.format, format),
      });
    } else if (run.start < start && run.end > end) {
      // Selection is entirely within run - split into 3
      // Before selection
      newRuns.push({
        start: run.start,
        end: start,
        format: run.format,
      });
      // Selection with merged format
      newRuns.push({
        start,
        end,
        format: mergeFormats(run.format, format),
      });
      // After selection
      newRuns.push({
        start: end,
        end: run.end,
        format: run.format,
      });
    } else if (run.start < start) {
      // Run overlaps left boundary - split into 2
      // Before selection
      newRuns.push({
        start: run.start,
        end: start,
        format: run.format,
      });
      // Overlapping part with merged format
      newRuns.push({
        start,
        end: run.end,
        format: mergeFormats(run.format, format),
      });
    } else {
      // Run overlaps right boundary - split into 2
      // Overlapping part with merged format
      newRuns.push({
        start: run.start,
        end,
        format: mergeFormats(run.format, format),
      });
      // After selection
      newRuns.push({
        start: end,
        end: run.end,
        format: run.format,
      });
    }
  }

  return createFormattedText(ft.text, newRuns);
}

/**
 * Optimize runs by merging adjacent runs with identical formats
 * Time: O(n log n) for sort, O(n) for merge
 * Space: O(n)
 */
export function optimizeRuns(runs: FormatRun[]): FormatRun[] {
  if (runs.length === 0) return [];

  // 1. Sort by start position
  const sorted = [...runs].sort((a, b) => a.start - b.start);

  // 2. Remove empty runs and fix invalid runs
  const valid: FormatRun[] = [];
  for (const run of sorted) {
    if (run.end > run.start) {
      valid.push(run);
    }
  }

  if (valid.length === 0) return [];

  // 3. Merge adjacent runs with identical formats
  const optimized: FormatRun[] = [valid[0]];

  for (let i = 1; i < valid.length; i++) {
    const current = valid[i];
    const last = optimized[optimized.length - 1];

    // Check if we can merge
    if (last.end === current.start && formatsEqual(last.format, current.format)) {
      // Merge by extending last run
      last.end = current.end;
    } else if (last.end < current.start) {
      // Gap between runs - add current
      optimized.push(current);
    } else if (last.end >= current.start) {
      // Overlapping runs - this shouldn't happen after proper algorithm execution
      // But we handle it defensively: truncate or skip
      if (current.end > last.end) {
        // Current extends beyond last
        if (formatsEqual(last.format, current.format)) {
          // Merge by extending
          last.end = current.end;
        } else {
          // Split: keep overlap in last, add remainder
          optimized.push({
            start: last.end,
            end: current.end,
            format: current.format,
          });
        }
      }
      // Otherwise current is entirely within last - skip it
    }
  }

  return optimized;
}

// ============================================================================
// Validation & Repair
// ============================================================================

/**
 * Validate FormattedText structure
 * Returns true if valid, false otherwise
 */
export function validateFormattedText(ft: FormattedText): boolean {
  if (!ft || ft._type !== 'FormattedText') return false;
  if (typeof ft.text !== 'string') return false;
  if (!Array.isArray(ft.runs)) return false;

  // Validate runs
  for (let i = 0; i < ft.runs.length; i++) {
    const run = ft.runs[i];

    // Check run structure
    if (typeof run.start !== 'number' || typeof run.end !== 'number') {
      return false;
    }

    // Check bounds
    if (run.start < 0 || run.end > ft.text.length || run.start >= run.end) {
      return false;
    }

    // Check sorting
    if (i > 0 && run.start < ft.runs[i - 1].end) {
      return false;
    }
  }

  return true;
}

/**
 * Repair malformed FormattedText
 * Fixes out-of-bounds runs, overlaps, and empty runs
 */
export function repairFormattedText(ft: FormattedText): FormattedText {
  if (!ft || !ft.text || !Array.isArray(ft.runs)) {
    return createFormattedText('', []);
  }

  const textLength = ft.text.length;
  const repairedRuns: FormatRun[] = [];

  for (const run of ft.runs) {
    // Skip invalid runs
    if (
      typeof run.start !== 'number' ||
      typeof run.end !== 'number' ||
      run.start >= run.end
    ) {
      continue;
    }

    // Clamp to text bounds
    const start = Math.max(0, Math.min(run.start, textLength));
    const end = Math.max(start, Math.min(run.end, textLength));

    if (end > start) {
      repairedRuns.push({
        start,
        end,
        format: run.format,
      });
    }
  }

  return createFormattedText(ft.text, repairedRuns);
}

// ============================================================================
// Conversion Helpers
// ============================================================================

/**
 * Ensure a value is FormattedText (auto-convert if needed)
 */
export function ensureFormattedText(
  value: string | number | boolean | FormattedText | null
): FormattedText {
  if (value && typeof value === 'object' && '_type' in value) {
    return value as FormattedText;
  }

  // Convert to string
  const text = value === null || value === undefined ? '' : String(value);
  return stringToFormattedText(text);
}

/**
 * Check if FormattedText has any character-level formatting
 * (i.e., more than one distinct format)
 */
export function hasCharacterFormatting(ft: FormattedText): boolean {
  if (ft.runs.length <= 1) return false;

  const firstFormat = ft.runs[0].format;
  for (let i = 1; i < ft.runs.length; i++) {
    if (!formatsEqual(firstFormat, ft.runs[i].format)) {
      return true;
    }
  }

  return false;
}

/**
 * Get the plain text length of FormattedText
 */
export function getTextLength(ft: FormattedText): number {
  return ft.text.length;
}

/**
 * Check if FormattedText should be stored as FormattedText or downgraded to plain string.
 * For memory efficiency, single-format cells should be stored as plain strings.
 * Excel-compatible behavior.
 */
export function shouldStoreAsFormattedText(ft: FormattedText): boolean {
  // No runs or empty text -> plain string
  if (ft.runs.length === 0 || ft.text.length === 0) return false;

  // Single run covering entire text with no format -> plain string
  if (ft.runs.length === 1) {
    const run = ft.runs[0];
    if (run.start === 0 && run.end === ft.text.length && !run.format) {
      return false;
    }
    // Single run with "empty" format (all properties undefined) -> plain string
    if (run.format && Object.values(run.format).every(v => v === undefined)) {
      return false;
    }
  }

  return true;
}

/**
 * Optimize FormattedText to plain string if appropriate.
 * Returns plain string or FormattedText based on formatting complexity.
 * Use this before storing in Cell.value for memory efficiency.
 */
export function optimizeToValue(ft: FormattedText): string | FormattedText {
  if (!shouldStoreAsFormattedText(ft)) {
    return ft.text;
  }
  return ft;
}

/**
 * Extract text substring with format preservation
 */
export function substring(
  ft: FormattedText,
  start: number,
  end?: number
): FormattedText {
  const actualEnd = end ?? ft.text.length;

  // Clamp bounds
  start = Math.max(0, Math.min(start, ft.text.length));
  const finalEnd = Math.max(start, Math.min(actualEnd, ft.text.length));

  // Extract text
  const newText = ft.text.slice(start, finalEnd);

  // Extract and adjust runs
  const newRuns: FormatRun[] = [];

  for (const run of ft.runs) {
    // Skip runs entirely outside range
    if (run.end <= start || run.start >= finalEnd) continue;

    // Calculate intersection
    const newStart = Math.max(run.start, start);
    const newEnd = Math.min(run.end, finalEnd);

    // Add adjusted run
    newRuns.push({
      start: newStart - start,
      end: newEnd - start,
      format: run.format,
    });
  }

  return createFormattedText(newText, newRuns);
}
