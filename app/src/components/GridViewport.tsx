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
  memo,
} from 'react';
import {
  VirtualRenderer,
  type DimensionProvider,
  type MergeProvider,
  type RenderFrame as EngineRenderFrame,
} from '../../../engine/core/rendering/VirtualRenderer';
import type {
  Cell as EngineCell,
  RenderCell as EngineRenderCell,
  CellFormat,
} from '../../../engine/core/types/index';
import { isFormattedText } from '../../../engine/core/types/index';
import {
  GridProvider,
  CornerCell,
  ColumnHeaders,
  RowHeaders,
  CellLayer,
  SelectionOverlay,
  FillHandleOverlay,
  FormatPainterOverlay,
  type GridConfig,
  type ViewportDimensions,
  type ScrollState,
  type SelectionState,
  type SelectionRange,
  type RenderFrame,
  type RenderCell,
  type ConditionalFormatResult,
  type FormatPainterUIState,
  type ContextMenuTarget,
  DEFAULT_GRID_CONFIG,
  isCellInRange,
} from './grid';
import { ContextMenu } from './grid/ContextMenu';
import { usePointerAdapter, type ShowContextMenuIntent } from './grid/PointerAdapter';
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
  FormulaReferenceHighlight,
} from './grid/editing';
import { formatCellAddress } from './grid/types';
import { useA11y } from './A11yProvider';
import { useTheme } from './ThemeProvider';
import { useAnimationGuard } from '../hooks/useAnimationGuard';
import { useVirtualKeyboard } from '../hooks/useVirtualKeyboard';

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
  /** Optional merge provider for merge-aware rendering */
  mergeProvider?: MergeProvider;
  /** Provider for pre-computed conditional format results (evaluated by caller) */
  conditionalFormatProvider?: (row: number, col: number) => ConditionalFormatResult | null;
  /** Format painter state (from engine, driven by parent) */
  formatPainterState?: FormatPainterUIState;
  /** Callback when format painter should apply at target cell */
  onFormatPainterApply?: (row: number, col: number) => void;
  /** Callback when context menu requests row insertion */
  onInsertRows?: (row: number, count: number) => void;
  /** Callback when context menu requests row deletion */
  onDeleteRows?: (startRow: number, endRow: number) => void;
  /** Callback when context menu requests column insertion */
  onInsertColumns?: (col: number, count: number) => void;
  /** Callback when context menu requests column deletion */
  onDeleteColumns?: (startCol: number, endCol: number) => void;
  /** Callback when context menu requests cell merge */
  onMergeCells?: () => void;
  /** Callback when context menu requests cell unmerge */
  onUnmergeCells?: () => void;
  /** Callback when context menu requests format dialog */
  onShowFormatDialog?: () => void;
  /** Callback when context menu requests content deletion */
  onDeleteContents?: () => void;
  /** Callback when context menu requests clipboard action */
  onClipboard?: (action: 'copy' | 'cut' | 'paste') => void;
  /** Callback when undo/redo is requested (keyboard shortcut) */
  onUndoRedo?: (action: 'undo' | 'redo') => void;
  /** Callback when format should be applied (keyboard shortcut) */
  onApplyFormat?: (format: Partial<CellFormat>) => void;
  /** Callback when Find/Replace dialog should open */
  onOpenFindReplace?: (mode: 'find' | 'replace') => void;
  /** Callback when Sort dialog should open */
  onOpenSortDialog?: () => void;
  /** Callback when Filter dropdown should open for a column */
  onOpenFilterDropdown?: (column: number, anchorRect: { x: number; y: number; width: number; height: number }) => void;
  /** Callback when Data Validation dialog should open */
  onOpenDataValidation?: () => void;
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
  /** Return keyboard focus to the grid container */
  focus: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;
const FORMULA_BAR_HEIGHT = 28; // Matches --formula-bar-height CSS variable

// =============================================================================
// Utilities
// =============================================================================

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

function roundZoom(zoom: number): number {
  return Math.round(zoom * 100) / 100;
}

