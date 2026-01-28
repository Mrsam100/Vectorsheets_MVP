/**
 * VectorSheet Engine
 *
 * A high-performance spreadsheet engine with Excel-compatible features:
 * - Sparse cell storage for 1M+ row support
 * - Formula engine with dependency tracking and caching
 * - Virtual rendering for smooth scrolling
 * - Excel-like keyboard navigation and selection
 *
 * @example
 * ```typescript
 * import { SpreadsheetEngine } from '@vectorsheet/engine';
 *
 * const engine = new SpreadsheetEngine({
 *   viewportWidth: 1200,
 *   viewportHeight: 800,
 * });
 *
 * // Set cell values
 * engine.setCellValue(0, 0, 'Hello');
 * engine.setCellValue(0, 1, 42);
 * engine.setCellValue(1, 0, '=A1 & " World"');
 *
 * // Calculate formulas
 * engine.calculateSync();
 *
 * // Get display value
 * console.log(engine.getCellDisplayValue(1, 0)); // "Hello World"
 * ```
 */

export * from './core/index.js';
