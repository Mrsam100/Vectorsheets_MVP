/**
 * Grid Context
 *
 * Provides shared state for grid components without prop drilling.
 * Manages configuration, render frame, selection state, and event handlers.
 */

import React, { createContext, useContext, useMemo } from 'react';
import type {
  GridConfig,
  ScrollState,
  ViewportDimensions,
  SelectionState,
  RenderFrame,
  CellClickHandler,
  CellDoubleClickHandler,
  HeaderClickHandler,
} from './types';
import { DEFAULT_GRID_CONFIG, isCellInRange } from './types';

/**
 * Grid context value - everything grid components need
 */
export interface GridContextValue {
  // Configuration
  config: GridConfig;

  // Dimensions
  viewport: ViewportDimensions;

  // Scroll state
  scroll: ScrollState;

  // Render frame from VirtualRenderer (THE render contract)
  frame: RenderFrame | null;

  // Selection state (UI-managed)
  selection: SelectionState;

  // Event handlers
  onCellClick?: CellClickHandler;
  onCellDoubleClick?: CellDoubleClickHandler;
  onRowHeaderClick?: HeaderClickHandler;
  onColHeaderClick?: HeaderClickHandler;
  onSelectAll?: () => void;

  // Selection helper functions
  isCellSelected: (row: number, col: number) => boolean;
  isCellActive: (row: number, col: number) => boolean;
  isRowSelected: (row: number) => boolean;
  isColSelected: (col: number) => boolean;
}

const GridContext = createContext<GridContextValue | null>(null);

/**
 * Hook to access grid context
 * Throws if used outside GridProvider
 */
export function useGridContext(): GridContextValue {
  const context = useContext(GridContext);
  if (!context) {
    throw new Error('useGridContext must be used within a GridProvider');
  }
  return context;
}

/**
 * Grid provider props - supports two modes:
 * 1. Pass a pre-built `value` object directly
 * 2. Pass individual props that get composed into the context
 */
export type GridProviderProps =
  | {
      children: React.ReactNode;
      value: GridContextValue;
    }
  | {
      children: React.ReactNode;
      value?: never;
      config?: Partial<GridConfig>;
      viewport: ViewportDimensions;
      scroll: ScrollState;
      frame: RenderFrame | null;
      selection: SelectionState;
      onCellClick?: CellClickHandler;
      onCellDoubleClick?: CellDoubleClickHandler;
      onRowHeaderClick?: HeaderClickHandler;
      onColHeaderClick?: HeaderClickHandler;
      onSelectAll?: () => void;
    };

/**
 * Grid provider component
 */
export const GridProvider: React.FC<GridProviderProps> = (props) => {
  const { children } = props;

  // If value is provided directly, use it
  if ('value' in props && props.value) {
    return (
      <GridContext.Provider value={props.value}>
        {children}
      </GridContext.Provider>
    );
  }

  // Otherwise, compose from individual props
  const {
    config: configOverrides,
    viewport,
    scroll,
    frame,
    selection,
    onCellClick,
    onCellDoubleClick,
    onRowHeaderClick,
    onColHeaderClick,
    onSelectAll,
  } = props as Exclude<GridProviderProps, { value: GridContextValue }>;

  return (
    <GridProviderInner
      configOverrides={configOverrides}
      viewport={viewport}
      scroll={scroll}
      frame={frame}
      selection={selection}
      onCellClick={onCellClick}
      onCellDoubleClick={onCellDoubleClick}
      onRowHeaderClick={onRowHeaderClick}
      onColHeaderClick={onColHeaderClick}
      onSelectAll={onSelectAll}
    >
      {children}
    </GridProviderInner>
  );
};

/**
 * Inner provider component that builds context from props
 */
const GridProviderInner: React.FC<{
  children: React.ReactNode;
  configOverrides?: Partial<GridConfig>;
  viewport: ViewportDimensions;
  scroll: ScrollState;
  frame: RenderFrame | null;
  selection: SelectionState;
  onCellClick?: CellClickHandler;
  onCellDoubleClick?: CellDoubleClickHandler;
  onRowHeaderClick?: HeaderClickHandler;
  onColHeaderClick?: HeaderClickHandler;
  onSelectAll?: () => void;
}> = ({
  children,
  configOverrides,
  viewport,
  scroll,
  frame,
  selection,
  onCellClick,
  onCellDoubleClick,
  onRowHeaderClick,
  onColHeaderClick,
  onSelectAll,
}) => {
  // Merge config with defaults
  const config = useMemo(
    () => ({ ...DEFAULT_GRID_CONFIG, ...configOverrides }),
    [configOverrides]
  );

  // Selection helper: is cell in any selection range?
  const isCellSelected = useMemo(() => {
    return (row: number, col: number): boolean => {
      // Check active cell
      if (
        selection.activeCell?.row === row &&
        selection.activeCell?.col === col
      ) {
        return true;
      }
      // Check ranges
      return selection.ranges.some((range) => isCellInRange(row, col, range));
    };
  }, [selection]);

  // Selection helper: is this the active cell?
  const isCellActive = useMemo(() => {
    return (row: number, col: number): boolean => {
      return (
        selection.activeCell?.row === row && selection.activeCell?.col === col
      );
    };
  }, [selection.activeCell]);

  // Selection helper: is any cell in this row selected?
  const isRowSelected = useMemo(() => {
    return (row: number): boolean => {
      if (selection.activeCell?.row === row) return true;
      return selection.ranges.some((range) => {
        const minRow = Math.min(range.startRow, range.endRow);
        const maxRow = Math.max(range.startRow, range.endRow);
        return row >= minRow && row <= maxRow;
      });
    };
  }, [selection]);

  // Selection helper: is any cell in this column selected?
  const isColSelected = useMemo(() => {
    return (col: number): boolean => {
      if (selection.activeCell?.col === col) return true;
      return selection.ranges.some((range) => {
        const minCol = Math.min(range.startCol, range.endCol);
        const maxCol = Math.max(range.startCol, range.endCol);
        return col >= minCol && col <= maxCol;
      });
    };
  }, [selection]);

  // Build context value
  const value = useMemo<GridContextValue>(
    () => ({
      config,
      viewport,
      scroll,
      frame,
      selection,
      onCellClick,
      onCellDoubleClick,
      onRowHeaderClick,
      onColHeaderClick,
      onSelectAll,
      isCellSelected,
      isCellActive,
      isRowSelected,
      isColSelected,
    }),
    [
      config,
      viewport,
      scroll,
      frame,
      selection,
      onCellClick,
      onCellDoubleClick,
      onRowHeaderClick,
      onColHeaderClick,
      onSelectAll,
      isCellSelected,
      isCellActive,
      isRowSelected,
      isColSelected,
    ]
  );

  return <GridContext.Provider value={value}>{children}</GridContext.Provider>;
};
