/**
 * VectorSheet Engine - Navigation Manager
 *
 * Handles Excel-compatible keyboard navigation:
 * - Arrow key navigation
 * - Ctrl+Arrow data region jumping
 * - Ctrl+Shift+Arrow region selection
 * - Ctrl+A current region / select all
 * - Tab/Enter movement
 * - Page Up/Down viewport scrolling
 */

import {
  CellRef,
  CellRange,
  Selection,
  Direction,
  MAX_ROWS,
  MAX_COLS,
} from '../types/index.js';
import { SparseDataStore } from '../data/SparseDataStore.js';
import { VirtualRenderer } from '../rendering/VirtualRenderer.js';

export interface NavigationOptions {
  /** Wrap at row/col boundaries */
  wrap?: boolean;
  /** Skip hidden rows/columns */
  skipHidden?: boolean;
}

export class NavigationManager {
  private dataStore: SparseDataStore;
  private renderer: VirtualRenderer;

  /** Current selection state */
  private selection: Selection;

  // Navigation state could be added here for future edit mode tracking

  /** Ctrl+A press count for cycling behavior */
  private ctrlACount: number = 0;
  private ctrlALastTime: number = 0;

  /** Selection history for Tab/Enter entry point tracking */
  private selectionEntryPoint: CellRef | null = null;

