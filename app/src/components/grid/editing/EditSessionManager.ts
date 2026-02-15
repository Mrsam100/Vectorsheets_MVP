/**
 * EditSessionManager - UI-side wrapper for managing edit sessions with pending formats
 *
 * This manager sits between the UI and EditModeManager, tracking:
 * - Pending format changes during editing
 * - Text selection ranges for character-level formatting (future)
 * - Deferred format application until commit
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ User clicks Bold during edit                                │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 1. EditSessionManager records pending format                │
 * │ 2. Edit session continues (NOT committed)                   │
 * │ 3. User presses Enter                                       │
 * │ 4. EditSessionManager merges pending formats → final value  │
 * │ 5. EditModeManager.confirmEdit() commits to engine          │
 * └─────────────────────────────────────────────────────────────┘
 *
 * IMPORTANT: This does NOT modify the engine. It's a UI-layer state manager.
 * Future: Will support character-level formatting via FormatRuns.
 */

import type { CellFormat } from '../../../../../engine/core/types/index';

// =============================================================================
// Types
// =============================================================================

/**
 * Edit session state
 */
export interface EditSession {
  /** Current text being edited */
  text: string;
  /** Cursor position in text */
  cursor: number;
  /** Text selection range (for future character-level formatting) */
  selection: [number, number] | null;
  /** Pending format to apply when edit commits */
  pendingFormat?: Partial<CellFormat>;
  /** Is edit session active */
  isActive: boolean;
  /** Cell being edited */
  cell: { row: number; col: number } | null;
}

/**
 * Format run for character-level formatting (future)
 */
export interface FormatRun {
  /** Start index in text (inclusive) */
  start: number;
  /** End index in text (exclusive) */
  end: number;
  /** Format for this range */
  format: Partial<CellFormat>;
}

/**
 * Rich text value with character-level formatting (future)
 */
export interface FormattedText {
  /** Plain text content */
  text: string;
  /** Format runs (empty = cell-level formatting only) */
  runs: FormatRun[];
}

// =============================================================================
// EditSessionManager Class
// =============================================================================

export class EditSessionManager {
  private session: EditSession;

  constructor() {
    this.session = this.createEmptySession();
  }

  // ===========================================================================
  // Session Lifecycle
  // ===========================================================================

  /**
   * Start a new edit session
   */
  startSession(
    cell: { row: number; col: number },
    initialText: string,
    cursorPosition?: number
  ): EditSession {
    this.session = {
      text: initialText,
      cursor: cursorPosition ?? initialText.length,
      selection: null,
      pendingFormat: undefined,
      isActive: true,
      cell: { ...cell },
    };
    return this.getSession();
  }

  /**
   * End the current session
   */
  endSession(): EditSession {
    const finalSession = this.getSession();
    this.session = this.createEmptySession();
    return finalSession;
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.session.isActive;
  }

  /**
   * Get current session state (immutable copy)
   */
  getSession(): Readonly<EditSession> {
    return { ...this.session };
  }

  // ===========================================================================
  // Text Mutation
  // ===========================================================================

  /**
   * Update session text
   */
  setText(text: string): void {
    if (!this.session.isActive) return;
    this.session.text = text;
  }

  /**
   * Update cursor position
   */
  setCursor(position: number): void {
    if (!this.session.isActive) return;
    this.session.cursor = Math.max(0, Math.min(this.session.text.length, position));
  }

  /**
   * Set text selection range
   */
  setSelection(start: number, end: number): void {
    if (!this.session.isActive) return;
    const maxLen = this.session.text.length;
    this.session.selection = [
      Math.max(0, Math.min(maxLen, start)),
      Math.max(0, Math.min(maxLen, end)),
    ];
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    if (!this.session.isActive) return;
    this.session.selection = null;
  }

  // ===========================================================================
  // Format Management
  // ===========================================================================

  /**
   * Apply pending format (toolbar button clicked)
   * For now, applies to entire cell. Future: apply to selection range.
   */
  applyPendingFormat(format: Partial<CellFormat>): void {
    if (!this.session.isActive) return;

    // Merge with existing pending format
    this.session.pendingFormat = {
      ...this.session.pendingFormat,
      ...format,
    };

    // TODO (Phase 3): When character-level formatting is implemented,
    // apply format to current selection range instead of entire cell.
    // See the "Future: Character-Level Formatting (Phase 3)" section at the end of the class.
  }

  /**
   * Get pending format to apply on commit
   */
  getPendingFormat(): Partial<CellFormat> | undefined {
    return this.session.pendingFormat ? { ...this.session.pendingFormat } : undefined;
  }

  /**
   * Clear pending format
   */
  clearPendingFormat(): void {
    this.session.pendingFormat = undefined;
  }

  // ===========================================================================
  // Commit / Cancel
  // ===========================================================================

  /**
   * Prepare final value for commit
   * Returns text and format to be committed to engine
   */
  prepareFinalValue(): { text: string; format?: Partial<CellFormat> } {
    return {
      text: this.session.text,
      format: this.session.pendingFormat,
    };
  }

  /**
   * Cancel session (discard all changes)
   */
  cancel(): void {
    this.session = this.createEmptySession();
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private createEmptySession(): EditSession {
    return {
      text: '',
      cursor: 0,
      selection: null,
      pendingFormat: undefined,
      isActive: false,
      cell: null,
    };
  }

  // ===========================================================================
  // Future: Character-Level Formatting (Phase 3)
  // ===========================================================================
  // Phase 3 implementation will include:
  // 1. applyFormatToRange(start, end, format) - Apply format to specific text range
  //    - Split/merge existing FormatRuns
  //    - Optimize adjacent runs with identical formats
  //    - Update session.runs array
  // 2. toFormattedText() - Convert session to FormattedText with character formatting
  // 3. fromFormattedText(formatted) - Load FormattedText into session
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Merge format runs with identical formats (future optimization)
 */
export function optimizeFormatRuns(runs: FormatRun[]): FormatRun[] {
  if (runs.length <= 1) return runs;

  const optimized: FormatRun[] = [];
  let current = { ...runs[0] };

  for (let i = 1; i < runs.length; i++) {
    const next = runs[i];

    // Check if formats are identical
    if (formatsEqual(current.format, next.format)) {
      // Merge runs
      current.end = next.end;
    } else {
      // Push current and start new run
      optimized.push(current);
      current = { ...next };
    }
  }

  optimized.push(current);
  return optimized;
}

/**
 * Check if two formats are identical (deep equality)
 */
function formatsEqual(a: Partial<CellFormat>, b: Partial<CellFormat>): boolean {
  const keysA = Object.keys(a) as (keyof CellFormat)[];
  const keysB = Object.keys(b) as (keyof CellFormat)[];

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }

  return true;
}

/**
 * Split a format run at a position
 */
export function splitFormatRun(
  run: FormatRun,
  position: number
): [FormatRun, FormatRun] | null {
  if (position <= run.start || position >= run.end) {
    return null; // Position outside run bounds
  }

  return [
    { start: run.start, end: position, format: { ...run.format } },
    { start: position, end: run.end, format: { ...run.format } },
  ];
}

/**
 * Find format run containing a position
 */
export function findRunAtPosition(runs: FormatRun[], position: number): FormatRun | null {
  for (const run of runs) {
    if (position >= run.start && position < run.end) {
      return run;
    }
  }
  return null;
}
