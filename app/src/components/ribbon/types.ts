/**
 * Ribbon type definitions
 *
 * RibbonState is the sole input to the Ribbon component.
 * The Ribbon is a pure, stateless view of this data.
 */

import type { CellFormat } from '../../../../engine/core/types/index';

/** State passed to Ribbon by parent — Ribbon is a pure view of this */
export interface RibbonState {
  /** Active cell's current format (for toggle states) */
  activeCellFormat: Partial<CellFormat>;
  /** Whether any cell is selected */
  hasSelection: boolean;
  /** Whether user is editing a cell */
  isEditing: boolean;
  /** Sheet protection */
  isProtected: boolean;
  /** Undo availability */
  canUndo: boolean;
  /** Redo availability */
  canRedo: boolean;
  /** Format painter active */
  formatPainterActive: boolean;
}

/** Default ribbon state (nothing selected, no formatting) */
export const DEFAULT_RIBBON_STATE: RibbonState = {
  activeCellFormat: {},
  hasSelection: false,
  isEditing: false,
  isProtected: false,
  canUndo: false,
  canRedo: false,
  formatPainterActive: false,
};
