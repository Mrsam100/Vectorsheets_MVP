/**
 * VectorSheet Engine - SelectionManager Unit Tests
 *
 * Tests the Excel-exact selection model implementation.
 * Covers:
 * - Utility functions
 * - State factories
 * - Selection queries
 * - Core operations (click, shift+click, ctrl+click)
 * - Keyboard navigation
 * - Mouse interactions
 * - Event subscriptions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SelectionManager,
  SelectionState,
  SelectionChangeEvent,
  normalizeRange,
  cellToRange,
  rangesEqual,
  cellsEqual,
  clampCell,
  clampRange,
  spanRange,
  getRangeCellCount,
  isCellInRange,
  getUnionBounds,
  createInitialSelection,
  createCellSelection,
  createRangeSelection,
} from './SelectionManager.js';
import { CellRef, CellRange, MAX_ROWS, MAX_COLS } from '../types/index.js';

// =============================================================================
// Utility Functions
// =============================================================================

describe('Selection Utility Functions', () => {
  describe('normalizeRange', () => {
    it('should normalize range with start > end', () => {
      const range: CellRange = { startRow: 5, startCol: 5, endRow: 2, endCol: 2 };
      const normalized = normalizeRange(range);

      expect(normalized.startRow).toBe(2);
      expect(normalized.startCol).toBe(2);
      expect(normalized.endRow).toBe(5);
      expect(normalized.endCol).toBe(5);
    });

    it('should keep already normalized range unchanged', () => {
      const range: CellRange = { startRow: 1, startCol: 2, endRow: 5, endCol: 10 };
      const normalized = normalizeRange(range);

      expect(normalized).toEqual(range);
    });

    it('should handle single cell range', () => {
      const range: CellRange = { startRow: 3, startCol: 3, endRow: 3, endCol: 3 };
      const normalized = normalizeRange(range);

      expect(normalized).toEqual(range);
    });
  });

  describe('cellToRange', () => {
    it('should create single-cell range', () => {
      const cell: CellRef = { row: 5, col: 10 };
      const range = cellToRange(cell);

      expect(range.startRow).toBe(5);
      expect(range.startCol).toBe(10);
      expect(range.endRow).toBe(5);
      expect(range.endCol).toBe(10);
    });
  });

  describe('rangesEqual', () => {
    it('should return true for equal ranges', () => {
      const a: CellRange = { startRow: 1, startCol: 2, endRow: 3, endCol: 4 };
      const b: CellRange = { startRow: 1, startCol: 2, endRow: 3, endCol: 4 };

      expect(rangesEqual(a, b)).toBe(true);
    });

    it('should return false for different ranges', () => {
      const a: CellRange = { startRow: 1, startCol: 2, endRow: 3, endCol: 4 };
      const b: CellRange = { startRow: 1, startCol: 2, endRow: 3, endCol: 5 };

      expect(rangesEqual(a, b)).toBe(false);
    });
  });

  describe('cellsEqual', () => {
    it('should return true for equal cells', () => {
      expect(cellsEqual({ row: 5, col: 3 }, { row: 5, col: 3 })).toBe(true);
    });

    it('should return false for different cells', () => {
      expect(cellsEqual({ row: 5, col: 3 }, { row: 5, col: 4 })).toBe(false);
    });
  });

  describe('clampCell', () => {
    it('should clamp negative values to 0', () => {
      const clamped = clampCell({ row: -5, col: -10 });
      expect(clamped.row).toBe(0);
      expect(clamped.col).toBe(0);
    });

    it('should clamp values exceeding MAX to MAX-1', () => {
      const clamped = clampCell({ row: MAX_ROWS + 100, col: MAX_COLS + 100 });
      expect(clamped.row).toBe(MAX_ROWS - 1);
      expect(clamped.col).toBe(MAX_COLS - 1);
    });

    it('should keep valid values unchanged', () => {
      const clamped = clampCell({ row: 100, col: 50 });
      expect(clamped.row).toBe(100);
      expect(clamped.col).toBe(50);
    });
  });

  describe('clampRange', () => {
    it('should clamp all values to valid bounds', () => {
      const range: CellRange = {
        startRow: -10,
        startCol: -5,
        endRow: MAX_ROWS + 100,
        endCol: MAX_COLS + 50,
      };
      const clamped = clampRange(range);

      expect(clamped.startRow).toBe(0);
      expect(clamped.startCol).toBe(0);
      expect(clamped.endRow).toBe(MAX_ROWS - 1);
      expect(clamped.endCol).toBe(MAX_COLS - 1);
    });
  });

  describe('spanRange', () => {
    it('should create range spanning two cells', () => {
      const anchor: CellRef = { row: 2, col: 3 };
      const active: CellRef = { row: 5, col: 7 };
      const range = spanRange(anchor, active);

      expect(range.startRow).toBe(2);
      expect(range.startCol).toBe(3);
      expect(range.endRow).toBe(5);
      expect(range.endCol).toBe(7);
    });

    it('should normalize when active is before anchor', () => {
      const anchor: CellRef = { row: 10, col: 10 };
      const active: CellRef = { row: 5, col: 5 };
      const range = spanRange(anchor, active);

      expect(range.startRow).toBe(5);
      expect(range.startCol).toBe(5);
      expect(range.endRow).toBe(10);
      expect(range.endCol).toBe(10);
    });
  });

  describe('getRangeCellCount', () => {
    it('should return 1 for single cell', () => {
      const range: CellRange = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
      expect(getRangeCellCount(range)).toBe(1);
    });

    it('should return correct count for range', () => {
      // 3 rows x 4 cols = 12 cells
      const range: CellRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 3 };
      expect(getRangeCellCount(range)).toBe(12);
    });
  });

  describe('isCellInRange', () => {
    const range: CellRange = { startRow: 2, startCol: 3, endRow: 5, endCol: 8 };

    it('should return true for cell inside range', () => {
      expect(isCellInRange({ row: 3, col: 5 }, range)).toBe(true);
    });

    it('should return true for cell at range corners', () => {
      expect(isCellInRange({ row: 2, col: 3 }, range)).toBe(true); // top-left
      expect(isCellInRange({ row: 5, col: 8 }, range)).toBe(true); // bottom-right
    });

    it('should return false for cell outside range', () => {
      expect(isCellInRange({ row: 1, col: 5 }, range)).toBe(false);
      expect(isCellInRange({ row: 6, col: 5 }, range)).toBe(false);
      expect(isCellInRange({ row: 3, col: 2 }, range)).toBe(false);
      expect(isCellInRange({ row: 3, col: 9 }, range)).toBe(false);
    });
  });

  describe('getUnionBounds', () => {
    it('should return null for empty array', () => {
      expect(getUnionBounds([])).toBeNull();
    });

    it('should return same range for single range', () => {
      const range: CellRange = { startRow: 2, startCol: 3, endRow: 5, endCol: 8 };
      expect(getUnionBounds([range])).toEqual(range);
    });

    it('should return union of multiple ranges', () => {
      const ranges: CellRange[] = [
        { startRow: 0, startCol: 0, endRow: 2, endCol: 2 },
        { startRow: 5, startCol: 5, endRow: 10, endCol: 10 },
      ];
      const union = getUnionBounds(ranges);

      expect(union?.startRow).toBe(0);
      expect(union?.startCol).toBe(0);
      expect(union?.endRow).toBe(10);
      expect(union?.endCol).toBe(10);
    });
  });
});

// =============================================================================
// State Factories
// =============================================================================

describe('Selection State Factories', () => {
  describe('createInitialSelection', () => {
    it('should create selection at A1', () => {
      const state = createInitialSelection();

      expect(state.activeCell.row).toBe(0);
      expect(state.activeCell.col).toBe(0);
      expect(state.anchorCell.row).toBe(0);
      expect(state.anchorCell.col).toBe(0);
      expect(state.ranges.length).toBe(1);
      expect(state.activeRangeIndex).toBe(0);
      expect(state.mode).toBe('normal');
    });

    it('should be frozen (immutable)', () => {
      const state = createInitialSelection();
      expect(Object.isFrozen(state)).toBe(true);
    });
  });

  describe('createCellSelection', () => {
    it('should create single cell selection', () => {
      const state = createCellSelection({ row: 5, col: 10 });

      expect(state.activeCell.row).toBe(5);
      expect(state.activeCell.col).toBe(10);
      expect(state.ranges[0].startRow).toBe(5);
      expect(state.ranges[0].endRow).toBe(5);
    });

    it('should clamp invalid coordinates', () => {
      const state = createCellSelection({ row: -5, col: MAX_COLS + 100 });

      expect(state.activeCell.row).toBe(0);
      expect(state.activeCell.col).toBe(MAX_COLS - 1);
    });
  });

  describe('createRangeSelection', () => {
    it('should create range selection', () => {
      const range: CellRange = { startRow: 2, startCol: 3, endRow: 5, endCol: 8 };
      const state = createRangeSelection(range);

      expect(state.ranges[0]).toEqual(range);
      expect(state.activeCell.row).toBe(2);
      expect(state.activeCell.col).toBe(3);
    });

    it('should accept custom active cell within range', () => {
      const range: CellRange = { startRow: 2, startCol: 3, endRow: 5, endCol: 8 };
      const state = createRangeSelection(range, { row: 4, col: 6 });

      expect(state.activeCell.row).toBe(4);
      expect(state.activeCell.col).toBe(6);
    });

    it('should clamp active cell to range bounds', () => {
      const range: CellRange = { startRow: 2, startCol: 3, endRow: 5, endCol: 8 };
      const state = createRangeSelection(range, { row: 100, col: 100 });

      expect(state.activeCell.row).toBe(5); // clamped to endRow
      expect(state.activeCell.col).toBe(8); // clamped to endCol
    });

    it('should normalize inverted range', () => {
      const range: CellRange = { startRow: 5, startCol: 8, endRow: 2, endCol: 3 };
      const state = createRangeSelection(range);

      expect(state.ranges[0].startRow).toBe(2);
      expect(state.ranges[0].startCol).toBe(3);
      expect(state.ranges[0].endRow).toBe(5);
      expect(state.ranges[0].endCol).toBe(8);
    });
  });
});

// =============================================================================
// SelectionManager Core
// =============================================================================

describe('SelectionManager', () => {
  let manager: SelectionManager;

  beforeEach(() => {
    manager = new SelectionManager();
  });

  describe('Construction', () => {
    it('should initialize with A1 selected', () => {
      const state = manager.getState();

      expect(state.activeCell.row).toBe(0);
      expect(state.activeCell.col).toBe(0);
      expect(state.ranges.length).toBe(1);
    });

    it('should accept initial state', () => {
      const initialState = createCellSelection({ row: 5, col: 5 });
      const mgr = new SelectionManager(null, initialState);

      expect(mgr.getActiveCell().row).toBe(5);
      expect(mgr.getActiveCell().col).toBe(5);
    });
  });

  describe('State Access', () => {
    it('getState should return immutable state', () => {
      const state = manager.getState();
      expect(Object.isFrozen(state)).toBe(true);
    });

    it('getActiveRange should return primary range', () => {
      manager.setRange({ startRow: 2, startCol: 3, endRow: 5, endCol: 8 });
      const range = manager.getActiveRange();

      expect(range.startRow).toBe(2);
      expect(range.endRow).toBe(5);
    });

    it('getActiveCell should return current active cell', () => {
      manager.setActiveCell({ row: 10, col: 15 });
      const cell = manager.getActiveCell();

      expect(cell.row).toBe(10);
      expect(cell.col).toBe(15);
    });

    it('getAnchorCell should return anchor', () => {
      manager.setActiveCell({ row: 3, col: 4 });
      expect(manager.getAnchorCell().row).toBe(3);
    });

    it('getAllRanges should return readonly array', () => {
      const ranges = manager.getAllRanges();
      expect(Array.isArray(ranges)).toBe(true);
    });
  });

  describe('Selection Queries', () => {
    describe('isCellSelected', () => {
      it('should return true for selected cell', () => {
        manager.setRange({ startRow: 2, startCol: 2, endRow: 5, endCol: 5 });
        expect(manager.isCellSelected(3, 3)).toBe(true);
      });

      it('should return false for unselected cell', () => {
        manager.setRange({ startRow: 2, startCol: 2, endRow: 5, endCol: 5 });
        expect(manager.isCellSelected(10, 10)).toBe(false);
      });
    });

    describe('isActiveCell', () => {
      it('should return true for active cell', () => {
        manager.setActiveCell({ row: 5, col: 5 });
        expect(manager.isActiveCell(5, 5)).toBe(true);
      });

      it('should return false for non-active cell', () => {
        manager.setActiveCell({ row: 5, col: 5 });
        expect(manager.isActiveCell(5, 6)).toBe(false);
      });
    });

    describe('isSingleCell', () => {
      it('should return true for single cell selection', () => {
        manager.setActiveCell({ row: 5, col: 5 });
        expect(manager.isSingleCell()).toBe(true);
      });

      it('should return false for range selection', () => {
        manager.setRange({ startRow: 2, startCol: 2, endRow: 5, endCol: 5 });
        expect(manager.isSingleCell()).toBe(false);
      });
    });

    describe('isMultiRange', () => {
      it('should return false for single range', () => {
        expect(manager.isMultiRange()).toBe(false);
      });

      it('should return true for multiple ranges', () => {
        manager.setActiveCell({ row: 0, col: 0 });
        manager.addRange({ startRow: 5, startCol: 5, endRow: 5, endCol: 5 });
        expect(manager.isMultiRange()).toBe(true);
      });
    });

    describe('getSelectedCellCount', () => {
      it('should return 1 for single cell', () => {
        expect(manager.getSelectedCellCount()).toBe(1);
      });

      it('should return correct count for range', () => {
        manager.setRange({ startRow: 0, startCol: 0, endRow: 2, endCol: 2 }); // 3x3 = 9
        expect(manager.getSelectedCellCount()).toBe(9);
      });

      it('should deduplicate overlapping ranges', () => {
        manager.setRange({ startRow: 0, startCol: 0, endRow: 2, endCol: 2 });
        manager.addRange({ startRow: 1, startCol: 1, endRow: 3, endCol: 3 }); // Overlaps

        // Manual count: union of two overlapping 3x3 ranges
        // Should be less than 18 due to overlap
        const count = manager.getSelectedCellCount();
        expect(count).toBeLessThan(18);
        expect(count).toBeGreaterThan(9);
      });
    });

    describe('getSelectedCells', () => {
      it('should return all selected cell refs', () => {
        manager.setRange({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 }); // 2x2 = 4 cells
        const cells = manager.getSelectedCells();

        expect(cells.length).toBe(4);
        expect(cells.some(c => c.row === 0 && c.col === 0)).toBe(true);
        expect(cells.some(c => c.row === 1 && c.col === 1)).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Core Selection Operations
  // ===========================================================================

  describe('Core Operations', () => {
    describe('setActiveCell', () => {
      it('should set single cell selection', () => {
        manager.setActiveCell({ row: 5, col: 10 });

        expect(manager.getActiveCell().row).toBe(5);
        expect(manager.getActiveCell().col).toBe(10);
        expect(manager.isSingleCell()).toBe(true);
      });

      it('should clear previous selection', () => {
        manager.setRange({ startRow: 0, startCol: 0, endRow: 10, endCol: 10 });
        manager.setActiveCell({ row: 5, col: 5 });

        expect(manager.getAllRanges().length).toBe(1);
        expect(manager.isSingleCell()).toBe(true);
      });

      it('should set anchor to same cell', () => {
        manager.setActiveCell({ row: 5, col: 5 });
        expect(manager.getAnchorCell().row).toBe(5);
        expect(manager.getAnchorCell().col).toBe(5);
      });
    });

    describe('setRange', () => {
      it('should set range selection', () => {
        manager.setRange({ startRow: 2, startCol: 3, endRow: 5, endCol: 8 });
        const range = manager.getActiveRange();

        expect(range.startRow).toBe(2);
        expect(range.startCol).toBe(3);
        expect(range.endRow).toBe(5);
        expect(range.endCol).toBe(8);
      });

      it('should normalize inverted range', () => {
        manager.setRange({ startRow: 10, startCol: 10, endRow: 5, endCol: 5 });
        const range = manager.getActiveRange();

        expect(range.startRow).toBe(5);
        expect(range.endRow).toBe(10);
      });
    });

    describe('extendSelection (Shift+Click)', () => {
      it('should extend from anchor to target', () => {
        manager.setActiveCell({ row: 2, col: 2 });
        manager.extendSelection({ row: 5, col: 5 });

        const range = manager.getActiveRange();
        expect(range.startRow).toBe(2);
        expect(range.startCol).toBe(2);
        expect(range.endRow).toBe(5);
        expect(range.endCol).toBe(5);
      });

      it('should keep anchor fixed', () => {
        manager.setActiveCell({ row: 2, col: 2 });
        manager.extendSelection({ row: 5, col: 5 });

        expect(manager.getAnchorCell().row).toBe(2);
        expect(manager.getAnchorCell().col).toBe(2);
      });

      it('should update active cell to target', () => {
        manager.setActiveCell({ row: 2, col: 2 });
        manager.extendSelection({ row: 5, col: 5 });

        expect(manager.getActiveCell().row).toBe(5);
        expect(manager.getActiveCell().col).toBe(5);
      });

      it('should handle extension in negative direction', () => {
        manager.setActiveCell({ row: 5, col: 5 });
        manager.extendSelection({ row: 2, col: 2 });

        const range = manager.getActiveRange();
        expect(range.startRow).toBe(2);
        expect(range.startCol).toBe(2);
        expect(range.endRow).toBe(5);
        expect(range.endCol).toBe(5);
      });
    });

    describe('addRange (Ctrl+Click)', () => {
      it('should add new range', () => {
        manager.setActiveCell({ row: 0, col: 0 });
        manager.addRange({ startRow: 5, startCol: 5, endRow: 7, endCol: 7 });

        expect(manager.getAllRanges().length).toBe(2);
      });

      it('should make new range active', () => {
        manager.setActiveCell({ row: 0, col: 0 });
        manager.addRange({ startRow: 5, startCol: 5, endRow: 7, endCol: 7 });

        expect(manager.getActiveRange().startRow).toBe(5);
      });

      it('should set active cell to new range start', () => {
        manager.setActiveCell({ row: 0, col: 0 });
        manager.addRange({ startRow: 5, startCol: 5, endRow: 7, endCol: 7 });

        expect(manager.getActiveCell().row).toBe(5);
        expect(manager.getActiveCell().col).toBe(5);
      });
    });

    describe('addCell', () => {
      it('should add single cell as new range', () => {
        manager.setActiveCell({ row: 0, col: 0 });
        manager.addCell({ row: 10, col: 10 });

        expect(manager.getAllRanges().length).toBe(2);
        expect(manager.getActiveRange().startRow).toBe(10);
        expect(manager.getActiveRange().endRow).toBe(10);
      });
    });

    describe('removeRange', () => {
      it('should remove specified range', () => {
        manager.setActiveCell({ row: 0, col: 0 });
        manager.addRange({ startRow: 5, startCol: 5, endRow: 5, endCol: 5 });
        manager.addRange({ startRow: 10, startCol: 10, endRow: 10, endCol: 10 });

        expect(manager.getAllRanges().length).toBe(3);

        manager.removeRange(1);
        expect(manager.getAllRanges().length).toBe(2);
      });

      it('should reset to A1 if removing last range', () => {
        manager.setActiveCell({ row: 5, col: 5 });
        manager.removeRange(0);

        expect(manager.getActiveCell().row).toBe(0);
        expect(manager.getActiveCell().col).toBe(0);
      });

      it('should adjust activeRangeIndex when removing before active', () => {
        manager.setActiveCell({ row: 0, col: 0 });
        manager.addRange({ startRow: 5, startCol: 5, endRow: 5, endCol: 5 });
        manager.addRange({ startRow: 10, startCol: 10, endRow: 10, endCol: 10 });

        // Active is index 2 (last added)
        expect(manager.getState().activeRangeIndex).toBe(2);

        manager.removeRange(0);
        expect(manager.getState().activeRangeIndex).toBe(1);
      });
    });

    describe('clear', () => {
      it('should reset to A1', () => {
        manager.setRange({ startRow: 5, startCol: 5, endRow: 10, endCol: 10 });
        manager.addRange({ startRow: 15, startCol: 15, endRow: 20, endCol: 20 });

        manager.clear();

        expect(manager.getActiveCell().row).toBe(0);
        expect(manager.getActiveCell().col).toBe(0);
        expect(manager.getAllRanges().length).toBe(1);
        expect(manager.isSingleCell()).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Keyboard Navigation
  // ===========================================================================

  describe('Keyboard Navigation', () => {
    describe('moveActiveCell', () => {
      it('should move cell by delta', () => {
        manager.setActiveCell({ row: 5, col: 5 });
        manager.moveActiveCell(1, 0); // down

        expect(manager.getActiveCell().row).toBe(6);
        expect(manager.getActiveCell().col).toBe(5);
      });

      it('should clamp at grid boundaries', () => {
        manager.setActiveCell({ row: 0, col: 0 });
        manager.moveActiveCell(-1, -1); // up-left from origin

        expect(manager.getActiveCell().row).toBe(0);
        expect(manager.getActiveCell().col).toBe(0);
      });

      it('should extend selection when extend=true', () => {
        manager.setActiveCell({ row: 5, col: 5 });
        manager.moveActiveCell(2, 2, true);

        const range = manager.getActiveRange();
        expect(range.startRow).toBe(5);
        expect(range.endRow).toBe(7);
      });
    });

    describe('goToCell', () => {
      it('should navigate to specific cell', () => {
        manager.goToCell(100, 50);

        expect(manager.getActiveCell().row).toBe(100);
        expect(manager.getActiveCell().col).toBe(50);
      });
    });

    describe('moveWithinSelection', () => {
      beforeEach(() => {
        manager.setRange({ startRow: 0, startCol: 0, endRow: 2, endCol: 2 }); // 3x3
      });

      it('should move to next cell (Tab)', () => {
        // Start at 0,0 - next should be 0,1
        manager.moveWithinSelection('next');
        expect(manager.getActiveCell().col).toBe(1);
      });

      it('should wrap to next row at end of row', () => {
        manager.setRange(
          { startRow: 0, startCol: 0, endRow: 2, endCol: 2 },
          { row: 0, col: 2 } // End of first row
        );
        manager.moveWithinSelection('next');

        expect(manager.getActiveCell().row).toBe(1);
        expect(manager.getActiveCell().col).toBe(0);
      });

      it('should wrap to start at end of range', () => {
        manager.setRange(
          { startRow: 0, startCol: 0, endRow: 2, endCol: 2 },
          { row: 2, col: 2 } // Last cell
        );
        manager.moveWithinSelection('next');

        expect(manager.getActiveCell().row).toBe(0);
        expect(manager.getActiveCell().col).toBe(0);
      });

      it('should move to previous cell (Shift+Tab)', () => {
        manager.setRange(
          { startRow: 0, startCol: 0, endRow: 2, endCol: 2 },
          { row: 1, col: 1 }
        );
        manager.moveWithinSelection('previous');

        expect(manager.getActiveCell().col).toBe(0);
      });

      it('should move to next row (Enter)', () => {
        manager.moveWithinSelection('nextRow');
        expect(manager.getActiveCell().row).toBe(1);
        expect(manager.getActiveCell().col).toBe(0);
      });
    });

    describe('selectEntireRows', () => {
      it('should select entire rows of current selection', () => {
        manager.setRange({ startRow: 2, startCol: 5, endRow: 4, endCol: 8 });
        manager.selectEntireRows();

        const range = manager.getActiveRange();
        expect(range.startCol).toBe(0);
        expect(range.endCol).toBe(MAX_COLS - 1);
        expect(range.startRow).toBe(2);
        expect(range.endRow).toBe(4);
      });
    });

    describe('selectEntireColumns', () => {
      it('should select entire columns of current selection', () => {
        manager.setRange({ startRow: 2, startCol: 5, endRow: 4, endCol: 8 });
        manager.selectEntireColumns();

        const range = manager.getActiveRange();
        expect(range.startRow).toBe(0);
        expect(range.endRow).toBe(MAX_ROWS - 1);
        expect(range.startCol).toBe(5);
        expect(range.endCol).toBe(8);
      });
    });
  });

  // ===========================================================================
  // Mouse Interactions
  // ===========================================================================

  describe('Mouse Interactions', () => {
    describe('handleMouseDown', () => {
      it('should set single cell on regular click', () => {
        manager.handleMouseDown({ row: 5, col: 5 }, {});

        expect(manager.getActiveCell().row).toBe(5);
        expect(manager.isSingleCell()).toBe(true);
      });

      it('should extend on shift+click', () => {
        manager.setActiveCell({ row: 2, col: 2 });
        manager.handleMouseDown({ row: 5, col: 5 }, { shift: true });

        const range = manager.getActiveRange();
        expect(range.startRow).toBe(2);
        expect(range.endRow).toBe(5);
      });

      it('should add range on ctrl+click', () => {
        manager.setActiveCell({ row: 2, col: 2 });
        manager.handleMouseDown({ row: 5, col: 5 }, { ctrl: true });

        expect(manager.getAllRanges().length).toBe(2);
      });

      it('should add range on meta+click (Mac)', () => {
        manager.setActiveCell({ row: 2, col: 2 });
        manager.handleMouseDown({ row: 5, col: 5 }, { meta: true });

        expect(manager.getAllRanges().length).toBe(2);
      });
    });

    describe('handleMouseDrag', () => {
      it('should extend selection while dragging', () => {
        manager.setActiveCell({ row: 2, col: 2 });
        manager.handleMouseDrag({ row: 5, col: 5 });

        const range = manager.getActiveRange();
        expect(range.endRow).toBe(5);
        expect(range.endCol).toBe(5);
      });
    });

    describe('handleMouseUp', () => {
      it('should set mode to normal', () => {
        manager.setMode('selecting');
        manager.handleMouseUp();

        expect(manager.getState().mode).toBe('normal');
      });
    });
  });

  // ===========================================================================
  // Event Subscription
  // ===========================================================================

  describe('Event Subscription', () => {
    it('should notify listeners on selection change', () => {
      const listener = vi.fn();
      manager.subscribe(listener);

      manager.setActiveCell({ row: 5, col: 5 });

      expect(listener).toHaveBeenCalledTimes(1);
      const event: SelectionChangeEvent = listener.mock.calls[0][0];
      expect(event.current.activeCell.row).toBe(5);
    });

    it('should provide previous state in event', () => {
      const listener = vi.fn();
      manager.subscribe(listener);

      manager.setActiveCell({ row: 5, col: 5 });

      const event: SelectionChangeEvent = listener.mock.calls[0][0];
      expect(event.previous.activeCell.row).toBe(0); // Was at A1
    });

    it('should support unsubscribe', () => {
      const listener = vi.fn();
      const unsubscribe = manager.subscribe(listener);

      manager.setActiveCell({ row: 1, col: 1 });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      manager.setActiveCell({ row: 2, col: 2 });
      expect(listener).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should not notify if no change', () => {
      const listener = vi.fn();
      manager.subscribe(listener);

      // Set to current position (no change)
      manager.setActiveCell({ row: 0, col: 0 });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle selection at grid maximum', () => {
      manager.setActiveCell({ row: MAX_ROWS - 1, col: MAX_COLS - 1 });

      expect(manager.getActiveCell().row).toBe(MAX_ROWS - 1);
      expect(manager.getActiveCell().col).toBe(MAX_COLS - 1);
    });

    it('should handle rapid selection changes', () => {
      for (let i = 0; i < 100; i++) {
        manager.setActiveCell({ row: i % 10, col: i % 10 });
      }

      expect(manager.getActiveCell().row).toBe(9);
    });

    it('should handle empty ranges array gracefully', () => {
      // This shouldn't happen in normal use, but test robustness
      const state = manager.getState();
      expect(state.ranges.length).toBeGreaterThan(0);
    });
  });
});