type CFProvider = (row: number, col: number) => ConditionalFormatResult | null;

function adaptRenderCell(
  engineCell: EngineRenderCell,
  cfProvider?: CFProvider,
  frozenRows?: number,
  frozenCols?: number,
): RenderCell {
  const cell = engineCell.cell as EngineCell | null;

  // Compute valueType early — needed for auto-alignment below
  const valueType: RenderCell['valueType'] =
    !cell || cell.value == null ? 'empty'
    : cell.type === 'error' ? 'error'
    : typeof cell.value === 'number' ? 'number'
    : typeof cell.value === 'boolean' ? 'boolean'
    : 'string';

  // Excel-style auto-alignment: when engine hasn't set explicit alignment,
  // numbers right-align, booleans center, text/empty left-align.
  const explicitAlign = cell?.format?.horizontalAlign;
  const horizontalAlign = explicitAlign ?? (
    valueType === 'number' ? 'right' as const
    : valueType === 'boolean' ? 'center' as const
    : undefined
  );

  // Base format from engine Cell
  const baseFormat = {
    fontFamily: cell?.format?.fontFamily,
    fontSize: cell?.format?.fontSize,
    fontColor: cell?.format?.fontColor,
    bold: cell?.format?.bold,
    italic: cell?.format?.italic,
    underline: cell?.format?.underline ? true : undefined,
    strikethrough: cell?.format?.strikethrough,
    horizontalAlign,
    verticalAlign: cell?.format?.verticalAlign,
    backgroundColor: cell?.format?.backgroundColor,
    numberFormat: cell?.format?.numberFormat,
  };

  // Query conditional format provider
  const cf = cfProvider?.(engineCell.row, engineCell.col) ?? undefined;

  // Pre-merge conditional format overrides + colorScale into format so
  // CellLayer renders formatToStyles(cell.format) once — no override logic.
  let format = baseFormat;
  if (cf && (cf.formatOverrides || cf.colorScale)) {
    format = {
      ...baseFormat,
      ...cf.formatOverrides,
      ...(cf.colorScale ? { backgroundColor: cf.colorScale } : {}),
    };
  }

  // Extract FormattedText for character-level rendering
  const richText = cell && isFormattedText(cell.value)
    ? {
        _type: 'FormattedText' as const,
        text: cell.value.text,
        runs: cell.value.runs.map(run => ({
          start: run.start,
          end: run.end,
          format: run.format ? { ...run.format } : undefined,
        })),
      }
    : undefined;

  return {
    row: engineCell.row,
    col: engineCell.col,
    x: engineCell.x,
    y: engineCell.y,
    width: engineCell.width,
    height: engineCell.height,
    displayValue: cell?.displayValue ?? (cell && isFormattedText(cell.value) ? cell.value.text : (cell?.value != null ? String(cell.value) : '')),
    richText, // NEW: Pass FormattedText for multi-span rendering
    valueType,
    isFormula: cell?.formula !== undefined,
    errorCode: cell?.type === 'error' ? String(cell.value) : undefined,
    format,
    // Only carry dataBar/icon on conditionalFormat (visual child elements).
    // Format overrides and colorScale are already absorbed into format above.
    conditionalFormat: cf && (cf.dataBar || cf.icon)
      ? { dataBar: cf.dataBar, icon: cf.icon }
      : undefined,
    merge: cell?.merge
      ? { isAnchor: true, isHidden: false, rowSpan: cell.merge.rowSpan, colSpan: cell.merge.colSpan }
      : cell?.mergeParent
        ? { isAnchor: false, isHidden: true, anchorRow: cell.mergeParent.row, anchorCol: cell.mergeParent.col }
        : undefined,
    frozenRow: engineCell.row < (frozenRows ?? 0),
    frozenCol: engineCell.col < (frozenCols ?? 0),
  };
}

