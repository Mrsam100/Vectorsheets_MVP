/**
 * PointerAdapter - Translates mouse interactions into SpreadsheetIntents
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                         EVENT FLOW DIAGRAM                              │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                         │
 * │   Mouse Event                                                           │
 * │       │                                                                 │
 * │       ▼                                                                 │
 * │   ┌───────────────┐                                                     │
 * │   │PointerAdapter │  ← Translates raw events to semantic intents       │
 * │   └───────┬───────┘                                                     │
 * │           │                                                             │
 * │           ▼                                                             │
 * │   ┌───────────────┐                                                     │
 * │   │SpreadsheetIntent│  ← Pure data describing user intent              │
 * │   └───────┬───────┘                                                     │
 * │           │                                                             │
 * │           ▼                                                             │
 * │   ┌───────────────┐                                                     │
 * │   │ onIntent()    │  ← Callback to parent (GridViewport)               │
 * │   └───────┬───────┘                                                     │
 * │           │                                                             │
 * │           ▼                                                             │
 * │   ┌───────────────┐                                                     │
 * │   │Engine/Handler │  ← Processes intent, updates state                 │
 * │   └───────────────┘                                                     │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * INTERACTION MAPPINGS:
 * ┌────────────────────────┬─────────────────────────────────────────────┐
 * │ User Action            │ Emitted Intent                              │
 * ├────────────────────────┼─────────────────────────────────────────────┤
 * │ Click on cell          │ SetActiveCell { row, col }                  │
 * │ Shift+Click            │ ExtendSelection { row, col }                │
 * │ Ctrl/Cmd+Click         │ AddRange { row, col }                       │
 * │ Click+Drag             │ BeginDragSelection → UpdateDragSelection    │
 * │ Release drag           │ EndDragSelection                            │
 * │ Double-click           │ BeginEdit { row, col }                      │
 * │ Click row header       │ SelectRow { row }                           │
 * │ Click col header       │ SelectColumn { col }                        │
 * │ Click corner           │ SelectAll                                   │
 * │ Drag near edge         │ AutoScroll { direction, speed }             │
 * └────────────────────────┴─────────────────────────────────────────────┘
 *
 * DESIGN PRINCIPLES:
 * 1. UI never mutates selection directly
 * 2. UI emits semantic intents only
 * 3. No engine imports in this file
 * 4. All coordinates are in cell indices (row, col), not pixels
 */

// =============================================================================
// Intent Types (Pure data, no behavior)
// =============================================================================

/**
 * Base intent type
 */
interface BaseIntent {
  type: string;
  timestamp: number;
}

/**
 * Set the active cell (cursor position)
 */
export interface SetActiveCellIntent extends BaseIntent {
  type: 'SetActiveCell';
  row: number;
  col: number;
}

/**
 * Extend selection from active cell to target
 * Triggered by Shift+Click
 */
export interface ExtendSelectionIntent extends BaseIntent {
  type: 'ExtendSelection';
  row: number;
  col: number;
}

/**
 * Add a new selection range (multi-select)
 * Triggered by Ctrl/Cmd+Click
 */
export interface AddRangeIntent extends BaseIntent {
  type: 'AddRange';
  row: number;
  col: number;
}

/**
 * Begin a drag selection
 */
export interface BeginDragSelectionIntent extends BaseIntent {
  type: 'BeginDragSelection';
  row: number;
  col: number;
  additive: boolean; // Ctrl/Cmd held
}

/**
 * Update drag selection (during drag)
 */
export interface UpdateDragSelectionIntent extends BaseIntent {
  type: 'UpdateDragSelection';
  row: number;
  col: number;
}

/**
 * End drag selection
 */
export interface EndDragSelectionIntent extends BaseIntent {
  type: 'EndDragSelection';
  row: number;
  col: number;
}

/**
 * Begin editing a cell
 * Triggered by double-click or F2
 */
export interface BeginEditIntent extends BaseIntent {
  type: 'BeginEdit';
  row: number;
  col: number;
}

/**
 * Select entire row
 */
export interface SelectRowIntent extends BaseIntent {
  type: 'SelectRow';
  row: number;
  extend: boolean; // Shift held
  additive: boolean; // Ctrl/Cmd held
}

/**
 * Select entire column
 */
export interface SelectColumnIntent extends BaseIntent {
  type: 'SelectColumn';
  col: number;
  extend: boolean;
  additive: boolean;
}

/**
 * Select all cells
 */
export interface SelectAllIntent extends BaseIntent {
  type: 'SelectAll';
}

/**
 * Auto-scroll request (when dragging near edges)
 */
export interface AutoScrollIntent extends BaseIntent {
  type: 'AutoScroll';
  direction: 'up' | 'down' | 'left' | 'right';
  speed: number; // pixels per frame
}

