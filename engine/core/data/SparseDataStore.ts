/**
 * VectorSheet Engine - Sparse Data Store
 *
 * Memory-efficient storage for spreadsheet cells.
 * Only stores non-empty cells, enabling support for 1M+ rows without memory issues.
 *
 * Key features:
 * - O(1) cell access via Map
 * - O(n) iteration where n = non-empty cells only
 * - Efficient range queries via row/column indexes
 * - Track used range (last row/col with data)
 */

import {
  Cell,
  CellKey,
  CellRef,
  CellRange,
  RowInfo,
  ColumnInfo,
  cellKey,
  parseKey,
  MAX_ROWS,
  MAX_COLS,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_COL_WIDTH,
} from '../types/index.js';

export interface DataStoreStats {
  cellCount: number;
  usedRows: number;
  usedCols: number;
  memoryEstimateKB: number;
}

export class SparseDataStore {
  /** Main cell storage: Map<"row_col", Cell> */
  private cells: Map<CellKey, Cell> = new Map();

  /** Row index: Map<row, Set<col>> for quick row iteration */
  private rowIndex: Map<number, Set<number>> = new Map();

  /** Column index: Map<col, Set<row>> for quick column iteration */
  private colIndex: Map<number, Set<number>> = new Map();

  /** Custom row heights (only stores non-default) */
  private rowInfo: Map<number, RowInfo> = new Map();

  /** Custom column widths (only stores non-default) */
  private colInfo: Map<number, ColumnInfo> = new Map();

  /** Tracked bounds of used area */
  private _usedRange: CellRange = {
    startRow: 0,
    startCol: 0,
    endRow: -1,  // -1 indicates no data
    endCol: -1,
  };

  /** Whether bounds need recalculation */
  private _boundsDirty: boolean = false;

  // ===========================================================================
  // Cell Operations
  // ===========================================================================

  /**
   * Get a cell by coordinates
   * @returns Cell or null if empty
   */
  getCell(row: number, col: number): Cell | null {
    return this.cells.get(cellKey(row, col)) ?? null;
  }

  /**
   * Set a cell value
   * @param row Row index (0-based)
   * @param col Column index (0-based)
   * @param cell Cell data or null to clear
   */
  setCell(row: number, col: number, cell: Cell | null): void {
    const key = cellKey(row, col);

    if (cell === null || this.isCellEmpty(cell)) {
      this.deleteCell(row, col);
      return;
    }

    // Store the cell
    this.cells.set(key, cell);

    // Update row index
    if (!this.rowIndex.has(row)) {
      this.rowIndex.set(row, new Set());
    }
    this.rowIndex.get(row)!.add(col);

    // Update column index
    if (!this.colIndex.has(col)) {
      this.colIndex.set(col, new Set());
    }
    this.colIndex.get(col)!.add(row);

    // Update used range (quick update, not full recalc)
    if (this._usedRange.endRow < row) this._usedRange.endRow = row;
    if (this._usedRange.endCol < col) this._usedRange.endCol = col;
    if (this._usedRange.startRow > row || this._usedRange.endRow === -1) {
      this._usedRange.startRow = row;
    }
    if (this._usedRange.startCol > col || this._usedRange.endCol === -1) {
      this._usedRange.startCol = col;
    }
  }

  /**
   * Delete a cell
   */
  deleteCell(row: number, col: number): void {
    const key = cellKey(row, col);

    if (!this.cells.has(key)) return;

    this.cells.delete(key);

    // Update row index
    const rowCols = this.rowIndex.get(row);
    if (rowCols) {
      rowCols.delete(col);
      if (rowCols.size === 0) {
        this.rowIndex.delete(row);
      }
    }

    // Update column index
    const colRows = this.colIndex.get(col);
    if (colRows) {
      colRows.delete(row);
      if (colRows.size === 0) {
        this.colIndex.delete(col);
      }
    }

    // Mark bounds for recalculation if we deleted at the edge
    if (row === this._usedRange.endRow || col === this._usedRange.endCol ||
        row === this._usedRange.startRow || col === this._usedRange.startCol) {
      this._boundsDirty = true;
    }
  }

