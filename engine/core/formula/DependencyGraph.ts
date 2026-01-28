/**
 * VectorSheet Engine - Formula Dependency Graph
 *
 * Maintains a directed acyclic graph (DAG) of formula dependencies.
 * Enables incremental recalculation - only dirty cells are recalculated.
 *
 * Key features:
 * - Track which cells depend on which other cells
 * - Detect circular references
 * - Topological sort for optimal calculation order
 * - Incremental dirty marking
 */

import {
  CellKey,
  CellRef,
  CellRange,
  cellKey,
} from '../types/index.js';

export interface DependencyInfo {
  /** Cells that this cell's formula references */
  precedents: Set<CellKey>;
  /** Cells that reference this cell in their formulas */
  dependents: Set<CellKey>;
}

export interface CircularReferenceError {
  type: 'circular';
  cells: CellKey[];
  message: string;
}

export class DependencyGraph {
  /** Map of cell -> its dependency info */
  private graph: Map<CellKey, DependencyInfo> = new Map();

  /** Set of cells that need recalculation */
  private dirtyCells: Set<CellKey> = new Set();

  /** Set of cells with circular references */
  private circularCells: Set<CellKey> = new Set();

  /** Volatile function cells (always recalculate) */
  private volatileCells: Set<CellKey> = new Set();

  // ===========================================================================
  // Dependency Management
  // ===========================================================================

  /**
   * Set the dependencies for a cell's formula
   * @param cell The cell with the formula
   * @param precedents The cells that the formula references
   * @param isVolatile Whether the formula contains volatile functions (NOW, RAND, etc.)
   */
  setDependencies(
    cell: CellKey,
    precedents: CellKey[],
    isVolatile: boolean = false
  ): CircularReferenceError | null {
    // Remove old dependencies first
    this.removeDependencies(cell);

    // Create new dependency info
    const info: DependencyInfo = {
      precedents: new Set(precedents),
      dependents: new Set(),
    };

    // Check for self-reference
    if (precedents.includes(cell)) {
      this.circularCells.add(cell);
      return {
        type: 'circular',
        cells: [cell],
        message: `Cell ${cell} contains a circular reference to itself`,
      };
    }

    // Add this cell as a dependent of each precedent
    for (const precedent of precedents) {
      let precedentInfo = this.graph.get(precedent);
      if (!precedentInfo) {
        precedentInfo = { precedents: new Set(), dependents: new Set() };
        this.graph.set(precedent, precedentInfo);
      }
      precedentInfo.dependents.add(cell);
    }

    this.graph.set(cell, info);

    // Track volatile cells
    if (isVolatile) {
      this.volatileCells.add(cell);
    } else {
      this.volatileCells.delete(cell);
    }

    // Check for circular references
    const cycle = this.detectCycle(cell);
    if (cycle) {
      this.circularCells.add(cell);
      return {
        type: 'circular',
        cells: cycle,
        message: `Circular reference detected: ${cycle.join(' -> ')}`,
      };
    }

    this.circularCells.delete(cell);
    return null;
  }

  /**
   * Remove all dependencies for a cell (when formula is deleted)
   */
  removeDependencies(cell: CellKey): void {
    const info = this.graph.get(cell);
    if (!info) return;

    // Remove this cell from all precedents' dependent lists
    for (const precedent of info.precedents) {
      const precedentInfo = this.graph.get(precedent);
      if (precedentInfo) {
        precedentInfo.dependents.delete(cell);

        // Clean up if precedent has no more connections
        if (precedentInfo.precedents.size === 0 && precedentInfo.dependents.size === 0) {
          this.graph.delete(precedent);
        }
      }
    }

    // Clear this cell's precedents (keep dependents as they still exist)
    info.precedents.clear();

    // Remove from volatile and circular tracking
    this.volatileCells.delete(cell);
    this.circularCells.delete(cell);

    // Clean up if no more connections
    if (info.dependents.size === 0) {
      this.graph.delete(cell);
    }
  }

  /**
   * Get direct precedents (cells that this cell references)
   */
  getPrecedents(cell: CellKey): CellKey[] {
    return Array.from(this.graph.get(cell)?.precedents ?? []);
  }

  /**
   * Get direct dependents (cells that reference this cell)
   */
  getDependents(cell: CellKey): CellKey[] {
    return Array.from(this.graph.get(cell)?.dependents ?? []);
  }

  /**
   * Get all dependents recursively (transitive closure)
   */
  getAllDependents(cell: CellKey): CellKey[] {
    const visited = new Set<CellKey>();
    const result: CellKey[] = [];
    const queue = this.getDependents(cell);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;

      visited.add(current);
      result.push(current);

      // Add this cell's dependents to the queue
      const dependents = this.getDependents(current);
      queue.push(...dependents);
    }