  constructor(dataStore: SparseDataStore, renderer: VirtualRenderer) {
    this.dataStore = dataStore;
    this.renderer = renderer;

    // Initialize selection at A1
    this.selection = {
      ranges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }],
      activeCell: { row: 0, col: 0 },
      anchorCell: { row: 0, col: 0 },
      activeRangeIndex: 0,
    };

  }

  // ===========================================================================
  // Selection Getters/Setters
  // ===========================================================================

  getSelection(): Selection {
    return { ...this.selection };
  }

  getActiveCell(): CellRef {
    return { ...this.selection.activeCell };
  }

  getActiveRange(): CellRange {
    return { ...this.selection.ranges[this.selection.activeRangeIndex] };
  }

  setSelection(selection: Partial<Selection>): void {
    this.selection = { ...this.selection, ...selection };
    this.ctrlACount = 0; // Reset Ctrl+A cycle
  }

  // ===========================================================================
  // Basic Cell Navigation
  // ===========================================================================

  /**
   * Move active cell by one step in direction
   */
  moveActiveCell(direction: Direction, options: NavigationOptions = {}): CellRef {
    const { row, col } = this.selection.activeCell;
    let newRow = row;
    let newCol = col;

    switch (direction) {
      case 'up':
        newRow = this.findNextVisibleRow(row, -1, options.skipHidden);
        break;
      case 'down':
        newRow = this.findNextVisibleRow(row, 1, options.skipHidden);
        break;
      case 'left':
        newCol = this.findNextVisibleCol(col, -1, options.skipHidden);
        break;
      case 'right':
        newCol = this.findNextVisibleCol(col, 1, options.skipHidden);
        break;
    }

    // Update selection to single cell
    this.selection = {
      ranges: [{ startRow: newRow, startCol: newCol, endRow: newRow, endCol: newCol }],
      activeCell: { row: newRow, col: newCol },
      anchorCell: { row: newRow, col: newCol },
      activeRangeIndex: 0,
    };

    // Scroll to bring cell into view
    this.renderer.scrollToCell(newRow, newCol);

    return { row: newRow, col: newCol };
  }

  private findNextVisibleRow(current: number, delta: number, skipHidden: boolean = true): number {
    let row = current + delta;

    if (skipHidden) {
      while (row >= 0 && row < MAX_ROWS && this.dataStore.isRowHidden(row)) {
        row += delta;
      }
    }

    return Math.max(0, Math.min(MAX_ROWS - 1, row));
  }

  private findNextVisibleCol(current: number, delta: number, skipHidden: boolean = true): number {
    let col = current + delta;

    if (skipHidden) {
      while (col >= 0 && col < MAX_COLS && this.dataStore.isColumnHidden(col)) {
        col += delta;
      }
    }

    return Math.max(0, Math.min(MAX_COLS - 1, col));
  }

  // ===========================================================================
  // Ctrl+Arrow: Data Region Navigation
  // ===========================================================================

  /**
   * Jump to edge of data region (Excel Ctrl+Arrow behavior)
   */
  ctrlArrow(direction: Direction): CellRef {
    const { row, col } = this.selection.activeCell;
    const target = this.dataStore.findNextNonEmpty(row, col, direction);

    // Update selection to single cell at target
    this.selection = {
      ranges: [{ startRow: target.row, startCol: target.col, endRow: target.row, endCol: target.col }],
      activeCell: target,
      anchorCell: target,
      activeRangeIndex: 0,
    };

    this.renderer.scrollToCell(target.row, target.col);
    return target;
  }

  // ===========================================================================
  // Shift+Arrow: Extend Selection
  // ===========================================================================

  /**
   * Extend selection by one cell in direction
   */
  extendSelection(direction: Direction): CellRange {
    const anchor = this.selection.anchorCell;
    const active = this.selection.activeCell;

    let newActive = { ...active };

    switch (direction) {
      case 'up':
        newActive.row = this.findNextVisibleRow(active.row, -1);
        break;
      case 'down':
        newActive.row = this.findNextVisibleRow(active.row, 1);
        break;
      case 'left':
        newActive.col = this.findNextVisibleCol(active.col, -1);
        break;
      case 'right':
        newActive.col = this.findNextVisibleCol(active.col, 1);
        break;
    }

    // Calculate new range from anchor to new active
    const newRange = this.calculateRange(anchor, newActive);

    this.selection = {
      ...this.selection,
      ranges: [newRange],
      activeCell: newActive,
      activeRangeIndex: 0,
    };

    this.renderer.scrollToCell(newActive.row, newActive.col);
    return newRange;
  }

  // ===========================================================================
  // Ctrl+Shift+Arrow: Extend Selection to Data Region Edge
  // ===========================================================================

  /**
   * Extend selection to edge of data region
   */
  ctrlShiftArrow(direction: Direction): CellRange {
    const anchor = this.selection.anchorCell;
    const active = this.selection.activeCell;

    // Find the edge of data region from active cell
    const target = this.dataStore.findNextNonEmpty(active.row, active.col, direction);

    // Calculate new range from anchor to target
    const newRange = this.calculateRange(anchor, target);

    this.selection = {
      ...this.selection,
      ranges: [newRange],
      activeCell: target,
      activeRangeIndex: 0,
    };

    this.renderer.scrollToCell(target.row, target.col);
    return newRange;
  }

  // ===========================================================================
  // Ctrl+A: Current Region / Select All
  // ===========================================================================

  /**
   * Ctrl+A behavior:
   * 1st press: Select current region (contiguous data)
   * 2nd press: Select used range
   * 3rd press: Select all cells
   */
  ctrlA(): CellRange {
    const now = Date.now();

    // Reset counter if more than 1 second since last press
    if (now - this.ctrlALastTime > 1000) {
      this.ctrlACount = 0;
    }

    this.ctrlACount++;
    this.ctrlALastTime = now;

    let newRange: CellRange;

    if (this.ctrlACount === 1) {
      // First press: Select current region
      const currentRegion = this.dataStore.findCurrentRegion(
        this.selection.activeCell.row,
        this.selection.activeCell.col
      );

      if (currentRegion) {
        newRange = currentRegion;
      } else {
        // No current region, select used range
        const usedRange = this.dataStore.getUsedRange();
        if (usedRange.endRow >= 0) {
          newRange = usedRange;
        } else {
          // No data, select all
          newRange = { startRow: 0, startCol: 0, endRow: MAX_ROWS - 1, endCol: MAX_COLS - 1 };
        }
        this.ctrlACount = 2; // Skip to stage 2
      }
    } else if (this.ctrlACount === 2) {
      // Second press: Select used range
      const usedRange = this.dataStore.getUsedRange();
      if (usedRange.endRow >= 0) {
        newRange = usedRange;
      } else {
        newRange = { startRow: 0, startCol: 0, endRow: MAX_ROWS - 1, endCol: MAX_COLS - 1 };
      }
    } else {
      // Third+ press: Select all
      newRange = { startRow: 0, startCol: 0, endRow: MAX_ROWS - 1, endCol: MAX_COLS - 1 };
      this.ctrlACount = 0; // Reset for next cycle
    }

    this.selection = {
      ranges: [newRange],
      activeCell: this.selection.activeCell, // Keep active cell
      anchorCell: { row: newRange.startRow, col: newRange.startCol },
      activeRangeIndex: 0,
    };

    return newRange;
  }

  // ===========================================================================
  // Enter/Tab: Movement within Selection
  // ===========================================================================

  /**
   * Enter key behavior:
   * - Single cell: Move down (or direction in options)
   * - Multi-cell selection: Cycle through cells in selection
   * - Shift+Enter: Move backward
   */
  enterKey(shift: boolean = false): CellRef {
    const range = this.selection.ranges[this.selection.activeRangeIndex];
    const isSingleCell =
      range.startRow === range.endRow && range.startCol === range.endCol;

    if (isSingleCell) {
      // Single cell: just move down (or up with shift)
      return this.moveActiveCell(shift ? 'up' : 'down');
    }

    // Multi-cell selection: cycle within selection
    return this.cycleWithinSelection(shift ? 'backward' : 'forward', 'column');
  }

  /**
   * Tab key behavior:
   * - Move right within selection
   * - At end of row, wrap to next row
   * - Shift+Tab: Move left
   */
  tabKey(shift: boolean = false): CellRef {
    const range = this.selection.ranges[this.selection.activeRangeIndex];
    const isSingleCell =
      range.startRow === range.endRow && range.startCol === range.endCol;

    if (isSingleCell) {
      // Set entry point for future wrapping
      if (!this.selectionEntryPoint) {
        this.selectionEntryPoint = { ...this.selection.activeCell };
      }
      return this.moveActiveCell(shift ? 'left' : 'right');
    }

    // Multi-cell selection: cycle within selection
    return this.cycleWithinSelection(shift ? 'backward' : 'forward', 'row');
  }

  /**
   * Cycle active cell within the selected range
   * @param direction 'forward' or 'backward'
   * @param primary 'row' = move horizontally first, 'column' = move vertically first
   */
  private cycleWithinSelection(
    direction: 'forward' | 'backward',
    primary: 'row' | 'column'
  ): CellRef {
    const range = this.selection.ranges[this.selection.activeRangeIndex];
    let { row, col } = this.selection.activeCell;

    if (primary === 'row') {
      // Move horizontally, then vertically
      if (direction === 'forward') {
        col++;
        if (col > range.endCol) {
          col = range.startCol;
          row++;
          if (row > range.endRow) {
            row = range.startRow;
          }
        }
      } else {
        col--;
        if (col < range.startCol) {
          col = range.endCol;
          row--;
          if (row < range.startRow) {
            row = range.endRow;
          }
        }
      }
    } else {
      // Move vertically, then horizontally
      if (direction === 'forward') {
        row++;
        if (row > range.endRow) {
          row = range.startRow;
          col++;
          if (col > range.endCol) {
            col = range.startCol;
          }
        }
      } else {
        row--;
        if (row < range.startRow) {
          row = range.endRow;
          col--;
          if (col < range.startCol) {
            col = range.endCol;
          }
        }
      }
    }

    // Skip hidden rows/cols
    while (this.dataStore.isRowHidden(row) || this.dataStore.isColumnHidden(col)) {
      if (direction === 'forward') {
        if (primary === 'row') {
          col++;
          if (col > range.endCol) {
            col = range.startCol;
            row++;
          }
        } else {
          row++;
          if (row > range.endRow) {
            row = range.startRow;
            col++;
          }
        }
      } else {
        if (primary === 'row') {
          col--;
          if (col < range.startCol) {
            col = range.endCol;
            row--;
          }
        } else {
          row--;
          if (row < range.startRow) {
            row = range.endRow;
            col--;
          }
        }
      }

      // Prevent infinite loop
      if (row < range.startRow || row > range.endRow ||
          col < range.startCol || col > range.endCol) {
        break;
      }
    }

    // Clamp to valid range
    row = Math.max(range.startRow, Math.min(range.endRow, row));
    col = Math.max(range.startCol, Math.min(range.endCol, col));

    this.selection = {
      ...this.selection,
      activeCell: { row, col },
    };

    this.renderer.scrollToCell(row, col);
    return { row, col };
  }

  // ===========================================================================
  // Page Up/Down: Viewport Scrolling
  // ===========================================================================

  /**
   * Page Up: Move up by one viewport height
   */
  pageUp(shift: boolean = false): CellRef {
    const pageRows = this.renderer.getPageRowCount();
    return this.moveByPage(-pageRows, shift);
  }

  /**
   * Page Down: Move down by one viewport height
   */
  pageDown(shift: boolean = false): CellRef {
    const pageRows = this.renderer.getPageRowCount();
    return this.moveByPage(pageRows, shift);
  }

  private moveByPage(rowDelta: number, extend: boolean): CellRef {
    const { row, col } = this.selection.activeCell;
    const newRow = Math.max(0, Math.min(MAX_ROWS - 1, row + rowDelta));

    if (extend) {
      // Extend selection
      const anchor = this.selection.anchorCell;
      const newRange = this.calculateRange(anchor, { row: newRow, col });

      this.selection = {
        ...this.selection,
        ranges: [newRange],
        activeCell: { row: newRow, col },
        activeRangeIndex: 0,
      };
    } else {
      // Move selection
      this.selection = {
        ranges: [{ startRow: newRow, startCol: col, endRow: newRow, endCol: col }],
        activeCell: { row: newRow, col },
        anchorCell: { row: newRow, col },
        activeRangeIndex: 0,
      };
    }

    this.renderer.scrollToCell(newRow, col);
    return { row: newRow, col };
  }

  // ===========================================================================
  // Home/End Navigation
  // ===========================================================================

  /**
   * Home: Go to column A (or start of data with Ctrl)
   */
  home(ctrl: boolean = false, shift: boolean = false): CellRef {
    const { row } = this.selection.activeCell;
    let targetRow = row;
    let targetCol = 0;

    if (ctrl) {
      // Ctrl+Home: Go to A1
      targetRow = 0;
      targetCol = 0;
    }

    if (shift) {
      // Extend selection
      const anchor = this.selection.anchorCell;
      const newRange = this.calculateRange(anchor, { row: targetRow, col: targetCol });

      this.selection = {
        ...this.selection,
        ranges: [newRange],
        activeCell: { row: targetRow, col: targetCol },
        activeRangeIndex: 0,
      };
    } else {
      this.selection = {
        ranges: [{ startRow: targetRow, startCol: targetCol, endRow: targetRow, endCol: targetCol }],
        activeCell: { row: targetRow, col: targetCol },
        anchorCell: { row: targetRow, col: targetCol },
        activeRangeIndex: 0,
      };
    }

    this.renderer.scrollToCell(targetRow, targetCol);
    return { row: targetRow, col: targetCol };
  }

  /**
   * End: Go to end of data in row (or last used cell with Ctrl)
   */
  end(ctrl: boolean = false, shift: boolean = false): CellRef {
    const { row } = this.selection.activeCell;
    let targetRow: number;
    let targetCol: number;

    if (ctrl) {
      // Ctrl+End: Go to last used cell
      const usedRange = this.dataStore.getUsedRange();
      targetRow = Math.max(0, usedRange.endRow);
      targetCol = Math.max(0, usedRange.endCol);
    } else {
      // End: Go to last column with data in current row
      const rowCells = this.dataStore.getCellsInRow(row);
      targetRow = row;
      targetCol = 0;
      for (const col of rowCells.keys()) {
        if (col > targetCol) targetCol = col;
      }
    }

    if (shift) {
      const anchor = this.selection.anchorCell;
      const newRange = this.calculateRange(anchor, { row: targetRow, col: targetCol });

      this.selection = {
        ...this.selection,
        ranges: [newRange],
        activeCell: { row: targetRow, col: targetCol },
        activeRangeIndex: 0,
      };
    } else {
      this.selection = {
        ranges: [{ startRow: targetRow, startCol: targetCol, endRow: targetRow, endCol: targetCol }],
        activeCell: { row: targetRow, col: targetCol },
        anchorCell: { row: targetRow, col: targetCol },
        activeRangeIndex: 0,
      };
    }

    this.renderer.scrollToCell(targetRow, targetCol);
    return { row: targetRow, col: targetCol };
  }

  // ===========================================================================
  // Mouse Selection
  // ===========================================================================

  /**
   * Start selection at a cell (mouse down)
   */
  startSelection(row: number, col: number, addToSelection: boolean = false): void {
    const newRange: CellRange = {
      startRow: row,
      startCol: col,
      endRow: row,
      endCol: col,
    };

    if (addToSelection) {
      // Ctrl+Click: Add new range
      this.selection = {
        ranges: [...this.selection.ranges, newRange],
        activeCell: { row, col },
        anchorCell: { row, col },
        activeRangeIndex: this.selection.ranges.length,
      };
    } else {
      // Normal click: Replace selection
      this.selection = {
        ranges: [newRange],
        activeCell: { row, col },
        anchorCell: { row, col },
        activeRangeIndex: 0,
      };
    }

    this.selectionEntryPoint = { row, col };
  }

  /**
   * Extend selection to a cell (mouse drag or Shift+Click)
   */
  extendSelectionTo(row: number, col: number): void {
    const anchor = this.selection.anchorCell;
    const newRange = this.calculateRange(anchor, { row, col });

    const ranges = [...this.selection.ranges];
    ranges[this.selection.activeRangeIndex] = newRange;

    this.selection = {
      ...this.selection,
      ranges,
      activeCell: { row, col },
    };
  }

  /**
   * Select entire row
   */
  selectRow(row: number, addToSelection: boolean = false): void {
    const newRange: CellRange = {
      startRow: row,
      startCol: 0,
      endRow: row,
      endCol: MAX_COLS - 1,
    };

    if (addToSelection) {
      this.selection = {
        ranges: [...this.selection.ranges, newRange],
        activeCell: { row, col: 0 },
        anchorCell: { row, col: 0 },
        activeRangeIndex: this.selection.ranges.length,
      };
    } else {
      this.selection = {
        ranges: [newRange],
        activeCell: { row, col: 0 },
        anchorCell: { row, col: 0 },
        activeRangeIndex: 0,
      };
    }
  }

  /**
   * Select entire column
   */
  selectColumn(col: number, addToSelection: boolean = false): void {
    const newRange: CellRange = {
      startRow: 0,
      startCol: col,
      endRow: MAX_ROWS - 1,
      endCol: col,
    };

    if (addToSelection) {
      this.selection = {
        ranges: [...this.selection.ranges, newRange],
        activeCell: { row: 0, col },
        anchorCell: { row: 0, col },
        activeRangeIndex: this.selection.ranges.length,
      };
    } else {
      this.selection = {
        ranges: [newRange],
        activeCell: { row: 0, col },
        anchorCell: { row: 0, col },
        activeRangeIndex: 0,
      };
    }
  }

  // ===========================================================================
  // Go To Cell
  // ===========================================================================

  /**
   * Go to a specific cell (by reference like "A1" or "B10")
   */
  goToCell(row: number, col: number): void {
    this.selection = {
      ranges: [{ startRow: row, startCol: col, endRow: row, endCol: col }],
      activeCell: { row, col },
      anchorCell: { row, col },
      activeRangeIndex: 0,
    };

    this.renderer.scrollToCell(row, col);
    this.ctrlACount = 0;
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private calculateRange(anchor: CellRef, active: CellRef): CellRange {
    return {
      startRow: Math.min(anchor.row, active.row),
      startCol: Math.min(anchor.col, active.col),
      endRow: Math.max(anchor.row, active.row),
      endCol: Math.max(anchor.col, active.col),
    };
  }

  /**
   * Check if a cell is within the current selection
   */
  isCellSelected(row: number, col: number): boolean {
    for (const range of this.selection.ranges) {
      if (row >= range.startRow && row <= range.endRow &&
          col >= range.startCol && col <= range.endCol) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a cell is the active cell
   */
  isActiveCell(row: number, col: number): boolean {
    return this.selection.activeCell.row === row &&
           this.selection.activeCell.col === col;
  }

  /**
   * Get selection info text (e.g., "A1:B10" or "3R x 5C")
   */
  getSelectionInfo(): string {
    const range = this.selection.ranges[this.selection.activeRangeIndex];

    if (range.startRow === range.endRow && range.startCol === range.endCol) {
      // Single cell
      return this.cellRefToString(range.startRow, range.startCol);
    }

    const rows = range.endRow - range.startRow + 1;
    const cols = range.endCol - range.startCol + 1;

    return `${rows}R x ${cols}C`;
  }

  private cellRefToString(row: number, col: number): string {
    let colStr = '';
    let c = col + 1;
    while (c > 0) {
      const remainder = (c - 1) % 26;
      colStr = String.fromCharCode(65 + remainder) + colStr;
      c = Math.floor((c - 1) / 26);
    }
    return colStr + (row + 1);
  }
}
