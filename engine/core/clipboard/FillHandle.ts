/**
 * VectorSheet Engine - Fill Handle
 *
 * Manages the fill handle (the small square at the bottom-right of selection):
 * - Drag detection and tracking
 * - Preview generation during drag
 * - Fill direction detection
 * - Double-click to auto-fill
 *
 * Integration:
 * - Uses FillSeries (pure) for pattern detection and value generation
 * - Uses SparseDataStore for reading source and writing results
 */

import { Cell, CellRef, CellRange } from '../types/index.js';
import { SparseDataStore } from '../data/SparseDataStore.js';
import { FillSeries, FillDirection, GeneratedValue } from './FillSeries.js';

export interface FillHandleState {
  /** Is currently dragging */
  isDragging: boolean;
  /** Starting selection range */
  sourceRange: CellRange | null;
  /** Current target range (during drag) */
  targetRange: CellRange | null;
  /** Fill direction */
  direction: FillDirection | null;
  /** Preview values for target cells */
  preview: Map<string, string>;
}

export interface FillHandlePosition {
  /** X position in pixels */
  x: number;
  /** Y position in pixels */
  y: number;
  /** Width of the handle */
  width: number;
  /** Height of the handle */
  height: number;
  /** Is visible */
  visible: boolean;
}

export interface FillHandleEvents {
  /** Called when drag starts */
  onDragStart?: (sourceRange: CellRange) => void;
  /** Called during drag with preview */
  onDragMove?: (targetRange: CellRange, direction: FillDirection, preview: Map<string, string>) => void;
  /** Called when drag ends */
  onDragEnd?: (sourceRange: CellRange, targetRange: CellRange, direction: FillDirection) => void;
  /** Called when drag is cancelled */
  onDragCancel?: () => void;
  /** Called when fill is complete */
  onFillComplete?: (filledCells: CellRef[]) => void;
}

export class FillHandle {
  private dataStore: SparseDataStore;
  private fillSeries: FillSeries;
  private state: FillHandleState;
  private events: FillHandleEvents = {};

  /** Handle size in pixels */
  private handleSize = 6;

  constructor(dataStore: SparseDataStore) {
    this.dataStore = dataStore;
    this.fillSeries = new FillSeries();
    this.state = this.createInitialState();
  }