    return result;
  }

  // ===========================================================================
  // Dirty Tracking & Calculation Order
  // ===========================================================================

  /**
   * Mark a cell and all its dependents as dirty
   */
  markDirty(cell: CellKey): void {
    this.dirtyCells.add(cell);

    // Mark all dependents as dirty
    const dependents = this.getAllDependents(cell);
    for (const dependent of dependents) {
      this.dirtyCells.add(dependent);
    }
  }

  /**
   * Mark a range of cells as dirty
   */
  markRangeDirty(range: CellRange): void {
    for (let row = range.startRow; row <= range.endRow; row++) {
      for (let col = range.startCol; col <= range.endCol; col++) {
        this.markDirty(cellKey(row, col));
      }
    }
  }

  /**
   * Mark all volatile cells as dirty
   */
  markVolatileDirty(): void {
    for (const cell of this.volatileCells) {
      this.markDirty(cell);
    }
  }

  /**
   * Check if a cell is dirty
   */
  isDirty(cell: CellKey): boolean {
    return this.dirtyCells.has(cell);
  }

  /**
   * Clear dirty flag for a cell
   */
  clearDirty(cell: CellKey): void {
    this.dirtyCells.delete(cell);
  }

  /**
   * Get all dirty cells
   */
  getDirtyCells(): CellKey[] {
    return Array.from(this.dirtyCells);
  }

  /**
   * Get dirty cells in calculation order (topological sort)
   * Cells with no dirty precedents come first
   */
  getCalculationOrder(): CellKey[] {
    const dirty = new Set(this.dirtyCells);
    const result: CellKey[] = [];
    const inDegree = new Map<CellKey, number>();

    // Calculate in-degree for each dirty cell (count of dirty precedents)
    for (const cell of dirty) {
      let count = 0;
      const precedents = this.getPrecedents(cell);
      for (const precedent of precedents) {
        if (dirty.has(precedent)) {
          count++;
        }
      }
      inDegree.set(cell, count);
    }

    // Process cells with no dirty precedents first
    const queue: CellKey[] = [];
    for (const [cell, degree] of inDegree) {
      if (degree === 0) {
        queue.push(cell);
      }
    }

    while (queue.length > 0) {
      const cell = queue.shift()!;
      result.push(cell);

      // Decrease in-degree of dependents
      const dependents = this.getDependents(cell);
      for (const dependent of dependents) {
        if (dirty.has(dependent)) {
          const newDegree = (inDegree.get(dependent) ?? 0) - 1;
          inDegree.set(dependent, newDegree);
          if (newDegree === 0) {
            queue.push(dependent);
          }
        }
      }
    }

    // Any remaining cells have circular dependencies
    for (const cell of dirty) {
      if (!result.includes(cell)) {
        result.push(cell);
      }
    }

    return result;
  }

  /**
   * Clear all dirty flags
   */
  clearAllDirty(): void {
    this.dirtyCells.clear();
  }

  // ===========================================================================
  // Circular Reference Detection
  // ===========================================================================

  /**
   * Detect if adding dependencies creates a cycle
   * @returns Array of cells in the cycle, or null if no cycle
   */
  private detectCycle(startCell: CellKey): CellKey[] | null {
    const visited = new Set<CellKey>();
    const recursionStack = new Set<CellKey>();
    const path: CellKey[] = [];

    const dfs = (cell: CellKey): CellKey[] | null => {
      visited.add(cell);
      recursionStack.add(cell);
      path.push(cell);

      const info = this.graph.get(cell);
      if (info) {
        for (const precedent of info.precedents) {
          if (!visited.has(precedent)) {
            const cycle = dfs(precedent);
            if (cycle) return cycle;
          } else if (recursionStack.has(precedent)) {
            // Found a cycle
            const cycleStart = path.indexOf(precedent);
            return path.slice(cycleStart);
          }
        }
      }

      path.pop();
      recursionStack.delete(cell);
      return null;
    };

    return dfs(startCell);
  }

  /**
   * Check if a cell has a circular reference
   */
  hasCircularReference(cell: CellKey): boolean {
    return this.circularCells.has(cell);
  }

  /**
   * Get all cells with circular references
   */
  getCircularCells(): CellKey[] {
    return Array.from(this.circularCells);
  }

  // ===========================================================================
  // Volatile Functions
  // ===========================================================================

  /**
   * Check if a cell contains volatile functions
   */
  isVolatile(cell: CellKey): boolean {
    return this.volatileCells.has(cell);
  }

  /**
   * Get all volatile cells
   */
  getVolatileCells(): CellKey[] {
    return Array.from(this.volatileCells);
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Clear the entire graph
   */
  clear(): void {
    this.graph.clear();
    this.dirtyCells.clear();
    this.circularCells.clear();
    this.volatileCells.clear();
  }

  /**
   * Get statistics about the graph
   */
  getStats(): {
    totalCells: number;
    totalEdges: number;
    dirtyCells: number;
    circularCells: number;
    volatileCells: number;
  } {
    let totalEdges = 0;
    for (const info of this.graph.values()) {
      totalEdges += info.precedents.size;
    }

    return {
      totalCells: this.graph.size,
      totalEdges,
      dirtyCells: this.dirtyCells.size,
      circularCells: this.circularCells.size,
      volatileCells: this.volatileCells.size,
    };
  }

  /**
   * Debug: Print the graph
   */
  debug(): void {
    console.log('=== Dependency Graph ===');
    for (const [cell, info] of this.graph) {
      console.log(`${cell}:`);
      console.log(`  Precedents: ${Array.from(info.precedents).join(', ') || 'none'}`);
      console.log(`  Dependents: ${Array.from(info.dependents).join(', ') || 'none'}`);
    }
    console.log(`Dirty cells: ${Array.from(this.dirtyCells).join(', ') || 'none'}`);
    console.log(`Circular cells: ${Array.from(this.circularCells).join(', ') || 'none'}`);
    console.log(`Volatile cells: ${Array.from(this.volatileCells).join(', ') || 'none'}`);
  }
}

