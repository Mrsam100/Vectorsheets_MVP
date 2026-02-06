/**
 * CellLayer - Pure renderer for RenderFrame cells
 *
 * This component is a pure renderer - it receives RenderCells and renders them.
 * No spreadsheet logic here. All formatting decisions made by engine.
 *
 * Render Contract:
 * - Receives: RenderFrame with pre-positioned, pre-formatted cells
 * - Outputs: DOM elements at exact positions specified
 * - Never computes: positions, formats, values
 *
 * Note: Selection visuals are rendered by SelectionOverlay, not here.
 */

import React, { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useGridContext } from './GridContext';
import type { RenderCell, CellFormat, FormattedText, CharacterFormat } from './types';

export interface CellLayerProps {
  className?: string;
  style?: React.CSSProperties;
}

// =============================================================================
// Cell Component - Renders a single RenderCell
// =============================================================================

interface CellProps {
  cell: RenderCell;
  headerOffset: { x: number; y: number };
  onClick?: (row: number, col: number, e: React.MouseEvent) => void;
  onDoubleClick?: (row: number, col: number, e: React.MouseEvent) => void;
}

/** Reject CSS color values that could contain URL or expression injection */
const UNSAFE_COLOR_PATTERN = /url\s*\(|expression\s*\(|import\s|;|}/i;
function safeColor(value: string): string | undefined {
  if (UNSAFE_COLOR_PATTERN.test(value)) return undefined;
  return value;
}

/**
 * Convert CellFormat to React CSSProperties
 * Pure function - no side effects
 */
function formatToStyles(format: CellFormat): React.CSSProperties {
  const styles: React.CSSProperties = {};

  // Typography
  if (format.fontFamily) styles.fontFamily = format.fontFamily;
  if (format.fontSize) styles.fontSize = `${format.fontSize}pt`;
  if (format.fontColor) styles.color = safeColor(format.fontColor);
  if (format.bold) styles.fontWeight = 'bold';
  if (format.italic) styles.fontStyle = 'italic';
  if (format.underline) styles.textDecoration = 'underline';
  if (format.strikethrough) {
    styles.textDecoration = format.underline
      ? 'underline line-through'
      : 'line-through';
  }

  // Alignment
  if (format.horizontalAlign) styles.textAlign = format.horizontalAlign;
  if (format.verticalAlign) {
    styles.alignItems =
      format.verticalAlign === 'top'
        ? 'flex-start'
        : format.verticalAlign === 'bottom'
          ? 'flex-end'
          : 'center';
  }
  if (format.textWrap === false) styles.whiteSpace = 'nowrap';
  if (format.textRotation && Number.isFinite(format.textRotation)) {
    const deg = Math.max(0, Math.min(360, format.textRotation));
    styles.transform = `rotate(${deg}deg)`;
  }

  // Background
  if (format.backgroundColor) styles.backgroundColor = safeColor(format.backgroundColor);

  return styles;
}

// =============================================================================
// Rich Text Support - Production-Grade Character-Level Formatting
// =============================================================================

/**
 * Format cache for character formats (performance optimization)
 * WeakMap allows garbage collection of unused formats
 */
const characterFormatCache = new WeakMap<CharacterFormat, React.CSSProperties>();

/**
 * Convert CharacterFormat to React CSSProperties with caching
 * Merges character format with cell format for final styles
 */
function characterFormatToStyles(
  cellFormat: CellFormat,
  charFormat?: CharacterFormat
): React.CSSProperties {
  // Fast path: no character format, return cell format styles
  if (!charFormat) {
    return formatToStyles(cellFormat);
  }

  // Check cache for character format
  const cached = characterFormatCache.get(charFormat);
  if (cached) {
    return cached;
  }

  // Build merged styles (character format overrides cell format)
  const styles: React.CSSProperties = {};

  // Typography - character format takes precedence
  const fontFamily = charFormat.fontFamily ?? cellFormat.fontFamily;
  const fontSize = charFormat.fontSize ?? cellFormat.fontSize;
  const fontColor = charFormat.fontColor ?? cellFormat.fontColor;
  const bold = charFormat.bold ?? cellFormat.bold;
  const italic = charFormat.italic ?? cellFormat.italic;
  const underline = charFormat.underline ?? cellFormat.underline;
  const strikethrough = charFormat.strikethrough ?? cellFormat.strikethrough;

  if (fontFamily) styles.fontFamily = fontFamily;
  if (fontSize) styles.fontSize = `${fontSize}pt`;
  if (fontColor) styles.color = safeColor(fontColor);
  if (bold) styles.fontWeight = 'bold';
  if (italic) styles.fontStyle = 'italic';
  if (underline) styles.textDecoration = 'underline';
  if (strikethrough) {
    styles.textDecoration = underline
      ? 'underline line-through'
      : 'line-through';
  }

  // Cache and return
  characterFormatCache.set(charFormat, styles);
  return styles;
}

/**
 * Render FormattedText as multiple spans with character-level formatting
 * Production-grade: Excel-compatible, optimized, handles edge cases
 */
function renderFormattedText(
  richText: FormattedText,
  cellFormat: CellFormat
): React.ReactNode {
  const { text, runs } = richText;

  // Edge case: empty text
  if (text.length === 0) {
    return null;
  }

  // Edge case: no runs, render as plain text
  if (runs.length === 0) {
    return text;
  }

  // Build spans for each run
  const spans: React.ReactNode[] = [];
  let lastEnd = 0;

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];

    // Validate run bounds
    const start = Math.max(0, Math.min(run.start, text.length));
    const end = Math.max(start, Math.min(run.end, text.length));

    // Add unformatted gap before this run (if any)
    if (start > lastEnd) {
      const gapText = text.slice(lastEnd, start);
      spans.push(
        <span key={`gap-${lastEnd}`} style={formatToStyles(cellFormat)}>
          {gapText}
        </span>
      );
    }

    // Add formatted run
    if (end > start) {
      const runText = text.slice(start, end);
      const runStyles = characterFormatToStyles(cellFormat, run.format);

      spans.push(
        <span key={`run-${start}`} style={runStyles}>
          {runText}
        </span>
      );
    }

    lastEnd = end;
  }

  // Add trailing unformatted text (if any)
  if (lastEnd < text.length) {
    const trailingText = text.slice(lastEnd);
    spans.push(
      <span key={`trail-${lastEnd}`} style={formatToStyles(cellFormat)}>
        {trailingText}
      </span>
    );
  }

  return <>{spans}</>;
}

