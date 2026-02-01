/**
 * Example RenderFrame
 *
 * This file shows what a RenderFrame looks like.
 * The engine produces this; the UI renders it.
 */

import type { RenderFrame, RenderCell } from './types';

/**
 * Example: Simple 3x3 grid with some formatting
 */
export const exampleRenderFrame: RenderFrame = {
  // Cells to render (already positioned, already formatted)
  cells: [
    // Row 0
    {
      row: 0,
      col: 0,
      x: 46,  // After row header (46px)
      y: 24,  // After col header (24px)
      width: 100,
      height: 24,
      displayValue: 'Name',
      valueType: 'string',
      format: {
        bold: true,
        backgroundColor: '#f0f0f0',
        horizontalAlign: 'center',
      },
    },
    {
      row: 0,
      col: 1,
      x: 146,
      y: 24,
      width: 100,
      height: 24,
      displayValue: 'Amount',
      valueType: 'string',
      format: {
        bold: true,
        backgroundColor: '#f0f0f0',
        horizontalAlign: 'center',
      },
    },
    {
      row: 0,
      col: 2,
      x: 246,
      y: 24,
      width: 100,
      height: 24,
      displayValue: 'Status',
      valueType: 'string',
      format: {
        bold: true,
        backgroundColor: '#f0f0f0',
        horizontalAlign: 'center',
      },
    },

    // Row 1
    {
      row: 1,
      col: 0,
      x: 46,
      y: 48,
      width: 100,
      height: 24,
      displayValue: 'Alice',
      valueType: 'string',
      format: {},
    },
    {
      row: 1,
      col: 1,
      x: 146,
      y: 48,
      width: 100,
      height: 24,
      displayValue: '$1,234.56',  // Pre-formatted by engine
      valueType: 'number',
      format: {
        horizontalAlign: 'right',
        isCurrency: true,
        currencySymbol: '$',
      },
    },
    {
      row: 1,
      col: 2,
      x: 246,
      y: 48,
      width: 100,
      height: 24,
      displayValue: 'Active',
      valueType: 'string',
      format: {
        fontColor: '#22c55e',  // Green
      },
      // Conditional formatting applied
      conditionalFormat: {
        formatOverrides: {
          backgroundColor: '#dcfce7',  // Light green
        },
      },
    },

    // Row 2 - with merged cell
    {
      row: 2,
      col: 0,
      x: 46,
      y: 72,
      width: 200,  // Spans 2 columns
      height: 24,
      displayValue: 'Bob (VIP Customer)',
      valueType: 'string',
      format: {
        italic: true,
      },
      merge: {
        isAnchor: true,
        isHidden: false,
        rowSpan: 1,
        colSpan: 2,
      },
    },
    // col 1 of row 2 is hidden due to merge - NOT in cells array
    {
      row: 2,
      col: 2,
      x: 246,
      y: 72,
      width: 100,
      height: 24,
      displayValue: 'Inactive',
      valueType: 'string',
      format: {
        fontColor: '#ef4444',  // Red
      },
    },
  ],

  // Row headers
  rows: [
    { row: 0, top: 24, height: 24, frozen: false },
    { row: 1, top: 48, height: 24, frozen: false },
    { row: 2, top: 72, height: 24, frozen: false },
  ],

  // Column headers
  columns: [
    { col: 0, left: 46, width: 100, frozen: false },
    { col: 1, left: 146, width: 100, frozen: false },
    { col: 2, left: 246, width: 100, frozen: false },
  ],

  // Scroll state
  scroll: { x: 0, y: 0 },

  // Content bounds (for scrollbar sizing)
  contentBounds: {
    width: 10000,   // Total scrollable width
    height: 100000, // Total scrollable height
  },

  // Visible range
  visibleRange: {
    startRow: 0,
    endRow: 2,
    startCol: 0,
    endCol: 2,
  },

  // No frozen panes in this example
  freezeLines: {
    horizontal: null,
    vertical: null,
  },

  // Metadata
  timestamp: Date.now(),
  zoom: 1.0,
};

/**
 * Example: Frozen panes (first row and column frozen)
 */
export const exampleWithFrozenPanes: RenderFrame = {
  cells: [
    // Frozen corner cell (row 0, col 0)
    {
      row: 0,
      col: 0,
      x: 46,
      y: 24,
      width: 100,
      height: 24,
      displayValue: 'ID',
      valueType: 'string',
      format: { bold: true, backgroundColor: '#e5e7eb' },
      frozenRow: true,
      frozenCol: true,
    },
    // Frozen row cells (row 0, col 1+)
    {
      row: 0,
      col: 1,
      x: 146,
      y: 24,
      width: 100,
      height: 24,
      displayValue: 'Name',
      valueType: 'string',
      format: { bold: true, backgroundColor: '#e5e7eb' },
      frozenRow: true,
      frozenCol: false,
    },
    // Frozen column cells (row 1+, col 0)
    {
      row: 1,
      col: 0,
      x: 46,
      y: 48,
      width: 100,
      height: 24,
      displayValue: '001',
      valueType: 'string',
      format: { backgroundColor: '#f3f4f6' },
      frozenRow: false,
      frozenCol: true,
    },
    // Regular scrollable cells
    {
      row: 1,
      col: 1,
      x: 146,
      y: 48,
      width: 100,
      height: 24,
      displayValue: 'Alice',
      valueType: 'string',
      format: {},
      frozenRow: false,
      frozenCol: false,
    },
  ],

  rows: [
    { row: 0, top: 24, height: 24, frozen: true },
    { row: 1, top: 48, height: 24, frozen: false },
  ],

  columns: [
    { col: 0, left: 46, width: 100, frozen: true },
    { col: 1, left: 146, width: 100, frozen: false },
  ],

  scroll: { x: 0, y: 0 },
  contentBounds: { width: 10000, height: 100000 },
  visibleRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },

  freezeLines: {
    horizontal: 48,  // Below row 0
    vertical: 146,   // After col 0
  },

  zoom: 1.0,
};

/**
 * Example: Cell with data bar (conditional formatting)
 */
export const cellWithDataBar: RenderCell = {
  row: 5,
  col: 3,
  x: 346,
  y: 144,
  width: 100,
  height: 24,
  displayValue: '75%',
  valueType: 'number',
  format: {
    horizontalAlign: 'right',
    isPercentage: true,
  },
  conditionalFormat: {
    dataBar: {
      percentage: 75,
      color: '#3b82f6',
      direction: 'ltr',
    },
  },
};

/**
 * Example: Cell with validation error
 */
export const cellWithValidationError: RenderCell = {
  row: 10,
  col: 2,
  x: 246,
  y: 264,
  width: 100,
  height: 24,
  displayValue: 'invalid',
  valueType: 'string',
  format: {},
  validation: {
    isValid: false,
    errorMessage: 'Value must be a number',
    showErrorIndicator: true,
  },
};

/**
 * Example: Formula cell with error
 */
export const formulaCellWithError: RenderCell = {
  row: 3,
  col: 4,
  x: 446,
  y: 96,
  width: 100,
  height: 24,
  displayValue: '#DIV/0!',
  valueType: 'error',
  isFormula: true,
  errorCode: 'DIV/0',
  format: {
    fontColor: '#dc2626',  // Red for errors
    horizontalAlign: 'center',
  },
};
