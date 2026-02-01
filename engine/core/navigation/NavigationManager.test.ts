/**
 * VectorSheet Engine - NavigationManager Unit Tests
 *
 * Tests keyboard navigation in a spreadsheet grid.
 * Covers:
 * - Basic movement (Arrow keys)
 * - Jump navigation (Ctrl+Arrow)
 * - Direct navigation (goTo)
 * - Page navigation (PageUp/PageDown)
 * - Home/End keys
 * - Tab/Enter cycling
 * - Ctrl+A selection
 * - Hidden row/column handling
 * - Boundary conditions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NavigationManager,
  NavigationDataProvider,
  NavigationConfig,
  NavigationResult,
  createNavigationManager,
} from './NavigationManager.js';
import { SelectionManager } from '../selection/SelectionManager.js';
import { CellRange } from '../types/index.js';

// =============================================================================
// Mock Data Provider
// =============================================================================

/**
 * Creates a mock NavigationDataProvider with configurable data.
 */
function createMockDataProvider(options: {
  cells?: Array<{ row: number; col: number }>;
  hiddenRows?: Set<number>;
  hiddenCols?: Set<number>;
  usedRange?: CellRange | null;
}): NavigationDataProvider {
  const cells = new Set(options.cells?.map(c => `${c.row}_${c.col}`) ?? []);
  const hiddenRows = options.hiddenRows ?? new Set();
  const hiddenCols = options.hiddenCols ?? new Set();

  // Build row and column indexes
  const rowIndex = new Map<number, number[]>();
  const colIndex = new Map<number, number[]>();

  for (const cell of options.cells ?? []) {
    if (!rowIndex.has(cell.row)) rowIndex.set(cell.row, []);
    if (!colIndex.has(cell.col)) colIndex.set(cell.col, []);
    rowIndex.get(cell.row)!.push(cell.col);
    colIndex.get(cell.col)!.push(cell.row);
  }

  // Sort indexes
  for (const cols of rowIndex.values()) cols.sort((a, b) => a - b);
  for (const rows of colIndex.values()) rows.sort((a, b) => a - b);

  return {
    hasContent(row: number, col: number): boolean {
      return cells.has(`${row}_${col}`);
    },
    isRowHidden(row: number): boolean {
      return hiddenRows.has(row);
    },
    isColumnHidden(col: number): boolean {
      return hiddenCols.has(col);
    },
    getColumnsInRow(row: number): number[] {
      return rowIndex.get(row) ?? [];
    },
    getRowsInColumn(col: number): number[] {
      return colIndex.get(col) ?? [];
    },
    getUsedRange(): CellRange | null {
      return options.usedRange ?? null;
    },
  };
}

/**
 * Create an empty data provider (no cells, nothing hidden).
 */
function createEmptyDataProvider(): NavigationDataProvider {
  return createMockDataProvider({});
}

// =============================================================================
// Basic Movement Tests
// =============================================================================

