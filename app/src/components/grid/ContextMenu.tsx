/**
 * ContextMenu - Grid right-click context menu
 *
 * Renders context-appropriate menu items for cell area, row headers,
 * and column headers. Emits SpreadsheetIntents only — never mutates
 * engine state directly.
 *
 * Behaviour:
 * - position: fixed, viewport-clamped (all 4 edges)
 * - Dismisses on: click-outside, Escape, scroll (parent closes via state)
 * - Accessibility: role="menu", role="menuitem", keyboard arrow/Home/End navigation
 */

import React, { memo, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ContextMenuTarget, SelectionState } from './types';
import type { SpreadsheetIntent } from './IntentHandler';

// =============================================================================
// Types
// =============================================================================

export interface ContextMenuProps {
  /** Screen X of the menu anchor (from MouseEvent.clientX) */
  x: number;
  /** Screen Y of the menu anchor (from MouseEvent.clientY) */
  y: number;
  /** What was right-clicked */
  target: ContextMenuTarget;
  /** Current grid selection */
  selection: SelectionState;
  /** Does the selection span multiple cells? */
  isMultiCell: boolean;
  /** Are any cells in the selection merged? */
  hasMergedCells: boolean;
  /** Emit a SpreadsheetIntent */
  onIntent: (intent: SpreadsheetIntent) => void;
  /** Close the menu */
  onClose: () => void;
}

// =============================================================================
// Menu item model
// =============================================================================

interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  action: () => void;
}

interface MenuSeparator {
  separator: true;
}

type MenuEntry = MenuItem | MenuSeparator;

function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return 'separator' in entry;
}

// =============================================================================
// Constants
// =============================================================================

const MENU_WIDTH = 220;
const MENU_ITEM_HEIGHT = 28;
const SEPARATOR_HEIGHT = 9;
const EDGE_MARGIN = 4;

// =============================================================================
// Menu item builder
// =============================================================================

