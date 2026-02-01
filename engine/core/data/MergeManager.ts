/**
 * VectorSheet Engine - Merge Manager
 *
 * Structural sheet-state manager for merged cells.
 * Tracks merge metadata and enforces merge constraints.
 *
 * Responsibilities:
 * - Merge rectangular ranges into a single logical cell
 * - Track merge metadata (rowSpan, colSpan, anchor cell)
 * - Prevent invalid merges (overlapping, partial overlaps)
 * - Coordinate with SparseDataStore for cell merge properties
 */

import { CellRef, CellRange, cellKey, rangesOverlap } from '../types/index.js';
import { SparseDataStore } from './SparseDataStore.js';

// ============================================================================
// Types
// ============================================================================

export interface MergeInfo {
  /** Anchor cell (top-left of merge) */
  anchor: CellRef;
  /** Number of rows in the merge */
  rowSpan: number;
  /** Number of columns in the merge */
  colSpan: number;
}

export interface MergeResult {
  /** Whether the merge was successful */
  success: boolean;
  /** Error message if merge failed */
  error?: string;
  /** The merge info if successful */
  mergeInfo?: MergeInfo;
}

export interface UnmergeResult {
  /** Whether the unmerge was successful */
  success: boolean;
  /** Error message if unmerge failed */
  error?: string;
  /** The cells that were unmerged */
  unmergedCells?: CellRef[];
}

export interface MergeManagerEvents {
  /** Called when a merge is created */
  onMerge?: (mergeInfo: MergeInfo) => void;
  /** Called when a merge is removed */
  onUnmerge?: (anchor: CellRef) => void;
}

// ============================================================================
// MergeManager Class
// ============================================================================

export class MergeManager {
  private dataStore: SparseDataStore;
  private events: MergeManagerEvents = {};

  /**
   * Internal index of all merges by anchor key.
   * Key format: "row_col" for the anchor cell.
   */
  private merges: Map<string, MergeInfo> = new Map();

  /**
   * Reverse index: maps any cell in a merge to its anchor.
   * Key format: "row_col" -> anchor key "row_col".
   */
  private cellToAnchor: Map<string, string> = new Map();

