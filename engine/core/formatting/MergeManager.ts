/**
 * VectorSheet Engine - Merge Manager (Production Grade)
 *
 * Structural sheet-state manager for merged cells.
 * Manages cell merge operations with strict validation.
 *
 * Responsibilities:
 * - Merge rectangular ranges into a single logical cell
 * - Track merge metadata (anchor cell, rowSpan, colSpan)
 * - Prevent invalid merges (overlapping, partial overlaps)
 * - Coordinate with data store for persistence
 *
 * Behavior:
 * - Merged cells act as one unit for editing, selection, rendering
 * - Unmerge restores all underlying cells
 * - Deterministic and testable
 *
 * Architecture:
 * - Uses MergeReader/MergeWriter interfaces for decoupling
 * - Dual indexing for O(1) lookup by anchor or any cell
 * - No UI or rendering logic
 */

import { CellRef, CellRange, cellKey, rangesOverlap } from '../types/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Information about a merged region.
 */
export interface MergeInfo {
  /** Anchor cell (top-left of merge) */
  anchor: CellRef;
  /** Number of rows in the merge */
  rowSpan: number;
  /** Number of columns in the merge */
  colSpan: number;
}

/**
 * Legacy type alias for backward compatibility.
 * @deprecated Use MergeInfo instead
 */
export interface MergedRegion {
  /** Top-left cell of the merged region */
  topLeft: CellRef;
  /** Number of rows in the merge */
  rowSpan: number;
  /** Number of columns in the merge */
  colSpan: number;
}

/**
 * Result of a merge operation.
 */
export interface MergeResult {
  /** Whether the merge was successful */
  success: boolean;
  /** Error message if merge failed */
  error?: string;
  /** The merge info if successful */
  mergeInfo?: MergeInfo;
}

/**
 * Result of an unmerge operation.
 */
export interface UnmergeResult {
  /** Whether the unmerge was successful */
  success: boolean;
  /** Error message if unmerge failed */
  error?: string;
  /** The cells that were unmerged */
  unmergedCells?: CellRef[];
  /** The merge infos that were removed */
  removedMerges?: MergeInfo[];
}

/**
 * Events emitted by MergeManager.
 */
export interface MergeManagerEvents {
  /** Called when cells are merged */
  onMerge?: (mergeInfo: MergeInfo) => void;
  /** Called when cells are unmerged */
  onUnmerge?: (mergeInfo: MergeInfo) => void;
}

/**
 * Interface for reading cell merge data.
 * Decouples from SpreadsheetEngine/SparseDataStore.
 */
export interface MergeReader {
  /** Get cell value */
  getValue(row: number, col: number): unknown;
  /** Check if cell has merge info (is anchor) */
  getMerge(row: number, col: number): { rowSpan: number; colSpan: number } | undefined;
  /** Check if cell has merge parent (is part of merge but not anchor) */
  getMergeParent(row: number, col: number): { row: number; col: number } | undefined;
}

/**
 * Interface for writing cell merge data.
 */
export interface MergeWriter {
  /** Set merge info on anchor cell */
  setMerge(row: number, col: number, merge: { rowSpan: number; colSpan: number } | undefined): void;
  /** Set merge parent on non-anchor cells */
  setMergeParent(row: number, col: number, parent: { row: number; col: number } | undefined): void;
  /** Clear cell value (for non-anchor cells in merge) */
  clearValue(row: number, col: number): void;
}

// =============================================================================
// MergeManager Class
// =============================================================================

export class MergeManager {
  /**
   * Internal index of all merges by anchor key.
   * Key format: "row_col" for the anchor cell.
   */
  private merges: Map<string, MergeInfo> = new Map();

  /**
   * Reverse index: maps any cell in a merge to its anchor key.
   * Key format: "row_col" -> anchor key "row_col".
   */
  private cellToAnchor: Map<string, string> = new Map();

  /** Event handlers */
  private events: MergeManagerEvents = {};

