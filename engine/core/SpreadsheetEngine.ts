/**
 * VectorSheet Engine - Main Spreadsheet Engine
 *
 * Central orchestrator that ties together all engine components:
 * - SparseDataStore for efficient cell storage
 * - FormulaEngine for calculation with caching
 * - VirtualRenderer for efficient viewport rendering
 * - NavigationManager for Excel-like navigation
 * - SelectionManager for selection state
 * - KeyboardHandler for keyboard shortcuts
 */

import {
  Cell,
  CellRef,
  CellRange,
  Selection,
  Viewport,
  RenderCell,
} from './types/index.js';
import { SparseDataStore } from './data/SparseDataStore.js';
import {
  FormulaEngine,
  FormulaEvaluator,
  FormulaValue,
  CalculationResult,
  CalculationProgressCallback,
  createSimpleEvaluator,
} from './formula/FormulaEngine.js';
import { VirtualRenderer } from './rendering/VirtualRenderer.js';
import { NavigationManager } from './navigation/NavigationManager.js';
import { SelectionManager } from './selection/SelectionManager.js';
import {
  KeyboardHandler,
  KeyboardEvent as SpreadsheetKeyboardEvent,
} from './navigation/KeyboardHandler.js';

export interface SpreadsheetEngineConfig {
  /** Initial viewport dimensions */
  viewportWidth?: number;
  viewportHeight?: number;
  /** Default row height */
  defaultRowHeight?: number;
  /** Default column width */
  defaultColumnWidth?: number;
  /** Custom formula evaluator */
  formulaEvaluator?: FormulaEvaluator;
  /** Frozen rows/columns */
  frozenRows?: number;
  frozenCols?: number;
}

export interface SpreadsheetEngineEvents {
  /** Called when cell data changes */
  onCellChange?: (row: number, col: number, cell: Cell | null) => void;
  /** Called when selection changes */
  onSelectionChange?: (selection: Selection) => void;
  /** Called when viewport should update */
  onViewportChange?: (viewport: Viewport) => void;
  /** Called when calculation completes */
  onCalculationComplete?: (result: CalculationResult) => void;
  /** Called when cell editing should start */
  onStartEdit?: (row: number, col: number, initialValue?: string) => void;
  /** Called when cell editing should end */
  onEndEdit?: (confirm: boolean) => void;
  /** Called for clipboard operations */
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  /** Called for undo/redo */
  onUndo?: () => void;
  onRedo?: () => void;
  /** Called for formatting operations */
  onBold?: () => void;
  onItalic?: () => void;
  onUnderline?: () => void;
  /** Called for find dialog */
  onFind?: () => void;
  /** Called for save */
  onSave?: () => void;
  /** Called for print */
  onPrint?: () => void;
  /** Called for delete */
  onDelete?: () => void;
}

/** Selection statistics for status bar */
export interface SelectionStats {
  sum: number | null;
  average: number | null;
  count: number;
  numericCount: number;
  min: number | null;
  max: number | null;
}

export class SpreadsheetEngine {
  // Core components
  private dataStore: SparseDataStore;
  private formulaEngine: FormulaEngine;
  private virtualRenderer: VirtualRenderer;
  private navigationManager: NavigationManager;
  private selectionManager: SelectionManager;
  private keyboardHandler: KeyboardHandler;

  // Configuration
  private config: Required<SpreadsheetEngineConfig>;

  // Event callbacks
  private events: SpreadsheetEngineEvents = {};

  constructor(config: SpreadsheetEngineConfig = {}) {
    // Merge with defaults
    this.config = {
      viewportWidth: config.viewportWidth ?? 1200,
      viewportHeight: config.viewportHeight ?? 800,
      defaultRowHeight: config.defaultRowHeight ?? 21,
      defaultColumnWidth: config.defaultColumnWidth ?? 100,
      formulaEvaluator: config.formulaEvaluator ?? createSimpleEvaluator(),
      frozenRows: config.frozenRows ?? 0,
      frozenCols: config.frozenCols ?? 0,
    };

    // Initialize data store
    this.dataStore = new SparseDataStore();

    // Initialize formula engine
    this.formulaEngine = new FormulaEngine(
      this.dataStore,
      this.config.formulaEvaluator
    );

    // Initialize virtual renderer (takes dataStore as first param)
    this.virtualRenderer = new VirtualRenderer(this.dataStore, {
      width: this.config.viewportWidth,
      height: this.config.viewportHeight,
      rowBuffer: 5,
      colBuffer: 3,
      frozenRows: this.config.frozenRows,
      frozenCols: this.config.frozenCols,
    });

    // Initialize selection manager
    this.selectionManager = new SelectionManager(this.dataStore);

    // Initialize navigation manager
    this.navigationManager = new NavigationManager(
      this.dataStore,
      this.virtualRenderer
    );

    // Initialize keyboard handler
    this.keyboardHandler = new KeyboardHandler(
      this.navigationManager,
      this.selectionManager
    );

    // Wire up internal events
    this.setupInternalEvents();
  }

