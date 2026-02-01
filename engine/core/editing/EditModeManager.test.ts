/**
 * VectorSheet Engine - EditModeManager Unit Tests
 *
 * Tests Excel-style edit mode state machine.
 * Covers:
 * - Edit lifecycle (start, confirm, cancel)
 * - Mode transitions (Navigate, Edit, Enter, Point)
 * - F2 cycling behavior
 * - Cursor and selection management
 * - Text editing operations
 * - Formula bar integration
 * - Intent handling
 * - Event callbacks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EditModeManager,
  EditState,
  EditModeManagerEvents,
  HandleKeyResult,
} from './EditModeManager.js';
import type {
  NavigateIntent,
  EditIntent,
  TabEnterIntent,
  DeleteIntent,
  ClipboardIntent,
} from '../navigation/KeyboardHandler.js';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a NavigateIntent for testing.
 */
function createNavigateIntent(
  direction: 'up' | 'down' | 'left' | 'right',
  options: { jump?: boolean; extend?: boolean } = {}
): NavigateIntent {
  return {
    type: 'navigate',
    direction,
    jump: options.jump ?? false,
    extend: options.extend ?? false,
  };
}

/**
 * Create an EditIntent for testing.
 */
function createEditIntent(
  action: 'start' | 'confirm' | 'cancel',
  options: { row?: number; col?: number; initialValue?: string } = {}
): EditIntent {
  return {
    type: 'edit',
    action,
    ...options,
  };
}

/**
 * Create a TabEnterIntent for testing.
 */
function createTabEnterIntent(
  key: 'tab' | 'enter',
  reverse: boolean = false
): TabEnterIntent {
  return {
    type: 'tabEnter',
    key,
    reverse,
  };
}

/**
 * Create a DeleteIntent for testing.
 */
function createDeleteIntent(action: 'contents' | 'cells'): DeleteIntent {
  return {
    type: 'delete',
    action,
  };
}

// =============================================================================
// Initial State Tests
// =============================================================================