  /**
   * Check if a cell is considered empty
   */
  private isCellEmpty(cell: Cell): boolean {
    return cell.value === null &&
           cell.value === undefined &&
           !cell.formula &&
           !cell.format &&
           !cell.borders &&
           !cell.comment;
  }

  /**
   * Check if a cell exists (is non-empty)
   */
  hasCell(row: number, col: number): boolean {
    return this.cells.has(cellKey(row, col));
  }

  // ===========================================================================
  // Range Operations
  // ===========================================================================

  /**
   * Get all cells in a range
   * @returns Map of cells with coordinates as values
   */
  getCellsInRange(range: CellRange): Map<CellKey, Cell> {
    const result = new Map<CellKey, Cell>();

    // For small ranges, iterate directly
    const rangeSize = (range.endRow - range.startRow + 1) * (range.endCol - range.startCol + 1);

    if (rangeSize < this.cells.size) {
      // Iterate over range coordinates
      for (let row = range.startRow; row <= range.endRow; row++) {
        for (let col = range.startCol; col <= range.endCol; col++) {
          const key = cellKey(row, col);
          const cell = this.cells.get(key);
          if (cell) {
            result.set(key, cell);
          }
        }
      }
    } else {
      // Iterate over cells and filter
      for (const [key, cell] of this.cells) {
        const { row, col } = parseKey(key);
        if (row >= range.startRow && row <= range.endRow &&
            col >= range.startCol && col <= range.endCol) {
          result.set(key, cell);
        }
      }
    }

    return result;
  }

  /**
   * Clear all cells in a range
   */
  clearRange(range: CellRange): void {
    for (let row = range.startRow; row <= range.endRow; row++) {
      const cols = this.rowIndex.get(row);
      if (!cols) continue;

      for (const col of cols) {
        if (col >= range.startCol && col <= range.endCol) {
          this.deleteCell(row, col);
        }
      }
    }
  }

  /**
   * Get cells in a specific row
   */
  getCellsInRow(row: number): Map<number, Cell> {
    const result = new Map<number, Cell>();
    const cols = this.rowIndex.get(row);

    if (cols) {
      for (const col of cols) {
        const cell = this.cells.get(cellKey(row, col));
        if (cell) {
          result.set(col, cell);
        }
      }
    }

    return result;
  }

  /**
   * Get cells in a specific column
   */
  getCellsInColumn(col: number): Map<number, Cell> {
    const result = new Map<number, Cell>();
    const rows = this.colIndex.get(col);

    if (rows) {
      for (const row of rows) {
        const cell = this.cells.get(cellKey(row, col));
        if (cell) {
          result.set(row, cell);
        }
      }
    }

    return result;
  }

  // ===========================================================================
  // Row/Column Info
  // ===========================================================================

  getRowHeight(row: number): number {
    return this.rowInfo.get(row)?.height ?? DEFAULT_ROW_HEIGHT;
  }

  setRowHeight(row: number, height: number): void {
    const info = this.rowInfo.get(row) ?? {
      height: DEFAULT_ROW_HEIGHT,
      hidden: false,
      customHeight: false,
    };
    info.height = height;
    info.customHeight = true;
    this.rowInfo.set(row, info);
  }

  isRowHidden(row: number): boolean {
    return this.rowInfo.get(row)?.hidden ?? false;
  }

  setRowHidden(row: number, hidden: boolean): void {
    const info = this.rowInfo.get(row) ?? {
      height: DEFAULT_ROW_HEIGHT,
      hidden: false,
      customHeight: false,
    };
    info.hidden = hidden;
    this.rowInfo.set(row, info);
  }

  getColumnWidth(col: number): number {
    return this.colInfo.get(col)?.width ?? DEFAULT_COL_WIDTH;
  }