  // ===========================================================================
  // Event Setup
  // ===========================================================================

  private setupInternalEvents(): void {
    // Keyboard handler callbacks
    this.keyboardHandler.setCallbacks({
      onStartEdit: (row, col, initialValue) => {
        this.events.onStartEdit?.(row, col, initialValue);
      },
      onEndEdit: (confirm) => {
        this.events.onEndEdit?.(confirm);
      },
      onSelectionChange: (selection) => {
        this.events.onSelectionChange?.(selection);
      },
      onDelete: () => {
        this.deleteSelection();
        this.events.onDelete?.();
      },
      onCopy: () => this.events.onCopy?.(),
      onCut: () => this.events.onCut?.(),
      onPaste: () => this.events.onPaste?.(),
      onUndo: () => this.events.onUndo?.(),
      onRedo: () => this.events.onRedo?.(),
      onBold: () => this.events.onBold?.(),
      onItalic: () => this.events.onItalic?.(),
      onUnderline: () => this.events.onUnderline?.(),
      onFind: () => this.events.onFind?.(),
      onSave: () => this.events.onSave?.(),
      onPrint: () => this.events.onPrint?.(),
    });
  }

  /**
   * Set event handlers
   */
  setEventHandlers(events: SpreadsheetEngineEvents): void {
    this.events = { ...this.events, ...events };
  }

  // ===========================================================================
  // Cell Operations
  // ===========================================================================

  /**
   * Get cell at position
   */
  getCell(row: number, col: number): Cell | null {
    return this.dataStore.getCell(row, col);
  }

  /**
   * Set cell value
   */
  setCellValue(row: number, col: number, value: string | number | boolean | null): void {
    let cell = this.dataStore.getCell(row, col);

    // Create new cell if needed
    if (!cell) {
      cell = {
        value: null,
        type: 'empty',
      };
    }

    // Check if it's a formula
    if (typeof value === 'string' && value.startsWith('=')) {
      cell.formula = value;
      cell.value = value;
      cell.type = 'formula';
      this.formulaEngine.setFormula(row, col, value);
    } else {
      // Clear any existing formula
      if (cell.formula) {
        this.formulaEngine.removeFormula(row, col);
        cell.formula = undefined;
        cell.formulaResult = undefined;
      }
      cell.value = value;
      cell.type = typeof value === 'number' ? 'number' :
                  typeof value === 'boolean' ? 'boolean' :
                  typeof value === 'string' ? 'string' : 'empty';
    }

    cell.isDirty = false;
    this.dataStore.setCell(row, col, cell);

    // Trigger recalculation for affected cells
    this.formulaEngine.recalculateAffected(row, col);

    // Notify listeners
    this.events.onCellChange?.(row, col, cell);
  }

  /**
   * Get cell display value (formula result or raw value)
   */
  getCellDisplayValue(row: number, col: number): FormulaValue {
    const cell = this.dataStore.getCell(row, col);
    if (!cell) return null;

    if (cell.formula !== undefined) {
      return cell.formulaResult ?? null;
    }
    return cell.value;
  }

  /**
   * Delete selection contents
   */
  deleteSelection(): void {
    const selection = this.selectionManager.getSelection();
    if (!selection) return;

    for (const range of selection.ranges) {
      for (let row = range.startRow; row <= range.endRow; row++) {
        for (let col = range.startCol; col <= range.endCol; col++) {
          this.dataStore.deleteCell(row, col);
          this.formulaEngine.removeFormula(row, col);
        }
      }
    }

    // Recalculate affected formulas
    this.formulaEngine.calculateSync();
  }