// ===========================================================================
// Formula Reference Parser
// ===========================================================================

/**
 * Parse cell references from a formula string
 * Returns array of CellKey for each reference
 */
export function parseFormulaReferences(formula: string): CellKey[] {
  const references: CellKey[] = [];

  // Match cell references like A1, $A$1, A$1, $A1, AA123, etc.
  const cellRefRegex = /\$?[A-Z]+\$?\d+/gi;

  // Match range references like A1:B10
  const rangeRefRegex = /(\$?[A-Z]+\$?\d+):(\$?[A-Z]+\$?\d+)/gi;

  // First extract ranges
  let rangeMatch;
  while ((rangeMatch = rangeRefRegex.exec(formula)) !== null) {
    const start = parseCellReference(rangeMatch[1]);
    const end = parseCellReference(rangeMatch[2]);

    if (start && end) {
      const minRow = Math.min(start.row, end.row);
      const maxRow = Math.max(start.row, end.row);
      const minCol = Math.min(start.col, end.col);
      const maxCol = Math.max(start.col, end.col);

      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          references.push(cellKey(row, col));
        }
      }
    }
  }

  // Then extract individual cells (excluding those already in ranges)
  // This is simplified - a real implementation would need proper tokenization
  const rangePositions = new Set<number>();
  rangeRefRegex.lastIndex = 0;
  while ((rangeMatch = rangeRefRegex.exec(formula)) !== null) {
    for (let i = rangeMatch.index; i < rangeMatch.index + rangeMatch[0].length; i++) {
      rangePositions.add(i);
    }
  }

  let cellMatch;
  while ((cellMatch = cellRefRegex.exec(formula)) !== null) {
    // Skip if this is part of a range
    if (rangePositions.has(cellMatch.index)) continue;

    const ref = parseCellReference(cellMatch[0]);
    if (ref) {
      const key = cellKey(ref.row, ref.col);
      if (!references.includes(key)) {
        references.push(key);
      }
    }
  }

  return references;
}

/**
 * Parse a cell reference string like "A1" or "$B$2" to row/col
 */
export function parseCellReference(ref: string): CellRef | null {
  const match = ref.match(/^\$?([A-Z]+)\$?(\d+)$/i);
  if (!match) return null;

  const colStr = match[1].toUpperCase();
  const rowNum = parseInt(match[2], 10);

  if (isNaN(rowNum) || rowNum < 1) return null;

  // Convert column letters to number (A=0, B=1, ..., Z=25, AA=26, etc.)
  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  col -= 1; // 0-indexed

  return { row: rowNum - 1, col };
}

/**
 * Convert row/col to cell reference string like "A1"
 */
export function cellToReference(row: number, col: number): string {
  let colStr = '';
  let c = col + 1;

  while (c > 0) {
    const remainder = (c - 1) % 26;
    colStr = String.fromCharCode(65 + remainder) + colStr;
    c = Math.floor((c - 1) / 26);
  }

  return colStr + (row + 1);
}

/**
 * Check if a formula contains volatile functions
 */
export function containsVolatileFunction(formula: string): boolean {
  const volatileFunctions = [
    'NOW',
    'TODAY',
    'RAND',
    'RANDBETWEEN',
    'OFFSET',
    'INDIRECT',
    'INFO',
    'CELL',
  ];

  const upperFormula = formula.toUpperCase();

  for (const func of volatileFunctions) {
    // Check for function call pattern: FUNCNAME(
    if (upperFormula.includes(func + '(')) {
      return true;
    }
  }

  return false;
}