describe('EditModeManager', () => {
  describe('Initial State', () => {
    let mgr: EditModeManager;

    beforeEach(() => {
      mgr = new EditModeManager();
    });

    it('should start in navigate mode', () => {
      expect(mgr.getMode()).toBe('navigate');
    });

    it('should not be editing initially', () => {
      expect(mgr.isEditing()).toBe(false);
    });

    it('should have null editing cell', () => {
      expect(mgr.getEditingCell()).toBeNull();
    });

    it('should have empty current value', () => {
      expect(mgr.getCurrentValue()).toBe('');
    });

    it('should have cursor at position 0', () => {
      expect(mgr.getCursorPosition()).toBe(0);
    });

    it('should return complete initial state', () => {
      const state = mgr.getState();

      expect(state.mode).toBe('navigate');
      expect(state.isEditing).toBe(false);
      expect(state.editingCell).toBeNull();
      expect(state.originalValue).toBeNull();
      expect(state.currentValue).toBe('');
      expect(state.cursorPosition).toBe(0);
      expect(state.textSelection).toBeNull();
      expect(state.formulaBarFocused).toBe(false);
    });

    it('should return a copy of state (immutable)', () => {
      const state1 = mgr.getState();
      const state2 = mgr.getState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  // ===========================================================================
  // Edit Lifecycle Tests
  // ===========================================================================

  describe('Edit Lifecycle', () => {
    let mgr: EditModeManager;

    beforeEach(() => {
      mgr = new EditModeManager();
    });

    describe('startEditing()', () => {
      it('should start editing in default enter mode', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Hello');

        expect(mgr.isEditing()).toBe(true);
        expect(mgr.getMode()).toBe('enter');
        expect(mgr.getCurrentValue()).toBe('Hello');
      });

      it('should start editing in specified mode', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Test', 'edit');

        expect(mgr.getMode()).toBe('edit');
      });

      it('should store editing cell', () => {
        mgr.startEditing({ row: 5, col: 3 }, 'Value');

        const cell = mgr.getEditingCell();
        expect(cell).toEqual({ row: 5, col: 3 });
      });

      it('should store original value for cancel', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Original');

        const state = mgr.getState();
        expect(state.originalValue).toBe('Original');
      });

      it('should convert number to string', () => {
        mgr.startEditing({ row: 0, col: 0 }, 123);

        expect(mgr.getCurrentValue()).toBe('123');
      });

      it('should convert boolean to string', () => {
        mgr.startEditing({ row: 0, col: 0 }, true);

        expect(mgr.getCurrentValue()).toBe('true');
      });

      it('should handle null value', () => {
        mgr.startEditing({ row: 0, col: 0 }, null);

        expect(mgr.getCurrentValue()).toBe('');
      });

      it('should place cursor at end by default', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Hello');

        expect(mgr.getCursorPosition()).toBe(5);
      });

      it('should select all text by default', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Hello');

        const state = mgr.getState();
        expect(state.textSelection).toEqual({ start: 0, end: 5 });
      });

      it('should replace content when replaceContent is true', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Original', 'enter', true);

        expect(mgr.getCurrentValue()).toBe('');
      });

      it('should use initial char when replaceContent is true', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Original', 'enter', true, 'X');

        expect(mgr.getCurrentValue()).toBe('X');
        expect(mgr.getCursorPosition()).toBe(1);
      });

      it('should clear selection when replaceContent is true', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Original', 'enter', true, 'X');

        const state = mgr.getState();
        expect(state.textSelection).toBeNull();
      });
    });

    describe('endEditing()', () => {
      beforeEach(() => {
        mgr.startEditing({ row: 2, col: 3 }, 'Original');
      });

      it('should return null if not editing', () => {
        const mgr2 = new EditModeManager();
        const result = mgr2.endEditing(true);

        expect(result).toBeNull();
      });

      it('should return committed value when confirmed', () => {
        mgr.setValue('Modified');
        const result = mgr.endEditing(true);

        expect(result).toEqual({
          value: 'Modified',
          cell: { row: 2, col: 3 },
        });
      });

      it('should return null when cancelled', () => {
        mgr.setValue('Modified');
        const result = mgr.endEditing(false);

        expect(result).toBeNull();
      });

      it('should reset to navigate mode', () => {
        mgr.endEditing(true);

        expect(mgr.getMode()).toBe('navigate');
        expect(mgr.isEditing()).toBe(false);
      });

      it('should clear editing cell', () => {
        mgr.endEditing(true);

        expect(mgr.getEditingCell()).toBeNull();
      });

      it('should reset current value', () => {
        mgr.setValue('Modified');
        mgr.endEditing(true);

        expect(mgr.getCurrentValue()).toBe('');
      });
    });

    describe('cancelEditing()', () => {
      it('should cancel editing', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Test');
        mgr.setValue('Changed');
        mgr.cancelEditing();

        expect(mgr.isEditing()).toBe(false);
        expect(mgr.getMode()).toBe('navigate');
      });
    });

    describe('confirmEditing()', () => {
      it('should confirm and return result', () => {
        mgr.startEditing({ row: 1, col: 2 }, 'Test');
        mgr.setValue('Confirmed');
        const result = mgr.confirmEditing();

        expect(result).toEqual({
          value: 'Confirmed',
          cell: { row: 1, col: 2 },
        });
      });
    });
  });

  // ===========================================================================
  // Mode Cycling Tests (F2)
  // ===========================================================================

  describe('Mode Cycling (F2)', () => {
    let mgr: EditModeManager;

    beforeEach(() => {
      mgr = new EditModeManager();
    });

    it('should not cycle when not editing', () => {
      const mode = mgr.cycleMode();

      expect(mode).toBe('navigate');
    });

    describe('Non-formula cycling', () => {
      beforeEach(() => {
        mgr.startEditing({ row: 0, col: 0 }, 'Regular text', 'edit');
      });

      it('should cycle Edit → Enter', () => {
        const mode = mgr.cycleMode();

        expect(mode).toBe('enter');
      });

      it('should cycle Enter → Edit', () => {
        mgr.setMode('enter');
        const mode = mgr.cycleMode();

        expect(mode).toBe('edit');
      });

      it('should complete full cycle', () => {
        expect(mgr.getMode()).toBe('edit');

        mgr.cycleMode(); // Edit → Enter
        expect(mgr.getMode()).toBe('enter');

        mgr.cycleMode(); // Enter → Edit
        expect(mgr.getMode()).toBe('edit');
      });
    });

    describe('Formula cycling', () => {
      beforeEach(() => {
        mgr.startEditing({ row: 0, col: 0 }, '=SUM(A1:A10)', 'edit');
      });

      it('should cycle Edit → Point (for formula)', () => {
        const mode = mgr.cycleMode();

        expect(mode).toBe('point');
      });

      it('should cycle Point → Enter', () => {
        mgr.setMode('point');
        const mode = mgr.cycleMode();

        expect(mode).toBe('enter');
      });

      it('should complete full formula cycle', () => {
        expect(mgr.getMode()).toBe('edit');

        mgr.cycleMode(); // Edit → Point
        expect(mgr.getMode()).toBe('point');

        mgr.cycleMode(); // Point → Enter
        expect(mgr.getMode()).toBe('enter');

        mgr.cycleMode(); // Enter → Edit
        expect(mgr.getMode()).toBe('edit');
      });
    });

    describe('setMode()', () => {
      it('should set mode directly', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Test', 'edit');
        mgr.setMode('point');

        expect(mgr.getMode()).toBe('point');
      });

      it('should not trigger event if mode unchanged', () => {
        const onModeChange = vi.fn();
        mgr.setEventHandlers({ onModeChange });
        mgr.startEditing({ row: 0, col: 0 }, 'Test', 'edit');

        onModeChange.mockClear();
        mgr.setMode('edit'); // Already in edit mode

        expect(onModeChange).not.toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Explicit Mode Transitions
  // ===========================================================================

  describe('Explicit Mode Transitions', () => {
    let mgr: EditModeManager;

    beforeEach(() => {
      mgr = new EditModeManager();
    });

    describe('enterNavigate()', () => {
      it('should cancel editing and return to navigate', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Test');
        mgr.enterNavigate();

        expect(mgr.getMode()).toBe('navigate');
        expect(mgr.isEditing()).toBe(false);
      });

      it('should do nothing if already in navigate', () => {
        mgr.enterNavigate();

        expect(mgr.getMode()).toBe('navigate');
      });
    });

    describe('enterEdit()', () => {
      it('should start editing with provided cell', () => {
        mgr.enterEdit({ row: 5, col: 10 }, 'Initial');

        expect(mgr.isEditing()).toBe(true);
        expect(mgr.getMode()).toBe('edit');
        expect(mgr.getEditingCell()).toEqual({ row: 5, col: 10 });
      });

      it('should switch to edit mode if already editing', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Test', 'enter');
        mgr.enterEdit();

        expect(mgr.getMode()).toBe('edit');
      });

      it('should do nothing if no cell provided and not editing', () => {
        mgr.enterEdit();

        expect(mgr.isEditing()).toBe(false);
      });
    });

    describe('enterPoint()', () => {
      it('should do nothing if not editing', () => {
        mgr.enterPoint();

        expect(mgr.getMode()).toBe('navigate');
      });

      it('should enter point mode when editing', () => {
        mgr.startEditing({ row: 0, col: 0 }, '=', 'edit');
        mgr.enterPoint();

        expect(mgr.getMode()).toBe('point');
      });
    });

    describe('commit()', () => {
      it('should return null if not editing', () => {
        const result = mgr.commit();

        expect(result).toBeNull();
      });

      it('should commit current value', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Test');
        mgr.setValue('Committed');
        const result = mgr.commit();

        expect(result).toEqual({
          value: 'Committed',
          cell: { row: 0, col: 0 },
        });
      });

      it('should commit provided value', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Test');
        const result = mgr.commit('Override');

        expect(result).toEqual({
          value: 'Override',
          cell: { row: 0, col: 0 },
        });
      });
    });

    describe('cancel()', () => {
      it('should cancel editing', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Test');
        mgr.cancel();

        expect(mgr.isEditing()).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Value Updates
  // ===========================================================================

  describe('Value Updates', () => {
    let mgr: EditModeManager;

    beforeEach(() => {
      mgr = new EditModeManager();
      mgr.startEditing({ row: 0, col: 0 }, 'Hello', 'edit');
    });

    describe('setValue()', () => {
      it('should update current value', () => {
        mgr.setValue('World');

        expect(mgr.getCurrentValue()).toBe('World');
      });
    });

    describe('insertText()', () => {
      it('should insert at cursor position', () => {
        mgr.setCursorPosition(2);
        mgr.insertText('XX');

        expect(mgr.getCurrentValue()).toBe('HeXXllo');
        expect(mgr.getCursorPosition()).toBe(4);
      });

      it('should replace selection if present', () => {
        mgr.setTextSelection(1, 4); // Select "ell"
        mgr.insertText('XX');

        expect(mgr.getCurrentValue()).toBe('HXXo');
        expect(mgr.getCursorPosition()).toBe(3);
      });

      it('should clear selection after insert', () => {
        mgr.setTextSelection(1, 3);
        mgr.insertText('X');

        const state = mgr.getState();
        expect(state.textSelection).toBeNull();
      });
    });

    describe('deleteText()', () => {
      it('should delete backward (backspace)', () => {
        mgr.setCursorPosition(3);
        mgr.deleteText('backward');

        expect(mgr.getCurrentValue()).toBe('Helo');
        expect(mgr.getCursorPosition()).toBe(2);
      });

      it('should delete forward (delete key)', () => {
        mgr.setCursorPosition(2);
        mgr.deleteText('forward');

        expect(mgr.getCurrentValue()).toBe('Helo');
        expect(mgr.getCursorPosition()).toBe(2);
      });

      it('should delete multiple characters', () => {
        mgr.setCursorPosition(5);
        mgr.deleteText('backward', 3);

        expect(mgr.getCurrentValue()).toBe('He');
      });

      it('should delete selection', () => {
        mgr.setTextSelection(1, 4); // Select "ell"
        mgr.deleteText('backward');

        expect(mgr.getCurrentValue()).toBe('Ho');
        expect(mgr.getCursorPosition()).toBe(1);
      });

      it('should not go past beginning on backspace', () => {
        mgr.setCursorPosition(0);
        mgr.deleteText('backward', 5);

        expect(mgr.getCurrentValue()).toBe('Hello');
        expect(mgr.getCursorPosition()).toBe(0);
      });
    });
  });

  // ===========================================================================
  // Cursor Management
  // ===========================================================================

  describe('Cursor Management', () => {
    let mgr: EditModeManager;

    beforeEach(() => {
      mgr = new EditModeManager();
      mgr.startEditing({ row: 0, col: 0 }, 'Hello World', 'edit');
    });

    describe('setCursorPosition()', () => {
      it('should set cursor position', () => {
        mgr.setCursorPosition(5);

        expect(mgr.getCursorPosition()).toBe(5);
      });

      it('should clamp to valid range', () => {
        mgr.setCursorPosition(100);

        expect(mgr.getCursorPosition()).toBe(11); // Length of "Hello World"
      });

      it('should clamp negative values', () => {
        mgr.setCursorPosition(-5);

        expect(mgr.getCursorPosition()).toBe(0);
      });

      it('should clear selection', () => {
        mgr.setTextSelection(0, 5);
        mgr.setCursorPosition(3);

        const state = mgr.getState();
        expect(state.textSelection).toBeNull();
      });
    });

    describe('setTextSelection()', () => {
      it('should set text selection', () => {
        mgr.setTextSelection(2, 7);

        const state = mgr.getState();
        expect(state.textSelection).toEqual({ start: 2, end: 7 });
      });

      it('should clamp selection to valid range', () => {
        mgr.setTextSelection(-5, 100);

        const state = mgr.getState();
        expect(state.textSelection).toEqual({ start: 0, end: 11 });
      });

      it('should move cursor to end of selection', () => {
        mgr.setTextSelection(2, 7);

        expect(mgr.getCursorPosition()).toBe(7);
      });
    });

    describe('selectAll()', () => {
      it('should select all text', () => {
        mgr.selectAll();

        const state = mgr.getState();
        expect(state.textSelection).toEqual({ start: 0, end: 11 });
      });
    });

    describe('moveCursor()', () => {
      it('should move cursor by offset', () => {
        mgr.setCursorPosition(5);
        mgr.moveCursor(2);

        expect(mgr.getCursorPosition()).toBe(7);
      });

      it('should move cursor left with negative offset', () => {
        mgr.setCursorPosition(5);
        mgr.moveCursor(-2);

        expect(mgr.getCursorPosition()).toBe(3);
      });

      it('should extend selection when specified', () => {
        mgr.setCursorPosition(3);
        mgr.moveCursor(4, true);

        const state = mgr.getState();
        expect(state.textSelection).toEqual({ start: 3, end: 7 });
      });

      it('should clamp at boundaries', () => {
        mgr.setCursorPosition(10);
        mgr.moveCursor(100);

        expect(mgr.getCursorPosition()).toBe(11);
      });
    });

    describe('moveCursorByWord()', () => {
      it('should move right to next word boundary', () => {
        mgr.setCursorPosition(0);
        mgr.moveCursorByWord('right');

        expect(mgr.getCursorPosition()).toBe(6); // After "Hello "
      });

      it('should move left to previous word boundary', () => {
        mgr.setCursorPosition(8);
        mgr.moveCursorByWord('left');

        expect(mgr.getCursorPosition()).toBe(6); // Start of "World"
      });

      it('should extend selection when specified', () => {
        mgr.setCursorPosition(0);
        mgr.moveCursorByWord('right', true);

        const state = mgr.getState();
        expect(state.textSelection).toEqual({ start: 0, end: 6 });
      });
    });
  });

  // ===========================================================================
  // Point Mode
  // ===========================================================================

  describe('Point Mode', () => {
    let mgr: EditModeManager;

    beforeEach(() => {
      mgr = new EditModeManager();
      mgr.startEditing({ row: 0, col: 0 }, '=SUM(', 'edit');
      mgr.setMode('point');
      mgr.setCursorPosition(5);
    });

    describe('insertCellReference()', () => {
      it('should insert cell reference', () => {
        mgr.insertCellReference('A1');

        expect(mgr.getCurrentValue()).toBe('=SUM(A1');
      });

      it('should do nothing if not in point mode', () => {
        mgr.setMode('edit');
        mgr.insertCellReference('A1');

        expect(mgr.getCurrentValue()).toBe('=SUM(');
      });
    });

    describe('insertRangeReference()', () => {
      it('should insert range reference', () => {
        mgr.insertRangeReference('A1', 'A10');

        expect(mgr.getCurrentValue()).toBe('=SUM(A1:A10');
      });

      it('should do nothing if not in point mode', () => {
        mgr.setMode('edit');
        mgr.insertRangeReference('A1', 'A10');

        expect(mgr.getCurrentValue()).toBe('=SUM(');
      });
    });
  });

  // ===========================================================================
  // Formula Bar Integration
  // ===========================================================================

  describe('Formula Bar Integration', () => {
    let mgr: EditModeManager;

    beforeEach(() => {
      mgr = new EditModeManager();
    });

    it('should track formula bar focus', () => {
      expect(mgr.isFormulaBarFocused()).toBe(false);

      mgr.setFormulaBarFocused(true);
      expect(mgr.isFormulaBarFocused()).toBe(true);

      mgr.setFormulaBarFocused(false);
      expect(mgr.isFormulaBarFocused()).toBe(false);
    });
  });

  // ===========================================================================
  // Utilities
  // ===========================================================================

  describe('Utilities', () => {
    let mgr: EditModeManager;

    beforeEach(() => {
      mgr = new EditModeManager();
    });

    describe('isFormula()', () => {
      it('should return true for formula', () => {
        mgr.startEditing({ row: 0, col: 0 }, '=SUM(A1)');

        expect(mgr.isFormula()).toBe(true);
      });

      it('should return false for regular text', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Hello');

        expect(mgr.isFormula()).toBe(false);
      });

      it('should return false for empty value', () => {
        mgr.startEditing({ row: 0, col: 0 }, '');

        expect(mgr.isFormula()).toBe(false);
      });
    });

    describe('getFormulaExpression()', () => {
      it('should return formula without equals sign', () => {
        mgr.startEditing({ row: 0, col: 0 }, '=SUM(A1:A10)');

        expect(mgr.getFormulaExpression()).toBe('SUM(A1:A10)');
      });

      it('should return null for non-formula', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Hello');

        expect(mgr.getFormulaExpression()).toBeNull();
      });
    });

    describe('shouldStartEditing()', () => {
      it('should return true for printable characters', () => {
        expect(mgr.shouldStartEditing('a')).toBe(true);
        expect(mgr.shouldStartEditing('A')).toBe(true);
        expect(mgr.shouldStartEditing('1')).toBe(true);
        expect(mgr.shouldStartEditing('=')).toBe(true);
        expect(mgr.shouldStartEditing(' ')).toBe(true);
        expect(mgr.shouldStartEditing('!')).toBe(true);
      });

      it('should return false for control characters', () => {
        expect(mgr.shouldStartEditing('Tab')).toBe(false);
        expect(mgr.shouldStartEditing('Enter')).toBe(false);
        expect(mgr.shouldStartEditing('Escape')).toBe(false);
        expect(mgr.shouldStartEditing('ArrowUp')).toBe(false);
      });

      it('should return false for empty string', () => {
        expect(mgr.shouldStartEditing('')).toBe(false);
      });
    });

    describe('expectsCellReference()', () => {
      it('should return true after operator in formula', () => {
        mgr.startEditing({ row: 0, col: 0 }, '=A1+');
        mgr.setCursorPosition(4);

        expect(mgr.expectsCellReference()).toBe(true);
      });

      it('should return true after opening paren', () => {
        mgr.startEditing({ row: 0, col: 0 }, '=SUM(');
        mgr.setCursorPosition(5);

        expect(mgr.expectsCellReference()).toBe(true);
      });

      it('should return true after comma', () => {
        mgr.startEditing({ row: 0, col: 0 }, '=SUM(A1,');
        mgr.setCursorPosition(8);

        expect(mgr.expectsCellReference()).toBe(true);
      });

      it('should return false for non-formula', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Hello');

        expect(mgr.expectsCellReference()).toBe(false);
      });

      it('should return false at position 0', () => {
        mgr.startEditing({ row: 0, col: 0 }, '=SUM(A1)');
        mgr.setCursorPosition(0);

        expect(mgr.expectsCellReference()).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  describe('Event Handlers', () => {
    let mgr: EditModeManager;

    beforeEach(() => {
      mgr = new EditModeManager();
    });

    it('should call onEditStart when editing starts', () => {
      const onEditStart = vi.fn();
      mgr.setEventHandlers({ onEditStart });

      mgr.startEditing({ row: 0, col: 0 }, 'Test');

      expect(onEditStart).toHaveBeenCalledWith({ row: 0, col: 0 }, 'Test');
    });

    it('should call onModeChange when mode changes', () => {
      const onModeChange = vi.fn();
      mgr.setEventHandlers({ onModeChange });

      mgr.startEditing({ row: 0, col: 0 }, 'Test', 'edit');

      expect(onModeChange).toHaveBeenCalledWith('edit', 'navigate');
    });

    it('should call onEditEnd when editing ends', () => {
      const onEditEnd = vi.fn();
      mgr.setEventHandlers({ onEditEnd });
      mgr.startEditing({ row: 0, col: 0 }, 'Test');
      mgr.setValue('Modified');

      mgr.endEditing(true);

      expect(onEditEnd).toHaveBeenCalledWith(true, 'Modified');
    });

    it('should call onCommit when confirmed', () => {
      const onCommit = vi.fn();
      mgr.setEventHandlers({ onCommit });
      mgr.startEditing({ row: 1, col: 2 }, 'Test');
      mgr.setValue('Committed');

      mgr.endEditing(true);

      expect(onCommit).toHaveBeenCalledWith({ row: 1, col: 2 }, 'Committed');
    });

    it('should not call onCommit when cancelled', () => {
      const onCommit = vi.fn();
      mgr.setEventHandlers({ onCommit });
      mgr.startEditing({ row: 0, col: 0 }, 'Test');

      mgr.endEditing(false);

      expect(onCommit).not.toHaveBeenCalled();
    });

    it('should call onValueChange when value changes', () => {
      const onValueChange = vi.fn();
      mgr.setEventHandlers({ onValueChange });
      mgr.startEditing({ row: 0, col: 0 }, 'Test');

      mgr.setValue('New Value');

      expect(onValueChange).toHaveBeenCalledWith('New Value');
    });

    it('should call onCursorChange when cursor moves', () => {
      const onCursorChange = vi.fn();
      mgr.setEventHandlers({ onCursorChange });
      mgr.startEditing({ row: 0, col: 0 }, 'Hello');

      mgr.setCursorPosition(3);

      expect(onCursorChange).toHaveBeenCalledWith(3, null);
    });

    it('should call onInsertReference in point mode', () => {
      const onInsertReference = vi.fn();
      mgr.setEventHandlers({ onInsertReference });
      mgr.startEditing({ row: 0, col: 0 }, '=SUM(', 'edit');
      mgr.setMode('point');
      mgr.setCursorPosition(5);

      mgr.insertCellReference('A1');

      expect(onInsertReference).toHaveBeenCalledWith('A1');
    });

    it('should call onNavigate in point mode for navigation', () => {
      const onNavigate = vi.fn();
      mgr.setEventHandlers({ onNavigate });
      mgr.startEditing({ row: 0, col: 0 }, '=', 'edit');
      mgr.setMode('point');

      const intent = createNavigateIntent('down');
      mgr.handleKey(intent);

      expect(onNavigate).toHaveBeenCalledWith('down', false);
    });

    it('should merge event handlers', () => {
      const onEditStart = vi.fn();
      const onEditEnd = vi.fn();

      mgr.setEventHandlers({ onEditStart });
      mgr.setEventHandlers({ onEditEnd });

      mgr.startEditing({ row: 0, col: 0 }, 'Test');
      expect(onEditStart).toHaveBeenCalled();

      mgr.endEditing(true);
      expect(onEditEnd).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Intent Handling
  // ===========================================================================

  describe('Intent Handling', () => {
    let mgr: EditModeManager;

    beforeEach(() => {
      mgr = new EditModeManager();
    });

    describe('handleKey() - Navigate Intents', () => {
      describe('in Navigate mode', () => {
        it('should not handle navigation (pass through)', () => {
          const intent = createNavigateIntent('down');
          const result = mgr.handleKey(intent);

          expect(result.handled).toBe(false);
        });
      });

      describe('in Edit mode', () => {
        beforeEach(() => {
          mgr.startEditing({ row: 0, col: 0 }, 'Hello', 'edit');
          mgr.setCursorPosition(2);
        });

        it('should move cursor left', () => {
          const intent = createNavigateIntent('left');
          const result = mgr.handleKey(intent);

          expect(result.handled).toBe(true);
          expect(mgr.getCursorPosition()).toBe(1);
        });

        it('should move cursor right', () => {
          const intent = createNavigateIntent('right');
          const result = mgr.handleKey(intent);

          expect(result.handled).toBe(true);
          expect(mgr.getCursorPosition()).toBe(3);
        });

        it('should move by word with Ctrl', () => {
          const intent = createNavigateIntent('right', { jump: true });
          const result = mgr.handleKey(intent);

          expect(result.handled).toBe(true);
          expect(mgr.getCursorPosition()).toBe(5); // End of "Hello"
        });

        it('should extend selection with Shift', () => {
          const intent = createNavigateIntent('right', { extend: true });
          const result = mgr.handleKey(intent);

          expect(result.handled).toBe(true);
          const state = mgr.getState();
          expect(state.textSelection).toEqual({ start: 2, end: 3 });
        });

        it('should not handle up/down (pass through)', () => {
          const intentUp = createNavigateIntent('up');
          const intentDown = createNavigateIntent('down');

          expect(mgr.handleKey(intentUp).handled).toBe(false);
          expect(mgr.handleKey(intentDown).handled).toBe(false);
        });
      });

      describe('in Enter mode', () => {
        beforeEach(() => {
          mgr.startEditing({ row: 0, col: 0 }, 'Hello', 'enter');
        });

        it('should commit and navigate', () => {
          const intent = createNavigateIntent('down');
          const result = mgr.handleKey(intent);

          expect(result.handled).toBe(true);
          expect(result.shouldNavigate).toBe(true);
          expect(result.navigateDirection).toBe('down');
          expect(result.commitResult).toEqual({
            value: 'Hello',
            cell: { row: 0, col: 0 },
          });
        });

        it('should end editing after navigation', () => {
          const intent = createNavigateIntent('right');
          mgr.handleKey(intent);

          expect(mgr.isEditing()).toBe(false);
        });

        it('should include extend flag', () => {
          const intent = createNavigateIntent('down', { extend: true });
          const result = mgr.handleKey(intent);

          expect(result.extendSelection).toBe(true);
        });
      });

      describe('in Point mode', () => {
        beforeEach(() => {
          mgr.startEditing({ row: 0, col: 0 }, '=', 'edit');
          mgr.setMode('point');
        });

        it('should handle navigation and emit event', () => {
          const onNavigate = vi.fn();
          mgr.setEventHandlers({ onNavigate });

          const intent = createNavigateIntent('down');
          const result = mgr.handleKey(intent);

          expect(result.handled).toBe(true);
          expect(onNavigate).toHaveBeenCalledWith('down', false);
        });
      });
    });

    describe('handleKey() - Tab/Enter Intents', () => {
      it('should not handle when not editing', () => {
        const intent = createTabEnterIntent('enter');
        const result = mgr.handleKey(intent);

        expect(result.handled).toBe(false);
      });

      it('should commit and navigate down on Enter', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Test', 'enter');

        const intent = createTabEnterIntent('enter');
        const result = mgr.handleKey(intent);

        expect(result.handled).toBe(true);
        expect(result.shouldNavigate).toBe(true);
        expect(result.navigateDirection).toBe('down');
        expect(result.commitResult?.value).toBe('Test');
      });

      it('should navigate up on Shift+Enter', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Test', 'enter');

        const intent = createTabEnterIntent('enter', true);
        const result = mgr.handleKey(intent);

        expect(result.navigateDirection).toBe('up');
      });

      it('should navigate right on Tab', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Test', 'enter');

        const intent = createTabEnterIntent('tab');
        const result = mgr.handleKey(intent);

        expect(result.navigateDirection).toBe('right');
      });

      it('should navigate left on Shift+Tab', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Test', 'enter');

        const intent = createTabEnterIntent('tab', true);
        const result = mgr.handleKey(intent);

        expect(result.navigateDirection).toBe('left');
      });
    });

    describe('handleKey() - Edit Intents', () => {
      describe('start action', () => {
        it('should start editing if cell provided', () => {
          const intent = createEditIntent('start', { row: 0, col: 0, initialValue: 'Test' });
          const result = mgr.handleKey(intent);

          expect(result.handled).toBe(true);
          expect(mgr.isEditing()).toBe(true);
          expect(mgr.getMode()).toBe('edit');
        });

        it('should not start if no cell provided', () => {
          const intent = createEditIntent('start');
          const result = mgr.handleKey(intent);

          expect(result.handled).toBe(false);
          expect(mgr.isEditing()).toBe(false);
        });

        it('should cycle mode if already editing (F2)', () => {
          mgr.startEditing({ row: 0, col: 0 }, 'Test', 'edit');

          const intent = createEditIntent('start');
          const result = mgr.handleKey(intent);

          expect(result.handled).toBe(true);
          expect(mgr.getMode()).toBe('enter'); // Cycled from edit to enter
        });
      });

      describe('confirm action', () => {
        it('should confirm editing', () => {
          mgr.startEditing({ row: 0, col: 0 }, 'Test');

          const intent = createEditIntent('confirm');
          const result = mgr.handleKey(intent);

          expect(result.handled).toBe(true);
          expect(result.commitResult).toBeDefined();
          expect(mgr.isEditing()).toBe(false);
        });

        it('should not handle if not editing', () => {
          const intent = createEditIntent('confirm');
          const result = mgr.handleKey(intent);

          expect(result.handled).toBe(false);
        });
      });

      describe('cancel action', () => {
        it('should cancel editing', () => {
          mgr.startEditing({ row: 0, col: 0 }, 'Test');

          const intent = createEditIntent('cancel');
          const result = mgr.handleKey(intent);

          expect(result.handled).toBe(true);
          expect(mgr.isEditing()).toBe(false);
        });
      });
    });

    describe('handleKey() - Escape Intent', () => {
      it('should cancel editing', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Test');

        const result = mgr.handleKey({ type: 'escape' });

        expect(result.handled).toBe(true);
        expect(mgr.isEditing()).toBe(false);
      });

      it('should not handle if not editing', () => {
        const result = mgr.handleKey({ type: 'escape' });

        expect(result.handled).toBe(false);
      });
    });

    describe('handleKey() - Delete Intent', () => {
      it('should not handle if not editing', () => {
        const intent = createDeleteIntent('contents');
        const result = mgr.handleKey(intent);

        expect(result.handled).toBe(false);
      });

      it('should delete text when editing', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Hello', 'edit');
        mgr.setCursorPosition(5);

        const intent = createDeleteIntent('contents');
        const result = mgr.handleKey(intent);

        expect(result.handled).toBe(true);
        expect(mgr.getCurrentValue()).toBe('Hell');
      });
    });

    describe('handleKey() - Clipboard Intent', () => {
      it('should not handle if not editing', () => {
        const intent: ClipboardIntent = { type: 'clipboard', action: 'copy' };
        const result = mgr.handleKey(intent);

        expect(result.handled).toBe(false);
      });

      it('should not handle in edit mode (text editor handles)', () => {
        mgr.startEditing({ row: 0, col: 0 }, 'Test');

        const intent: ClipboardIntent = { type: 'clipboard', action: 'copy' };
        const result = mgr.handleKey(intent);

        // Currently not handled - actual clipboard is handled by text input
        expect(result.handled).toBe(false);
      });
    });

    describe('handleKey() - Unknown Intent', () => {
      it('should not handle unknown intent types', () => {
        const result = mgr.handleKey({ type: 'unknown' } as any);

        expect(result.handled).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    let mgr: EditModeManager;

    beforeEach(() => {
      mgr = new EditModeManager();
    });

    it('should handle editing same cell multiple times', () => {
      mgr.startEditing({ row: 0, col: 0 }, 'First');
      mgr.endEditing(true);

      mgr.startEditing({ row: 0, col: 0 }, 'Second');

      expect(mgr.getCurrentValue()).toBe('Second');
    });

    it('should handle empty string editing', () => {
      mgr.startEditing({ row: 0, col: 0 }, '');

      expect(mgr.getCurrentValue()).toBe('');
      expect(mgr.getCursorPosition()).toBe(0);
    });

    it('should handle very long text', () => {
      const longText = 'A'.repeat(10000);
      mgr.startEditing({ row: 0, col: 0 }, longText);

      expect(mgr.getCurrentValue().length).toBe(10000);
      expect(mgr.getCursorPosition()).toBe(10000);
    });

    it('should handle special characters', () => {
      mgr.startEditing({ row: 0, col: 0 }, 'Test\nWith\tSpecial\r\nChars');

      expect(mgr.getCurrentValue()).toBe('Test\nWith\tSpecial\r\nChars');
    });

    it('should handle unicode text', () => {
      const unicode = '你好世界 🌍 Ελληνικά';
      mgr.startEditing({ row: 0, col: 0 }, unicode);

      expect(mgr.getCurrentValue()).toBe(unicode);
    });

    it('should handle rapid mode changes', () => {
      mgr.startEditing({ row: 0, col: 0 }, '=SUM(A1)', 'edit');

      for (let i = 0; i < 10; i++) {
        mgr.cycleMode();
      }

      // Should be in a valid mode
      expect(['edit', 'enter', 'point']).toContain(mgr.getMode());
    });

    it('should handle editing cell at max bounds', () => {
      mgr.startEditing({ row: 999999, col: 999999 }, 'Test');

      const cell = mgr.getEditingCell();
      expect(cell).toEqual({ row: 999999, col: 999999 });
    });
  });
});