/**
 * Determine z-index based on frozen state
 * Frozen corner (both) > Frozen row/col > Scrollable
 */
function getCellZIndex(cell: RenderCell): number {
  if (cell.frozenRow && cell.frozenCol) return 30;
  if (cell.frozenRow || cell.frozenCol) return 20;
  return 1;
}

/**
 * Cell component - renders a single cell from RenderCell
 * Note: Selection highlighting is handled by SelectionOverlay, not here.
 */
const Cell: React.FC<CellProps> = memo(
  ({ cell, headerOffset, onClick, onDoubleClick }) => {
    // Event handlers
    const handleClick = useCallback(
      (e: React.MouseEvent) => onClick?.(cell.row, cell.col, e),
      [cell.row, cell.col, onClick]
    );

    const handleDoubleClick = useCallback(
      (e: React.MouseEvent) => onDoubleClick?.(cell.row, cell.col, e),
      [cell.row, cell.col, onDoubleClick]
    );

    // Ref for number overflow detection (Excel-style #### hash fill)
    const contentRef = useRef<HTMLSpanElement>(null);
    const isNumberType = cell.valueType === 'number';
    const hasRichText = !!cell.richText;

    // Excel-style overflow: numbers that don't fit the cell show #### instead
    // of ellipsis. Runs before paint (useLayoutEffect) so there's no flash.
    useLayoutEffect(() => {
      const el = contentRef.current;
      if (!el || !isNumberType) return;

      // For rich text, measure the rendered spans
      // For plain text, measure the text content directly
      if (hasRichText) {
        // Rich text: measure actual rendered width of all spans
        if (el.scrollWidth > el.clientWidth + 1) {
          const approxCharWidth = 8;
          const count = Math.ceil(el.clientWidth / approxCharWidth) + 2;
          el.textContent = '#'.repeat(count);
        }
      } else {
        // Plain text: measure text content
        el.textContent = cell.displayValue;

        if (el.scrollWidth > el.clientWidth + 1) {
          const approxCharWidth = 8;
          const count = Math.ceil(el.clientWidth / approxCharWidth) + 2;
          el.textContent = '#'.repeat(count);
        }
      }
    }, [cell.displayValue, cell.richText, cell.width, isNumberType, hasRichText]);

    // Skip hidden merged cells
    if (cell.merge?.isHidden) {
      return null;
    }

    // Compute styles from format.
    // Conditional formatting overrides (formatOverrides + colorScale) are
    // pre-merged into cell.format by the adapter — no override logic here.
    const formatStyles = formatToStyles(cell.format);

    // Error styling
    const isError = cell.valueType === 'error';
    const errorClass = isError ? 'cell-error' : '';

    // Position styles (subtract header offset since we're inside scroll container)
    const positionStyles: React.CSSProperties = {
      position: 'absolute',
      left: cell.x - headerOffset.x,
      top: cell.y - headerOffset.y,
      width: cell.width,
      height: cell.height,
      zIndex: getCellZIndex(cell),
      ...formatStyles,
      ...(isError ? { color: 'var(--color-danger)' } : {}),
    };

    // Validation error indicator
    const hasValidationError = cell.validation?.isValid === false;

    // Content class: numbers clip without ellipsis (hash fill instead),
    // text/other types truncate with ellipsis.
    const contentClass = isNumberType
      ? 'w-full relative z-10 overflow-hidden whitespace-nowrap block'
      : 'truncate w-full relative z-10';

    return (
      <div
        className={`cell flex items-center px-1 text-sm select-none cursor-cell border-r border-b overflow-hidden ${errorClass}`}
        style={positionStyles}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        id={`cell-${cell.row}-${cell.col}`}
        role="gridcell"
        aria-rowindex={cell.row + 1}
        aria-colindex={cell.col + 1}
        data-row={cell.row}
        data-col={cell.col}
        title={cell.validation?.errorMessage}
      >
        {/* Data bar (rendered behind text) */}
        {cell.conditionalFormat?.dataBar && (
          <div
            className="absolute inset-y-0 pointer-events-none"
            style={{
              left: cell.conditionalFormat.dataBar.direction === 'ltr' ? 0 : undefined,
              right: cell.conditionalFormat.dataBar.direction === 'rtl' ? 0 : undefined,
              width: `${Math.max(0, Math.min(100, cell.conditionalFormat.dataBar.percentage))}%`,
              backgroundColor: cell.conditionalFormat.dataBar.color,
              opacity: 0.3,
            }}
          />
        )}

        {/* Icon (from icon set conditional formatting) */}
        {cell.conditionalFormat?.icon && (
          <span
            className={`flex-shrink-0 ${cell.conditionalFormat.icon.position === 'right' ? 'order-last ml-1' : 'mr-1'}`}
          >
            {cell.conditionalFormat.icon.type}
          </span>
        )}

        {/* Cell content - render rich text or plain text */}
        <span ref={contentRef} className={contentClass}>
          {cell.richText
            ? renderFormattedText(cell.richText, cell.format)
            : cell.displayValue}
        </span>

        {/* Validation error indicator (red triangle) */}
        {hasValidationError && (
          <div
            className="absolute top-0 right-0 w-0 h-0 border-t-4 border-r-4"
            style={{ borderTopColor: 'var(--color-danger)', borderRightColor: 'var(--color-danger)', borderLeft: '4px solid transparent', borderBottom: '4px solid transparent' }}
          />
        )}
      </div>
    );
  }
);

