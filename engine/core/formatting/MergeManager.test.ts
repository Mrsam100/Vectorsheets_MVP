/**
 * VectorSheet Engine - MergeManager Unit Tests
 *
 * Tests cell merge management.
 * Covers:
 * - Merge/unmerge operations
 * - Merge queries and lookups
 * - Overlap detection and validation
 * - Display and navigation helpers
 * - Serialization
 * - Event callbacks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MergeManager,
  MergeInfo,
  MergeWriter,
  MergeReader,
  createMergeManager,
} from './MergeManager.js';
import { CellRange, CellRef } from '../types/index.js';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a mock MergeWriter for testing.
 */
function createMockWriter(): MergeWriter & {
  calls: Array<{ method: string; args: unknown[] }>;
} {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  return {
    calls,
    setMerge(row, col, merge) {
      calls.push({ method: 'setMerge', args: [row, col, merge] });
    },
    setMergeParent(row, col, parent) {
      calls.push({ method: 'setMergeParent', args: [row, col, parent] });
    },
    clearValue(row, col) {
      calls.push({ method: 'clearValue', args: [row, col] });
    },
  };
}

/**
 * Create a range helper.
 */
function range(startRow: number, startCol: number, endRow: number, endCol: number): CellRange {
  return { startRow, startCol, endRow, endCol };
}

/**
 * Create a cell reference helper.
 */
function cell(row: number, col: number): CellRef {
  return { row, col };
}

// =============================================================================
// Initial State Tests
// =============================================================================