  setColumnWidth(col: number, width: number): void {
    const info = this.colInfo.get(col) ?? {
      width: DEFAULT_COL_WIDTH,
      hidden: false,
      customWidth: false,
    };
    info.width = width;
    info.customWidth = true;
    this.colInfo.set(col, info);
  }

  isColumnHidden(col: number): boolean {
    return this.colInfo.get(col)?.hidden ?? false;
  }

  setColumnHidden(col: number, hidden: boolean): void {
    const info = this.colInfo.get(col) ?? {
      width: DEFAULT_COL_WIDTH,
      hidden: false,
      customWidth: false,
    };
    info.hidden = hidden;
    this.colInfo.set(col, info);
  }

  // ===========================================================================
  // Used Range & Bounds
  // ===========================================================================

  /**
   * Get the used range (area containing data)
   */
  getUsedRange(): CellRange {
    if (this._boundsDirty) {
      this.recalculateBounds();
    }
    return { ...this._usedRange };
  }

  /**
   * Get the last row with data
   */
  getLastRow(): number {
    if (this._boundsDirty) {
      this.recalculateBounds();
    }
    return this._usedRange.endRow;
  }

  /**
   * Get the last column with data
   */
  getLastColumn(): number {
    if (this._boundsDirty) {
      this.recalculateBounds();
    }
    return this._usedRange.endCol;
  }

  /**
   * Recalculate bounds from scratch
   */
  private recalculateBounds(): void {
    if (this.cells.size === 0) {
      this._usedRange = { startRow: 0, startCol: 0, endRow: -1, endCol: -1 };
      this._boundsDirty = false;
      return;
    }

    let minRow = MAX_ROWS;
    let maxRow = -1;
    let minCol = MAX_COLS;
    let maxCol = -1;

    for (const key of this.cells.keys()) {
      const { row, col } = parseKey(key);
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }

    this._usedRange = {
      startRow: minRow,
      startCol: minCol,
      endRow: maxRow,
      endCol: maxCol,
    };
    this._boundsDirty = false;
  }

  // ===========================================================================
  // Navigation Helpers
  // ===========================================================================

  /**
   * Find the next non-empty cell in a direction (for Ctrl+Arrow)
   */
  findNextNonEmpty(
    startRow: number,
    startCol: number,
    direction: 'up' | 'down' | 'left' | 'right'
  ): CellRef {
    const currentCell = this.getCell(startRow, startCol);
    const hasData = currentCell !== null && currentCell.value !== null;

    let row = startRow;
    let col = startCol;

    const delta = {
      up: { row: -1, col: 0 },
      down: { row: 1, col: 0 },
      left: { row: 0, col: -1 },
      right: { row: 0, col: 1 },
    }[direction];

    // If current cell has data, find the end of the data region or next data
    // If current cell is empty, find the first cell with data

    if (hasData) {
      // Move to next cell first
      row += delta.row;
      col += delta.col;

      // Check bounds
      if (row < 0 || row >= MAX_ROWS || col < 0 || col >= MAX_COLS) {
        return { row: startRow, col: startCol };
      }

      const nextCell = this.getCell(row, col);
      const nextHasData = nextCell !== null && nextCell.value !== null;

      if (nextHasData) {
        // We're in a data region, find the end
        while (true) {
          const checkRow = row + delta.row;
          const checkCol = col + delta.col;

          if (checkRow < 0 || checkRow >= MAX_ROWS || checkCol < 0 || checkCol >= MAX_COLS) {
            break;
          }

          const checkCell = this.getCell(checkRow, checkCol);
          if (checkCell === null || checkCell.value === null) {
            break;
          }

          row = checkRow;
          col = checkCol;
        }
      } else {
        // We hit empty after data, find next data region
        while (true) {
          row += delta.row;
          col += delta.col;

          if (row < 0 || row >= MAX_ROWS || col < 0 || col >= MAX_COLS) {
            // Hit the edge, stop at last valid position
            row = Math.max(0, Math.min(row - delta.row, MAX_ROWS - 1));
            col = Math.max(0, Math.min(col - delta.col, MAX_COLS - 1));
            break;
          }

          const foundCell = this.getCell(row, col);
          if (foundCell !== null && foundCell.value !== null) {
            break;
          }
        }
      }
    } else {
      // Current cell is empty, find first non-empty
      while (true) {
        row += delta.row;
        col += delta.col;

        if (row < 0 || row >= MAX_ROWS || col < 0 || col >= MAX_COLS) {
          // Hit the edge
          row = Math.max(0, Math.min(row - delta.row, MAX_ROWS - 1));
          col = Math.max(0, Math.min(col - delta.col, MAX_COLS - 1));
          break;
        }

        const foundCell = this.getCell(row, col);
        if (foundCell !== null && foundCell.value !== null) {
          break;
        }
      }
    }

    return { row, col };
  }