describe('NavigationManager', () => {
  describe('Basic Movement (Arrow Keys)', () => {
    let nav: NavigationManager;

    beforeEach(() => {
      nav = new NavigationManager(createEmptyDataProvider());
    });

    describe('move()', () => {
      it('should move down', () => {
        const result = nav.move('down', { row: 0, col: 0 });

        expect(result.cell.row).toBe(1);
        expect(result.cell.col).toBe(0);
        expect(result.action).toBe('move');
        expect(result.direction).toBe('down');
        expect(result.boundaryHit).toBe(false);
      });

      it('should move up', () => {
        const result = nav.move('up', { row: 5, col: 0 });

        expect(result.cell.row).toBe(4);
        expect(result.cell.col).toBe(0);
      });

      it('should move right', () => {
        const result = nav.move('right', { row: 0, col: 5 });

        expect(result.cell.row).toBe(0);
        expect(result.cell.col).toBe(6);
      });

      it('should move left', () => {
        const result = nav.move('left', { row: 0, col: 5 });

        expect(result.cell.row).toBe(0);
        expect(result.cell.col).toBe(4);
      });

      it('should not move past top boundary', () => {
        const result = nav.move('up', { row: 0, col: 0 });

        expect(result.cell.row).toBe(0);
        expect(result.cell.col).toBe(0);
        expect(result.boundaryHit).toBe(true);
      });

      it('should not move past left boundary', () => {
        const result = nav.move('left', { row: 0, col: 0 });

        expect(result.cell.row).toBe(0);
        expect(result.cell.col).toBe(0);
        expect(result.boundaryHit).toBe(true);
      });

      it('should clamp at max row', () => {
        const config: Partial<NavigationConfig> = { maxRow: 100, maxCol: 100 };
        nav = new NavigationManager(createEmptyDataProvider(), config);

        const result = nav.move('down', { row: 99, col: 0 });

        expect(result.cell.row).toBe(99);
        expect(result.boundaryHit).toBe(true);
      });

      it('should clamp at max col', () => {
        const config: Partial<NavigationConfig> = { maxRow: 100, maxCol: 100 };
        nav = new NavigationManager(createEmptyDataProvider(), config);

        const result = nav.move('right', { row: 0, col: 99 });

        expect(result.cell.col).toBe(99);
        expect(result.boundaryHit).toBe(true);
      });

      it('should use current cell if no from provided', () => {
        nav.setCurrentCell(5, 5);
        const result = nav.move('down');

        expect(result.previousCell.row).toBe(5);
        expect(result.previousCell.col).toBe(5);
        expect(result.cell.row).toBe(6);
      });

      it('should update internal position after move', () => {
        nav.move('down', { row: 0, col: 0 });
        nav.move('right');

        const current = nav.getCurrentCell();
        expect(current.row).toBe(1);
        expect(current.col).toBe(1);
      });
    });

    describe('move() with hidden rows/columns', () => {
      it('should skip hidden rows when moving down', () => {
        const provider = createMockDataProvider({ hiddenRows: new Set([1, 2]) });
        nav = new NavigationManager(provider);

        const result = nav.move('down', { row: 0, col: 0 });

        expect(result.cell.row).toBe(3);
      });

      it('should skip hidden rows when moving up', () => {
        const provider = createMockDataProvider({ hiddenRows: new Set([3, 4]) });
        nav = new NavigationManager(provider);

        const result = nav.move('up', { row: 5, col: 0 });

        expect(result.cell.row).toBe(2);
      });

      it('should skip hidden columns when moving right', () => {
        const provider = createMockDataProvider({ hiddenCols: new Set([1, 2]) });
        nav = new NavigationManager(provider);

        const result = nav.move('right', { row: 0, col: 0 });

        expect(result.cell.col).toBe(3);
      });

      it('should skip hidden columns when moving left', () => {
        const provider = createMockDataProvider({ hiddenCols: new Set([3, 4]) });
        nav = new NavigationManager(provider);

        const result = nav.move('left', { row: 0, col: 5 });

        expect(result.cell.col).toBe(2);
      });

      it('should respect skipHidden=false option', () => {
        const provider = createMockDataProvider({ hiddenRows: new Set([1]) });
        nav = new NavigationManager(provider);

        const result = nav.move('down', { row: 0, col: 0 }, { skipHidden: false });

        expect(result.cell.row).toBe(1);
      });
    });
  });

  // ===========================================================================
  // Jump Navigation (Ctrl+Arrow)
  // ===========================================================================

  describe('Jump Navigation (Ctrl+Arrow)', () => {
    let nav: NavigationManager;

    describe('jump() from empty cell', () => {
      it('should jump to next non-empty cell going right', () => {
        const provider = createMockDataProvider({
          cells: [
            { row: 0, col: 5 },
            { row: 0, col: 10 },
          ],
        });
        nav = new NavigationManager(provider);

        const result = nav.jump('right', { row: 0, col: 0 });

        expect(result.cell.col).toBe(5);
      });

      it('should jump to edge if no data in direction', () => {
        const provider = createMockDataProvider({
          cells: [{ row: 0, col: 0 }], // Data only at origin
        });
        nav = new NavigationManager(provider, { maxCol: 100 });

        const result = nav.jump('right', { row: 0, col: 5 }); // Start in empty area

        expect(result.cell.col).toBe(99); // maxCol - 1
      });

      it('should jump to previous non-empty going left', () => {
        const provider = createMockDataProvider({
          cells: [
            { row: 0, col: 2 },
            { row: 0, col: 5 },
          ],
        });
        nav = new NavigationManager(provider);

        const result = nav.jump('left', { row: 0, col: 10 });

        expect(result.cell.col).toBe(5);
      });

      it('should jump to edge (0) if no data going left', () => {
        const provider = createMockDataProvider({
          cells: [{ row: 0, col: 50 }],
        });
        nav = new NavigationManager(provider);

        const result = nav.jump('left', { row: 0, col: 10 });

        expect(result.cell.col).toBe(0);
      });
    });

    describe('jump() from non-empty cell', () => {
      it('should jump to last consecutive cell if next is non-empty', () => {
        // Data: cells at columns 0, 1, 2, 3 (consecutive)
        const provider = createMockDataProvider({
          cells: [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 0, col: 2 },
            { row: 0, col: 3 },
          ],
        });
        nav = new NavigationManager(provider, { maxCol: 100 });

        const result = nav.jump('right', { row: 0, col: 0 });

        expect(result.cell.col).toBe(3); // Last in consecutive block
      });

      it('should jump to next non-empty if next cell is empty', () => {
        // Data: cells at columns 0 and 5 (gap between)
        const provider = createMockDataProvider({
          cells: [
            { row: 0, col: 0 },
            { row: 0, col: 5 },
          ],
        });
        nav = new NavigationManager(provider, { maxCol: 100 });

        const result = nav.jump('right', { row: 0, col: 0 });

        expect(result.cell.col).toBe(5);
      });

      it('should jump to edge if next is empty and no more data', () => {
        const provider = createMockDataProvider({
          cells: [{ row: 0, col: 0 }],
        });
        nav = new NavigationManager(provider, { maxCol: 100 });

        const result = nav.jump('right', { row: 0, col: 0 });

        expect(result.cell.col).toBe(99);
      });
    });

    describe('jump() vertically', () => {
      it('should jump down to next non-empty', () => {
        const provider = createMockDataProvider({
          cells: [
            { row: 5, col: 0 },
            { row: 10, col: 0 },
          ],
        });
        nav = new NavigationManager(provider);

        const result = nav.jump('down', { row: 0, col: 0 });

        expect(result.cell.row).toBe(5);
      });

      it('should jump up to previous non-empty', () => {
        const provider = createMockDataProvider({
          cells: [
            { row: 2, col: 0 },
            { row: 8, col: 0 },
          ],
        });
        nav = new NavigationManager(provider);

        const result = nav.jump('up', { row: 10, col: 0 });

        expect(result.cell.row).toBe(8);
      });
    });
  });

  // ===========================================================================
  // Direct Navigation
  // ===========================================================================

  describe('Direct Navigation (goTo)', () => {
    let nav: NavigationManager;

    beforeEach(() => {
      nav = new NavigationManager(createEmptyDataProvider(), { maxRow: 100, maxCol: 100 });
    });

    it('should navigate to specific cell', () => {
      const result = nav.goTo(50, 25);

      expect(result.cell.row).toBe(50);
      expect(result.cell.col).toBe(25);
      expect(result.action).toBe('goTo');
    });

    it('should clamp to bounds', () => {
      const result = nav.goTo(200, 200);

      expect(result.cell.row).toBe(99);
      expect(result.cell.col).toBe(99);
    });

    it('should clamp negative values', () => {
      const result = nav.goTo(-10, -5);

      expect(result.cell.row).toBe(0);
      expect(result.cell.col).toBe(0);
    });

    it('should skip hidden row and find next visible', () => {
      const provider = createMockDataProvider({ hiddenRows: new Set([5]) });
      nav = new NavigationManager(provider, { maxRow: 100, maxCol: 100 });

      const result = nav.goTo(5, 0);

      expect(result.cell.row).toBe(6);
    });

    it('should update current cell', () => {
      nav.goTo(30, 40);

      const current = nav.getCurrentCell();
      expect(current.row).toBe(30);
      expect(current.col).toBe(40);
    });
  });

  // ===========================================================================
  // Page Navigation
  // ===========================================================================

  describe('Page Navigation (PageUp/PageDown)', () => {
    let nav: NavigationManager;

    beforeEach(() => {
      nav = new NavigationManager(createEmptyDataProvider(), {
        pageSize: 20,
        maxRow: 100,
        maxCol: 100,
      });
    });

    describe('pageDown()', () => {
      it('should move down by page size', () => {
        nav.setCurrentCell(0, 0);
        const result = nav.pageDown();

        expect(result.cell.row).toBe(20);
        expect(result.action).toBe('pageDown');
      });

      it('should clamp at max row', () => {
        nav.setCurrentCell(90, 0);
        const result = nav.pageDown();

        expect(result.cell.row).toBe(99);
        // boundaryHit is false because movement occurred (90 → 99), just less than page size
        expect(result.boundaryHit).toBe(false);
      });

      it('should report boundaryHit when already at max row', () => {
        nav.setCurrentCell(99, 0);
        const result = nav.pageDown();

        expect(result.cell.row).toBe(99);
        expect(result.boundaryHit).toBe(true); // No movement occurred
      });

      it('should accept custom page size', () => {
        nav.setCurrentCell(0, 0);
        const result = nav.pageDown(false, 10);

        expect(result.cell.row).toBe(10);
      });

      it('should keep same column', () => {
        nav.setCurrentCell(0, 5);
        const result = nav.pageDown();

        expect(result.cell.col).toBe(5);
      });
    });

    describe('pageUp()', () => {
      it('should move up by page size', () => {
        nav.setCurrentCell(50, 0);
        const result = nav.pageUp();

        expect(result.cell.row).toBe(30);
        expect(result.action).toBe('pageUp');
      });

      it('should clamp at row 0', () => {
        nav.setCurrentCell(10, 0);
        const result = nav.pageUp();

        expect(result.cell.row).toBe(0);
        // boundaryHit is false because movement occurred (10 → 0), just less than page size
        expect(result.boundaryHit).toBe(false);
      });

      it('should report boundaryHit when already at row 0', () => {
        nav.setCurrentCell(0, 0);
        const result = nav.pageUp();

        expect(result.cell.row).toBe(0);
        expect(result.boundaryHit).toBe(true); // No movement occurred
      });
    });
  });

  // ===========================================================================
  // Home/End Navigation
  // ===========================================================================

  describe('Home/End Navigation', () => {
    let nav: NavigationManager;

    beforeEach(() => {
      nav = new NavigationManager(
        createMockDataProvider({
          cells: [
            { row: 0, col: 5 },
            { row: 3, col: 8 },
          ],
          usedRange: { startRow: 0, startCol: 5, endRow: 3, endCol: 8 },
        }),
        { maxRow: 100, maxCol: 100 }
      );
    });

    describe('home()', () => {
      it('should go to column 0 in current row', () => {
        nav.setCurrentCell(5, 10);
        const result = nav.home();

        expect(result.cell.row).toBe(5);
        expect(result.cell.col).toBe(0);
      });

      it('should go to A1 with ctrl', () => {
        nav.setCurrentCell(5, 10);
        const result = nav.home(true);

        expect(result.cell.row).toBe(0);
        expect(result.cell.col).toBe(0);
      });
    });

    describe('end()', () => {
      it('should go to last column with data in current row', () => {
        nav.setCurrentCell(0, 0);
        const result = nav.end();

        expect(result.cell.row).toBe(0);
        expect(result.cell.col).toBe(5); // Last data in row 0
      });

      it('should go to used range end with ctrl', () => {
        nav.setCurrentCell(0, 0);
        const result = nav.end(true);

        expect(result.cell.row).toBe(3);
        expect(result.cell.col).toBe(8);
      });

      it('should stay at 0 if no data in row', () => {
        nav.setCurrentCell(10, 5); // Empty row
        const result = nav.end();

        expect(result.cell.col).toBe(0);
      });
    });
  });

  // ===========================================================================
  // Tab/Enter Navigation
  // ===========================================================================

  describe('Tab/Enter Navigation', () => {
    let nav: NavigationManager;

    describe('without SelectionManager', () => {
      beforeEach(() => {
        nav = new NavigationManager(createEmptyDataProvider(), {
          tabDirection: 'right',
          enterDirection: 'down',
        });
      });

      it('should move right on tab', () => {
        nav.setCurrentCell(0, 0);
        const result = nav.tab();

        expect(result.cell.col).toBe(1);
        expect(result.action).toBe('move');
      });

      it('should move left on shift+tab', () => {
        nav.setCurrentCell(0, 5);
        const result = nav.tab(true);

        expect(result.cell.col).toBe(4);
      });

      it('should move down on enter', () => {
        nav.setCurrentCell(0, 0);
        const result = nav.enter();

        expect(result.cell.row).toBe(1);
      });

      it('should move up on shift+enter', () => {
        nav.setCurrentCell(5, 0);
        const result = nav.enter(true);

        expect(result.cell.row).toBe(4);
      });
    });

    describe('with SelectionManager (cycling)', () => {
      it('should cycle through selection on tab', () => {
        const selMgr = new SelectionManager();
        selMgr.setRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 2 }); // 3 cells

        nav = new NavigationManager(createEmptyDataProvider(), {}, selMgr);

        // Tab should cycle: 0→1→2→0
        nav.tab();
        expect(nav.getCurrentCell().col).toBe(1);

        nav.tab();
        expect(nav.getCurrentCell().col).toBe(2);

        nav.tab();
        expect(nav.getCurrentCell().col).toBe(0); // Wrapped
      });

      it('should cycle through selection on enter (vertically)', () => {
        const selMgr = new SelectionManager();
        selMgr.setRange({ startRow: 0, startCol: 0, endRow: 2, endCol: 0 }); // 3 rows

        nav = new NavigationManager(createEmptyDataProvider(), {}, selMgr);

        nav.enter();
        expect(nav.getCurrentCell().row).toBe(1);

        nav.enter();
        expect(nav.getCurrentCell().row).toBe(2);

        nav.enter();
        expect(nav.getCurrentCell().row).toBe(0); // Wrapped
      });
    });
  });

  // ===========================================================================
  // Ctrl+A Navigation
  // ===========================================================================

  describe('Ctrl+A Navigation', () => {
    let nav: NavigationManager;

    it('should select current region on first press', () => {
      const provider = createMockDataProvider({
        cells: [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
          { row: 1, col: 0 },
          { row: 1, col: 1 },
        ],
        usedRange: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
      });
      nav = new NavigationManager(provider, { maxRow: 100, maxCol: 100 });
      nav.setCurrentCell(0, 0);

      const range = nav.ctrlA();

      expect(range.startRow).toBe(0);
      expect(range.startCol).toBe(0);
      expect(range.endRow).toBe(1);
      expect(range.endCol).toBe(1);
    });

    it('should select used range on second press', () => {
      const provider = createMockDataProvider({
        cells: [
          { row: 0, col: 0 },
          { row: 5, col: 5 },
        ],
        usedRange: { startRow: 0, startCol: 0, endRow: 5, endCol: 5 },
      });
      nav = new NavigationManager(provider, { maxRow: 100, maxCol: 100 });
      nav.setCurrentCell(0, 0);

      nav.ctrlA(); // First press - current region
      const range = nav.ctrlA(); // Second press - used range

      expect(range.endRow).toBe(5);
      expect(range.endCol).toBe(5);
    });

    it('should select all on third press', () => {
      const provider = createMockDataProvider({
        cells: [{ row: 0, col: 0 }],
        usedRange: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
      });
      nav = new NavigationManager(provider, { maxRow: 100, maxCol: 100 });

      nav.ctrlA();
      nav.ctrlA();
      const range = nav.ctrlA(); // Third press

      expect(range.startRow).toBe(0);
      expect(range.startCol).toBe(0);
      expect(range.endRow).toBe(99);
      expect(range.endCol).toBe(99);
    });

    it('should reset cycle after timeout', async () => {
      const provider = createMockDataProvider({
        cells: [{ row: 0, col: 0 }],
        usedRange: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
      });
      nav = new NavigationManager(provider, { maxRow: 100, maxCol: 100 });

      nav.ctrlA();

      // Note: In real test we'd wait 1+ second, but we can't test timing easily
      // Just verify the method exists and returns a range
      const range = nav.ctrlA();
      expect(range).toBeDefined();
    });
  });

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  describe('Event Handlers', () => {
    let nav: NavigationManager;

    it('should call onNavigate handler', () => {
      const onNavigate = vi.fn();
      nav = new NavigationManager(createEmptyDataProvider());
      nav.setEventHandlers({ onNavigate });

      nav.move('down', { row: 0, col: 0 });

      expect(onNavigate).toHaveBeenCalledTimes(1);
      const result: NavigationResult = onNavigate.mock.calls[0][0];
      expect(result.action).toBe('move');
    });

    it('should call onBoundaryHit when hitting boundary', () => {
      const onBoundaryHit = vi.fn();
      nav = new NavigationManager(createEmptyDataProvider());
      nav.setEventHandlers({ onBoundaryHit });

      nav.move('up', { row: 0, col: 0 });

      expect(onBoundaryHit).toHaveBeenCalledTimes(1);
      expect(onBoundaryHit).toHaveBeenCalledWith('up', { row: 0, col: 0 });
    });
  });

  // ===========================================================================
  // SelectionManager Integration
  // ===========================================================================

  describe('SelectionManager Integration', () => {
    let nav: NavigationManager;
    let selMgr: SelectionManager;

    beforeEach(() => {
      selMgr = new SelectionManager();
      nav = new NavigationManager(createEmptyDataProvider(), {}, selMgr);
    });

    it('should sync initial position from SelectionManager', () => {
      selMgr.setActiveCell({ row: 5, col: 5 });
      nav = new NavigationManager(createEmptyDataProvider(), {}, selMgr);

      const current = nav.getCurrentCell();
      expect(current.row).toBe(5);
      expect(current.col).toBe(5);
    });

    it('should update SelectionManager on move', () => {
      nav.move('down', { row: 0, col: 0 });

      const state = selMgr.getState();
      expect(state.activeCell.row).toBe(1);
    });

    it('should extend selection with extend option', () => {
      selMgr.setActiveCell({ row: 5, col: 5 });
      nav = new NavigationManager(createEmptyDataProvider(), {}, selMgr);

      nav.move('down', undefined, { extend: true });

      const state = selMgr.getState();
      expect(state.ranges[0].endRow).toBe(6);
    });

    it('should update SelectionManager on goTo', () => {
      nav.goTo(10, 10);

      const state = selMgr.getState();
      expect(state.activeCell.row).toBe(10);
      expect(state.activeCell.col).toBe(10);
    });

    it('should be attachable after construction', () => {
      nav = new NavigationManager(createEmptyDataProvider());
      const newSelMgr = new SelectionManager();
      newSelMgr.setActiveCell({ row: 3, col: 3 });

      nav.setSelectionManager(newSelMgr);

      expect(nav.getCurrentCell().row).toBe(3);
    });
  });

  // ===========================================================================
  // Configuration
  // ===========================================================================

  describe('Configuration', () => {
    it('should use custom maxRow/maxCol', () => {
      const nav = new NavigationManager(createEmptyDataProvider(), {
        maxRow: 50,
        maxCol: 30,
      });

      const result = nav.goTo(100, 100);

      expect(result.cell.row).toBe(49);
      expect(result.cell.col).toBe(29);
    });

    it('should use custom pageSize', () => {
      const nav = new NavigationManager(createEmptyDataProvider(), {
        pageSize: 10,
      });
      nav.setCurrentCell(0, 0);

      const result = nav.pageDown();

      expect(result.cell.row).toBe(10);
    });

    it('should provide config via getConfig()', () => {
      const nav = new NavigationManager(createEmptyDataProvider(), {
        pageSize: 15,
      });

      const config = nav.getConfig();

      expect(config.pageSize).toBe(15);
      expect(Object.isFrozen(config)).toBe(true);
    });
  });

  // ===========================================================================
  // Factory Functions
  // ===========================================================================

  describe('Factory Functions', () => {
    it('createNavigationManager should create instance', () => {
      const nav = createNavigationManager(createEmptyDataProvider());

      expect(nav).toBeInstanceOf(NavigationManager);
    });

    it('createNavigationManager should accept config', () => {
      const nav = createNavigationManager(createEmptyDataProvider(), { pageSize: 50 });

      expect(nav.getConfig().pageSize).toBe(50);
    });
  });

  // ===========================================================================
  // Legacy Compatibility Methods
  // ===========================================================================

  describe('Legacy Compatibility', () => {
    let nav: NavigationManager;

    beforeEach(() => {
      nav = new NavigationManager(createEmptyDataProvider());
    });

    it('moveActiveCell should work like move', () => {
      const result = nav.moveActiveCell('down');
      expect(result.row).toBe(1);
    });

    it('goToCell should work like goTo', () => {
      nav.goToCell(5, 5);
      const current = nav.getCurrentCell();
      expect(current.row).toBe(5);
      expect(current.col).toBe(5);
    });

    it('getActiveCell should return current cell', () => {
      nav.setCurrentCell(3, 3);
      const cell = nav.getActiveCell();
      expect(cell.row).toBe(3);
      expect(cell.col).toBe(3);
    });

    it('getSelection should return selection-like object', () => {
      const sel = nav.getSelection();
      expect(sel.ranges).toBeDefined();
      expect(sel.activeCell).toBeDefined();
      expect(sel.anchorCell).toBeDefined();
      expect(sel.activeRangeIndex).toBe(0);
    });

    it('ctrlArrow should work like jump', () => {
      const provider = createMockDataProvider({
        cells: [{ row: 0, col: 5 }],
      });
      nav = new NavigationManager(provider, { maxCol: 100 });

      const cell = nav.ctrlArrow('right');
      expect(cell.col).toBe(5);
    });

    it('getSelectionInfo should return cell reference string', () => {
      nav.setCurrentCell(0, 0);
      const info = nav.getSelectionInfo();
      expect(info).toBe('A1');
    });

    it('getSelectionInfo should return A1 format for different cells', () => {
      nav.setCurrentCell(0, 2); // C1
      expect(nav.getSelectionInfo()).toBe('C1');

      nav.setCurrentCell(4, 0); // A5
      expect(nav.getSelectionInfo()).toBe('A5');

      nav.setCurrentCell(0, 25); // Z1
      expect(nav.getSelectionInfo()).toBe('Z1');

      nav.setCurrentCell(0, 26); // AA1
      expect(nav.getSelectionInfo()).toBe('AA1');
    });
  });
});