function buildMenuItems(
  target: ContextMenuTarget,
  selection: SelectionState,
  isMultiCell: boolean,
  hasMergedCells: boolean,
  emit: (intent: SpreadsheetIntent) => void,
): MenuEntry[] {
  const now = Date.now();
  const { row, col } = target;

  // Derive selection range bounds
  const range =
    selection.ranges.length > 0
      ? selection.ranges[0]
      : selection.activeCell
        ? { startRow: selection.activeCell.row, startCol: selection.activeCell.col,
            endRow: selection.activeCell.row, endCol: selection.activeCell.col }
        : null;

  const minRow = range ? Math.min(range.startRow, range.endRow) : row;
  const maxRow = range ? Math.max(range.startRow, range.endRow) : row;
  const minCol = range ? Math.min(range.startCol, range.endCol) : col;
  const maxCol = range ? Math.max(range.startCol, range.endCol) : col;

  const clipboardItems: MenuEntry[] = [
    {
      label: 'Cut',
      shortcut: 'Ctrl+X',
      action: () => emit({ type: 'ClipboardAction', action: 'cut', timestamp: now }),
    },
    {
      label: 'Copy',
      shortcut: 'Ctrl+C',
      action: () => emit({ type: 'ClipboardAction', action: 'copy', timestamp: now }),
    },
    {
      label: 'Paste',
      shortcut: 'Ctrl+V',
      action: () => emit({ type: 'ClipboardAction', action: 'paste', timestamp: now }),
    },
  ];

  const clearItem: MenuEntry = {
    label: 'Clear Contents',
    shortcut: 'Del',
    action: () => emit({ type: 'DeleteContents', timestamp: now }),
  };

  if (target.area === 'rowHeader') {
    const rowCount = maxRow - minRow + 1;
    return [
      ...clipboardItems,
      { separator: true },
      {
        label: 'Insert Row Above',
        action: () => emit({ type: 'InsertRows', row: minRow, count: 1, timestamp: now }),
      },
      {
        label: 'Insert Row Below',
        action: () => emit({ type: 'InsertRows', row: maxRow + 1, count: 1, timestamp: now }),
      },
      {
        label: rowCount > 1 ? `Delete ${rowCount} Rows` : 'Delete Row',
        action: () => emit({ type: 'DeleteRows', startRow: minRow, endRow: maxRow, timestamp: now }),
      },
      { separator: true },
      clearItem,
      { separator: true },
      {
        label: 'Row Height...',
        disabled: true,
        action: () => {},
      },
    ];
  }

  if (target.area === 'colHeader') {
    const colCount = maxCol - minCol + 1;
    return [
      ...clipboardItems,
      { separator: true },
      {
        label: 'Insert Column Left',
        action: () => emit({ type: 'InsertColumns', col: minCol, count: 1, timestamp: now }),
      },
      {
        label: 'Insert Column Right',
        action: () => emit({ type: 'InsertColumns', col: maxCol + 1, count: 1, timestamp: now }),
      },
      {
        label: colCount > 1 ? `Delete ${colCount} Columns` : 'Delete Column',
        action: () => emit({ type: 'DeleteColumns', startCol: minCol, endCol: maxCol, timestamp: now }),
      },
      { separator: true },
      clearItem,
      { separator: true },
      {
        label: 'Column Width...',
        disabled: true,
        action: () => {},
      },
    ];
  }

  // Cell area
  const rowCount = maxRow - minRow + 1;
  const colCount = maxCol - minCol + 1;
  const items: MenuEntry[] = [
    ...clipboardItems,
    { separator: true },
    {
      label: 'Insert Row Above',
      action: () => emit({ type: 'InsertRows', row: minRow, count: 1, timestamp: now }),
    },
    {
      label: 'Insert Row Below',
      action: () => emit({ type: 'InsertRows', row: maxRow + 1, count: 1, timestamp: now }),
    },
    {
      label: 'Insert Column Left',
      action: () => emit({ type: 'InsertColumns', col: minCol, count: 1, timestamp: now }),
    },
    {
      label: 'Insert Column Right',
      action: () => emit({ type: 'InsertColumns', col: maxCol + 1, count: 1, timestamp: now }),
    },
    { separator: true },
    {
      label: rowCount > 1 ? `Delete ${rowCount} Rows` : 'Delete Row',
      action: () => emit({ type: 'DeleteRows', startRow: minRow, endRow: maxRow, timestamp: now }),
    },
    {
      label: colCount > 1 ? `Delete ${colCount} Columns` : 'Delete Column',
      action: () => emit({ type: 'DeleteColumns', startCol: minCol, endCol: maxCol, timestamp: now }),
    },
    { separator: true },
  ];

  // Merge / Unmerge (only when relevant)
  if (isMultiCell) {
    items.push({
      label: 'Merge Cells',
      action: () => emit({ type: 'MergeCells', timestamp: now }),
    });
  }
  if (hasMergedCells) {
    items.push({
      label: 'Unmerge Cells',
      action: () => emit({ type: 'UnmergeCells', timestamp: now }),
    });
  }
  if (isMultiCell || hasMergedCells) {
    items.push({ separator: true });
  }

  items.push(clearItem);
  items.push({ separator: true });
  items.push({
    label: 'Format Cells...',
    action: () => emit({ type: 'ShowFormatDialog', timestamp: now }),
  });

  return items;
}

// =============================================================================
// Estimate menu height for viewport clamping
// =============================================================================

function estimateMenuHeight(items: MenuEntry[]): number {
  let h = 8; // py-1 padding
  for (const entry of items) {
    h += isSeparator(entry) ? SEPARATOR_HEIGHT : MENU_ITEM_HEIGHT;
  }
  return h;
}

/** Get ordered indices of focusable (non-separator, non-disabled) items */
function getFocusableIndices(items: MenuEntry[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i];
    if (!isSeparator(entry) && !entry.disabled) {
      result.push(i);
    }
  }
  return result;
}

// =============================================================================
// Component
// =============================================================================