  private createInitialState(): FillHandleState {
    return {
      isDragging: false,
      sourceRange: null,
      targetRange: null,
      direction: null,
      preview: new Map(),
    };
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  setEventHandlers(events: FillHandleEvents): void {
    this.events = { ...this.events, ...events };
  }

  // ===========================================================================
  // State
  // ===========================================================================

  getState(): Readonly<FillHandleState> {
    return { ...this.state, preview: new Map(this.state.preview) };
  }

  isDragging(): boolean {
    return this.state.isDragging;
  }

  getTargetRange(): CellRange | null {
    return this.state.targetRange;
  }

  getDirection(): FillDirection | null {
    return this.state.direction;
  }

  getPreview(): Map<string, string> {
    return new Map(this.state.preview);
  }

  // ===========================================================================
  // Handle Position Calculation
  // ===========================================================================

  /**
   * Calculate fill handle position based on selection and cell metrics
   */
  calculatePosition(
    selection: CellRange,
    getCellPosition: (row: number, col: number) => { x: number; y: number; width: number; height: number }
  ): FillHandlePosition {
    // Get position of bottom-right cell
    const bottomRight = getCellPosition(selection.endRow, selection.endCol);

    return {
      x: bottomRight.x + bottomRight.width - this.handleSize,
      y: bottomRight.y + bottomRight.height - this.handleSize,
      width: this.handleSize,
      height: this.handleSize,
      visible: true,
    };
  }

  /**
   * Check if a point is over the fill handle
   */
  isPointOverHandle(
    x: number,
    y: number,
    handlePosition: FillHandlePosition
  ): boolean {
    if (!handlePosition.visible) return false;

    // Add a small tolerance for easier clicking
    const tolerance = 2;

    return (
      x >= handlePosition.x - tolerance &&
      x <= handlePosition.x + handlePosition.width + tolerance &&
      y >= handlePosition.y - tolerance &&
      y <= handlePosition.y + handlePosition.height + tolerance
    );
  }

  // ===========================================================================
  // Drag Operations
  // ===========================================================================

  /**
   * Start dragging the fill handle
   */
  startDrag(sourceRange: CellRange): void {
    this.state = {
      isDragging: true,
      sourceRange: { ...sourceRange },
      targetRange: null,
      direction: null,
      preview: new Map(),
    };

    this.events.onDragStart?.(sourceRange);
  }

  /**
   * Update drag position
   */
  updateDrag(currentCell: CellRef): void {
    if (!this.state.isDragging || !this.state.sourceRange) return;

    const source = this.state.sourceRange;

    // Determine fill direction based on current cell position
    const direction = this.detectDirection(source, currentCell);

    if (!direction) {
      // Current cell is within source range
      this.state.targetRange = null;
      this.state.direction = null;
      this.state.preview.clear();
      return;
    }

    // Calculate target range
    const targetRange = this.calculateTargetRange(source, currentCell, direction);

    this.state.direction = direction;
    this.state.targetRange = targetRange;

    // Generate preview
    this.generatePreview(source, targetRange, direction);

    this.events.onDragMove?.(targetRange, direction, this.state.preview);
  }

  /**
   * End drag and perform fill
   */
  endDrag(): CellRef[] {
    if (!this.state.isDragging || !this.state.sourceRange || !this.state.targetRange || !this.state.direction) {
      this.cancelDrag();
      return [];
    }

    const source = this.state.sourceRange;
    const target = this.state.targetRange;
    const direction = this.state.direction;

    this.events.onDragEnd?.(source, target, direction);

    // Perform the fill
    const filledCells = this.performFill(source, target, direction);

    this.events.onFillComplete?.(filledCells);

    // Reset state
    this.state = this.createInitialState();

    return filledCells;
  }

  /**
   * Cancel drag
   */
  cancelDrag(): void {
    if (this.state.isDragging) {
      this.events.onDragCancel?.();
    }
    this.state = this.createInitialState();
  }

  // ===========================================================================
  // Fill Operation
  // ===========================================================================

  /**
   * Perform fill operation using pure FillSeries and write to dataStore.
   */
  private performFill(
    source: CellRange,
    target: CellRange,
    direction: FillDirection
  ): CellRef[] {
    const filledCells: CellRef[] = [];
    const isVertical = direction === 'down' || direction === 'up';

    if (isVertical) {
      const fillCount = target.endRow - target.startRow + 1;

      for (let col = source.startCol; col <= source.endCol; col++) {
        // Extract source cells for this column
        const sourceCells = this.extractColumnCells(source, col);

        // Analyze pattern and generate values
        const pattern = this.fillSeries.analyze(sourceCells);
        const result = this.fillSeries.generate(pattern, fillCount, direction);

        // Write generated values to data store
        for (let i = 0; i < result.values.length; i++) {
          const targetRow = direction === 'down'
            ? target.startRow + i
            : target.endRow - i;

          this.writeGeneratedValue(targetRow, col, result.values[i]);
          filledCells.push({ row: targetRow, col });
        }
      }
    } else {
      const fillCount = target.endCol - target.startCol + 1;

      for (let row = source.startRow; row <= source.endRow; row++) {
        // Extract source cells for this row
        const sourceCells = this.extractRowCells(source, row);

        // Analyze pattern and generate values
        const pattern = this.fillSeries.analyze(sourceCells);
        const result = this.fillSeries.generate(pattern, fillCount, direction);

        // Write generated values to data store
        for (let i = 0; i < result.values.length; i++) {
          const targetCol = direction === 'right'
            ? target.startCol + i
            : target.endCol - i;

          this.writeGeneratedValue(row, targetCol, result.values[i]);
          filledCells.push({ row, col: targetCol });
        }
      }
    }

    return filledCells;
  }

  /**
   * Extract cells from a column within a range.
   */
  private extractColumnCells(range: CellRange, col: number): (Cell | null)[] {
    const cells: (Cell | null)[] = [];
    for (let row = range.startRow; row <= range.endRow; row++) {
      cells.push(this.dataStore.getCell(row, col));
    }
    return cells;
  }

  /**
   * Extract cells from a row within a range.
   */
  private extractRowCells(range: CellRange, row: number): (Cell | null)[] {
    const cells: (Cell | null)[] = [];
    for (let col = range.startCol; col <= range.endCol; col++) {
      cells.push(this.dataStore.getCell(row, col));
    }
    return cells;
  }

  /**
   * Write a generated value to the data store.
   */
  private writeGeneratedValue(row: number, col: number, generated: GeneratedValue): void {
    const cell: Cell = {
      value: generated.value,
      type: generated.type,
      formula: generated.formula,
      format: generated.format,
      isDirty: generated.formula !== undefined,
    };
    this.dataStore.setCell(row, col, cell);
  }

  // ===========================================================================
  // Double-Click Auto-Fill
  // ===========================================================================

  /**
   * Auto-fill down based on adjacent data
   * (Double-clicking the fill handle behavior)
   */
  autoFill(sourceRange: CellRange): CellRef[] {
    // Find how far down to fill based on adjacent column data
    const fillToRow = this.findAutoFillEndRow(sourceRange);

    if (fillToRow <= sourceRange.endRow) {
      return []; // Nothing to fill
    }

    const targetRange: CellRange = {
      startRow: sourceRange.endRow + 1,
      endRow: fillToRow,
      startCol: sourceRange.startCol,
      endCol: sourceRange.endCol,
    };

    const filledCells = this.performFill(sourceRange, targetRange, 'down');

    this.events.onFillComplete?.(filledCells);

    return filledCells;
  }

  /**
   * Find how far to auto-fill based on adjacent columns
   */
  private findAutoFillEndRow(sourceRange: CellRange): number {
    // Check columns to the left and right of the selection
    const checkCols = [sourceRange.startCol - 1, sourceRange.endCol + 1];
    let maxRow = sourceRange.endRow;

    for (const col of checkCols) {
      if (col < 0) continue;

      // Find the last non-empty row in this column
      let row = sourceRange.endRow + 1;
      while (row < 1000000) { // Reasonable limit
        const cell = this.dataStore.getCell(row, col);
        if (!cell || cell.value === null || cell.value === '') {
          break;
        }
        maxRow = Math.max(maxRow, row);
        row++;
      }
    }

    return maxRow;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Detect fill direction based on current cell position relative to source
   */
  private detectDirection(source: CellRange, current: CellRef): FillDirection | null {
    // Check if current is inside source
    if (
      current.row >= source.startRow &&
      current.row <= source.endRow &&
      current.col >= source.startCol &&
      current.col <= source.endCol
    ) {
      return null;
    }

    // Calculate distances
    const distUp = source.startRow - current.row;
    const distDown = current.row - source.endRow;
    const distLeft = source.startCol - current.col;
    const distRight = current.col - source.endCol;

    // Find the dominant direction
    const maxDist = Math.max(distUp, distDown, distLeft, distRight);

    if (maxDist <= 0) return null;

    if (distDown === maxDist) return 'down';
    if (distUp === maxDist) return 'up';
    if (distRight === maxDist) return 'right';
    if (distLeft === maxDist) return 'left';

    return null;
  }

  /**
   * Calculate target range based on direction
   */
  private calculateTargetRange(
    source: CellRange,
    current: CellRef,
    direction: FillDirection
  ): CellRange {
    switch (direction) {
      case 'down':
        return {
          startRow: source.endRow + 1,
          endRow: Math.max(source.endRow + 1, current.row),
          startCol: source.startCol,
          endCol: source.endCol,
        };
      case 'up':
        return {
          startRow: Math.min(source.startRow - 1, current.row),
          endRow: source.startRow - 1,
          startCol: source.startCol,
          endCol: source.endCol,
        };
      case 'right':
        return {
          startRow: source.startRow,
          endRow: source.endRow,
          startCol: source.endCol + 1,
          endCol: Math.max(source.endCol + 1, current.col),
        };
      case 'left':
        return {
          startRow: source.startRow,
          endRow: source.endRow,
          startCol: Math.min(source.startCol - 1, current.col),
          endCol: source.startCol - 1,
        };
    }
  }

  /**
   * Generate preview values for target cells
   */
  private generatePreview(
    source: CellRange,
    target: CellRange,
    direction: FillDirection
  ): void {
    this.state.preview.clear();

    const isVertical = direction === 'down' || direction === 'up';

    if (isVertical) {
      const fillCount = target.endRow - target.startRow + 1;

      for (let col = source.startCol; col <= source.endCol; col++) {
        const sourceCells = this.extractColumnCells(source, col);
        const pattern = this.fillSeries.analyze(sourceCells);
        const result = this.fillSeries.generate(pattern, fillCount, direction);

        for (let i = 0; i < result.values.length; i++) {
          const targetRow = direction === 'down'
            ? target.startRow + i
            : target.endRow - i;

          const previewValue = this.formatPreviewValue(result.values[i]);
          this.state.preview.set(`${targetRow}_${col}`, previewValue);
        }
      }
    } else {
      const fillCount = target.endCol - target.startCol + 1;

      for (let row = source.startRow; row <= source.endRow; row++) {
        const sourceCells = this.extractRowCells(source, row);
        const pattern = this.fillSeries.analyze(sourceCells);
        const result = this.fillSeries.generate(pattern, fillCount, direction);

        for (let i = 0; i < result.values.length; i++) {
          const targetCol = direction === 'right'
            ? target.startCol + i
            : target.endCol - i;

          const previewValue = this.formatPreviewValue(result.values[i]);
          this.state.preview.set(`${row}_${targetCol}`, previewValue);
        }
      }
    }
  }

  /**
   * Format a generated value for preview display.
   */
  private formatPreviewValue(generated: GeneratedValue): string {
    if (generated.formula) {
      // For formulas, show the formula text
      return generated.formula;
    }

    if (generated.value === null) {
      return '';
    }

    return String(generated.value);
  }
}