describe('MergeManager', () => {
  describe('Initial State', () => {
    let mgr: MergeManager;

    beforeEach(() => {
      mgr = new MergeManager();
    });

    it('should have no merges initially', () => {
      expect(mgr.getMergeCount()).toBe(0);
    });

    it('should return empty array for getAllMerges', () => {
      expect(mgr.getAllMerges()).toEqual([]);
    });

    it('should return null for getMergeInfo on any cell', () => {
      expect(mgr.getMergeInfo(cell(0, 0))).toBeNull();
      expect(mgr.getMergeInfo(cell(10, 10))).toBeNull();
    });

    it('should return false for isMerged on any cell', () => {
      expect(mgr.isMerged(cell(0, 0))).toBe(false);
    });
  });

  // ===========================================================================
  // Merge Operations
  // ===========================================================================

  describe('Merge Operations', () => {
    let mgr: MergeManager;

    beforeEach(() => {
      mgr = new MergeManager();
    });

    describe('merge()', () => {
      it('should merge a 2x2 range', () => {
        const result = mgr.merge(range(0, 0, 1, 1));

        expect(result.success).toBe(true);
        expect(result.mergeInfo).toEqual({
          anchor: { row: 0, col: 0 },
          rowSpan: 2,
          colSpan: 2,
        });
      });

      it('should merge a horizontal range', () => {
        const result = mgr.merge(range(0, 0, 0, 3));

        expect(result.success).toBe(true);
        expect(result.mergeInfo?.rowSpan).toBe(1);
        expect(result.mergeInfo?.colSpan).toBe(4);
      });

      it('should merge a vertical range', () => {
        const result = mgr.merge(range(0, 0, 3, 0));

        expect(result.success).toBe(true);
        expect(result.mergeInfo?.rowSpan).toBe(4);
        expect(result.mergeInfo?.colSpan).toBe(1);
      });

      it('should normalize inverted range', () => {
        const result = mgr.merge(range(5, 5, 2, 2));

        expect(result.success).toBe(true);
        expect(result.mergeInfo?.anchor).toEqual({ row: 2, col: 2 });
        expect(result.mergeInfo?.rowSpan).toBe(4);
        expect(result.mergeInfo?.colSpan).toBe(4);
      });

      it('should fail for single cell', () => {
        const result = mgr.merge(range(0, 0, 0, 0));

        expect(result.success).toBe(false);
        expect(result.error).toBe('Cannot merge a single cell');
      });

      it('should fail for overlapping merge', () => {
        mgr.merge(range(0, 0, 2, 2));
        const result = mgr.merge(range(1, 1, 3, 3));

        expect(result.success).toBe(false);
        expect(result.error).toContain('conflicts');
      });

      it('should update merge count', () => {
        expect(mgr.getMergeCount()).toBe(0);
        mgr.merge(range(0, 0, 1, 1));
        expect(mgr.getMergeCount()).toBe(1);
        mgr.merge(range(5, 5, 6, 6));
        expect(mgr.getMergeCount()).toBe(2);
      });

      it('should call writer when provided', () => {
        const writer = createMockWriter();
        mgr.merge(range(0, 0, 1, 1), writer);

        // Should set merge on anchor
        expect(writer.calls.some(c =>
          c.method === 'setMerge' && c.args[0] === 0 && c.args[1] === 0
        )).toBe(true);

        // Should set mergeParent on non-anchor cells
        expect(writer.calls.some(c =>
          c.method === 'setMergeParent' && c.args[0] === 0 && c.args[1] === 1
        )).toBe(true);

        // Should clear values on non-anchor cells
        expect(writer.calls.some(c =>
          c.method === 'clearValue'
        )).toBe(true);
      });
    });

    describe('unmerge()', () => {
      beforeEach(() => {
        mgr.merge(range(0, 0, 2, 2));
      });

      it('should unmerge a range', () => {
        const result = mgr.unmerge(range(0, 0, 2, 2));

        expect(result.success).toBe(true);
        expect(mgr.getMergeCount()).toBe(0);
      });

      it('should return unmerged cells', () => {
        const result = mgr.unmerge(range(0, 0, 2, 2));

        expect(result.unmergedCells?.length).toBe(9); // 3x3
      });

      it('should return removed merge info', () => {
        const result = mgr.unmerge(range(0, 0, 2, 2));

        expect(result.removedMerges?.length).toBe(1);
        expect(result.removedMerges?.[0].anchor).toEqual({ row: 0, col: 0 });
      });

      it('should unmerge by touching any cell in merge', () => {
        const result = mgr.unmerge(range(1, 1, 1, 1)); // Middle cell

        expect(result.success).toBe(true);
        expect(mgr.getMergeCount()).toBe(0);
      });

      it('should fail if no merge in range', () => {
        const result = mgr.unmerge(range(10, 10, 11, 11));

        expect(result.success).toBe(false);
        expect(result.error).toBe('No merged cells in the specified range');
      });

      it('should unmerge multiple merges in range', () => {
        mgr.merge(range(5, 0, 6, 1));
        mgr.merge(range(5, 3, 6, 4));

        const result = mgr.unmerge(range(5, 0, 6, 4)); // Covers both

        expect(result.success).toBe(true);
        expect(result.removedMerges?.length).toBe(2);
        expect(mgr.getMergeCount()).toBe(1); // Original merge still there
      });

      it('should call writer when provided', () => {
        const writer = createMockWriter();
        mgr.unmerge(range(0, 0, 2, 2), writer);

        // Should clear merge from anchor
        expect(writer.calls.some(c =>
          c.method === 'setMerge' && c.args[2] === undefined
        )).toBe(true);

        // Should clear mergeParent from non-anchor cells
        expect(writer.calls.some(c =>
          c.method === 'setMergeParent' && c.args[2] === undefined
        )).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  describe('Query Methods', () => {
    let mgr: MergeManager;

    beforeEach(() => {
      mgr = new MergeManager();
      mgr.merge(range(0, 0, 2, 2)); // 3x3 merge at A1
      mgr.merge(range(5, 5, 6, 7)); // 2x3 merge at F6
    });

    describe('isMerged()', () => {
      it('should return true for anchor cell', () => {
        expect(mgr.isMerged(cell(0, 0))).toBe(true);
      });

      it('should return true for non-anchor cells in merge', () => {
        expect(mgr.isMerged(cell(1, 1))).toBe(true);
        expect(mgr.isMerged(cell(2, 2))).toBe(true);
      });

      it('should return false for non-merged cell', () => {
        expect(mgr.isMerged(cell(3, 3))).toBe(false);
      });
    });

    describe('getMergeInfo()', () => {
      it('should return merge info for anchor', () => {
        const info = mgr.getMergeInfo(cell(0, 0));

        expect(info).toEqual({
          anchor: { row: 0, col: 0 },
          rowSpan: 3,
          colSpan: 3,
        });
      });

      it('should return merge info for any cell in merge', () => {
        const info = mgr.getMergeInfo(cell(1, 2));

        expect(info?.anchor).toEqual({ row: 0, col: 0 });
      });

      it('should return null for non-merged cell', () => {
        expect(mgr.getMergeInfo(cell(4, 4))).toBeNull();
      });
    });

    describe('isMergeAnchor()', () => {
      it('should return true for anchor cell', () => {
        expect(mgr.isMergeAnchor(cell(0, 0))).toBe(true);
        expect(mgr.isMergeAnchor(cell(5, 5))).toBe(true);
      });

      it('should return false for non-anchor merged cell', () => {
        expect(mgr.isMergeAnchor(cell(1, 1))).toBe(false);
      });

      it('should return false for non-merged cell', () => {
        expect(mgr.isMergeAnchor(cell(10, 10))).toBe(false);
      });
    });

    describe('isMergedChild()', () => {
      it('should return false for anchor cell', () => {
        expect(mgr.isMergedChild(cell(0, 0))).toBe(false);
      });

      it('should return true for non-anchor merged cell', () => {
        expect(mgr.isMergedChild(cell(0, 1))).toBe(true);
        expect(mgr.isMergedChild(cell(1, 0))).toBe(true);
        expect(mgr.isMergedChild(cell(2, 2))).toBe(true);
      });

      it('should return false for non-merged cell', () => {
        expect(mgr.isMergedChild(cell(10, 10))).toBe(false);
      });
    });

    describe('getMergeAnchor()', () => {
      it('should return anchor for merged cell', () => {
        expect(mgr.getMergeAnchor(cell(1, 2))).toEqual({ row: 0, col: 0 });
      });

      it('should return anchor for anchor cell', () => {
        expect(mgr.getMergeAnchor(cell(0, 0))).toEqual({ row: 0, col: 0 });
      });

      it('should return null for non-merged cell', () => {
        expect(mgr.getMergeAnchor(cell(10, 10))).toBeNull();
      });
    });

    describe('getAllMerges()', () => {
      it('should return all merges', () => {
        const merges = mgr.getAllMerges();

        expect(merges.length).toBe(2);
        expect(merges.some(m => m.anchor.row === 0 && m.anchor.col === 0)).toBe(true);
        expect(merges.some(m => m.anchor.row === 5 && m.anchor.col === 5)).toBe(true);
      });
    });

    describe('getMergesInRange()', () => {
      it('should return merges in range', () => {
        const merges = mgr.getMergesInRange(range(0, 0, 10, 10));

        expect(merges.length).toBe(2);
      });

      it('should return empty for range with no merges', () => {
        const merges = mgr.getMergesInRange(range(100, 100, 110, 110));

        expect(merges.length).toBe(0);
      });

      it('should return merge if range overlaps partially', () => {
        const merges = mgr.getMergesInRange(range(2, 2, 3, 3));

        expect(merges.length).toBe(1);
        expect(merges[0].anchor).toEqual({ row: 0, col: 0 });
      });
    });

    describe('getMergeCount()', () => {
      it('should return correct count', () => {
        expect(mgr.getMergeCount()).toBe(2);
      });
    });
  });

  // ===========================================================================
  // Display and Navigation Helpers
  // ===========================================================================

  describe('Display and Navigation Helpers', () => {
    let mgr: MergeManager;

    beforeEach(() => {
      mgr = new MergeManager();
      mgr.merge(range(0, 0, 2, 3)); // 3x4 merge
    });

    describe('getDisplayRange()', () => {
      it('should return merge range for anchor cell', () => {
        const displayRange = mgr.getDisplayRange(cell(0, 0));

        expect(displayRange).toEqual({
          startRow: 0, startCol: 0, endRow: 2, endCol: 3,
        });
      });

      it('should return merge range for non-anchor merged cell', () => {
        const displayRange = mgr.getDisplayRange(cell(1, 2));

        expect(displayRange).toEqual({
          startRow: 0, startCol: 0, endRow: 2, endCol: 3,
        });
      });

      it('should return single-cell range for non-merged cell', () => {
        const displayRange = mgr.getDisplayRange(cell(5, 5));

        expect(displayRange).toEqual({
          startRow: 5, startCol: 5, endRow: 5, endCol: 5,
        });
      });
    });

    describe('getEditTarget()', () => {
      it('should return anchor for merged cell', () => {
        expect(mgr.getEditTarget(cell(1, 2))).toEqual({ row: 0, col: 0 });
      });

      it('should return anchor for anchor cell', () => {
        expect(mgr.getEditTarget(cell(0, 0))).toEqual({ row: 0, col: 0 });
      });

      it('should return same cell for non-merged cell', () => {
        expect(mgr.getEditTarget(cell(5, 5))).toEqual({ row: 5, col: 5 });
      });
    });

    describe('expandRangeToIncludeMerges()', () => {
      it('should expand range to include partial merge', () => {
        // Range touches bottom-right corner of merge
        const expanded = mgr.expandRangeToIncludeMerges(range(2, 3, 5, 5));

        expect(expanded).toEqual({
          startRow: 0, startCol: 0, endRow: 5, endCol: 5,
        });
      });

      it('should not expand if range doesn\'t touch any merge', () => {
        const expanded = mgr.expandRangeToIncludeMerges(range(10, 10, 12, 12));

        expect(expanded).toEqual({
          startRow: 10, startCol: 10, endRow: 12, endCol: 12,
        });
      });

      it('should expand for multiple merges', () => {
        mgr.merge(range(10, 10, 12, 12));

        // Range touches both merges
        const expanded = mgr.expandRangeToIncludeMerges(range(2, 3, 10, 10));

        expect(expanded.startRow).toBe(0);
        expect(expanded.startCol).toBe(0);
        expect(expanded.endRow).toBe(12);
        expect(expanded.endCol).toBe(12);
      });
    });
  });

  // ===========================================================================
  // Validation
  // ===========================================================================

  describe('Validation', () => {
    let mgr: MergeManager;

    beforeEach(() => {
      mgr = new MergeManager();
      mgr.merge(range(0, 0, 2, 2));
    });

    describe('canMerge()', () => {
      it('should return true for valid merge', () => {
        const result = mgr.canMerge(range(5, 5, 6, 6));

        expect(result.canMerge).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should return false for single cell', () => {
        const result = mgr.canMerge(range(5, 5, 5, 5));

        expect(result.canMerge).toBe(false);
        expect(result.reason).toBe('Cannot merge a single cell');
      });

      it('should return false for overlapping merge', () => {
        const result = mgr.canMerge(range(1, 1, 3, 3));

        expect(result.canMerge).toBe(false);
        expect(result.reason).toContain('Conflicts');
      });
    });

    describe('hasOverlappingMerge()', () => {
      it('should return true for overlapping range', () => {
        expect(mgr.hasOverlappingMerge(range(1, 1, 3, 3))).toBe(true);
      });

      it('should return false for non-overlapping range', () => {
        expect(mgr.hasOverlappingMerge(range(5, 5, 6, 6))).toBe(false);
      });

      it('should return true for exact match', () => {
        expect(mgr.hasOverlappingMerge(range(0, 0, 2, 2))).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Bulk Operations
  // ===========================================================================

  describe('Bulk Operations', () => {
    let mgr: MergeManager;

    beforeEach(() => {
      mgr = new MergeManager();
      mgr.merge(range(0, 0, 1, 1));
      mgr.merge(range(5, 5, 6, 6));
    });

    describe('clearAll()', () => {
      it('should clear all merges', () => {
        mgr.clearAll();

        expect(mgr.getMergeCount()).toBe(0);
        expect(mgr.getAllMerges()).toEqual([]);
      });

      it('should call writer when provided', () => {
        const writer = createMockWriter();
        mgr.clearAll(writer);

        // Should clear merge info from both anchors
        const setCalls = writer.calls.filter(c =>
          c.method === 'setMerge' && c.args[2] === undefined
        );
        expect(setCalls.length).toBe(2);
      });
    });

    describe('toggleMerge()', () => {
      it('should merge if not merged', () => {
        const result = mgr.toggleMerge(range(10, 10, 11, 11));

        expect(result.merged).toBe(true);
        expect(result.mergeInfo).toBeDefined();
        expect(mgr.getMergeCount()).toBe(3);
      });

      it('should unmerge if exact match', () => {
        const result = mgr.toggleMerge(range(0, 0, 1, 1));

        expect(result.merged).toBe(false);
        expect(mgr.getMergeCount()).toBe(1);
      });

      it('should fail if overlapping but not exact match', () => {
        const result = mgr.toggleMerge(range(0, 0, 2, 2));

        // Should fail because it conflicts with existing merge
        expect(result.merged).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Serialization
  // ===========================================================================

  describe('Serialization', () => {
    let mgr: MergeManager;

    beforeEach(() => {
      mgr = new MergeManager();
      mgr.merge(range(0, 0, 2, 2));
      mgr.merge(range(5, 5, 6, 7));
    });

    describe('exportMerges()', () => {
      it('should export all merges', () => {
        const exported = mgr.exportMerges();

        expect(exported.length).toBe(2);
        expect(exported.some(m =>
          m.anchor.row === 0 && m.anchor.col === 0 && m.rowSpan === 3 && m.colSpan === 3
        )).toBe(true);
        expect(exported.some(m =>
          m.anchor.row === 5 && m.anchor.col === 5 && m.rowSpan === 2 && m.colSpan === 3
        )).toBe(true);
      });
    });

    describe('importMerges()', () => {
      it('should import merges with clear', () => {
        const newMgr = new MergeManager();
        const merges: MergeInfo[] = [
          { anchor: { row: 10, col: 10 }, rowSpan: 2, colSpan: 2 },
          { anchor: { row: 20, col: 20 }, rowSpan: 3, colSpan: 4 },
        ];

        newMgr.importMerges(merges);

        expect(newMgr.getMergeCount()).toBe(2);
        expect(newMgr.isMerged(cell(10, 10))).toBe(true);
        expect(newMgr.isMerged(cell(20, 23))).toBe(true);
      });

      it('should clear existing merges by default', () => {
        mgr.importMerges([{ anchor: { row: 100, col: 100 }, rowSpan: 2, colSpan: 2 }]);

        expect(mgr.getMergeCount()).toBe(1);
        expect(mgr.isMerged(cell(0, 0))).toBe(false);
      });

      it('should not clear existing when clearExisting is false', () => {
        mgr.importMerges(
          [{ anchor: { row: 100, col: 100 }, rowSpan: 2, colSpan: 2 }],
          undefined,
          false
        );

        expect(mgr.getMergeCount()).toBe(3);
      });
    });

    describe('round-trip', () => {
      it('should preserve merges through export/import', () => {
        const exported = mgr.exportMerges();
        const newMgr = new MergeManager();
        newMgr.importMerges(exported);

        expect(newMgr.getMergeCount()).toBe(2);
        expect(newMgr.getMergeInfo(cell(0, 0))).toEqual(mgr.getMergeInfo(cell(0, 0)));
        expect(newMgr.getMergeInfo(cell(5, 5))).toEqual(mgr.getMergeInfo(cell(5, 5)));
      });
    });
  });

  // ===========================================================================
  // Legacy API
  // ===========================================================================

  describe('Legacy API', () => {
    let mgr: MergeManager;

    beforeEach(() => {
      mgr = new MergeManager();
      mgr.merge(range(0, 0, 2, 2));
    });

    it('getMergedRegionAt should return legacy format', () => {
      const region = mgr.getMergedRegionAt(0, 0);

      expect(region?.topLeft).toEqual({ row: 0, col: 0 });
      expect(region?.rowSpan).toBe(3);
      expect(region?.colSpan).toBe(3);
    });

    it('getMergedRegions should return all in legacy format', () => {
      const regions = mgr.getMergedRegions();

      expect(regions.length).toBe(1);
      expect(regions[0].topLeft).toBeDefined();
    });

    it('isMergedCell should work like isMergedChild', () => {
      expect(mgr.isMergedCell(1, 1)).toBe(true);
      expect(mgr.isMergedCell(0, 0)).toBe(false); // Anchor
    });

    it('isMergeOrigin should work like isMergeAnchor', () => {
      expect(mgr.isMergeOrigin(0, 0)).toBe(true);
      expect(mgr.isMergeOrigin(1, 1)).toBe(false);
    });
  });

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  describe('Event Handlers', () => {
    let mgr: MergeManager;

    beforeEach(() => {
      mgr = new MergeManager();
    });

    it('should call onMerge when merging', () => {
      const onMerge = vi.fn();
      mgr.setEventHandlers({ onMerge });

      mgr.merge(range(0, 0, 1, 1));

      expect(onMerge).toHaveBeenCalledTimes(1);
      expect(onMerge).toHaveBeenCalledWith(expect.objectContaining({
        anchor: { row: 0, col: 0 },
      }));
    });

    it('should call onUnmerge when unmerging', () => {
      const onUnmerge = vi.fn();
      mgr.merge(range(0, 0, 1, 1));
      mgr.setEventHandlers({ onUnmerge });

      mgr.unmerge(range(0, 0, 1, 1));

      expect(onUnmerge).toHaveBeenCalledTimes(1);
    });

    it('should not call onMerge when merge fails', () => {
      const onMerge = vi.fn();
      mgr.setEventHandlers({ onMerge });

      mgr.merge(range(0, 0, 0, 0)); // Single cell - fails

      expect(onMerge).not.toHaveBeenCalled();
    });

    it('should merge event handlers', () => {
      const onMerge = vi.fn();
      const onUnmerge = vi.fn();

      mgr.setEventHandlers({ onMerge });
      mgr.setEventHandlers({ onUnmerge });

      mgr.merge(range(0, 0, 1, 1));
      mgr.unmerge(range(0, 0, 1, 1));

      expect(onMerge).toHaveBeenCalled();
      expect(onUnmerge).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Factory Function
  // ===========================================================================

  describe('Factory Function', () => {
    it('createMergeManager should create instance', () => {
      const mgr = createMergeManager();

      expect(mgr).toBeInstanceOf(MergeManager);
      expect(mgr.getMergeCount()).toBe(0);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    let mgr: MergeManager;

    beforeEach(() => {
      mgr = new MergeManager();
    });

    it('should handle large merge', () => {
      const result = mgr.merge(range(0, 0, 99, 99));

      expect(result.success).toBe(true);
      expect(result.mergeInfo?.rowSpan).toBe(100);
      expect(result.mergeInfo?.colSpan).toBe(100);
    });

    it('should handle merge at high row/col', () => {
      const result = mgr.merge(range(999999, 999999, 1000000, 1000000));

      expect(result.success).toBe(true);
    });

    it('should handle adjacent merges', () => {
      mgr.merge(range(0, 0, 1, 1));
      const result = mgr.merge(range(0, 2, 1, 3));

      expect(result.success).toBe(true);
      expect(mgr.getMergeCount()).toBe(2);
    });

    it('should handle many merges', () => {
      for (let i = 0; i < 100; i++) {
        mgr.merge(range(i * 3, 0, i * 3 + 1, 1));
      }

      expect(mgr.getMergeCount()).toBe(100);
    });

    it('should handle merge with exactly touching edges', () => {
      mgr.merge(range(0, 0, 2, 2));

      // Adjacent on right
      const result1 = mgr.merge(range(0, 3, 2, 5));
      expect(result1.success).toBe(true);

      // Adjacent below
      const result2 = mgr.merge(range(3, 0, 5, 2));
      expect(result2.success).toBe(true);
    });

    it('should unmerge and re-merge same range', () => {
      mgr.merge(range(0, 0, 1, 1));
      mgr.unmerge(range(0, 0, 1, 1));
      const result = mgr.merge(range(0, 0, 1, 1));

      expect(result.success).toBe(true);
      expect(mgr.getMergeCount()).toBe(1);
    });

    it('should handle overlapping unmerge range larger than merge', () => {
      mgr.merge(range(5, 5, 6, 6));

      const result = mgr.unmerge(range(0, 0, 10, 10));

      expect(result.success).toBe(true);
      expect(mgr.getMergeCount()).toBe(0);
    });
  });
});