const ContextMenuInner: React.FC<ContextMenuProps> = ({
  x,
  y,
  target,
  selection,
  isMultiCell,
  hasMergedCells,
  onIntent,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Memoize items — prevents keydown effect from rebinding every render
  const items = useMemo(
    () => buildMenuItems(target, selection, isMultiCell, hasMergedCells, onIntent),
    [target, selection, isMultiCell, hasMergedCells, onIntent],
  );

  // Memoize focusable indices
  const focusableIndices = useMemo(() => getFocusableIndices(items), [items]);

  // --- Viewport clamping (all 4 edges) ---
  const menuHeight = estimateMenuHeight(items);
  const clampedLeft = Math.max(EDGE_MARGIN, Math.min(x, window.innerWidth - MENU_WIDTH - EDGE_MARGIN));
  const clampedTop =
    y + menuHeight > window.innerHeight - EDGE_MARGIN
      ? Math.max(EDGE_MARGIN, y - menuHeight)
      : y;

  // --- Dismiss: click-outside ---
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use setTimeout(0) so a subsequent right-click's contextmenu event lands first,
    // preventing a close → immediate re-open flicker.
    const id = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [onClose]);

  // --- Keyboard: Escape, Arrows, Home, End, Tab ---
  // Runs in capture phase so we intercept before the grid's KeyboardAdapter.
  // Enter/Space are NOT handled here — native <button> click handles them
  // via onClick, which avoids double-firing the action.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
        case 'Tab':
          // Close menu; Tab additionally returns focus to the grid
          e.preventDefault();
          e.stopPropagation();
          onClose();
          return;

        case 'ArrowDown':
        case 'ArrowUp': {
          e.preventDefault();
          e.stopPropagation();
          if (focusableIndices.length === 0) return;

          const active = document.activeElement;
          const currentIdx = itemRefs.current.findIndex((el) => el === active);
          const currentFocusPos = focusableIndices.indexOf(currentIdx);

          let nextPos: number;
          if (currentFocusPos === -1) {
            nextPos = e.key === 'ArrowDown' ? 0 : focusableIndices.length - 1;
          } else if (e.key === 'ArrowDown') {
            nextPos = (currentFocusPos + 1) % focusableIndices.length;
          } else {
            nextPos = (currentFocusPos - 1 + focusableIndices.length) % focusableIndices.length;
          }
          itemRefs.current[focusableIndices[nextPos]]?.focus();
          return;
        }

        // Trap left/right arrows so they don't leak to the grid's KeyboardAdapter
        case 'ArrowLeft':
        case 'ArrowRight':
          e.preventDefault();
          e.stopPropagation();
          return;

        case 'Home': {
          e.preventDefault();
          e.stopPropagation();
          if (focusableIndices.length > 0) {
            itemRefs.current[focusableIndices[0]]?.focus();
          }
          return;
        }

        case 'End': {
          e.preventDefault();
          e.stopPropagation();
          if (focusableIndices.length > 0) {
            itemRefs.current[focusableIndices[focusableIndices.length - 1]]?.focus();
          }
          return;
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [focusableIndices, onClose]);

  // --- Focus first item on mount ---
  useEffect(() => {
    let rafId: number | undefined;
    if (focusableIndices.length > 0) {
      rafId = requestAnimationFrame(() => {
        itemRefs.current[focusableIndices[0]]?.focus();
      });
    }
    return () => { if (rafId !== undefined) cancelAnimationFrame(rafId); };
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleItemClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const idx = Number(e.currentTarget.dataset.idx);
      const entry = items[idx];
      if (!entry || isSeparator(entry) || entry.disabled) return;
      entry.action();
      onClose();
    },
    [items, onClose],
  );

  // Reset refs array length
  itemRefs.current.length = items.length;

  return (
    <div
      ref={menuRef}
      role="menu"
      className="grid-context-menu"
      style={{
        position: 'fixed',
        left: clampedLeft,
        top: clampedTop,
        width: MENU_WIDTH,
      }}
    >
      {items.map((entry, i) => {
        if (isSeparator(entry)) {
          return (
            <div
              key={`sep-${i}`}
              role="separator"
              className="grid-context-menu-separator"
            />
          );
        }
        return (
          <button
            key={`${entry.label}-${i}`}
            ref={(el) => { itemRefs.current[i] = el; }}
            type="button"
            role="menuitem"
            className="grid-context-menu-item"
            disabled={entry.disabled}
            tabIndex={-1}
            data-idx={i}
            onClick={handleItemClick}
          >
            <span>{entry.label}</span>
            {entry.shortcut && (
              <span className="grid-context-menu-shortcut">{entry.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

ContextMenuInner.displayName = 'ContextMenu';

export const ContextMenu = memo(ContextMenuInner);
export default ContextMenu;
