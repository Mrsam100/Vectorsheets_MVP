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
 * │ Click on cell (down)   │ SetActiveCell { row, col }                  │
 * │ Click on cell (up)     │ BeginEdit { row, col }  (single-click edit) │
 * │ Shift+Click            │ ExtendSelection { row, col }                │
 * │ Ctrl/Cmd+Click         │ AddRange { row, col }                       │
 * │ Click+Drag (>3px)      │ BeginDragSelection → UpdateDragSelection    │
 * │ Release drag           │ EndDragSelection                            │
 * │ Double-click           │ BeginEdit { row, col }  (redundant/harmless)│
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
 * Triggered by single-click (pointerup without drag), double-click, or F2
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

// =============================================================================
// Context Menu Action Intent Types
// =============================================================================

/** Insert rows at a given position */
export interface InsertRowsIntent extends BaseIntent {
  type: 'InsertRows';
  row: number;
  count: number;
}

/** Delete rows in a range (inclusive) */
export interface DeleteRowsIntent extends BaseIntent {
  type: 'DeleteRows';
  startRow: number;
  endRow: number;
}

/** Insert columns at a given position */
export interface InsertColumnsIntent extends BaseIntent {
  type: 'InsertColumns';
  col: number;
  count: number;
}

/** Delete columns in a range (inclusive) */
export interface DeleteColumnsIntent extends BaseIntent {
  type: 'DeleteColumns';
  startCol: number;
  endCol: number;
}

/** Merge cells in the current selection */
export interface MergeCellsIntent extends BaseIntent {
  type: 'MergeCells';
}

/** Unmerge cells in the current selection */
export interface UnmergeCellsIntent extends BaseIntent {
  type: 'UnmergeCells';
}

/** Open the format cells dialog */
export interface ShowFormatDialogIntent extends BaseIntent {
  type: 'ShowFormatDialog';
}

/** Open the sort dialog */
export interface OpenSortDialogIntent extends BaseIntent {
  type: 'OpenSortDialog';
}

/** Open the filter dropdown for a column */
export interface OpenFilterDropdownIntent extends BaseIntent {
  type: 'OpenFilterDropdown';
  column: number;
  anchorRect: { x: number; y: number; width: number; height: number };
}

/** Open the data validation dialog */
export interface OpenDataValidationIntent extends BaseIntent {
  type: 'OpenDataValidation';
}

/** Show context menu at a position (triggered by touch long-press) */
export interface ShowContextMenuIntent extends BaseIntent {
  type: 'ShowContextMenu';
  row: number;
  col: number;
  screenX: number;
  screenY: number;
}

/**
 * Union of all pointer/context-menu intent types
 */
export type PointerIntent =
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
  | EndFillDragIntent
  | InsertRowsIntent
  | DeleteRowsIntent
  | InsertColumnsIntent
  | DeleteColumnsIntent
  | MergeCellsIntent
  | UnmergeCellsIntent
  | ShowFormatDialogIntent
  | OpenSortDialogIntent
  | OpenFilterDropdownIntent
  | OpenDataValidationIntent
  | ShowContextMenuIntent;

// =============================================================================
// Intent Factory (Creates intents with timestamp)
// =============================================================================

