/**
 * sampleSheet - Pre-populated sample data for first-use experience
 *
 * Static array of cell entries loaded on first visit.
 * localStorage key: vs-sample-loaded — prevents re-loading on subsequent visits.
 */

import type { CellFormat } from '../../../engine/core/types/index';

// =============================================================================
// Types
// =============================================================================

export interface SampleCellEntry {
  row: number;
  col: number;
  value: string | number;
  format?: Partial<CellFormat>;
}

// =============================================================================
// Constants
// =============================================================================

export const SAMPLE_LOADED_KEY = 'vs-sample-loaded';

const HEADER_FORMAT: Partial<CellFormat> = {
  bold: true,
  backgroundColor: '#e8eaed',
  fontColor: '#1e293b',
};

const CURRENCY_FORMAT: Partial<CellFormat> = {
  numberFormat: '$#,##0.00',
};

const SUMMARY_FORMAT: Partial<CellFormat> = {
  bold: true,
  fontColor: '#1a73e8',
};

// =============================================================================
// Sample Data
// =============================================================================

export const SAMPLE_SHEET_DATA: ReadonlyArray<SampleCellEntry> = [
  // Header row (row 0)
  { row: 0, col: 0, value: 'Product', format: HEADER_FORMAT },
  { row: 0, col: 1, value: 'Q1 Sales', format: HEADER_FORMAT },
  { row: 0, col: 2, value: 'Q2 Sales', format: HEADER_FORMAT },
  { row: 0, col: 3, value: 'Q3 Sales', format: HEADER_FORMAT },
  { row: 0, col: 4, value: 'Total', format: HEADER_FORMAT },

  // Data rows
  { row: 1, col: 0, value: 'Widget A' },
  { row: 1, col: 1, value: 15200, format: CURRENCY_FORMAT },
  { row: 1, col: 2, value: 18400, format: CURRENCY_FORMAT },
  { row: 1, col: 3, value: 21000, format: CURRENCY_FORMAT },
  { row: 1, col: 4, value: '=SUM(B2:D2)', format: CURRENCY_FORMAT },

  { row: 2, col: 0, value: 'Widget B' },
  { row: 2, col: 1, value: 9800, format: CURRENCY_FORMAT },
  { row: 2, col: 2, value: 11200, format: CURRENCY_FORMAT },
  { row: 2, col: 3, value: 13500, format: CURRENCY_FORMAT },
  { row: 2, col: 4, value: '=SUM(B3:D3)', format: CURRENCY_FORMAT },

  { row: 3, col: 0, value: 'Widget C' },
  { row: 3, col: 1, value: 22100, format: CURRENCY_FORMAT },
  { row: 3, col: 2, value: 19800, format: CURRENCY_FORMAT },
  { row: 3, col: 3, value: 24300, format: CURRENCY_FORMAT },
  { row: 3, col: 4, value: '=SUM(B4:D4)', format: CURRENCY_FORMAT },

  { row: 4, col: 0, value: 'Widget D' },
  { row: 4, col: 1, value: 7500, format: CURRENCY_FORMAT },
  { row: 4, col: 2, value: 8900, format: CURRENCY_FORMAT },
  { row: 4, col: 3, value: 10200, format: CURRENCY_FORMAT },
  { row: 4, col: 4, value: '=SUM(B5:D5)', format: CURRENCY_FORMAT },

  // Summary row (row 5)
  { row: 5, col: 0, value: 'Total', format: { ...HEADER_FORMAT, ...SUMMARY_FORMAT } },
  { row: 5, col: 1, value: '=SUM(B2:B5)', format: { ...CURRENCY_FORMAT, ...SUMMARY_FORMAT } },
  { row: 5, col: 2, value: '=SUM(C2:C5)', format: { ...CURRENCY_FORMAT, ...SUMMARY_FORMAT } },
  { row: 5, col: 3, value: '=SUM(D2:D5)', format: { ...CURRENCY_FORMAT, ...SUMMARY_FORMAT } },
  { row: 5, col: 4, value: '=SUM(E2:E5)', format: { ...CURRENCY_FORMAT, ...SUMMARY_FORMAT } },

  // Average row (row 6)
  { row: 6, col: 0, value: 'Average', format: SUMMARY_FORMAT },
  { row: 6, col: 1, value: '=AVERAGE(B2:B5)', format: { ...CURRENCY_FORMAT, ...SUMMARY_FORMAT } },
  { row: 6, col: 2, value: '=AVERAGE(C2:C5)', format: { ...CURRENCY_FORMAT, ...SUMMARY_FORMAT } },
  { row: 6, col: 3, value: '=AVERAGE(D2:D5)', format: { ...CURRENCY_FORMAT, ...SUMMARY_FORMAT } },
  { row: 6, col: 4, value: '=AVERAGE(E2:E5)', format: { ...CURRENCY_FORMAT, ...SUMMARY_FORMAT } },
];

// =============================================================================
// Helpers
// =============================================================================

export function isSampleLoaded(): boolean {
  try {
    return localStorage.getItem(SAMPLE_LOADED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markSampleLoaded(): void {
  try {
    localStorage.setItem(SAMPLE_LOADED_KEY, 'true');
  } catch {
    // Storage unavailable — silently ignore
  }
}
