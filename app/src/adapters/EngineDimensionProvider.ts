/**
 * EngineDimensionProvider - Adapter for SpreadsheetEngine to DimensionProvider
 *
 * Wraps SpreadsheetEngine to implement the DimensionProvider interface
 * required by GridViewport/VirtualRenderer.
 */

import type { SpreadsheetEngine } from '../../../engine/core/SpreadsheetEngine';
import type { DimensionProvider } from '../../../engine/core/rendering/VirtualRenderer';
import type { Cell, CellRange } from '../../../engine/core/types';

export class EngineDimensionProvider implements DimensionProvider {
  private filterManager: ReturnType<SpreadsheetEngine['getFilterManager']>;

  constructor(private engine: SpreadsheetEngine) {
    this.filterManager = engine.getFilterManager();
  }

  getRowHeight(row: number): number {
    return this.engine.getRowHeight(row);
  }

  getColumnWidth(col: number): number {
    return this.engine.getColumnWidth(col);
  }

  isRowHidden(row: number): boolean {
    // Check if row is filtered out
    if (this.filterManager.hasFilters()) {
      return !this.filterManager.isRowVisible(row);
    }
    // TODO: Add manual row hiding support in SpreadsheetEngine
    return false;
  }

  isColumnHidden(_col: number): boolean {
    // TODO: Implement column hiding in SpreadsheetEngine
    // For now, no columns are hidden
    return false;
  }

  getCell(row: number, col: number): Cell | null {
    return this.engine.getCell(row, col);
  }

  getUsedRange(): CellRange {
    return this.engine.getUsedRange();
  }
}