function createIntent<T extends PointerIntent>(
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

/** Minimum pixel distance before a pointerdown+move is treated as a drag */
const DRAG_THRESHOLD = 3;

interface PointerState {
  /** Is a drag operation in progress (threshold exceeded)? */
  isDragging: boolean;
  /** Is the pointer currently down (before or after threshold)? */
  isPointerDown: boolean;
  /** Starting pixel position of pointerdown (for drag threshold calc) */
  dragStartPoint: { x: number; y: number } | null;
  /** Starting cell of drag */
  dragStartCell: { row: number; col: number } | null;
  /** Last cell emitted during drag (for same-cell dedup) */
  lastDragCell: { row: number; col: number } | null;
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
  /** Timer for touch long-press detection */
  longPressTimer: ReturnType<typeof setTimeout> | null;
  /** Origin point of a potential long-press (for movement threshold) */
  longPressOrigin: { x: number; y: number } | null;
}

// =============================================================================
// PointerAdapter Class
// =============================================================================

export interface PointerAdapterConfig {
  /** Callback when intent is emitted */
  onIntent: (intent: PointerIntent) => void;
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
 * PointerAdapter - Handles all pointer interactions (mouse, touch, pen)
 *
 * Uses the Pointer Events API for unified mouse/touch/pen support.
 * This enables tablet and touchscreen users to interact with the grid.
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
 * element.addEventListener('pointerdown', adapter.handlePointerDown);
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
      isPointerDown: false,
      dragStartCell: null,
      lastDragCell: null,
      isFillDrag: false,
      isAdditive: false,
      isExtending: false,
      autoScrollInterval: null,
      autoScrollDirection: null,
      longPressTimer: null,
      longPressOrigin: null,
      dragStartPoint: null,
    };

    // Bind methods to preserve `this` context
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleDoubleClick = this.handleDoubleClick.bind(this);
    this.handleRowHeaderClick = this.handleRowHeaderClick.bind(this);
    this.handleColHeaderClick = this.handleColHeaderClick.bind(this);
    this.handleCornerClick = this.handleCornerClick.bind(this);
    this.handleFillHandlePointerDown = this.handleFillHandlePointerDown.bind(this);
  }

  // ===========================================================================
  // Public Event Handlers
  // ===========================================================================

  /**
   * Handle pointerdown on cell area (supports mouse, touch, pen)
   */
  handlePointerDown(e: PointerEvent): boolean {
    if (e.button !== 0) return false; // Only primary button

    const cell = this.config.getCellAtPoint(e.clientX, e.clientY);
    if (!cell) return false;

    // Capture pointer for reliable move/up delivery (critical for touch)
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);

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
      // Normal click: Set active cell immediately for visual feedback
      this.emit(createIntent<SetActiveCellIntent>({
        type: 'SetActiveCell',
        row: cell.row,
        col: cell.col,
      }));
    }

    // Start pointer tracking (drag begins only after DRAG_THRESHOLD exceeded)
    this.state.isPointerDown = true;
    this.state.isDragging = false;
    this.state.dragStartCell = cell;
    this.state.lastDragCell = cell;
    this.state.isFillDrag = false;
    this.state.dragStartPoint = { x: e.clientX, y: e.clientY };

    // Touch long-press detection (500ms hold → context menu)
    if (e.pointerType === 'touch') {
      this.state.longPressOrigin = { x: e.clientX, y: e.clientY };
      this.state.longPressTimer = setTimeout(() => {
        this.state.longPressTimer = null;
        const origin = this.state.longPressOrigin;
        if (!origin) return;
        const target = this.config.getCellAtPoint(origin.x, origin.y);
        if (target) {
          this.emit(createIntent<ShowContextMenuIntent>({
            type: 'ShowContextMenu',
            row: target.row,
            col: target.col,
            screenX: origin.x,
            screenY: origin.y,
          }));
        }
        // Cancel drag — user wanted context menu, not selection
        this.state.isDragging = false;
        this.state.isPointerDown = false;
        this.state.longPressOrigin = null;
      }, 500);
    }

    // Add global listeners for drag
    document.addEventListener('pointermove', this.handlePointerMove);
    document.addEventListener('pointerup', this.handlePointerUp);
    document.addEventListener('pointercancel', this.handlePointerUp);

    e.preventDefault();
    return true;
  }

  /**
   * Handle pointermove (during drag — mouse, touch, pen)
   */
  handlePointerMove(e: PointerEvent): void {
    // Cancel long-press if finger moved more than 10px
    if (this.state.longPressTimer && this.state.longPressOrigin) {
      const dx = e.clientX - this.state.longPressOrigin.x;
      const dy = e.clientY - this.state.longPressOrigin.y;
      if (dx * dx + dy * dy > 100) {
        clearTimeout(this.state.longPressTimer);
        this.state.longPressTimer = null;
        this.state.longPressOrigin = null;
      }
    }

    if (!this.state.isPointerDown) return;

    // Check drag threshold before entering drag mode
    if (!this.state.isDragging && this.state.dragStartPoint && !this.state.isFillDrag) {
      const dx = e.clientX - this.state.dragStartPoint.x;
      const dy = e.clientY - this.state.dragStartPoint.y;
      if (Math.sqrt(dx * dx + dy * dy) <= DRAG_THRESHOLD) {
        return; // Haven't exceeded threshold — still a potential click
      }

      // Threshold exceeded — transition to drag mode
      this.state.isDragging = true;

      if (this.state.dragStartCell) {
        this.emit(createIntent<BeginDragSelectionIntent>({
          type: 'BeginDragSelection',
          row: this.state.dragStartCell.row,
          col: this.state.dragStartCell.col,
          additive: this.state.isAdditive,
        }));
      }
    }

    if (!this.state.isDragging) return;

    const cell = this.config.getCellAtPoint(e.clientX, e.clientY);

    // Check for auto-scroll
    this.checkAutoScroll(e.clientX, e.clientY);

    if (cell) {
      // Skip if cursor is still over the same cell as last emit (avoids redundant intents)
      const last = this.state.lastDragCell;
      if (last && last.row === cell.row && last.col === cell.col) return;
      this.state.lastDragCell = cell;

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
   * Handle pointerup / pointercancel (end drag)
   */
  handlePointerUp(e: PointerEvent): void {
    // Always cancel any pending long-press timer
    if (this.state.longPressTimer) {
      clearTimeout(this.state.longPressTimer);
      this.state.longPressTimer = null;
      this.state.longPressOrigin = null;
    }

    if (!this.state.isPointerDown) return;

    if (this.state.isDragging) {
      // Drag was in progress — emit EndDragSelection / EndFillDrag
      const cell = e.type === 'pointercancel'
        ? (this.state.lastDragCell ?? this.state.dragStartCell)
        : (this.config.getCellAtPoint(e.clientX, e.clientY) ?? this.state.dragStartCell);

      if (cell) {
        if (this.state.isFillDrag) {
          this.emit(createIntent<EndFillDragIntent>({
            type: 'EndFillDrag',
            row: cell.row,
            col: cell.col,
          }));
        } else {
          this.emit(createIntent<EndDragSelectionIntent>({
            type: 'EndDragSelection',
            row: cell.row,
            col: cell.col,
          }));
        }
      }
    } else {
      // No drag (click) — emit BeginEdit for single-click editing
      // Only for plain clicks (no Shift/Ctrl modifiers, which are selection actions)
      if (e.type !== 'pointercancel' && !this.state.isExtending && !this.state.isAdditive && this.state.dragStartCell) {
        this.emit(createIntent<BeginEditIntent>({
          type: 'BeginEdit',
          row: this.state.dragStartCell.row,
          col: this.state.dragStartCell.col,
        }));
      }
    }

    // Stop auto-scroll
    this.stopAutoScroll();

    // Reset state
    this.state.isPointerDown = false;
    this.state.isDragging = false;
    this.state.dragStartCell = null;
    this.state.lastDragCell = null;
    this.state.isFillDrag = false;
    this.state.dragStartPoint = null;

    // Remove global listeners
    document.removeEventListener('pointermove', this.handlePointerMove);
    document.removeEventListener('pointerup', this.handlePointerUp);
    document.removeEventListener('pointercancel', this.handlePointerUp);
  }

  /**
   * Handle double-click (enter edit mode)
   */
  handleDoubleClick(e: MouseEvent): void {
    // Redundant with single-click editing.
    // Keeping listener bound just in case, but no-op to prevent triple-edit cycles.
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
   * Handle pointerdown on fill handle (supports mouse, touch, pen)
   */
  handleFillHandlePointerDown(e: PointerEvent, anchorCell: { row: number; col: number }): void {
    if (e.button !== 0) return;

    // Capture pointer for reliable move/up delivery (critical for touch)
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);

    this.state.isDragging = true;
    this.state.dragStartCell = anchorCell;
    this.state.lastDragCell = anchorCell;
    this.state.lastDragCell = anchorCell;
    this.state.isFillDrag = true;
    this.state.isPointerDown = true; // Fix: Ensure pointer is marked down
    this.state.isAdditive = false;
    this.state.isExtending = false;

    this.emit(createIntent<BeginFillDragIntent>({
      type: 'BeginFillDrag',
      row: anchorCell.row,
      col: anchorCell.col,
    }));

    // Add global listeners
    document.addEventListener('pointermove', this.handlePointerMove);
    document.addEventListener('pointerup', this.handlePointerUp);
    document.addEventListener('pointercancel', this.handlePointerUp);

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

  private emit(intent: PointerIntent): void {
    this.config.onIntent(intent);
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clean up event listeners and intervals
   */
  dispose(): void {
    if (this.state.longPressTimer) {
      clearTimeout(this.state.longPressTimer);
      this.state.longPressTimer = null;
      this.state.longPressOrigin = null;
    }
    this.stopAutoScroll();

    // Reset all pointer state
    this.state.isPointerDown = false;
    this.state.isDragging = false;
    this.state.dragStartPoint = null;
    this.state.dragStartCell = null;
    this.state.lastDragCell = null;
    this.state.isFillDrag = false;
    this.state.isAdditive = false;
    this.state.isExtending = false;

    document.removeEventListener('pointermove', this.handlePointerMove);
    document.removeEventListener('pointerup', this.handlePointerUp);
    document.removeEventListener('pointercancel', this.handlePointerUp);
  }
}

// =============================================================================
// React Hook for PointerAdapter
// =============================================================================

import { useRef, useEffect, useCallback } from 'react';

export interface UsePointerAdapterOptions {
  /** Callback when intent is emitted */
  onIntent: (intent: PointerIntent) => void;
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

  // Use refs for frequently-changing callbacks to prevent adapter re-creation.
  // Without this, every editState change recreates the adapter, which:
  // 1. Disposes the old adapter (losing drag state mid-operation)
  // 2. Creates a new adapter (losing global mousemove/mouseup listeners)
  const onIntentRef = useRef(options.onIntent);
  const getCellAtPointRef = useRef(options.getCellAtPoint);
  onIntentRef.current = options.onIntent;
  getCellAtPointRef.current = options.getCellAtPoint;

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

  // Initialize adapter once — callbacks forwarded via refs so adapter
  // survives editState changes without losing drag state or listeners
  useEffect(() => {
    adapterRef.current = new PointerAdapter({
      onIntent: (intent) => onIntentRef.current(intent),
      getCellAtPoint: (x, y) => getCellAtPointRef.current(x, y),
      getViewportBounds,
      autoScrollThreshold: options.autoScrollThreshold,
      autoScrollSpeed: options.autoScrollSpeed,
    });

    return () => {
      adapterRef.current?.dispose();
      adapterRef.current = null;
    };
  }, [getViewportBounds, options.autoScrollThreshold, options.autoScrollSpeed]);

  // Expose handler functions
  const handleCellMouseDown = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    const handled = adapterRef.current?.handlePointerDown(e.nativeEvent as PointerEvent);
    // handlePointerDown calls e.preventDefault() to suppress text selection during
    // drag, but that also prevents the browser's default focus-on-click. Re-focus
    // the container so keyboard events (type-to-edit, arrow navigation) work.
    // Only focus when a cell was actually clicked (not on FormulaBar / empty area).
    if (handled) {
      (e.currentTarget as HTMLElement)?.focus();
    }
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
    (e: React.PointerEvent | React.MouseEvent, anchorCell: { row: number; col: number }) => {
      adapterRef.current?.handleFillHandlePointerDown(e.nativeEvent as PointerEvent, anchorCell);
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