  /**
   * Find the current region (contiguous data block) around a cell
   * Used for Ctrl+A to select current region
   */
  findCurrentRegion(startRow: number, startCol: number): CellRange | null {
    const startCell = this.getCell(startRow, startCol);
    if (startCell === null || startCell.value === null) {
      // If starting cell is empty, no current region
      return null;
    }

    // Use flood-fill to find the region
    const visited = new Set<CellKey>();
    const queue: CellRef[] = [{ row: startRow, col: startCol }];

    let minRow = startRow;
    let maxRow = startRow;
    let minCol = startCol;
    let maxCol = startCol;

    while (queue.length > 0) {
      const { row, col } = queue.shift()!;
      const key = cellKey(row, col);

      if (visited.has(key)) continue;
      visited.add(key);

      const cell = this.getCell(row, col);
      if (cell === null || cell.value === null) continue;

      // Update bounds
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;

      // Add neighbors (4-directional)
      const neighbors = [
        { row: row - 1, col },
        { row: row + 1, col },
        { row, col: col - 1 },
        { row, col: col + 1 },
      ];

      for (const neighbor of neighbors) {
        if (neighbor.row >= 0 && neighbor.row < MAX_ROWS &&
            neighbor.col >= 0 && neighbor.col < MAX_COLS &&
            !visited.has(cellKey(neighbor.row, neighbor.col))) {
          queue.push(neighbor);
        }
      }
    }

    return { startRow: minRow, startCol: minCol, endRow: maxRow, endCol: maxCol };
  }

  // ===========================================================================
  // Statistics & Utilities
  // ===========================================================================

  /**
   * Get storage statistics
   */
  getStats(): DataStoreStats {
    const usedRange = this.getUsedRange();

    // Rough memory estimate: each cell ~200 bytes average
    const memoryEstimate = this.cells.size * 200 / 1024;

    return {
      cellCount: this.cells.size,
      usedRows: usedRange.endRow >= 0 ? usedRange.endRow - usedRange.startRow + 1 : 0,
      usedCols: usedRange.endCol >= 0 ? usedRange.endCol - usedRange.startCol + 1 : 0,
      memoryEstimateKB: Math.round(memoryEstimate),
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.cells.clear();
    this.rowIndex.clear();
    this.colIndex.clear();
    this.rowInfo.clear();
    this.colInfo.clear();
    this._usedRange = { startRow: 0, startCol: 0, endRow: -1, endCol: -1 };
    this._boundsDirty = false;
  }

  /**
   * Get all cells (for serialization)
   */
  getAllCells(): Map<CellKey, Cell> {
    return new Map(this.cells);
  }

  /**
   * Iterate over all cells efficiently
   */
  *iterateCells(): Generator<{ row: number; col: number; cell: Cell }> {
    for (const [key, cell] of this.cells) {
      const { row, col } = parseKey(key);
      yield { row, col, cell };
    }
  }

  /**
   * Get count of non-empty cells
   */
  get cellCount(): number {
    return this.cells.size;
  }
}