/**
 * Stop auto-scrolling
 */
export interface StopAutoScrollIntent extends BaseIntent {
  type: 'StopAutoScroll';
}

/**
 * Fill handle drag started
 */
export interface BeginFillDragIntent extends BaseIntent {
  type: 'BeginFillDrag';
  row: number;
  col: number;
}

/**
 * Fill handle drag update
 */
export interface UpdateFillDragIntent extends BaseIntent {
  type: 'UpdateFillDrag';
  row: number;
  col: number;
}

/**
 * Fill handle drag ended
 */
export interface EndFillDragIntent extends BaseIntent {
  type: 'EndFillDrag';
  row: number;
  col: number;
}

/**
 * Union of all intent types
 */
export type SpreadsheetIntent =
  | SetActiveCellIntent
  | ExtendSelectionIntent
  | AddRangeIntent
  | BeginDragSelectionIntent
  | UpdateDragSelectionIntent
  | EndDragSelectionIntent
  | BeginEditIntent
  | SelectRowIntent
  | SelectColumnIntent
  | SelectAllIntent
  | AutoScrollIntent
  | StopAutoScrollIntent
  | BeginFillDragIntent
  | UpdateFillDragIntent
  | EndFillDragIntent;

// =============================================================================
// Intent Factory (Creates intents with timestamp)
// =============================================================================

function createIntent<T extends SpreadsheetIntent>(
  intent: Omit<T, 'timestamp'>
): T {
  return {
    ...intent,
    timestamp: Date.now(),
  } as T;
}

// =============================================================================
// Pointer State (Internal tracking)
// =============================================================================

interface PointerState {
  /** Is a drag operation in progress? */
  isDragging: boolean;
  /** Starting cell of drag */
  dragStartCell: { row: number; col: number } | null;
  /** Is this a fill handle drag? */
  isFillDrag: boolean;
  /** Is Ctrl/Cmd held? */
  isAdditive: boolean;
  /** Is Shift held? */
  isExtending: boolean;
  /** Auto-scroll interval ID */
  autoScrollInterval: number | null;
  /** Current auto-scroll direction */
  autoScrollDirection: 'up' | 'down' | 'left' | 'right' | null;
}

// =============================================================================
// PointerAdapter Class
// =============================================================================

export interface PointerAdapterConfig {
  /** Callback when intent is emitted */
  onIntent: (intent: SpreadsheetIntent) => void;
  /** Get cell at screen coordinates */
  getCellAtPoint: (x: number, y: number) => { row: number; col: number } | null;
  /** Get viewport bounds for auto-scroll detection */
  getViewportBounds: () => { top: number; left: number; right: number; bottom: number };
  /** Auto-scroll edge threshold in pixels */
  autoScrollThreshold?: number;
  /** Auto-scroll speed in pixels per frame */
  autoScrollSpeed?: number;
  /** Double-click threshold in ms */
  doubleClickThreshold?: number;
}

/**
 * PointerAdapter - Handles all mouse interactions
 *
 * Usage:
 * ```typescript
 * const adapter = new PointerAdapter({
 *   onIntent: (intent) => handleIntent(intent),
 *   getCellAtPoint: (x, y) => renderer.getCellAtPoint(x, y),
 *   getViewportBounds: () => ({ top, left, right, bottom }),
 * });
 *
 * // Attach to element
 * element.addEventListener('mousedown', adapter.handleMouseDown);
 * element.addEventListener('mousemove', adapter.handleMouseMove);
 * element.addEventListener('mouseup', adapter.handleMouseUp);
 * element.addEventListener('dblclick', adapter.handleDoubleClick);
 * ```
 */
export class PointerAdapter {
  private config: Required<PointerAdapterConfig>;
  private state: PointerState;

  constructor(config: PointerAdapterConfig) {
    this.config = {
      autoScrollThreshold: 40,
      autoScrollSpeed: 10,
      doubleClickThreshold: 300,
      ...config,
    };

    this.state = {
      isDragging: false,
      dragStartCell: null,
      isFillDrag: false,
      isAdditive: false,
      isExtending: false,
      autoScrollInterval: null,
      autoScrollDirection: null,
    };

    // Bind methods to preserve `this` context
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleDoubleClick = this.handleDoubleClick.bind(this);
    this.handleRowHeaderClick = this.handleRowHeaderClick.bind(this);
    this.handleColHeaderClick = this.handleColHeaderClick.bind(this);
    this.handleCornerClick = this.handleCornerClick.bind(this);
    this.handleFillHandleMouseDown = this.handleFillHandleMouseDown.bind(this);
  }

  // ===========================================================================
  // Public Event Handlers
  // ===========================================================================

  /**
   * Handle mousedown on cell area
   */
  handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return; // Only left click