  /**
   * Set cell format
   */
  setCellFormat(
    row: number,
    col: number,
    format: Partial<NonNullable<Cell['format']>>
  ): void {
    let cell = this.dataStore.getCell(row, col);
    if (!cell) {
      cell = { value: null, type: 'empty' };
    }
    cell.format = { ...cell.format, ...format };
    this.dataStore.setCell(row, col, cell);
  }

  // ===========================================================================
  // Formula Operations
  // ===========================================================================

  /**
   * Recalculate all formulas synchronously
   */
  calculateSync(): CalculationResult {
    const result = this.formulaEngine.calculateSync();
    this.events.onCalculationComplete?.(result);
    return result;
  }

  /**
   * Recalculate all formulas asynchronously (non-blocking)
   */
  async calculateAsync(
    progressCallback?: CalculationProgressCallback
  ): Promise<CalculationResult> {
    const result = await this.formulaEngine.calculateAsync(progressCallback);
    this.events.onCalculationComplete?.(result);
    return result;
  }

  /**
   * Cancel any in-progress calculation
   */
  cancelCalculation(): void {
    this.formulaEngine.cancelCalculation();
  }

  // ===========================================================================
  // Navigation & Selection
  // ===========================================================================

  /**
   * Handle keyboard event
   */
  handleKeyDown(event: SpreadsheetKeyboardEvent): boolean {
    return this.keyboardHandler.handleKeyDown(event);
  }

  /**
   * Get current selection
   */
  getSelection(): Selection | null {
    return this.selectionManager.getSelection();
  }

  /**
   * Set selection programmatically
   */
  setSelection(selection: Selection): void {
    this.selectionManager.setSelection(selection);
    this.navigationManager.setSelection(selection);
    this.events.onSelectionChange?.(selection);
  }

  /**
   * Select a single cell
   */
  selectCell(row: number, col: number): void {
    this.navigationManager.goToCell(row, col);
    const selection = this.navigationManager.getSelection();
    this.selectionManager.setSelection(selection);
    this.events.onSelectionChange?.(selection);
  }

  /**
   * Get active cell position
   */
  getActiveCell(): CellRef {
    return this.navigationManager.getActiveCell();
  }

  /**
   * Get selection statistics (for status bar)
   */
  getSelectionStats(): SelectionStats {
    return this.selectionManager.calculateSelectionStats();
  }

  /**
   * Set editing state
   */
  setEditing(isEditing: boolean): void {
    this.keyboardHandler.setEditing(isEditing);
  }

  /**
   * Check if currently editing
   */
  isEditing(): boolean {
    return this.keyboardHandler.getIsEditing();
  }

  // ===========================================================================
  // Viewport & Rendering
  // ===========================================================================

  /**
   * Set viewport size
   */
  setViewportSize(width: number, height: number): void {
    this.virtualRenderer.setViewportSize(width, height);
    this.events.onViewportChange?.(this.virtualRenderer.getViewport());
  }

  /**
   * Scroll to position
   */
  scrollTo(scrollLeft: number, scrollTop: number): void {
    this.virtualRenderer.setScroll(scrollLeft, scrollTop);
    this.events.onViewportChange?.(this.virtualRenderer.getViewport());
  }

  /**
   * Get current viewport
   */
  getViewport(): Viewport {
    return this.virtualRenderer.getViewport();
  }

  /**
   * Get cells to render for current viewport
   */
  getCellsToRender(): RenderCell[] {
    return this.virtualRenderer.getCellsToRender();
  }

  /**
   * Get visible rows for rendering
   */
  getVisibleRows() {
    return this.virtualRenderer.getVisibleRows();
  }

  /**
   * Get visible columns for rendering
   */
  getVisibleColumns() {
    return this.virtualRenderer.getVisibleColumns();
  }

  /**
   * Get row top position
   */
  getRowTop(row: number): number {
    return this.virtualRenderer.getRowTop(row);
  }

  /**
   * Get column left position
   */
  getColLeft(col: number): number {
    return this.virtualRenderer.getColLeft(col);
  }

  /**
   * Set row height
   */
  setRowHeight(row: number, height: number): void {
    this.dataStore.setRowHeight(row, height);
    this.virtualRenderer.invalidateCache();
  }

  /**
   * Set column width
   */
  setColumnWidth(col: number, width: number): void {
    this.dataStore.setColumnWidth(col, width);
    this.virtualRenderer.invalidateCache();
  }

  /**
   * Get row height
   */
  getRowHeight(row: number): number {
    return this.dataStore.getRowHeight(row);
  }