function adaptRenderFrame(
  engineFrame: EngineRenderFrame,
  zoom: number,
  cfProvider?: CFProvider,
  frozenRows?: number,
  frozenCols?: number,
): RenderFrame {
  return {
    cells: engineFrame.cells.map(c => adaptRenderCell(c, cfProvider, frozenRows, frozenCols)),
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

export const GridViewport = memo(forwardRef<GridViewportHandle, GridViewportProps>(
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
      mergeProvider,
      conditionalFormatProvider,
      formatPainterState,
      onFormatPainterApply,
      onInsertRows,
      onDeleteRows,
      onInsertColumns,
      onDeleteColumns,
      onMergeCells,
      onUnmergeCells,
      onShowFormatDialog,
      onDeleteContents,
      onClipboard,
      onUndoRedo,
      onApplyFormat,
      onOpenFindReplace,
      onOpenSortDialog,
      onOpenFilterDropdown,
      onOpenDataValidation,
    },
    ref
  ) => {
    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<VirtualRenderer | null>(null);
    const selectionRef = useRef<SelectionState>({ activeCell: { row: 0, col: 0 }, ranges: [] }); // Ref for avoiding stale closures
    const zoomRef = useRef(initialZoom);
    const scrollRef = useRef<ScrollState>({ scrollLeft: 0, scrollTop: 0 });
    // Ref for conditional format provider — avoids effect dep on potentially unstable callback
    const cfProviderRef = useRef(conditionalFormatProvider);
    cfProviderRef.current = conditionalFormatProvider;
    // Refs for frozen pane counts — avoids stale closures in handleScroll and autoScroll
    const frozenRowsRef = useRef(frozenRows);
    frozenRowsRef.current = frozenRows;
    const frozenColsRef = useRef(frozenCols);
    frozenColsRef.current = frozenCols;
    // Refs for format painter — avoids onIntent dep on potentially unstable callback/state
    const formatPainterStateRef = useRef(formatPainterState);
    formatPainterStateRef.current = formatPainterState;
    const onViewportResizeRef = useRef(onViewportResize);
    onViewportResizeRef.current = onViewportResize;
    const onFormatPainterApplyRef = useRef(onFormatPainterApply);
    onFormatPainterApplyRef.current = onFormatPainterApply;

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
    // Fill source range: captured at BeginFillDrag for dashed target preview
    const [fillSourceRange, setFillSourceRange] = useState<SelectionRange | null>(null);
    // Hover cell: tracked only when format painter is active
    const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
    const hoverRafRef = useRef<number | null>(null);
    // Context menu state
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: ContextMenuTarget } | null>(null);
    const contextMenuOpenRef = useRef(false);

    // Keep refs in sync to avoid stale closures in callbacks
    contextMenuOpenRef.current = contextMenu !== null;
    selectionRef.current = selection;
    zoomRef.current = zoom;
    scrollRef.current = scroll;

    // --- Accessibility: announce active cell to screen readers ---
    // Debounced so rapid arrow-key navigation announces only the final cell
    const { announce } = useA11y();
    const prevAnnouncedCellRef = useRef<string>('');
    const announceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => {
      const cell = selection.activeCell;
      if (!cell) return;
      const addr = formatCellAddress(cell.row, cell.col);
      if (addr === prevAnnouncedCellRef.current) return;

      clearTimeout(announceTimerRef.current);
      announceTimerRef.current = setTimeout(() => {
        prevAnnouncedCellRef.current = addr;
        announce(`Cell ${addr}`);
      }, 150);

      return () => clearTimeout(announceTimerRef.current);
    }, [selection.activeCell, announce]);

    const activeCellId = selection.activeCell
      ? `cell-${selection.activeCell.row}-${selection.activeCell.col}`
      : undefined;

    // Track previous active cell for scroll-to-cell on change
    const prevActiveCellRef = useRef<{ row: number; col: number } | null>(null);

    // Intent handler
    const { handleIntent } = useIntentHandler();

    // Density mode — adjusts base sizing to match density.css overrides
    const { density } = useTheme();

    // Config with density-aware and zoom-adjusted sizes
    const config = useMemo<GridConfig>(() => {
      // Base sizing — mirrors density.css compact/cozy overrides
      let baseColHeaderHeight = DEFAULT_GRID_CONFIG.colHeaderHeight; // 24
      let baseCellHeight = DEFAULT_GRID_CONFIG.defaultCellHeight;    // 24
      if (density === 'compact') {
        baseColHeaderHeight = 20;
        baseCellHeight = 20;
      } else if (density === 'cozy') {
        baseColHeaderHeight = 28;
        baseCellHeight = 30;
      }

      return {
        ...DEFAULT_GRID_CONFIG,
        defaultCellHeight: baseCellHeight,
        frozenRows,
        frozenCols,
        zoom,
        rowHeaderWidth: Math.round(DEFAULT_GRID_CONFIG.rowHeaderWidth * zoom),
        colHeaderHeight: Math.round(baseColHeaderHeight * zoom),
      };
    }, [density, frozenRows, frozenCols, zoom]);

    // Formula bar height (needed early for context menu hit-testing)
    const formulaBarHeight = showFormulaBar ? FORMULA_BAR_HEIGHT : 0;

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

    // Virtual keyboard detection for mobile/tablet editor positioning
    const keyboard = useVirtualKeyboard();

    // Suppress CSS micro-animations during hot-path interactions
    useAnimationGuard({
      isFillDragging: isDragging && fillSourceRange !== null,
      isAutoScrolling: isDragging,
      isEditing,
    });

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

    // VirtualRenderer - create/update renderer when config changes.
    // mergeProvider is NOT in this dep array — it uses setMergeProvider below
    // so changing merge state doesn't destroy the renderer and its cached viewport.
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
      renderer.setMergeProvider(mergeProvider ?? null);
      rendererRef.current = renderer;

      return () => {
        rendererRef.current = null;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dimensions, config, viewport, zoom, renderKey]);

    // Update merge provider without recreating the renderer (preserves caches)
    useEffect(() => {
      rendererRef.current?.setMergeProvider(mergeProvider ?? null);
    }, [mergeProvider]);

    // Update frame when renderer config changes (zoom, viewport, renderKey)
    // Scroll-triggered frame updates are batched inside handleScroll and autoScroll callback
    // to avoid the double-render: setScroll→render→effect→setFrame→render
    useEffect(() => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      const currentScroll = scrollRef.current;
      renderer.setScroll(currentScroll.scrollLeft, currentScroll.scrollTop);
      const engineFrame = renderer.getRenderFrame();
      setFrame(adaptRenderFrame(engineFrame, zoom, cfProviderRef.current, frozenRows, frozenCols));
    }, [zoom, viewport, renderKey, mergeProvider, conditionalFormatProvider]); // scroll removed — handled synchronously in handleScroll

    // Auto-scroll controller (replaces interval-based auto-scroll)
    const autoScroll = useAutoScroll({
      containerRef: containerRef as React.RefObject<HTMLElement>,
      scrollContainerRef: scrollContainerRef as React.RefObject<HTMLElement>,
      onScroll: (newScroll) => {
        // Batch scroll + frame into one render (same pattern as handleScroll)
        const renderer = rendererRef.current;
        if (renderer) {
          renderer.setScroll(newScroll.scrollLeft, newScroll.scrollTop);
          const engineFrame = renderer.getRenderFrame();
          setScroll(newScroll);
          setFrame(adaptRenderFrame(engineFrame, zoomRef.current, cfProviderRef.current, frozenRowsRef.current, frozenColsRef.current));
        } else {
          setScroll(newScroll);
        }
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
                onViewportResizeRef.current?.({ width, height });
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
    }, []);

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

      if (result.deleteContents) {
        onDeleteContents?.();
      }

      if (result.clipboard) {
        onClipboard?.(result.clipboard);
      }

      if (result.insertRows) {
        onInsertRows?.(result.insertRows.row, result.insertRows.count);
      }

      if (result.deleteRows) {
        onDeleteRows?.(result.deleteRows.startRow, result.deleteRows.endRow);
      }

      if (result.insertColumns) {
        onInsertColumns?.(result.insertColumns.col, result.insertColumns.count);
      }

      if (result.deleteColumns) {
        onDeleteColumns?.(result.deleteColumns.startCol, result.deleteColumns.endCol);
      }

      if (result.mergeCells) {
        onMergeCells?.();
      }

      if (result.unmergeCells) {
        onUnmergeCells?.();
      }

      if (result.showFormatDialog) {
        onShowFormatDialog?.();
      }

      if (result.undoRedo) {
        onUndoRedo?.(result.undoRedo);
      }

      if (result.applyFormat) {
        onApplyFormat?.(result.applyFormat);
      }

      if (result.openFindReplace) {
        onOpenFindReplace?.(result.openFindReplace);
      }

      if (result.openSortDialog) {
        onOpenSortDialog?.();
      }

      if (result.openFilterDropdown) {
        onOpenFilterDropdown?.(result.openFilterDropdown.column, result.openFilterDropdown.anchorRect);
      }

      if (result.openDataValidation) {
        onOpenDataValidation?.();
      }
    }, [onSelectionChange, onActiveCellChange, onFill, autoScroll,
        onDeleteContents, onClipboard, onInsertRows, onDeleteRows,
        onInsertColumns, onDeleteColumns, onMergeCells, onUnmergeCells, onShowFormatDialog,
        onUndoRedo, onApplyFormat, onOpenFindReplace,
        onOpenSortDialog, onOpenFilterDropdown, onOpenDataValidation]);

    const onIntent = useCallback((intent: SpreadsheetIntent) => {
      // Auto-close context menu on any intent (ref-guarded to avoid wasted calls in hot paths)
      if (contextMenuOpenRef.current) setContextMenu(null);

      // Touch long-press → show context menu (same as right-click)
      if (intent.type === 'ShowContextMenu') {
        const sci = intent as ShowContextMenuIntent;
        // Select the cell if not already selected (matches right-click behavior)
        const currentSel = selectionRef.current;
        const isInSelection = currentSel.ranges.some(r =>
          isCellInRange(sci.row, sci.col, r)
        ) || (currentSel.activeCell?.row === sci.row && currentSel.activeCell?.col === sci.col);

        if (!isInSelection) {
          const result = processEditIntent({
            type: 'SetActiveCell', row: sci.row, col: sci.col, timestamp: Date.now(),
          });
          processIntentResult(result);
        }
        setContextMenu({
          x: sci.screenX, y: sci.screenY,
          target: { area: 'cell', row: sci.row, col: sci.col },
        });
        return;
      }

      // Track drag state for UI feedback (e.g., hide fill handle during drag)
      if (intent.type === 'BeginDragSelection' || intent.type === 'BeginFillDrag') {
        setIsDragging(true);
      } else if (intent.type === 'EndDragSelection' || intent.type === 'EndFillDrag') {
        setIsDragging(false);
        autoScroll.stop();
      }

      // Track fill source range for dashed preview during fill drag.
      // Read from selectionRef (always current) to avoid selection.ranges as a dep.
      if (intent.type === 'BeginFillDrag') {
        setFillSourceRange(selectionRef.current.ranges[0] ?? null);
      } else if (intent.type === 'EndFillDrag' || intent.type === 'EndDragSelection') {
        setFillSourceRange(null);
      }

      // Format painter: intercept click to apply format, then continue normal selection.
      // Read from refs to keep onIntent stable (avoid recreation on painter state changes).
      const fpState = formatPainterStateRef.current;
      if (intent.type === 'SetActiveCell' && fpState && fpState.mode !== 'inactive') {
        onFormatPainterApplyRef.current?.(intent.row, intent.col);
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
      const localY = y - rect.top - formulaBarHeight;

      return renderer.getCellAtPoint(localX, localY);
    }, [formulaBarHeight]);

    // =========================================================================
    // Hover tracking (format painter only — zero overhead when inactive)
    // =========================================================================

    const handleHoverMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (hoverRafRef.current !== null) return;
      // Capture coords before rAF — SyntheticEvent may be stale by callback time
      const { clientX, clientY } = e;
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = null;
        const cell = getCellAtPoint(clientX, clientY);
        setHoverCell(prev => {
          if (prev?.row === cell?.row && prev?.col === cell?.col) return prev;
          return cell;
        });
      });
    }, [getCellAtPoint]);

    const handleHoverLeave = useCallback(() => {
      setHoverCell(null);
    }, []);

    // Cancel pending rAF on unmount to avoid setState on unmounted component
    useEffect(() => {
      return () => {
        if (hoverRafRef.current !== null) {
          cancelAnimationFrame(hoverRafRef.current);
        }
      };
    }, []);

    const isFormatPainterActive = formatPainterState != null && formatPainterState.mode !== 'inactive';

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
    const visibleRows = frame ? (frame.visibleRange.endRow - frame.visibleRange.startRow + 1) : 20;
    const { setEditMode: _setKeyboardEditMode } = useKeyboardAdapter({
      onIntent: onKeyboardIntent,
      containerRef: containerRef as React.RefObject<HTMLElement>,
      isEditing,
      enabled: true,
      visibleRows,
    });

    // =========================================================================
    // Zoom Controls
    // =========================================================================

    // Ref for onZoomChange to avoid stale closures in callbacks
    const onZoomChangeRef = useRef(onZoomChange);
    onZoomChangeRef.current = onZoomChange;

    const setZoom = useCallback((newZoom: number) => {
      const clamped = roundZoom(clampZoom(newZoom));
      setZoomState((prev) => {
        if (prev !== clamped) return clamped;
        return prev;
      });
    }, []);

    // Fire onZoomChange outside state updater to avoid side effects in updater
    useEffect(() => {
      onZoomChangeRef.current?.(zoom);
    }, [zoom]);

    const getZoom = useCallback(() => zoom, [zoom]);

    // Use functional updates to avoid recreating callbacks on every zoom change
    const zoomIn = useCallback((step = ZOOM_STEP) => {
      setZoomState((prev) => {
        const clamped = roundZoom(clampZoom(prev + step));
        return clamped !== prev ? clamped : prev;
      });
    }, []);

    const zoomOut = useCallback((step = ZOOM_STEP) => {
      setZoomState((prev) => {
        const clamped = roundZoom(clampZoom(prev - step));
        return clamped !== prev ? clamped : prev;
      });
    }, []);

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
      focus: () => containerRef.current?.focus(),
    }), [getZoom, setZoom, zoomIn, zoomOut, resetZoom, scrollToCell, viewport, selection, onSelectionChange]);

    // =========================================================================
    // Event Handlers (delegating to PointerAdapter)
    // =========================================================================

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      const newScrollLeft = target.scrollLeft;
      const newScrollTop = target.scrollTop;

      // Close context menu on scroll (ref-guarded — scroll fires 60+/s)
      if (contextMenuOpenRef.current) setContextMenu(null);

      // Early exit if scroll unchanged (prevents redundant renders from programmatic scroll)
      const current = scrollRef.current;
      if (current.scrollLeft === newScrollLeft && current.scrollTop === newScrollTop) return;

      // Batch scroll + frame computation into a single render
      // (eliminates the old pattern: setScroll → render → effect → setFrame → render)
      const renderer = rendererRef.current;
      if (renderer) {
        renderer.setScroll(newScrollLeft, newScrollTop);
        const engineFrame = renderer.getRenderFrame();
        setScroll({ scrollLeft: newScrollLeft, scrollTop: newScrollTop });
        setFrame(adaptRenderFrame(engineFrame, zoomRef.current, cfProviderRef.current, frozenRowsRef.current, frozenColsRef.current));
      } else {
        setScroll({ scrollLeft: newScrollLeft, scrollTop: newScrollTop });
      }
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

    // Keyboard zoom (disabled during cell editing to avoid interfering with formula input)
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (editState.isEditing) return; // Don't zoom while editing
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
    }, [zoomIn, zoomOut, resetZoom, editState.isEditing]);

    // =========================================================================
    // Context Menu
    // =========================================================================

    const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();

      // Don't open during drag or editing
      if (isDragging || isEditing) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top - formulaBarHeight;

      // Hit-test: determine which area was right-clicked
      let target: ContextMenuTarget;

      // Corner area (intersection of row/col headers) — no context menu
      if (localY < config.colHeaderHeight && localX < config.rowHeaderWidth) {
        return;
      }

      if (localY < config.colHeaderHeight) {
        // Column header area
        const cell = getCellAtPoint(e.clientX, e.clientY);
        target = { area: 'colHeader', row: 0, col: cell?.col ?? 0 };
      } else if (localX < config.rowHeaderWidth) {
        // Row header area
        const cell = getCellAtPoint(e.clientX, e.clientY);
        target = { area: 'rowHeader', row: cell?.row ?? 0, col: 0 };
      } else {
        // Cell area
        const cell = getCellAtPoint(e.clientX, e.clientY);
        if (!cell) return;
        target = { area: 'cell', row: cell.row, col: cell.col };
      }

      // Selection adjustment: if right-click target is outside current selection,
      // move selection to the target (matches Excel behavior)
      const currentSel = selectionRef.current;
      const isTargetInSelection = (() => {
        if (target.area === 'rowHeader') {
          for (const range of currentSel.ranges) {
            const minRow = Math.min(range.startRow, range.endRow);
            const maxRow = Math.max(range.startRow, range.endRow);
            if (target.row >= minRow && target.row <= maxRow) return true;
          }
          return currentSel.activeCell?.row === target.row;
        }
        if (target.area === 'colHeader') {
          for (const range of currentSel.ranges) {
            const minCol = Math.min(range.startCol, range.endCol);
            const maxCol = Math.max(range.startCol, range.endCol);
            if (target.col >= minCol && target.col <= maxCol) return true;
          }
          return currentSel.activeCell?.col === target.col;
        }
        // Cell area
        for (const range of currentSel.ranges) {
          if (isCellInRange(target.row, target.col, range)) return true;
        }
        return (
          currentSel.activeCell?.row === target.row &&
          currentSel.activeCell?.col === target.col
        );
      })();

      if (!isTargetInSelection) {
        if (target.area === 'rowHeader') {
          onIntent({ type: 'SelectRow', row: target.row, extend: false, additive: false, timestamp: Date.now() });
        } else if (target.area === 'colHeader') {
          onIntent({ type: 'SelectColumn', col: target.col, extend: false, additive: false, timestamp: Date.now() });
        } else {
          onIntent({ type: 'SetActiveCell', row: target.row, col: target.col, timestamp: Date.now() });
        }
      }

      setContextMenu({ x: e.clientX, y: e.clientY, target });
    }, [isDragging, isEditing, formulaBarHeight, config.colHeaderHeight, config.rowHeaderWidth, getCellAtPoint, onIntent]);

    // Compute context menu helper values
    const contextMenuIsMultiCell = useMemo(() => {
      if (!contextMenu) return false;
      const sel = selection;
      if (sel.ranges.length === 0) return false;
      const r = sel.ranges[0];
      const minRow = Math.min(r.startRow, r.endRow);
      const maxRow = Math.max(r.startRow, r.endRow);
      const minCol = Math.min(r.startCol, r.endCol);
      const maxCol = Math.max(r.startCol, r.endCol);
      return maxRow > minRow || maxCol > minCol;
    }, [contextMenu, selection]);

    const contextMenuHasMergedCells = false; // Placeholder — engine merge query not yet available

    // Stable close callback — avoids recreating ContextMenu effects on every render.
    // Returns focus to the grid so keyboard navigation resumes immediately.
    const closeContextMenu = useCallback(() => {
      setContextMenu(null);
      containerRef.current?.focus();
    }, []);

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

      // getCellRect is merge-aware: returns anchor position + span dimensions
      return renderer.getCellRect(row, col);
    }, []);

    // Get active cell info for formula bar
    const activeCell = selection.activeCell;
    const activeCellAddress = activeCell ? formatCellAddress(activeCell.row, activeCell.col) : 'A1';
    const activeCellValue = activeCell ? getCellValue(activeCell.row, activeCell.col) : '';

    // Calculate editor position when editing
    const editorPosition = useMemo(() => {
      if (!editState.isEditing || !editState.editingCell) return null;
      return getCellPosition(editState.editingCell.row, editState.editingCell.col);
    }, [editState.isEditing, editState.editingCell, getCellPosition]);

    // Check if the cell being edited is a merged cell
    const isEditingMergedCell = useMemo(() => {
      if (!editState.isEditing || !editState.editingCell || !mergeProvider) return false;
      return mergeProvider.getMergeInfo(editState.editingCell.row, editState.editingCell.col) !== null;
    }, [editState.isEditing, editState.editingCell, mergeProvider]);

    const handleEditCancel = useCallback(() => {
      containerRef.current?.focus();
    }, []);

    // Navigation handlers for editor components
    const handleEditorNavigation = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
      const cell = activeCell;
      if (!cell) return;

      let newRow = cell.row;
      let newCol = cell.col;

      switch (direction) {
        case 'up': newRow = Math.max(0, cell.row - 1); break;
        case 'down': newRow = Math.min(cell.row + 1, 1048575); break;
        case 'left': newCol = Math.max(0, cell.col - 1); break;
        case 'right': newCol = Math.min(cell.col + 1, 16383); break;
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

    return (
      <div
        ref={containerRef}
        className={`grid-viewport relative w-full h-full overflow-hidden ${className}`}
        tabIndex={0}
        role="application"
        aria-label="Spreadsheet grid"
        aria-activedescendant={activeCellId}
        data-zoom={zoom}
        onPointerDown={pointerAdapter.handleCellMouseDown}
        onContextMenu={handleContextMenu}
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
            onCancel={handleEditCancel}
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
                cursor: isFormatPainterActive ? 'copy' : undefined,
              }}
              onScroll={handleScroll}
              onMouseMove={isFormatPainterActive ? handleHoverMove : undefined}
              onMouseLeave={isFormatPainterActive ? handleHoverLeave : undefined}
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

                {/* Format Painter Overlay (source highlight + hover preview) */}
                {isFormatPainterActive && formatPainterState && (
                  <FormatPainterOverlay
                    state={formatPainterState}
                    hoverCell={hoverCell}
                    getCellPosition={getCellPosition}
                    scroll={scroll}
                  />
                )}

                <SelectionOverlay />

                <FillHandleOverlay
                  onFillHandleMouseDown={pointerAdapter.handleFillHandleMouseDown}
                  isDragging={isDragging}
                  isEditing={isEditing}
                  isFormatPainterActive={isFormatPainterActive}
                  fillSourceRange={fillSourceRange}
                />

                {/* Cell Editor Overlay */}
                {editState.isEditing && editorPosition && (
                  <CellEditorOverlay
                    state={editState}
                    actions={editActions}
                    cellPosition={editorPosition}
                    isMergedCell={isEditingMergedCell}
                    onEnter={handleEnterNavigation}
                    onTab={handleTabNavigation}
                    onArrowNav={handleEditorNavigation}
                    onClose={handleEditCancel}
                    keyboardHeight={keyboard.keyboardHeight}
                  />
                )}
              </div>
            </div>
          </div>

          {zoom !== 1.0 && (
            <div
              className="absolute bottom-2 right-2 px-2 py-1 debug-zoom-badge text-xs rounded opacity-75 pointer-events-none"
              style={{ zIndex: 100 }}
            >
              {Math.round(zoom * 100)}%
            </div>
          )}
        </GridProvider>

        {/* Context Menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            target={contextMenu.target}
            selection={selection}
            isMultiCell={contextMenuIsMultiCell}
            hasMergedCells={contextMenuHasMergedCells}
            onIntent={onIntent}
            onClose={closeContextMenu}
          />
        )}
      </div>
    );
  }
));

GridViewport.displayName = 'GridViewport';
export default GridViewport;