    const cell = this.config.getCellAtPoint(e.clientX, e.clientY);
    if (!cell) return;

    // Track modifier keys
    this.state.isAdditive = e.ctrlKey || e.metaKey;
    this.state.isExtending = e.shiftKey;

    if (this.state.isExtending) {
      // Shift+Click: Extend selection
      this.emit(createIntent<ExtendSelectionIntent>({
        type: 'ExtendSelection',
        row: cell.row,
        col: cell.col,
      }));
    } else if (this.state.isAdditive) {
      // Ctrl/Cmd+Click: Add to selection
      this.emit(createIntent<AddRangeIntent>({
        type: 'AddRange',
        row: cell.row,
        col: cell.col,
      }));
    } else {
      // Normal click: Set active cell
      this.emit(createIntent<SetActiveCellIntent>({
        type: 'SetActiveCell',
        row: cell.row,
        col: cell.col,
      }));
    }

    // Start drag tracking
    this.state.isDragging = true;
    this.state.dragStartCell = cell;
    this.state.isFillDrag = false;

    this.emit(createIntent<BeginDragSelectionIntent>({
      type: 'BeginDragSelection',
      row: cell.row,
      col: cell.col,
      additive: this.state.isAdditive,
    }));

    // Add global listeners for drag
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);

    e.preventDefault();
  }

  /**
   * Handle mousemove (during drag)
   */
  handleMouseMove(e: MouseEvent): void {
    if (!this.state.isDragging) return;

    const cell = this.config.getCellAtPoint(e.clientX, e.clientY);

    // Check for auto-scroll
    this.checkAutoScroll(e.clientX, e.clientY);

    if (cell) {
      if (this.state.isFillDrag) {
        this.emit(createIntent<UpdateFillDragIntent>({
          type: 'UpdateFillDrag',
          row: cell.row,
          col: cell.col,
        }));
      } else {
        this.emit(createIntent<UpdateDragSelectionIntent>({
          type: 'UpdateDragSelection',
          row: cell.row,
          col: cell.col,
        }));
      }
    }
  }

  /**
   * Handle mouseup (end drag)
   */
  handleMouseUp(e: MouseEvent): void {
    if (!this.state.isDragging) return;

    const cell = this.config.getCellAtPoint(e.clientX, e.clientY);
    const endCell = cell ?? this.state.dragStartCell;

    if (endCell) {
      if (this.state.isFillDrag) {
        this.emit(createIntent<EndFillDragIntent>({
          type: 'EndFillDrag',
          row: endCell.row,
          col: endCell.col,
        }));
      } else {
        this.emit(createIntent<EndDragSelectionIntent>({
          type: 'EndDragSelection',
          row: endCell.row,
          col: endCell.col,
        }));
      }
    }

    // Stop auto-scroll
    this.stopAutoScroll();

    // Reset state
    this.state.isDragging = false;
    this.state.dragStartCell = null;
    this.state.isFillDrag = false;

    // Remove global listeners
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
  }

  /**
   * Handle double-click (enter edit mode)
   */
  handleDoubleClick(e: MouseEvent): void {
    const cell = this.config.getCellAtPoint(e.clientX, e.clientY);
    if (!cell) return;

    this.emit(createIntent<BeginEditIntent>({
      type: 'BeginEdit',
      row: cell.row,
      col: cell.col,
    }));

    e.preventDefault();
  }

  /**
   * Handle click on row header
   */
  handleRowHeaderClick(row: number, e: MouseEvent): void {
    this.emit(createIntent<SelectRowIntent>({
      type: 'SelectRow',
      row,
      extend: e.shiftKey,
      additive: e.ctrlKey || e.metaKey,
    }));
  }

  /**
   * Handle click on column header
   */
  handleColHeaderClick(col: number, e: MouseEvent): void {
    this.emit(createIntent<SelectColumnIntent>({
      type: 'SelectColumn',
      col,
      extend: e.shiftKey,
      additive: e.ctrlKey || e.metaKey,
    }));
  }

  /**
   * Handle click on corner cell (select all)
   */
  handleCornerClick(_e: MouseEvent): void {
    this.emit(createIntent<SelectAllIntent>({
      type: 'SelectAll',
    }));
  }

  /**
   * Handle mousedown on fill handle
   */
  handleFillHandleMouseDown(e: MouseEvent, anchorCell: { row: number; col: number }): void {
    if (e.button !== 0) return;

    this.state.isDragging = true;
    this.state.dragStartCell = anchorCell;
    this.state.isFillDrag = true;

    this.emit(createIntent<BeginFillDragIntent>({
      type: 'BeginFillDrag',
      row: anchorCell.row,
      col: anchorCell.col,
    }));

    // Add global listeners
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);

    e.preventDefault();
    e.stopPropagation();
  }

  // ===========================================================================
  // Auto-scroll Logic (Legacy - now handled by AutoScrollController)
  // ===========================================================================
  // Note: Auto-scroll is now handled by GridViewport's AutoScrollController
  // which uses RAF for smooth 60fps scrolling. These methods are kept for
  // compatibility but the interval-based approach is disabled.

  private checkAutoScroll(_clientX: number, _clientY: number): void {
    // Auto-scroll is now handled by GridViewport's AutoScrollController
    // via its global mousemove listener during drag. No need to emit
    // AutoScroll intents - the controller detects edge proximity directly.
  }

  private stopAutoScroll(): void {
    // Clear any legacy interval that might be running
    if (this.state.autoScrollInterval !== null) {
      clearInterval(this.state.autoScrollInterval);
      this.state.autoScrollInterval = null;
    }

    // Emit StopAutoScroll for cleanup (GridViewport uses this)
    if (this.state.autoScrollDirection !== null) {
      this.emit(createIntent<StopAutoScrollIntent>({
        type: 'StopAutoScroll',
      }));
      this.state.autoScrollDirection = null;
    }
  }

  // ===========================================================================
  // Intent Emission
  // ===========================================================================

  private emit(intent: SpreadsheetIntent): void {
    this.config.onIntent(intent);
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clean up event listeners and intervals
   */
  dispose(): void {
    this.stopAutoScroll();
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
  }
}

