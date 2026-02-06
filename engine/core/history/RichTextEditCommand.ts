/**
 * VectorSheet Engine - Rich Text Edit Command
 * Undo/redo support for character-level formatting operations
 */

import { Command } from './UndoRedoManager.js';
import type { FormattedText, CellValueType } from '../types/index.js';
import { isFormattedText } from '../types/index.js';
import type { SparseDataStore } from '../data/SparseDataStore.js';

/**
 * Command for rich text editing operations.
 * Captures before/after snapshots of FormattedText or plain values.
 */
export class RichTextEditCommand implements Command {
  readonly id: string;
  readonly type: 'setCellValue' = 'setCellValue';
  readonly description: string;
  readonly timestamp: number;

  private row: number;
  private col: number;
  private beforeValue: string | number | boolean | FormattedText | null;
  private afterValue: string | number | boolean | FormattedText | null;
  private dataStore: SparseDataStore;

  constructor(
    dataStore: SparseDataStore,
    row: number,
    col: number,
    beforeValue: string | number | boolean | FormattedText | null,
    afterValue: string | number | boolean | FormattedText | null
  ) {
    this.id = `richtext-edit-${row}-${col}-${Date.now()}-${Math.random()}`;
    this.timestamp = Date.now();
    this.description = `Edit cell ${String.fromCharCode(65 + col)}${row + 1}`;
    this.dataStore = dataStore;
    this.row = row;
    this.col = col;
    // Deep clone values to prevent mutation
    this.beforeValue = this.cloneValue(beforeValue);
    this.afterValue = this.cloneValue(afterValue);
  }

  /**
   * Apply the command (set to afterValue)
   */
  apply(): void {
    const cell = this.dataStore.getCell(this.row, this.col);
    if (cell) {
      cell.value = this.cloneValue(this.afterValue);
    } else {
      // Create new cell if it doesn't exist
      this.dataStore.setCell(this.row, this.col, {
        value: this.cloneValue(this.afterValue),
        type: this.inferType(this.afterValue),
      });
    }
  }

  /**
   * Revert the command (set to beforeValue)
   */
  revert(): void {
    if (this.beforeValue === null) {
      // Cell didn't exist before - remove it
      this.dataStore.deleteCell(this.row, this.col);
    } else {
      const cell = this.dataStore.getCell(this.row, this.col);
      if (cell) {
        cell.value = this.cloneValue(this.beforeValue);
      } else {
        // Recreate cell
        this.dataStore.setCell(this.row, this.col, {
          value: this.cloneValue(this.beforeValue),
          type: this.inferType(this.beforeValue),
        });
      }
    }
  }

  /**
   * Estimate memory size for memory management
   * FormattedText: text.length * 2 + runs.length * 100 (bytes)
   * Plain value: estimate based on type
   */
  getMemorySize(): number {
    let size = 100; // Base overhead

    size += this.estimateValueSize(this.beforeValue);
    size += this.estimateValueSize(this.afterValue);

    return size;
  }

  /**
   * Deep clone a cell value
   * FormattedText needs deep cloning of runs array
   */
  private cloneValue(
    value: string | number | boolean | FormattedText | null
  ): string | number | boolean | FormattedText | null {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (isFormattedText(value)) {
      return {
        _type: 'FormattedText',
        text: value.text,
        runs: value.runs.map(run => ({
          start: run.start,
          end: run.end,
          format: run.format ? { ...run.format } : undefined,
        })),
      };
    }

    return value;
  }

  /**
   * Estimate memory size of a value
   */
  private estimateValueSize(value: string | number | boolean | FormattedText | null): number {
    if (value === null) return 0;

    if (typeof value === 'string') {
      return value.length * 2; // 2 bytes per char
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return 8; // 8 bytes for number/boolean
    }

    if (isFormattedText(value)) {
      // text.length * 2 + runs.length * 100 (each run ~100 bytes)
      return value.text.length * 2 + value.runs.length * 100;
    }

    return 0;
  }

  /**
   * Infer cell type from value
   */
  private inferType(value: string | number | boolean | FormattedText | null): CellValueType {
    if (value === null) return 'empty';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (isFormattedText(value)) return 'string';
    return 'string';
  }
}