  /**
   * Get column width
   */
  getColumnWidth(col: number): number {
    return this.dataStore.getColumnWidth(col);
  }

  /**
   * Get maximum scroll position
   */
  getMaxScroll(): { x: number; y: number } {
    return this.virtualRenderer.getMaxScroll();
  }

  /**
   * Get cell at pixel position
   */
  getCellAtPosition(x: number, y: number): CellRef | null {
    return this.virtualRenderer.getCellAtPoint(x, y);
  }

  // ===========================================================================
  // Row/Column Operations
  // ===========================================================================

  /**
   * Set frozen rows
   */
  setFrozenRows(count: number): void {
    this.virtualRenderer.setFrozenPanes(count, this.config.frozenCols);
    this.config.frozenRows = count;
  }

  /**
   * Set frozen columns
   */
  setFrozenCols(count: number): void {
    this.virtualRenderer.setFrozenPanes(this.config.frozenRows, count);
    this.config.frozenCols = count;
  }

  /**
   * Hide a row
   */
  hideRow(row: number): void {
    this.dataStore.setRowHidden(row, true);
    this.virtualRenderer.invalidateCache();
  }

  /**
   * Show a row
   */
  showRow(row: number): void {
    this.dataStore.setRowHidden(row, false);
    this.virtualRenderer.invalidateCache();
  }

  /**
   * Hide a column
   */
  hideColumn(col: number): void {
    this.dataStore.setColumnHidden(col, true);
    this.virtualRenderer.invalidateCache();
  }

  /**
   * Show a column
   */
  showColumn(col: number): void {
    this.dataStore.setColumnHidden(col, false);
    this.virtualRenderer.invalidateCache();
  }

  // ===========================================================================
  // Data Import/Export
  // ===========================================================================

  /**
   * Load data from 2D array
   */
  loadFromArray(data: (string | number | boolean | null)[][]): void {
    this.clear();

    for (let row = 0; row < data.length; row++) {
      const rowData = data[row];
      for (let col = 0; col < rowData.length; col++) {
        const value = rowData[col];
        if (value !== null && value !== undefined && value !== '') {
          this.setCellValue(row, col, value);
        }
      }
    }

    // Calculate all formulas
    this.calculateSync();
  }

  /**
   * Export data to 2D array
   */
  toArray(options?: { includeFormulas?: boolean }): (FormulaValue)[][] {
    const usedRange = this.dataStore.getUsedRange();
    if (usedRange.endRow < 0) return [];

    const result: (FormulaValue)[][] = [];

    for (let row = usedRange.startRow; row <= usedRange.endRow; row++) {
      const rowData: (FormulaValue)[] = [];
      for (let col = usedRange.startCol; col <= usedRange.endCol; col++) {
        const cell = this.dataStore.getCell(row, col);
        if (!cell) {
          rowData.push(null);
        } else if (options?.includeFormulas && cell.formula) {
          rowData.push(cell.formula);
        } else {
          rowData.push(cell.formulaResult ?? cell.value);
        }
      }
      result.push(rowData);
    }

    return result;
  }

  /**
   * Get used range
   */
  getUsedRange(): CellRange {
    return this.dataStore.getUsedRange();
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Clear all data
   */
  clear(): void {
    this.dataStore.clear();
    this.formulaEngine.clear();
    this.navigationManager.goToCell(0, 0);
  }

  /**
   * Get engine statistics
   */
  getStats(): {
    dataStats: ReturnType<SparseDataStore['getStats']>;
    formulaStats: ReturnType<FormulaEngine['getStats']>;
  } {
    return {
      dataStats: this.dataStore.getStats(),
      formulaStats: this.formulaEngine.getStats(),
    };
  }

  /**
   * Get underlying components for advanced usage
   */
  getComponents(): {
    dataStore: SparseDataStore;
    formulaEngine: FormulaEngine;
    virtualRenderer: VirtualRenderer;
    navigationManager: NavigationManager;
    selectionManager: SelectionManager;
    keyboardHandler: KeyboardHandler;
  } {
    return {
      dataStore: this.dataStore,
      formulaEngine: this.formulaEngine,
      virtualRenderer: this.virtualRenderer,
      navigationManager: this.navigationManager,
      selectionManager: this.selectionManager,
      keyboardHandler: this.keyboardHandler,
    };
  }
}