// =============================================================================
// React Hook for PointerAdapter
// =============================================================================

import { useRef, useEffect, useCallback } from 'react';

export interface UsePointerAdapterOptions {
  /** Callback when intent is emitted */
  onIntent: (intent: SpreadsheetIntent) => void;
  /** Get cell at screen coordinates */
  getCellAtPoint: (x: number, y: number) => { row: number; col: number } | null;
  /** Container element ref */
  containerRef: React.RefObject<HTMLElement>;
  /** Auto-scroll threshold */
  autoScrollThreshold?: number;
  /** Auto-scroll speed */
  autoScrollSpeed?: number;
}

/**
 * React hook for using PointerAdapter
 *
 * Usage:
 * ```tsx
 * const { handleCellMouseDown, handleCellDoubleClick, ... } = usePointerAdapter({
 *   onIntent: handleIntent,
 *   getCellAtPoint,
 *   containerRef,
 * });
 * ```
 */
export function usePointerAdapter(options: UsePointerAdapterOptions) {
  const adapterRef = useRef<PointerAdapter | null>(null);

  // Get viewport bounds from container
  const getViewportBounds = useCallback(() => {
    const container = options.containerRef.current;
    if (!container) {
      return { top: 0, left: 0, right: 0, bottom: 0 };
    }
    const rect = container.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
    };
  }, [options.containerRef]);

  // Initialize adapter
  useEffect(() => {
    adapterRef.current = new PointerAdapter({
      onIntent: options.onIntent,
      getCellAtPoint: options.getCellAtPoint,
      getViewportBounds,
      autoScrollThreshold: options.autoScrollThreshold,
      autoScrollSpeed: options.autoScrollSpeed,
    });

    return () => {
      adapterRef.current?.dispose();
      adapterRef.current = null;
    };
  }, [options.onIntent, options.getCellAtPoint, getViewportBounds, options.autoScrollThreshold, options.autoScrollSpeed]);

  // Expose handler functions
  const handleCellMouseDown = useCallback((e: React.MouseEvent) => {
    adapterRef.current?.handleMouseDown(e.nativeEvent);
  }, []);

  const handleCellDoubleClick = useCallback((e: React.MouseEvent) => {
    adapterRef.current?.handleDoubleClick(e.nativeEvent);
  }, []);

  const handleRowHeaderClick = useCallback((row: number, e: React.MouseEvent) => {
    adapterRef.current?.handleRowHeaderClick(row, e.nativeEvent);
  }, []);

  const handleColHeaderClick = useCallback((col: number, e: React.MouseEvent) => {
    adapterRef.current?.handleColHeaderClick(col, e.nativeEvent);
  }, []);

  const handleCornerClick = useCallback((e: React.MouseEvent) => {
    adapterRef.current?.handleCornerClick(e.nativeEvent);
  }, []);

  const handleFillHandleMouseDown = useCallback(
    (e: React.MouseEvent, anchorCell: { row: number; col: number }) => {
      adapterRef.current?.handleFillHandleMouseDown(e.nativeEvent, anchorCell);
    },
    []
  );

  return {
    handleCellMouseDown,
    handleCellDoubleClick,
    handleRowHeaderClick,
    handleColHeaderClick,
    handleCornerClick,
    handleFillHandleMouseDown,
  };
}
