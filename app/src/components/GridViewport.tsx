/**
 * GridViewport - Production-grade virtualized spreadsheet grid
 *
 * Features:
 * - ResizeObserver for container size tracking
 * - Zoom support (0.5x - 2x) affecting visual size, not logical coordinates
 * - VirtualRenderer integration with proper viewport updates
 * - Intent-based interaction model (UI emits intents, never mutates state)
 * - Auto-scroll during drag operations
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                         EVENT FLOW                                      │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                         │
 * │   Mouse/Keyboard Event                                                  │
 * │       │                                                                 │
 * │       ▼                                                                 │
 * │   ┌───────────────┐                                                     │
 * │   │PointerAdapter │  ← Translates to SpreadsheetIntent                 │
 * │   └───────┬───────┘                                                     │
 * │           │                                                             │
 * │           ▼                                                             │
 * │   ┌───────────────┐                                                     │
 * │   │IntentHandler  │  ← Produces SelectionState updates                 │
 * │   └───────┬───────┘                                                     │
 * │           │                                                             │
 * │           ▼                                                             │
 * │   ┌───────────────┐                                                     │
 * │   │ setState()    │  ← React state update                              │
 * │   └───────┬───────┘                                                     │
 * │           │                                                             │
 * │           ▼                                                             │
 * │   ┌───────────────┐                                                     │
 * │   │ Re-render     │  ← UI reflects new state                           │
 * │   └───────────────┘                                                     │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  VirtualRenderer,
  type DimensionProvider,
  type RenderFrame as EngineRenderFrame,
} from '../../../engine/core/rendering/VirtualRenderer';
import type {
  Cell as EngineCell,
  RenderCell as EngineRenderCell,
} from '../../../engine/core/types/index';
import {
  GridProvider,
  CornerCell,
  ColumnHeaders,
  RowHeaders,
  CellLayer,
  SelectionOverlay,
  type GridConfig,
  type ViewportDimensions,
  type ScrollState,
  type SelectionState,
  type RenderFrame,
  type RenderCell,
  DEFAULT_GRID_CONFIG,
} from './grid';
import { usePointerAdapter } from './grid/PointerAdapter';
import {
  useIntentHandler,
  type IntentResult,
  type SpreadsheetIntent,
} from './grid/IntentHandler';
import {
  useKeyboardAdapter,
  type KeyboardIntent,
} from './grid/KeyboardAdapter';
import { useAutoScroll } from './grid/AutoScrollController';
import {
  useEditMode,
  useEditModeIntegration,
  CellEditorOverlay,
  FormulaBar,
  formatCellAddress,
  FormulaReferenceHighlight,
} from './grid/editing';

// =============================================================================
// Types
// =============================================================================

export interface GridViewportProps {
  /** Optional class name */
  className?: string;
  /** Dimension provider for the engine (optional - uses mock if not provided) */
  dimensionProvider?: DimensionProvider;
  /** Number of frozen rows */
  frozenRows?: number;
  /** Number of frozen columns */
  frozenCols?: number;
  /** Initial zoom level (default: 1.0) */
  initialZoom?: number;
  /** Callback when selection changes */
  onSelectionChange?: (selection: SelectionState) => void;
  /** Callback when active cell changes */
  onActiveCellChange?: (row: number, col: number) => void;
  /** Callback when zoom changes */
  onZoomChange?: (zoom: number) => void;
  /** Callback when viewport resizes */
  onViewportResize?: (dimensions: ViewportDimensions) => void;
  /** Callback when edit mode should begin (legacy - use onCommit instead) */
  onBeginEdit?: (row: number, col: number) => void;
  /** Callback when cell value is committed */
  onCommit?: (row: number, col: number, value: string) => void;
  /** Callback for fill operation */
  onFill?: (from: { startRow: number; startCol: number; endRow: number; endCol: number }, to: { startRow: number; startCol: number; endRow: number; endCol: number }) => void;
  /** Get cell value at position (for edit mode) */
  getCellValue?: (row: number, col: number) => string;
  /** Whether to show formula bar */
  showFormulaBar?: boolean;
}