Cell.displayName = 'Cell';

// =============================================================================
// Freeze Pane Lines
// =============================================================================

interface FreezeLinesProps {
  horizontal: number | null;
  vertical: number | null;
  headerOffset: { x: number; y: number };
}

const FreezeLines: React.FC<FreezeLinesProps> = memo(
  ({ horizontal, vertical, headerOffset }) => {
    return (
      <>
        {vertical !== null && (
          <div
            className="freeze-line-vertical absolute top-0 bottom-0 w-px pointer-events-none"
            style={{
              left: vertical - headerOffset.x,
              zIndex: 60,
              boxShadow: 'var(--shadow-freeze-v)',
            }}
          />
        )}
        {horizontal !== null && (
          <div
            className="freeze-line-horizontal absolute left-0 right-0 h-px pointer-events-none"
            style={{
              top: horizontal - headerOffset.y,
              zIndex: 60,
              boxShadow: 'var(--shadow-freeze-h)',
            }}
          />
        )}
      </>
    );
  }
);

FreezeLines.displayName = 'FreezeLines';

// =============================================================================
// CellLayer - Main Container
// =============================================================================

/**
 * CellLayer - renders all visible cells from RenderFrame
 *
 * Contract:
 * - Receives RenderFrame via GridContext
 * - Renders cells at positions specified in RenderFrame
 * - Applies formatting from RenderCell.format
 * - Does NOT render selection visuals (handled by SelectionOverlay)
 */
export const CellLayer: React.FC<CellLayerProps> = memo(
  ({ className = '', style }) => {
    const {
      config,
      frame,
      onCellClick,
      onCellDoubleClick,
    } = useGridContext();

    // Memoize header offset to avoid new object on every render
    // (CellLayer re-renders on context changes including selection, but headerOffset is stable)
    const headerOffset = useMemo(
      () => ({ x: config.rowHeaderWidth, y: config.colHeaderHeight }),
      [config.rowHeaderWidth, config.colHeaderHeight]
    );

    // Memoize cell elements so selection-only context changes skip O(visibleCells) work.
    // During drag selection, frame doesn't change — only selection does. Without this,
    // CellLayer would re-run .map() over all visible cells on every mousemove.
    const cellElements = useMemo(() => {
      if (!frame) return null;
      return frame.cells.map((cell) => (
        <Cell
          key={`${cell.row}-${cell.col}`}
          cell={cell}
          headerOffset={headerOffset}
          onClick={onCellClick}
          onDoubleClick={onCellDoubleClick}
        />
      ));
    }, [frame, headerOffset, onCellClick, onCellDoubleClick]);

    // No frame = nothing to render
    if (!frame) return null;

    return (
      <div
        className={`cell-layer absolute overflow-hidden ${className}`}
        style={{
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          ...style,
        }}
        role="grid"
        aria-rowcount={-1}
        aria-colcount={-1}
      >
        {/* Render all visible cells (memoized — skipped when only selection changed) */}
        {cellElements}

        {/* Freeze pane divider lines */}
        <FreezeLines
          horizontal={frame.freezeLines.horizontal}
          vertical={frame.freezeLines.vertical}
          headerOffset={headerOffset}
        />
      </div>
    );
  }
);

CellLayer.displayName = 'CellLayer';

export default CellLayer;