  constructor(dataStore: SparseDataStore) {
    this.dataStore = dataStore;
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  setEventHandlers(events: MergeManagerEvents): void {
    this.events = { ...this.events, ...events };
  }

  // ===========================================================================
  // Core API
  // ===========================================================================

  /**
   * Merge a rectangular range into a single logical cell.
   *
   * @param range The range to merge
   * @returns Result indicating success or failure with reason
   */
  merge(range: CellRange): MergeResult {
    // Normalize range (ensure start <= end)
    const normalizedRange = this.normalizeRange(range);

    // Validate range dimensions
    const rowSpan = normalizedRange.endRow - normalizedRange.startRow + 1;
    const colSpan = normalizedRange.endCol - normalizedRange.startCol + 1;

    if (rowSpan === 1 && colSpan === 1) {
      return {
        success: false,
        error: 'Cannot merge a single cell',
      };
    }

    // Check for conflicts with existing merges
    const conflict = this.findConflictingMerge(normalizedRange);
    if (conflict) {
      return {
        success: false,
        error: `Range conflicts with existing merge at ${conflict.anchor.row},${conflict.anchor.col}`,
      };
    }

    // Create the merge
    const anchor: CellRef = {
      row: normalizedRange.startRow,
      col: normalizedRange.startCol,
    };

    const mergeInfo: MergeInfo = {
      anchor,
      rowSpan,
      colSpan,
    };

    const anchorKey = cellKey(anchor.row, anchor.col);

    // Update internal indexes
    this.merges.set(anchorKey, mergeInfo);

    // Map all cells to the anchor
    for (let row = normalizedRange.startRow; row <= normalizedRange.endRow; row++) {
      for (let col = normalizedRange.startCol; col <= normalizedRange.endCol; col++) {
        this.cellToAnchor.set(cellKey(row, col), anchorKey);
      }
    }

    // Update data store cells
    this.updateDataStoreMerge(mergeInfo);

    // Emit event
    this.events.onMerge?.(mergeInfo);

    return {
      success: true,
      mergeInfo,
    };
  }

  /**
   * Unmerge cells in a range.
   * If the range contains any part of a merge, the entire merge is removed.
   *
   * @param range The range to unmerge
   * @returns Result indicating success or failure
   */
  unmerge(range: CellRange): UnmergeResult {
    const normalizedRange = this.normalizeRange(range);

    // Find all merges that intersect with the range
    const mergesToRemove = this.findMergesInRange(normalizedRange);

    if (mergesToRemove.length === 0) {
      return {
        success: false,
        error: 'No merged cells in the specified range',
      };
    }

    const unmergedCells: CellRef[] = [];

    for (const mergeInfo of mergesToRemove) {
      // Remove from internal indexes
      const anchorKey = cellKey(mergeInfo.anchor.row, mergeInfo.anchor.col);
      this.merges.delete(anchorKey);

      // Remove all cell mappings
      for (let row = mergeInfo.anchor.row; row < mergeInfo.anchor.row + mergeInfo.rowSpan; row++) {
        for (let col = mergeInfo.anchor.col; col < mergeInfo.anchor.col + mergeInfo.colSpan; col++) {
          this.cellToAnchor.delete(cellKey(row, col));
          unmergedCells.push({ row, col });
        }
      }

      // Clear merge properties from data store cells
      this.clearDataStoreMerge(mergeInfo);

      // Emit event
      this.events.onUnmerge?.(mergeInfo.anchor);
    }

    return {
      success: true,
      unmergedCells,
    };
  }

  /**
   * Check if a cell is part of a merged region.
   *
   * @param cellRef The cell to check
   * @returns true if the cell is merged
   */
  isMerged(cellRef: CellRef): boolean {
    return this.cellToAnchor.has(cellKey(cellRef.row, cellRef.col));
  }

  /**
   * Check if a cell is the anchor (top-left) of a merge.
   *
   * @param cellRef The cell to check
   * @returns true if the cell is a merge anchor
   */
  isMergeAnchor(cellRef: CellRef): boolean {
    return this.merges.has(cellKey(cellRef.row, cellRef.col));
  }

  /**
   * Get merge info for a cell.
   * If the cell is part of a merge (whether anchor or non-anchor),
   * returns the full merge info.
   *
   * @param cellRef The cell to query
   * @returns MergeInfo or null if not merged
   */
  getMergeInfo(cellRef: CellRef): MergeInfo | null {
    const key = cellKey(cellRef.row, cellRef.col);
    const anchorKey = this.cellToAnchor.get(key);

    if (!anchorKey) {
      return null;
    }

    return this.merges.get(anchorKey) ?? null;
  }

  /**
   * Get the anchor cell for a merged cell.
   *
   * @param cellRef The cell to query
   * @returns Anchor CellRef or null if not merged
   */
  getMergeAnchor(cellRef: CellRef): CellRef | null {
    const mergeInfo = this.getMergeInfo(cellRef);
    return mergeInfo?.anchor ?? null;
  }

  /**
   * Get all merges in the sheet.
   *
   * @returns Array of all merge infos
   */
  getAllMerges(): MergeInfo[] {
    return Array.from(this.merges.values());
  }

  /**
   * Get all merges that intersect with a range.
   *
   * @param range The range to check
   * @returns Array of merge infos that intersect
   */
  getMergesInRange(range: CellRange): MergeInfo[] {
    return this.findMergesInRange(this.normalizeRange(range));
  }

  /**
   * Clear all merges.
   */
  clearAll(): void {
    // Clear data store merge properties for all merges
    for (const mergeInfo of this.merges.values()) {
      this.clearDataStoreMerge(mergeInfo);
    }

    this.merges.clear();
    this.cellToAnchor.clear();
  }

  /**
   * Get the effective display range for a cell.
   * For merged cells, returns the full merge range.
   * For non-merged cells, returns a single-cell range.
   *
   * @param cellRef The cell to query
   * @returns The display range
   */
  getDisplayRange(cellRef: CellRef): CellRange {
    const mergeInfo = this.getMergeInfo(cellRef);

    if (mergeInfo) {
      return {
        startRow: mergeInfo.anchor.row,
        startCol: mergeInfo.anchor.col,
        endRow: mergeInfo.anchor.row + mergeInfo.rowSpan - 1,
        endCol: mergeInfo.anchor.col + mergeInfo.colSpan - 1,
      };
    }

    return {
      startRow: cellRef.row,
      startCol: cellRef.col,
      endRow: cellRef.row,
      endCol: cellRef.col,
    };
  }

  /**
   * Check if editing a specific cell should be redirected.
   * Non-anchor cells in a merge should redirect to the anchor.
   *
   * @param cellRef The cell being edited
   * @returns The cell that should actually be edited
   */
  getEditTarget(cellRef: CellRef): CellRef {
    const anchor = this.getMergeAnchor(cellRef);
    return anchor ?? cellRef;
  }

  // ===========================================================================
  // Validation
  // ===========================================================================

  /**
   * Check if a range can be merged (validation only, no mutation).
   *
   * @param range The range to validate
   * @returns Object with canMerge boolean and reason if invalid
   */
  canMerge(range: CellRange): { canMerge: boolean; reason?: string } {
    const normalizedRange = this.normalizeRange(range);

    const rowSpan = normalizedRange.endRow - normalizedRange.startRow + 1;
    const colSpan = normalizedRange.endCol - normalizedRange.startCol + 1;

    if (rowSpan === 1 && colSpan === 1) {
      return { canMerge: false, reason: 'Cannot merge a single cell' };
    }

    const conflict = this.findConflictingMerge(normalizedRange);
    if (conflict) {
      return {
        canMerge: false,
        reason: `Conflicts with existing merge at ${conflict.anchor.row},${conflict.anchor.col}`,
      };
    }

    return { canMerge: true };
  }

  /**
   * Expand a range to include any merges that partially intersect.
   * This is useful when selecting or deleting ranges that touch merges.
   *
   * @param range The range to expand
   * @returns Expanded range that fully includes any touched merges
   */
  expandRangeToIncludeMerges(range: CellRange): CellRange {
    const normalizedRange = this.normalizeRange(range);
    let { startRow, startCol, endRow, endCol } = normalizedRange;

    // Keep expanding until no more merges are partially included
    let changed = true;
    while (changed) {
      changed = false;

      for (const mergeInfo of this.merges.values()) {
        const mergeRange: CellRange = {
          startRow: mergeInfo.anchor.row,
          startCol: mergeInfo.anchor.col,
          endRow: mergeInfo.anchor.row + mergeInfo.rowSpan - 1,
          endCol: mergeInfo.anchor.col + mergeInfo.colSpan - 1,
        };

        // Check if merge partially overlaps with current range
        if (rangesOverlap({ startRow, startCol, endRow, endCol }, mergeRange)) {
          const newStartRow = Math.min(startRow, mergeRange.startRow);
          const newStartCol = Math.min(startCol, mergeRange.startCol);
          const newEndRow = Math.max(endRow, mergeRange.endRow);
          const newEndCol = Math.max(endCol, mergeRange.endCol);

          if (newStartRow !== startRow || newStartCol !== startCol ||
              newEndRow !== endRow || newEndCol !== endCol) {
            startRow = newStartRow;
            startCol = newStartCol;
            endRow = newEndRow;
            endCol = newEndCol;
            changed = true;
          }
        }
      }
    }

    return { startRow, startCol, endRow, endCol };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Normalize a range to ensure start <= end for both dimensions.
   */
  private normalizeRange(range: CellRange): CellRange {
    return {
      startRow: Math.min(range.startRow, range.endRow),
      startCol: Math.min(range.startCol, range.endCol),
      endRow: Math.max(range.startRow, range.endRow),
      endCol: Math.max(range.startCol, range.endCol),
    };
  }

  /**
   * Find a merge that conflicts with (overlaps) the given range.
   * Returns the first conflicting merge or null if none.
   */
  private findConflictingMerge(range: CellRange): MergeInfo | null {
    for (const mergeInfo of this.merges.values()) {
      const mergeRange: CellRange = {
        startRow: mergeInfo.anchor.row,
        startCol: mergeInfo.anchor.col,
        endRow: mergeInfo.anchor.row + mergeInfo.rowSpan - 1,
        endCol: mergeInfo.anchor.col + mergeInfo.colSpan - 1,
      };

      if (rangesOverlap(range, mergeRange)) {
        return mergeInfo;
      }
    }

    return null;
  }

  /**
   * Find all merges that intersect with a range.
   */
  private findMergesInRange(range: CellRange): MergeInfo[] {
    const result: MergeInfo[] = [];

    for (const mergeInfo of this.merges.values()) {
      const mergeRange: CellRange = {
        startRow: mergeInfo.anchor.row,
        startCol: mergeInfo.anchor.col,
        endRow: mergeInfo.anchor.row + mergeInfo.rowSpan - 1,
        endCol: mergeInfo.anchor.col + mergeInfo.colSpan - 1,
      };

      if (rangesOverlap(range, mergeRange)) {
        result.push(mergeInfo);
      }
    }

    return result;
  }

  /**
   * Update data store cells with merge properties.
   */
  private updateDataStoreMerge(mergeInfo: MergeInfo): void {
    const { anchor, rowSpan, colSpan } = mergeInfo;

    // Set merge property on anchor cell
    const anchorCell = this.dataStore.getCell(anchor.row, anchor.col);
    const updatedAnchor = {
      value: anchorCell?.value ?? null,
      type: anchorCell?.type ?? 'empty' as const,
      ...anchorCell,
      merge: { rowSpan, colSpan },
    };
    delete updatedAnchor.mergeParent;
    this.dataStore.setCell(anchor.row, anchor.col, updatedAnchor);

    // Set mergeParent on non-anchor cells
    for (let row = anchor.row; row < anchor.row + rowSpan; row++) {
      for (let col = anchor.col; col < anchor.col + colSpan; col++) {
        if (row === anchor.row && col === anchor.col) continue;

        const cell = this.dataStore.getCell(row, col);
        const updatedCell = {
          value: cell?.value ?? null,
          type: cell?.type ?? 'empty' as const,
          ...cell,
          mergeParent: { row: anchor.row, col: anchor.col },
        };
        delete updatedCell.merge;
        this.dataStore.setCell(row, col, updatedCell);
      }
    }
  }

  /**
   * Clear merge properties from data store cells.
   */
  private clearDataStoreMerge(mergeInfo: MergeInfo): void {
    const { anchor, rowSpan, colSpan } = mergeInfo;

    for (let row = anchor.row; row < anchor.row + rowSpan; row++) {
      for (let col = anchor.col; col < anchor.col + colSpan; col++) {
        const cell = this.dataStore.getCell(row, col);
        if (cell) {
          const updatedCell = { ...cell };
          delete updatedCell.merge;
          delete updatedCell.mergeParent;

          // Only update if there's something left in the cell
          if (updatedCell.value !== null || updatedCell.formula ||
              updatedCell.format || updatedCell.borders) {
            this.dataStore.setCell(row, col, updatedCell);
          } else {
            // Cell is now effectively empty, delete it
            this.dataStore.deleteCell(row, col);
          }
        }
      }
    }
  }

  // ===========================================================================
  // Serialization
  // ===========================================================================

  /**
   * Export all merges for serialization.
   */
  exportMerges(): MergeInfo[] {
    return this.getAllMerges();
  }

  /**
   * Import merges from serialized data.
   * Clears existing merges and imports the new ones.
   */
  importMerges(merges: MergeInfo[]): void {
    this.clearAll();

    for (const mergeInfo of merges) {
      const range: CellRange = {
        startRow: mergeInfo.anchor.row,
        startCol: mergeInfo.anchor.col,
        endRow: mergeInfo.anchor.row + mergeInfo.rowSpan - 1,
        endCol: mergeInfo.anchor.col + mergeInfo.colSpan - 1,
      };

      this.merge(range);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new MergeManager instance.
 */
export function createMergeManager(dataStore: SparseDataStore): MergeManager {
  return new MergeManager(dataStore);
}