export interface GridViewportHandle {
  getZoom: () => number;
  setZoom: (zoom: number) => void;
  zoomIn: (step?: number) => void;
  zoomOut: (step?: number) => void;
  resetZoom: () => void;
  scrollToCell: (row: number, col: number) => void;
  getViewportDimensions: () => ViewportDimensions;
  getSelection: () => SelectionState;
  setSelection: (selection: SelectionState) => void;
  refresh: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

// =============================================================================
// Utilities
// =============================================================================

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

function roundZoom(zoom: number): number {
  return Math.round(zoom * 100) / 100;
}

function adaptRenderCell(engineCell: EngineRenderCell): RenderCell {
  const cell = engineCell.cell as EngineCell | null;
  return {
    row: engineCell.row,
    col: engineCell.col,
    x: engineCell.x,
    y: engineCell.y,
    width: engineCell.width,
    height: engineCell.height,
    displayValue: cell?.displayValue ?? (cell?.value != null ? String(cell.value) : ''),
    valueType: !cell || cell.value == null ? 'empty' : cell.type === 'error' ? 'error' : typeof cell.value === 'number' ? 'number' : typeof cell.value === 'boolean' ? 'boolean' : 'string',
    isFormula: cell?.formula !== undefined,
    errorCode: cell?.type === 'error' ? String(cell.value) : undefined,
    format: {
      fontFamily: cell?.format?.fontFamily,
      fontSize: cell?.format?.fontSize,
      fontColor: cell?.format?.fontColor,
      bold: cell?.format?.bold,
      italic: cell?.format?.italic,
      underline: cell?.format?.underline ? true : undefined,
      strikethrough: cell?.format?.strikethrough,
      horizontalAlign: cell?.format?.horizontalAlign,
      verticalAlign: cell?.format?.verticalAlign,
      backgroundColor: cell?.format?.backgroundColor,
      numberFormat: cell?.format?.numberFormat,
    },
    merge: cell?.merge
      ? { isAnchor: true, isHidden: false, rowSpan: cell.merge.rowSpan, colSpan: cell.merge.colSpan }
      : cell?.mergeParent
        ? { isAnchor: false, isHidden: true, anchorRow: cell.mergeParent.row, anchorCol: cell.mergeParent.col }
        : undefined,
    frozenRow: false,
    frozenCol: false,
  };
}

function adaptRenderFrame(engineFrame: EngineRenderFrame, zoom: number): RenderFrame {
  return {
    cells: engineFrame.cells.map(adaptRenderCell),
    rows: engineFrame.rows,
    columns: engineFrame.columns,
    scroll: engineFrame.scroll,
    contentBounds: engineFrame.contentBounds,
    visibleRange: {
      startRow: engineFrame.visibleBounds.startRow,
      endRow: engineFrame.visibleBounds.endRow,
      startCol: engineFrame.visibleBounds.startCol,
      endCol: engineFrame.visibleBounds.endCol,
    },
    freezeLines: engineFrame.freezeLines,
    timestamp: Date.now(),
    zoom,
  };
}

function createMockDimensionProvider(): DimensionProvider {
  return {
    getRowHeight: () => 24,
    getColumnWidth: () => 100,
    isRowHidden: () => false,
    isColumnHidden: () => false,
    getCell: () => null,
    getUsedRange: () => ({ startRow: 0, startCol: 0, endRow: 1000, endCol: 100 }),
  };
}

// =============================================================================
// GridViewport Component
// =============================================================================

export const GridViewport = forwardRef<GridViewportHandle, GridViewportProps>(
  (
    {
      className = '',
      dimensionProvider,
      frozenRows = 0,
      frozenCols = 0,
      initialZoom = 1.0,
      onSelectionChange,
      onActiveCellChange,
      onZoomChange,
      onViewportResize,
      onBeginEdit,
      onCommit,
      onFill,
      getCellValue: getCellValueProp,
      showFormulaBar = true,
    },
    ref
  ) => {
    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<VirtualRenderer | null>(null);
    const selectionRef = useRef<SelectionState>(null!); // Ref for avoiding stale closures

    // State
    const [zoom, setZoomState] = useState(() => clampZoom(initialZoom));
    const [viewport, setViewport] = useState<ViewportDimensions>({ width: 0, height: 0 });
    const [scroll, setScroll] = useState<ScrollState>({ scrollLeft: 0, scrollTop: 0 });
    const [selection, setSelection] = useState<SelectionState>({
      activeCell: { row: 0, col: 0 },
      ranges: [],
    });
    const [frame, setFrame] = useState<RenderFrame | null>(null);
    const [renderKey, setRenderKey] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    // Keep selectionRef in sync to avoid stale closures in callbacks
    selectionRef.current = selection;

    // Track previous active cell for scroll-to-cell on change
    const prevActiveCellRef = useRef<{ row: number; col: number } | null>(null);

    // Intent handler
    const { handleIntent } = useIntentHandler();

    // Config with zoom-adjusted sizes
    const config = useMemo<GridConfig>(() => ({
      ...DEFAULT_GRID_CONFIG,
      frozenRows,
      frozenCols,
      zoom,
      rowHeaderWidth: Math.round(DEFAULT_GRID_CONFIG.rowHeaderWidth * zoom),
      colHeaderHeight: Math.round(DEFAULT_GRID_CONFIG.colHeaderHeight * zoom),
    }), [frozenRows, frozenCols, zoom]);

    // Dimension provider
    const dimensions = useMemo(
      () => dimensionProvider ?? createMockDimensionProvider(),
      [dimensionProvider]
    );

    // =========================================================================
    // Edit Mode Integration
    // =========================================================================

    // Default getCellValue from dimension provider
    const getCellValue = useCallback((row: number, col: number): string => {
      if (getCellValueProp) return getCellValueProp(row, col);
      const cell = dimensions.getCell?.(row, col);
      if (!cell) return '';
      if (cell.formula) return cell.formula;
      if (cell.value == null) return '';
      return String(cell.value);
    }, [getCellValueProp, dimensions]);

    // Edit mode hook
    const { state: editState, actions: editActions } = useEditMode({
      onCommit: (cell, value) => {
        onCommit?.(cell.row, cell.col, value);
      },
      onEditStart: (cell) => {
        onBeginEdit?.(cell.row, cell.col);
      },
    });

    // Derive isEditing from edit state for backwards compatibility
    const isEditing = editState.isEditing;

    // Edit mode integration for intent routing
    const { processIntent: processEditIntent, handleCellClick: handleEditCellClick, isPointModeActive } =
      useEditModeIntegration({
        editState,
        editActions,
        handleIntent,
        selection,
        getCellValue,
        formatCellReference: formatCellAddress,
      });

    // VirtualRenderer - create/update renderer when config changes
    useEffect(() => {
      const renderer = new VirtualRenderer(dimensions, {
        width: viewport.width || 1200,
        height: viewport.height || 800,
        frozenRows: config.frozenRows,
        frozenCols: config.frozenCols,
        overscanRows: config.overscanRows,
        overscanCols: config.overscanCols,
        headerWidth: config.rowHeaderWidth,
        headerHeight: config.colHeaderHeight,
        zoom,
      });
      rendererRef.current = renderer;

      return () => {
        rendererRef.current = null;
      };
    }, [dimensions, config, viewport, zoom, renderKey]);

    // Update frame when renderer, scroll, or zoom changes
    // Using a separate effect ensures frame is updated after renderer is ready
    useEffect(() => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      renderer.setScroll(scroll.scrollLeft, scroll.scrollTop);
      const engineFrame = renderer.getRenderFrame();
      setFrame(adaptRenderFrame(engineFrame, zoom));
    }, [scroll, zoom, viewport, renderKey]); // viewport and renderKey trigger re-render after new renderer

    // Auto-scroll controller (replaces interval-based auto-scroll)
    const autoScroll = useAutoScroll({
      containerRef: containerRef as React.RefObject<HTMLElement>,
      scrollContainerRef: scrollContainerRef as React.RefObject<HTMLElement>,
      onScroll: (newScroll) => {
        setScroll(newScroll);
        // During auto-scroll, continue drag selection with the cell under cursor
        // This is handled by PointerAdapter's mousemove event
      },
      getMaxScroll: () => {
        const renderer = rendererRef.current;
        if (!renderer) return { x: 10000, y: 100000 };
        return renderer.getMaxScroll();
      },
      config: {
        threshold: 50,
        minSpeed: 4,
        maxSpeed: 24,
        accelerationCurve: 1.5,
      },
    });

    // Scroll to active cell when it changes (ensures cell is visible after navigation)
    useEffect(() => {
      const activeCell = selection.activeCell;
      const prevCell = prevActiveCellRef.current;

      // Update ref
      prevActiveCellRef.current = activeCell;

      // Don't scroll if no active cell or cell hasn't changed
      if (!activeCell) return;
      if (prevCell && prevCell.row === activeCell.row && prevCell.col === activeCell.col) return;

      // Don't scroll during drag (auto-scroll handles this)
      if (isDragging) return;

      // Scroll to bring active cell into view
      const renderer = rendererRef.current;
      const scrollContainer = scrollContainerRef.current;
      if (!renderer || !scrollContainer) return;

      const newScroll = renderer.scrollToCell(activeCell.row, activeCell.col);

      // Read current scroll from DOM to avoid stale state and prevent re-render loops
      const currentScrollLeft = scrollContainer.scrollLeft;
      const currentScrollTop = scrollContainer.scrollTop;

      // Only update if scroll actually changed
      if (newScroll.x !== currentScrollLeft || newScroll.y !== currentScrollTop) {
        scrollContainer.scrollLeft = newScroll.x;
        scrollContainer.scrollTop = newScroll.y;
        setScroll({ scrollLeft: newScroll.x, scrollTop: newScroll.y });
      }
    }, [selection.activeCell, isDragging]); // Removed scroll dependencies to prevent re-render loops

    // ResizeObserver
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let rafId: number | null = null;

      const resizeObserver = new ResizeObserver((entries) => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect;
            setViewport((prev) => {
              if (prev.width !== width || prev.height !== height) {
                onViewportResize?.({ width, height });
                return { width, height };
              }
              return prev;
            });
          }
        });
      });

      resizeObserver.observe(container);
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewport({ width: rect.width, height: rect.height });
      }

      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        resizeObserver.disconnect();
      };
    }, [onViewportResize]);

    // =========================================================================
    // Intent Processing
    // =========================================================================

    const processIntentResult = useCallback((result: IntentResult) => {
      if (result.selection) {
        setSelection(result.selection);
        onSelectionChange?.(result.selection);

        if (result.selection.activeCell) {
          onActiveCellChange?.(result.selection.activeCell.row, result.selection.activeCell.col);
        }
      }

      if (result.scrollTo) {
        const renderer = rendererRef.current;
        if (renderer) {
          const newScroll = renderer.scrollToCell(result.scrollTo.row, result.scrollTo.col);
          setScroll({ scrollLeft: newScroll.x, scrollTop: newScroll.y });
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = newScroll.x;
            scrollContainerRef.current.scrollTop = newScroll.y;
          }
        }
      }

      // Note: Auto-scroll is now handled by AutoScrollController
      // The PointerAdapter detects edge proximity during drag and calls autoScroll.update()
      // This is more efficient than the old interval-based approach

      if (result.stopAutoScroll) {
        autoScroll.stop();
      }

      // Note: beginEdit, confirmEdit, cancelEdit are now handled by EditModeManager
      // through the useEditMode hook. The hook's onCommit callback handles value commits.

      if (result.fillRange) {
        onFill?.(result.fillRange.from, result.fillRange.to);
      }

      // Note: deleteContents and clipboard are passed to parent via callbacks
      // These would be handled by onDelete and onClipboard callbacks if added
    }, [onSelectionChange, onActiveCellChange, onFill, autoScroll]);

    const onIntent = useCallback((intent: SpreadsheetIntent) => {
      // Track drag state for UI feedback (e.g., hide fill handle during drag)
      if (intent.type === 'BeginDragSelection' || intent.type === 'BeginFillDrag') {
        setIsDragging(true);
      } else if (intent.type === 'EndDragSelection' || intent.type === 'EndFillDrag') {
        setIsDragging(false);
        autoScroll.stop();
      }

      // Check if edit mode wants to handle this intent (e.g., Point mode cell click)
      if (intent.type === 'SetActiveCell' && editState.isEditing && editState.mode === 'point') {
        const editResult = handleEditCellClick(intent.row, intent.col, false);
        if (editResult) {
          processIntentResult(editResult);
          return;
        }
      }

      // Route through edit mode integration (handles edit triggers and mode-specific behavior)
      const result = processEditIntent(intent);
      processIntentResult(result);
    }, [processEditIntent, handleEditCellClick, processIntentResult, autoScroll, editState.isEditing, editState.mode]);

    // Global mousemove listener for auto-scroll during drag
    useEffect(() => {
      if (!isDragging) return;

      const handleMouseMove = (e: MouseEvent) => {
        autoScroll.update(e.clientX, e.clientY);
      };

      const handleMouseUp = () => {
        autoScroll.stop();
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        autoScroll.stop();
      };
    }, [isDragging, autoScroll]);

    // =========================================================================
    // Cell coordinate lookup
    // =========================================================================

    const getCellAtPoint = useCallback((x: number, y: number): { row: number; col: number } | null => {
      const renderer = rendererRef.current;
      if (!renderer) return null;

      const container = containerRef.current;
      if (!container) return null;

      const rect = container.getBoundingClientRect();
      const localX = x - rect.left;
      const localY = y - rect.top;

      return renderer.getCellAtPoint(localX, localY);
    }, []);

    // =========================================================================
    // Pointer Adapter
    // =========================================================================

    const pointerAdapter = usePointerAdapter({
      onIntent,
      getCellAtPoint,
      containerRef: containerRef as React.RefObject<HTMLElement>,
      autoScrollThreshold: 40,
      autoScrollSpeed: 10,
    });

    // =========================================================================
    // Keyboard Adapter
    // =========================================================================

    const onKeyboardIntent = useCallback((intent: KeyboardIntent) => {
      // Route through edit mode integration (handles edit triggers and mode-specific behavior)
      const result = processEditIntent(intent);
      processIntentResult(result);
    }, [processEditIntent, processIntentResult]);

    // Keyboard adapter handles keydown events on the container
    // The hook attaches listeners internally, we just need the edit mode sync
    const { setEditMode: _setKeyboardEditMode } = useKeyboardAdapter({
      onIntent: onKeyboardIntent,
      containerRef: containerRef as React.RefObject<HTMLElement>,
      isEditing,
      enabled: true,
    });

    // =========================================================================
    // Zoom Controls
    // =========================================================================

    const setZoom = useCallback((newZoom: number) => {
      const clamped = roundZoom(clampZoom(newZoom));
      setZoomState((prev) => {
        if (prev !== clamped) {
          onZoomChange?.(clamped);
          return clamped;
        }
        return prev;
      });
    }, [onZoomChange]);

    const getZoom = useCallback(() => zoom, [zoom]);

    // Use functional updates to avoid recreating callbacks on every zoom change
    const zoomIn = useCallback((step = ZOOM_STEP) => {
      setZoomState((prev) => {
        const clamped = roundZoom(clampZoom(prev + step));
        if (clamped !== prev) {
          onZoomChange?.(clamped);
          return clamped;
        }
        return prev;
      });
    }, [onZoomChange]);

    const zoomOut = useCallback((step = ZOOM_STEP) => {
      setZoomState((prev) => {
        const clamped = roundZoom(clampZoom(prev - step));
        if (clamped !== prev) {
          onZoomChange?.(clamped);
          return clamped;
        }
        return prev;
      });
    }, [onZoomChange]);

    const resetZoom = useCallback(() => setZoom(1.0), [setZoom]);

    const scrollToCell = useCallback((row: number, col: number) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const newScroll = renderer.scrollToCell(row, col);
      setScroll({ scrollLeft: newScroll.x, scrollTop: newScroll.y });
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = newScroll.x;
        scrollContainerRef.current.scrollTop = newScroll.y;
      }
    }, []);

    // =========================================================================
    // Imperative Handle
    // =========================================================================

    useImperativeHandle(ref, () => ({
      getZoom,
      setZoom,
      zoomIn,
      zoomOut,
      resetZoom,
      scrollToCell,
      getViewportDimensions: () => viewport,
      getSelection: () => selection,
      setSelection: (newSelection: SelectionState) => {
        setSelection(newSelection);
        onSelectionChange?.(newSelection);
      },
      refresh: () => setRenderKey((k) => k + 1),
    }), [getZoom, setZoom, zoomIn, zoomOut, resetZoom, scrollToCell, viewport, selection, onSelectionChange]);

    // =========================================================================
    // Event Handlers (delegating to PointerAdapter)
    // =========================================================================

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      setScroll({ scrollLeft: target.scrollLeft, scrollTop: target.scrollTop });
    }, []);

    // Selection helpers for context
    const isCellSelected = useCallback((row: number, col: number): boolean => {
      if (selection.activeCell?.row === row && selection.activeCell?.col === col) return true;
      for (const range of selection.ranges) {
        const minRow = Math.min(range.startRow, range.endRow);
        const maxRow = Math.max(range.startRow, range.endRow);
        const minCol = Math.min(range.startCol, range.endCol);
        const maxCol = Math.max(range.startCol, range.endCol);
        if (row >= minRow && row <= maxRow && col >= minCol && col <= maxCol) return true;
      }
      return false;
    }, [selection]);

    const isCellActive = useCallback((row: number, col: number): boolean => {
      return selection.activeCell?.row === row && selection.activeCell?.col === col;
    }, [selection]);

    const isRowSelected = useCallback((row: number): boolean => {
      if (selection.activeCell?.row === row) return true;
      for (const range of selection.ranges) {
        const minRow = Math.min(range.startRow, range.endRow);
        const maxRow = Math.max(range.startRow, range.endRow);
        if (row >= minRow && row <= maxRow) return true;
      }
      return false;
    }, [selection]);

    const isColSelected = useCallback((col: number): boolean => {
      if (selection.activeCell?.col === col) return true;
      for (const range of selection.ranges) {
        const minCol = Math.min(range.startCol, range.endCol);
        const maxCol = Math.max(range.startCol, range.endCol);
        if (col >= minCol && col <= maxCol) return true;
      }
      return false;
    }, [selection]);

    // Keyboard zoom
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey || e.metaKey) {
          if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn(); }
          else if (e.key === '-') { e.preventDefault(); zoomOut(); }
          else if (e.key === '0') { e.preventDefault(); resetZoom(); }
        }
      };
      const container = containerRef.current;
      if (container) {
        container.addEventListener('keydown', handleKeyDown);
        return () => container.removeEventListener('keydown', handleKeyDown);
      }
    }, [zoomIn, zoomOut, resetZoom]);

    // Content bounds
    const contentBounds = frame?.contentBounds ?? { width: 10000, height: 100000 };

    // =========================================================================
    // Cell Editor Position
    // =========================================================================

    /**
     * Calculate the position and size of a cell for the editor overlay
     */
    const getCellPosition = useCallback((row: number, col: number): { x: number; y: number; width: number; height: number } => {
      const renderer = rendererRef.current;
      if (!renderer) {
        // Fallback dimensions
        return {
          x: col * 100,
          y: row * 24,
          width: 100,
          height: 24,
        };
      }

      // Get cell position using renderer's methods
      const x = renderer.getColLeft(col);
      const y = renderer.getRowTop(row);
      const width = dimensions.getColumnWidth(col);
      const height = dimensions.getRowHeight(row);

      return { x, y, width, height };
    }, [dimensions]);

    // Get active cell info for formula bar
    const activeCell = selection.activeCell;
    const activeCellAddress = activeCell ? formatCellAddress(activeCell.row, activeCell.col) : 'A1';
    const activeCellValue = activeCell ? getCellValue(activeCell.row, activeCell.col) : '';

    // Calculate editor position when editing
    const editorPosition = useMemo(() => {
      if (!editState.isEditing || !editState.editingCell) return null;
      return getCellPosition(editState.editingCell.row, editState.editingCell.col);
    }, [editState.isEditing, editState.editingCell, getCellPosition]);

    // Navigation handlers for editor components
    const handleEditorNavigation = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
      const cell = activeCell;
      if (!cell) return;

      let newRow = cell.row;
      let newCol = cell.col;

      switch (direction) {
        case 'up': newRow = Math.max(0, cell.row - 1); break;
        case 'down': newRow = cell.row + 1; break;
        case 'left': newCol = Math.max(0, cell.col - 1); break;
        case 'right': newCol = cell.col + 1; break;
      }

      setSelection({ activeCell: { row: newRow, col: newCol }, ranges: [] });
      onSelectionChange?.({ activeCell: { row: newRow, col: newCol }, ranges: [] });
      onActiveCellChange?.(newRow, newCol);
    }, [activeCell, onSelectionChange, onActiveCellChange]);

    const handleEnterNavigation = useCallback((shiftKey: boolean) => {
      handleEditorNavigation(shiftKey ? 'up' : 'down');
    }, [handleEditorNavigation]);

    const handleTabNavigation = useCallback((shiftKey: boolean) => {
      handleEditorNavigation(shiftKey ? 'left' : 'right');
    }, [handleEditorNavigation]);

    // Handler wrappers to match context type signatures
    // Container's onMouseDown handles selection via getCellAtPoint, so cell-level click
    // handlers exist for double-click (edit mode) only
    const handleCellDoubleClick = useCallback(
      (row: number, col: number, _e: React.MouseEvent) => {
        onIntent({
          type: 'BeginEdit',
          row,
          col,
          timestamp: Date.now(),
        });
      },
      [onIntent]
    );

    const handleCornerClick = useCallback(() => {
      onIntent({
        type: 'SelectAll',
        timestamp: Date.now(),
      });
    }, [onIntent]);

    // Context value
    const contextValue = useMemo(() => ({
      config,
      viewport,
      scroll,
      frame,
      selection,
      // Don't pass onCellClick - container's onMouseDown handles selection
      onCellClick: undefined,
      onCellDoubleClick: handleCellDoubleClick,
      onRowHeaderClick: pointerAdapter.handleRowHeaderClick,
      onColHeaderClick: pointerAdapter.handleColHeaderClick,
      onSelectAll: handleCornerClick,
      isCellSelected,
      isCellActive,
      isRowSelected,
      isColSelected,
    }), [config, viewport, scroll, frame, selection, handleCellDoubleClick, pointerAdapter.handleRowHeaderClick, pointerAdapter.handleColHeaderClick, handleCornerClick, isCellSelected, isCellActive, isRowSelected, isColSelected]);

    // Calculate formula bar height for positioning
    const formulaBarHeight = showFormulaBar ? 28 : 0;

    return (
      <div
        ref={containerRef}
        className={`grid-viewport relative w-full h-full overflow-hidden bg-white ${className}`}
        tabIndex={0}
        data-zoom={zoom}
        onMouseDown={pointerAdapter.handleCellMouseDown}
      >
        {/* Formula Bar */}
        {showFormulaBar && (
          <FormulaBar
            state={editState}
            actions={editActions}
            activeCellAddress={activeCellAddress}
            activeCellValue={activeCellValue}
            activeCell={activeCell}
            onEnter={handleEnterNavigation}
            onTab={handleTabNavigation}
            onCancel={() => {
              // Focus back to grid after cancel
              containerRef.current?.focus();
            }}
          />
        )}

        <GridProvider value={contextValue}>
          <div
            style={{
              position: 'absolute',
              top: formulaBarHeight,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
            <CornerCell />
            <ColumnHeaders />
            <RowHeaders />

            <div
              ref={scrollContainerRef}
              className="absolute overflow-auto scrollbar-thin"
              style={{
                top: config.colHeaderHeight,
                left: config.rowHeaderWidth,
                right: 0,
                bottom: 0,
              }}
              onScroll={handleScroll}
            >
              <div
                className="relative"
                style={{
                  width: contentBounds.width,
                  height: contentBounds.height,
                  minWidth: '100%',
                  minHeight: '100%',
                }}
              >
                <CellLayer />

                {/* Formula Reference Highlighting (Point Mode) */}
                {editState.isEditing && editState.isFormula && (
                  <FormulaReferenceHighlight
                    formula={editState.value}
                    getCellPosition={getCellPosition}
                    scroll={scroll}
                    pointMode={{
                      isActive: editState.mode === 'point',
                      pointCell: isPointModeActive ? selection.activeCell : null,
                      pointRangeEnd: null,
                    }}
                    zIndex={40}
                  />
                )}

                <SelectionOverlay
                  onFillHandleMouseDown={pointerAdapter.handleFillHandleMouseDown}
                  isDragging={isDragging}
                />

                {/* Cell Editor Overlay */}
                {editState.isEditing && editorPosition && (
                  <CellEditorOverlay
                    state={editState}
                    actions={editActions}
                    cellPosition={editorPosition}
                    onEnter={handleEnterNavigation}
                    onTab={handleTabNavigation}
                    onArrowNav={handleEditorNavigation}
                    onClose={() => {
                      // Focus back to grid after edit
                      containerRef.current?.focus();
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {zoom !== 1.0 && (
            <div
              className="absolute bottom-2 right-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-75 pointer-events-none"
              style={{ zIndex: 100 }}
            >
              {Math.round(zoom * 100)}%
            </div>
          )}
        </GridProvider>
      </div>
    );
  }
);

GridViewport.displayName = 'GridViewport';
export default GridViewport;