  constructor() {
    // Initialize with empty state
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Set event handlers.
   */
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
   * @param writer Interface to write merge data (optional for pure state management)
   * @returns Result indicating success or failure with reason
   */
  merge(range: CellRange, writer?: MergeWriter): MergeResult {
    // Normalize range (ensure start <= end)
    const normalized = this.normalizeRange(range);

    // Validate range dimensions
    const rowSpan = normalized.endRow - normalized.startRow + 1;
    const colSpan = normalized.endCol - normalized.startCol + 1;

    if (rowSpan === 1 && colSpan === 1) {
      return {
        success: false,
        error: 'Cannot merge a single cell',
      };
    }

    // Check for conflicts with existing merges
    const conflict = this.findConflictingMerge(normalized);
    if (conflict) {
      return {
        success: false,
        error: `Range conflicts with existing merge at row ${conflict.anchor.row}, col ${conflict.anchor.col}`,
      };
    }

    // Create the merge
    const anchor: CellRef = {
      row: normalized.startRow,
      col: normalized.startCol,
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
    for (let row = normalized.startRow; row <= normalized.endRow; row++) {
      for (let col = normalized.startCol; col <= normalized.endCol; col++) {
        this.cellToAnchor.set(cellKey(row, col), anchorKey);
      }
    }

    // Update data store if writer provided
    if (writer) {
      this.writeMergeToStore(mergeInfo, writer);
    }

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
   * @param writer Interface to write merge data (optional)
   * @returns Result indicating success or failure
   */
  unmerge(range: CellRange, writer?: MergeWriter): UnmergeResult {
    const normalized = this.normalizeRange(range);

    // Find all merges that intersect with the range
    const mergesToRemove = this.findMergesInRange(normalized);

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

      // Clear merge data from store if writer provided
      if (writer) {
        this.clearMergeFromStore(mergeInfo, writer);
      }

      // Emit event
      this.events.onUnmerge?.(mergeInfo);
    }

    return {
      success: true,
      unmergedCells,
      removedMerges: mergesToRemove,
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

  // ===========================================================================
  // Additional Query Methods
  // ===========================================================================

  /**
   * Check if a cell is the anchor (top-left) of a merge.
   */
  isMergeAnchor(cellRef: CellRef): boolean {
    return this.merges.has(cellKey(cellRef.row, cellRef.col));
  }

  /**
   * Check if a cell is part of a merge but not the anchor.
   */
  isMergedChild(cellRef: CellRef): boolean {
    const key = cellKey(cellRef.row, cellRef.col);
    const anchorKey = this.cellToAnchor.get(key);
    return anchorKey !== undefined && anchorKey !== key;
  }

  /**
   * Get the anchor cell for a merged cell.
   */
  getMergeAnchor(cellRef: CellRef): CellRef | null {
    const mergeInfo = this.getMergeInfo(cellRef);
    return mergeInfo?.anchor ?? null;
  }

  /**
   * Get all merges in the sheet.
   */
  getAllMerges(): MergeInfo[] {
    return Array.from(this.merges.values());
  }

  /**
   * Get all merges that intersect with a range.
   */
  getMergesInRange(range: CellRange): MergeInfo[] {
    return this.findMergesInRange(this.normalizeRange(range));
  }

  /**
   * Get the total number of merged regions.
   */
  getMergeCount(): number {
    return this.merges.size;
  }

  // ===========================================================================
  // Convenience Methods (for backward compatibility)
  // ===========================================================================

  /**
   * Get merged region at a cell (legacy API).
   * @deprecated Use getMergeInfo instead
   */
  getMergedRegionAt(row: number, col: number): MergedRegion | null {
    const mergeInfo = this.getMergeInfo({ row, col });
    if (!mergeInfo) return null;

    return {
      topLeft: mergeInfo.anchor,
      rowSpan: mergeInfo.rowSpan,
      colSpan: mergeInfo.colSpan,
    };
  }

  /**
   * Get all merged regions (legacy API).
   * @deprecated Use getAllMerges instead
   */
  getMergedRegions(): MergedRegion[] {
    return this.getAllMerges().map(m => ({
      topLeft: m.anchor,
      rowSpan: m.rowSpan,
      colSpan: m.colSpan,
    }));
  }

  /**
   * Check if a cell is part of a merge but not the origin.
   * @deprecated Use isMergedChild instead
   */
  isMergedCell(row: number, col: number): boolean {
    return this.isMergedChild({ row, col });
  }

  /**
   * Check if a cell is the origin of a merge.
   * @deprecated Use isMergeAnchor instead
   */
  isMergeOrigin(row: number, col: number): boolean {
    return this.isMergeAnchor({ row, col });
  }

  // ===========================================================================
  // Display and Navigation Helpers
  // ===========================================================================

  /**
   * Get the effective display range for a cell.
   * For merged cells, returns the full merge range.
   * For non-merged cells, returns a single-cell range.
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
   * Get the cell that should actually be edited.
   * Non-anchor cells in a merge redirect to the anchor.
   */
  getEditTarget(cellRef: CellRef): CellRef {
    const anchor = this.getMergeAnchor(cellRef);
    return anchor ?? cellRef;
  }

  /**
   * Expand a range to include any merges that partially intersect.
   * Useful when selecting or deleting ranges that touch merges.
   */
  expandRangeToIncludeMerges(range: CellRange): CellRange {
    const normalized = this.normalizeRange(range);
    let { startRow, startCol, endRow, endCol } = normalized;

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
  // Validation
  // ===========================================================================

  /**
   * Check if a range can be merged (validation only, no mutation).
   */
  canMerge(range: CellRange): { canMerge: boolean; reason?: string } {
    const normalized = this.normalizeRange(range);

    const rowSpan = normalized.endRow - normalized.startRow + 1;
    const colSpan = normalized.endCol - normalized.startCol + 1;

    if (rowSpan === 1 && colSpan === 1) {
      return { canMerge: false, reason: 'Cannot merge a single cell' };
    }

    const conflict = this.findConflictingMerge(normalized);
    if (conflict) {
      return {
        canMerge: false,
        reason: `Conflicts with existing merge at row ${conflict.anchor.row}, col ${conflict.anchor.col}`,
      };
    }

    return { canMerge: true };
  }

  /**
   * Check if a range overlaps with any existing merge.
   */
  hasOverlappingMerge(range: CellRange): boolean {
    return this.findConflictingMerge(this.normalizeRange(range)) !== null;
  }

  // ===========================================================================
  // Bulk Operations
  // ===========================================================================

  /**
   * Clear all merges.
   */
  clearAll(writer?: MergeWriter): void {
    if (writer) {
      for (const mergeInfo of this.merges.values()) {
        this.clearMergeFromStore(mergeInfo, writer);
      }
    }

    this.merges.clear();
    this.cellToAnchor.clear();
  }

  /**
   * Toggle merge for a range.
   * If the range exactly matches an existing merge, unmerge it.
   * Otherwise, merge the range.
   */
  toggleMerge(range: CellRange, writer?: MergeWriter): { merged: boolean; mergeInfo?: MergeInfo } {
    const normalized = this.normalizeRange(range);
    const existing = this.getMergeInfo({ row: normalized.startRow, col: normalized.startCol });

    if (existing) {
      // Check if existing merge exactly matches the range
      const endRow = existing.anchor.row + existing.rowSpan - 1;
      const endCol = existing.anchor.col + existing.colSpan - 1;

      if (existing.anchor.row === normalized.startRow &&
          existing.anchor.col === normalized.startCol &&
          endRow === normalized.endRow &&
          endCol === normalized.endCol) {
        // Exact match - unmerge
        this.unmerge(range, writer);
        return { merged: false };
      }
    }

    // Merge the range
    const result = this.merge(range, writer);
    return { merged: result.success, mergeInfo: result.mergeInfo };
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
   * Optionally clears existing merges first.
   */
  importMerges(merges: MergeInfo[], writer?: MergeWriter, clearExisting: boolean = true): void {
    if (clearExisting) {
      this.clearAll(writer);
    }

    for (const mergeInfo of merges) {
      const range: CellRange = {
        startRow: mergeInfo.anchor.row,
        startCol: mergeInfo.anchor.col,
        endRow: mergeInfo.anchor.row + mergeInfo.rowSpan - 1,
        endCol: mergeInfo.anchor.col + mergeInfo.colSpan - 1,
      };

      this.merge(range, writer);
    }
  }

  /**
   * Import merged regions (legacy format).
   * @deprecated Use importMerges instead
   */
  importMergedRegions(regions: MergedRegion[], writer?: MergeWriter): void {
    const merges: MergeInfo[] = regions.map(r => ({
      anchor: r.topLeft,
      rowSpan: r.rowSpan,
      colSpan: r.colSpan,
    }));
    this.importMerges(merges, writer);
  }

  /**
   * Export merged regions (legacy format).
   * @deprecated Use exportMerges instead
   */
  exportMergedRegions(): MergedRegion[] {
    return this.getMergedRegions();
  }

  // ===========================================================================
  // Sync from Data Store
  // ===========================================================================

  /**
   * Rebuild merge index from data store.
   * Useful after loading a sheet or when store is modified externally.
   */
  syncFromStore(reader: MergeReader, bounds: CellRange): void {
    this.merges.clear();
    this.cellToAnchor.clear();

    for (let row = bounds.startRow; row <= bounds.endRow; row++) {
      for (let col = bounds.startCol; col <= bounds.endCol; col++) {
        const merge = reader.getMerge(row, col);

        if (merge) {
          const mergeInfo: MergeInfo = {
            anchor: { row, col },
            rowSpan: merge.rowSpan,
            colSpan: merge.colSpan,
          };

          const anchorKey = cellKey(row, col);
          this.merges.set(anchorKey, mergeInfo);

          // Index all cells in the merge
          for (let r = row; r < row + merge.rowSpan; r++) {
            for (let c = col; c < col + merge.colSpan; c++) {
              this.cellToAnchor.set(cellKey(r, c), anchorKey);
            }
          }
        }
      }
    }
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
   * Find a merge that conflicts with the given range.
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
   * Write merge data to store.
   */
  private writeMergeToStore(mergeInfo: MergeInfo, writer: MergeWriter): void {
    const { anchor, rowSpan, colSpan } = mergeInfo;

    // Set merge info on anchor cell
    writer.setMerge(anchor.row, anchor.col, { rowSpan, colSpan });

    // Set merge parent on non-anchor cells
    for (let row = anchor.row; row < anchor.row + rowSpan; row++) {
      for (let col = anchor.col; col < anchor.col + colSpan; col++) {
        if (row === anchor.row && col === anchor.col) continue;

        writer.setMergeParent(row, col, { row: anchor.row, col: anchor.col });
        writer.clearValue(row, col);
      }
    }
  }

  /**
   * Clear merge data from store.
   */
  private clearMergeFromStore(mergeInfo: MergeInfo, writer: MergeWriter): void {
    const { anchor, rowSpan, colSpan } = mergeInfo;

    // Clear merge info from anchor
    writer.setMerge(anchor.row, anchor.col, undefined);

    // Clear merge parent from non-anchor cells
    for (let row = anchor.row; row < anchor.row + rowSpan; row++) {
      for (let col = anchor.col; col < anchor.col + colSpan; col++) {
        if (row === anchor.row && col === anchor.col) continue;
        writer.setMergeParent(row, col, undefined);
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new MergeManager instance.
 */
export function createMergeManager(): MergeManager {
  return new MergeManager();
}

// =============================================================================
// Adapter for SparseDataStore
// =============================================================================

/**
 * Create a MergeReader adapter from a data store.
 */
export function createMergeReaderFromDataStore(
  dataStore: {
    getCell(row: number, col: number): {
      value?: unknown;
      merge?: { rowSpan: number; colSpan: number };
      mergeParent?: { row: number; col: number };
    } | null;
  }
): MergeReader {
  return {
    getValue(row: number, col: number): unknown {
      return dataStore.getCell(row, col)?.value;
    },
    getMerge(row: number, col: number): { rowSpan: number; colSpan: number } | undefined {
      return dataStore.getCell(row, col)?.merge;
    },
    getMergeParent(row: number, col: number): { row: number; col: number } | undefined {
      return dataStore.getCell(row, col)?.mergeParent;
    },
  };
}

/**
 * Create a MergeWriter adapter for a data store.
 */
export function createMergeWriterFromDataStore(
  dataStore: {
    getCell(row: number, col: number): {
      value?: unknown;
      type?: string;
      merge?: { rowSpan: number; colSpan: number };
      mergeParent?: { row: number; col: number };
    } | null;
    setCell(row: number, col: number, cell: {
      value?: unknown;
      type?: string;
      merge?: { rowSpan: number; colSpan: number };
      mergeParent?: { row: number; col: number };
    }): void;
  }
): MergeWriter {
  return {
    setMerge(row: number, col: number, merge: { rowSpan: number; colSpan: number } | undefined): void {
      const existing = dataStore.getCell(row, col);
      const updated = existing ? { ...existing } : { value: null, type: 'empty' };

      if (merge) {
        updated.merge = merge;
        delete updated.mergeParent;
      } else {
        delete updated.merge;
      }

      dataStore.setCell(row, col, updated);
    },
    setMergeParent(row: number, col: number, parent: { row: number; col: number } | undefined): void {
      const existing = dataStore.getCell(row, col);
      const updated = existing ? { ...existing } : { value: null, type: 'empty' };

      if (parent) {
        updated.mergeParent = parent;
        delete updated.merge;
      } else {
        delete updated.mergeParent;
      }

      dataStore.setCell(row, col, updated);
    },
    clearValue(row: number, col: number): void {
      const existing = dataStore.getCell(row, col);
      if (existing) {
        dataStore.setCell(row, col, { ...existing, value: null, type: 'empty' });
      }
    },
  };
}
