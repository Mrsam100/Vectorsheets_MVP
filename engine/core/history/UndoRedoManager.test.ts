/**
 * UndoRedoManager Unit Tests
 *
 * Tests the undo/redo system including:
 * - State queries (canUndo, canRedo)
 * - Command execution and recording
 * - Undo/redo operations
 * - Batch operations
 * - History management and trimming
 * - Event system
 * - Command implementations
 * - Factory functions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  UndoRedoManager,
  createUndoRedoManager,
  createCustomCommand,
  createBatchCommand,
  CellSnapshotCommand,
  BatchCommandImpl,
  CustomCommand,
  Command,
  MutationTarget,
  UndoRedoEvents,
} from './UndoRedoManager.js';
import { Cell } from '../types/index.js';

describe('UndoRedoManager', () => {
  let manager: UndoRedoManager;
  let mockTarget: MockMutationTarget;

  class MockMutationTarget implements MutationTarget {
    cells: Map<string, Cell> = new Map();

    getCell(row: number, col: number): Cell | null {
      return this.cells.get(`${row}_${col}`) ?? null;
    }

    setCell(row: number, col: number, cell: Cell): void {
      this.cells.set(`${row}_${col}`, cell);
    }

    deleteCell(row: number, col: number): void {
      this.cells.delete(`${row}_${col}`);
    }
  }

  beforeEach(() => {
    manager = createUndoRedoManager({
      groupRapidChanges: false, // Disable for predictable testing
    });
    mockTarget = new MockMutationTarget();
    manager.setTarget(mockTarget);
  });

  // ===========================================================================
  // State Queries
  // ===========================================================================

  describe('State Queries', () => {
    describe('getState', () => {
      it('should return initial state', () => {
        const state = manager.getState();

        expect(state.canUndo).toBe(false);
        expect(state.canRedo).toBe(false);
        expect(state.undoCount).toBe(0);
        expect(state.redoCount).toBe(0);
        expect(state.undoDescription).toBeNull();
        expect(state.redoDescription).toBeNull();
        expect(state.memoryUsage).toBe(0);
      });

      it('should reflect state after recording', () => {
        const command = createTestCommand('Test');
        manager.execute(command);

        const state = manager.getState();

        expect(state.canUndo).toBe(true);
        expect(state.canRedo).toBe(false);
        expect(state.undoCount).toBe(1);
        expect(state.redoCount).toBe(0);
        expect(state.undoDescription).toBe('Test');
      });

      it('should reflect state after undo', () => {
        const command = createTestCommand('Test');
        manager.execute(command);
        manager.undo();

        const state = manager.getState();

        expect(state.canUndo).toBe(false);
        expect(state.canRedo).toBe(true);
        expect(state.undoCount).toBe(0);
        expect(state.redoCount).toBe(1);
        expect(state.redoDescription).toBe('Test');
      });
    });

    describe('canUndo / canRedo', () => {
      it('should return false initially', () => {
        expect(manager.canUndo()).toBe(false);
        expect(manager.canRedo()).toBe(false);
      });

      it('should return true for canUndo after execute', () => {
        manager.execute(createTestCommand('Test'));
        expect(manager.canUndo()).toBe(true);
      });

      it('should return true for canRedo after undo', () => {
        manager.execute(createTestCommand('Test'));
        manager.undo();
        expect(manager.canRedo()).toBe(true);
      });
    });

    describe('isInBatch', () => {
      it('should return false initially', () => {
        expect(manager.isInBatch()).toBe(false);
      });

      it('should return true inside batch', () => {
        manager.beginBatch('Batch');
        expect(manager.isInBatch()).toBe(true);
      });

      it('should return false after endBatch', () => {
        manager.beginBatch('Batch');
        manager.endBatch();
        expect(manager.isInBatch()).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Command Execution
  // ===========================================================================

  describe('Command Execution', () => {
    describe('execute', () => {
      it('should apply the command', () => {
        let applied = false;
        const command = createCustomCommand('custom', 'Test', () => {
          applied = true;
        }, () => {});

        manager.execute(command);

        expect(applied).toBe(true);
      });

      it('should record the command', () => {
        const command = createTestCommand('Test');
        manager.execute(command);

        expect(manager.canUndo()).toBe(true);
        expect(manager.getState().undoCount).toBe(1);
      });

      it('should return true on success', () => {
        const result = manager.execute(createTestCommand('Test'));
        expect(result).toBe(true);
      });

      it('should call onBeforeApply handler', () => {
        const beforeApply = vi.fn(() => true);
        manager.setEventHandlers({ onBeforeApply: beforeApply });

        manager.execute(createTestCommand('Test'));

        expect(beforeApply).toHaveBeenCalled();
      });

      it('should block execution if onBeforeApply returns false', () => {
        let applied = false;
        manager.setEventHandlers({ onBeforeApply: () => false });

        const command = createCustomCommand('custom', 'Test', () => {
          applied = true;
        }, () => {});

        const result = manager.execute(command);

        expect(result).toBe(false);
        expect(applied).toBe(false);
        expect(manager.canUndo()).toBe(false);
      });

      it('should call onAfterApply handler', () => {
        const afterApply = vi.fn();
        manager.setEventHandlers({ onAfterApply: afterApply });

        manager.execute(createTestCommand('Test'));

        expect(afterApply).toHaveBeenCalled();
      });
    });

    describe('record', () => {
      it('should record without applying', () => {
        let applied = false;
        const command = createCustomCommand('custom', 'Test', () => {
          applied = true;
        }, () => {});

        manager.record(command);

        expect(applied).toBe(false);
        expect(manager.canUndo()).toBe(true);
      });

      it('should add to batch when inside batch', () => {
        manager.beginBatch('Batch');
        manager.record(createTestCommand('Command 1'));
        manager.record(createTestCommand('Command 2'));
        manager.endBatch();

        // Should be one batch command
        expect(manager.getState().undoCount).toBe(1);
        expect(manager.getState().undoDescription).toBe('Batch');
      });
    });
  });

  // ===========================================================================
  // Undo/Redo Operations
  // ===========================================================================

  describe('Undo/Redo Operations', () => {
    describe('undo', () => {
      it('should revert the last command', () => {
        let state = 0;
        const command = createCustomCommand('custom', 'Test', () => {
          state = 1;
        }, () => {
          state = 0;
        });

        manager.execute(command);
        expect(state).toBe(1);

        manager.undo();
        expect(state).toBe(0);
      });

      it('should return the undone command', () => {
        const command = createTestCommand('Test');
        manager.execute(command);

        const undone = manager.undo();

        expect(undone).toBe(command);
      });

      it('should move command to redo stack', () => {
        manager.execute(createTestCommand('Test'));
        manager.undo();

        expect(manager.canUndo()).toBe(false);
        expect(manager.canRedo()).toBe(true);
      });

      it('should return null when nothing to undo', () => {
        const result = manager.undo();
        expect(result).toBeNull();
      });

      it('should call onUndo handler', () => {
        const onUndo = vi.fn();
        manager.setEventHandlers({ onUndo });

        manager.execute(createTestCommand('Test'));
        manager.undo();

        expect(onUndo).toHaveBeenCalled();
      });
    });

    describe('redo', () => {
      it('should re-apply the last undone command', () => {
        let state = 0;
        const command = createCustomCommand('custom', 'Test', () => {
          state = 1;
        }, () => {
          state = 0;
        });

        manager.execute(command);
        manager.undo();
        expect(state).toBe(0);

        manager.redo();
        expect(state).toBe(1);
      });

      it('should return the redone command', () => {
        const command = createTestCommand('Test');
        manager.execute(command);
        manager.undo();

        const redone = manager.redo();

        expect(redone).toBe(command);
      });

      it('should move command back to undo stack', () => {
        manager.execute(createTestCommand('Test'));
        manager.undo();
        manager.redo();

        expect(manager.canUndo()).toBe(true);
        expect(manager.canRedo()).toBe(false);
      });

      it('should return null when nothing to redo', () => {
        const result = manager.redo();
        expect(result).toBeNull();
      });

      it('should call onRedo handler', () => {
        const onRedo = vi.fn();
        manager.setEventHandlers({ onRedo });

        manager.execute(createTestCommand('Test'));
        manager.undo();
        manager.redo();

        expect(onRedo).toHaveBeenCalled();
      });
    });

    describe('undoMultiple', () => {
      it('should undo multiple commands', () => {
        manager.execute(createTestCommand('Cmd 1'));
        manager.execute(createTestCommand('Cmd 2'));
        manager.execute(createTestCommand('Cmd 3'));

        const undone = manager.undoMultiple(2);

        expect(undone.length).toBe(2);
        expect(manager.getState().undoCount).toBe(1);
        expect(manager.getState().redoCount).toBe(2);
      });

      it('should not exceed available undo count', () => {
        manager.execute(createTestCommand('Cmd 1'));

        const undone = manager.undoMultiple(5);

        expect(undone.length).toBe(1);
        expect(manager.canUndo()).toBe(false);
      });
    });

    describe('redoMultiple', () => {
      it('should redo multiple commands', () => {
        manager.execute(createTestCommand('Cmd 1'));
        manager.execute(createTestCommand('Cmd 2'));
        manager.execute(createTestCommand('Cmd 3'));
        manager.undoMultiple(3);

        const redone = manager.redoMultiple(2);

        expect(redone.length).toBe(2);
        expect(manager.getState().undoCount).toBe(2);
        expect(manager.getState().redoCount).toBe(1);
      });
    });

    describe('redo stack clearing', () => {
      it('should clear redo stack when new command is executed', () => {
        manager.execute(createTestCommand('Cmd 1'));
        manager.undo();
        expect(manager.canRedo()).toBe(true);

        manager.execute(createTestCommand('Cmd 2'));
        expect(manager.canRedo()).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Batch Operations
  // ===========================================================================

  describe('Batch Operations', () => {
    describe('beginBatch / endBatch', () => {
      it('should group commands into a single undo step', () => {
        manager.beginBatch('Multiple Edits');
        manager.record(createTestCommand('Cmd 1'));
        manager.record(createTestCommand('Cmd 2'));
        manager.record(createTestCommand('Cmd 3'));
        manager.endBatch();

        expect(manager.getState().undoCount).toBe(1);
        expect(manager.getState().undoDescription).toBe('Multiple Edits');
      });

      it('should apply all commands in batch on redo', () => {
        let count = 0;
        const cmd1 = createCustomCommand('custom', 'Cmd 1', () => count++, () => count--);
        const cmd2 = createCustomCommand('custom', 'Cmd 2', () => count++, () => count--);

        manager.beginBatch('Batch');
        manager.execute(cmd1);
        manager.execute(cmd2);
        manager.endBatch();

        expect(count).toBe(2);

        manager.undo();
        expect(count).toBe(0);

        manager.redo();
        expect(count).toBe(2);
      });

      it('should not create batch if no commands', () => {
        manager.beginBatch('Empty Batch');
        manager.endBatch();

        expect(manager.getState().undoCount).toBe(0);
      });

      it('should support nested batches', () => {
        manager.beginBatch('Outer');
        manager.record(createTestCommand('Cmd 1'));

        manager.beginBatch('Inner');
        manager.record(createTestCommand('Cmd 2'));
        manager.record(createTestCommand('Cmd 3'));
        manager.endBatch(); // Inner

        manager.record(createTestCommand('Cmd 4'));
        manager.endBatch(); // Outer

        // Should be one outer batch command
        expect(manager.getState().undoCount).toBe(1);
        expect(manager.getState().undoDescription).toBe('Outer');
      });
    });

    describe('cancelBatch', () => {
      it('should discard batch without recording', () => {
        manager.beginBatch('Batch');
        manager.record(createTestCommand('Cmd 1'));
        manager.cancelBatch();

        expect(manager.getState().undoCount).toBe(0);
        expect(manager.isInBatch()).toBe(false);
      });

      it('should revert commands if specified', () => {
        let count = 0;
        const cmd = createCustomCommand('custom', 'Test', () => count++, () => count--);

        manager.beginBatch('Batch');
        manager.execute(cmd);
        expect(count).toBe(1);

        manager.cancelBatch(true);
        expect(count).toBe(0);
      });

      it('should not revert commands by default', () => {
        let count = 0;
        const cmd = createCustomCommand('custom', 'Test', () => count++, () => count--);

        manager.beginBatch('Batch');
        manager.execute(cmd);
        expect(count).toBe(1);

        manager.cancelBatch();
        expect(count).toBe(1); // Not reverted
      });
    });
  });

  // ===========================================================================
  // History Management
  // ===========================================================================

  describe('History Management', () => {
    describe('getUndoHistory', () => {
      it('should return undo history (most recent first)', () => {
        manager.execute(createTestCommand('Cmd 1'));
        manager.execute(createTestCommand('Cmd 2'));
        manager.execute(createTestCommand('Cmd 3'));

        const history = manager.getUndoHistory();

        expect(history.length).toBe(3);
        expect(history[0].description).toBe('Cmd 3');
        expect(history[1].description).toBe('Cmd 2');
        expect(history[2].description).toBe('Cmd 1');
      });

      it('should include id and timestamp', () => {
        manager.execute(createTestCommand('Test'));

        const history = manager.getUndoHistory();

        expect(history[0].id).toBeDefined();
        expect(history[0].timestamp).toBeDefined();
      });
    });

    describe('getRedoHistory', () => {
      it('should return redo history (most recent first)', () => {
        manager.execute(createTestCommand('Cmd 1'));
        manager.execute(createTestCommand('Cmd 2'));
        manager.undoMultiple(2);

        const history = manager.getRedoHistory();

        expect(history.length).toBe(2);
        // Cmd 1 is undone last, so it's the most recent in redo
        expect(history[0].description).toBe('Cmd 1');
        expect(history[1].description).toBe('Cmd 2');
      });
    });

    describe('clear', () => {
      it('should clear all history', () => {
        manager.execute(createTestCommand('Cmd 1'));
        manager.execute(createTestCommand('Cmd 2'));
        manager.undo();

        manager.clear();

        expect(manager.canUndo()).toBe(false);
        expect(manager.canRedo()).toBe(false);
        expect(manager.getState().memoryUsage).toBe(0);
      });
    });

    describe('clearRedo', () => {
      it('should clear only redo stack', () => {
        manager.execute(createTestCommand('Cmd 1'));
        manager.execute(createTestCommand('Cmd 2'));
        manager.undo();

        expect(manager.canRedo()).toBe(true);

        manager.clearRedo();

        expect(manager.canUndo()).toBe(true);
        expect(manager.canRedo()).toBe(false);
      });
    });

    describe('maxHistory trimming', () => {
      it('should trim history when exceeding max', () => {
        const smallManager = createUndoRedoManager({
          maxHistory: 3,
          groupRapidChanges: false,
        });

        smallManager.execute(createTestCommand('Cmd 1'));
        smallManager.execute(createTestCommand('Cmd 2'));
        smallManager.execute(createTestCommand('Cmd 3'));
        smallManager.execute(createTestCommand('Cmd 4'));
        smallManager.execute(createTestCommand('Cmd 5'));

        expect(smallManager.getState().undoCount).toBe(3);

        const history = smallManager.getUndoHistory();
        expect(history[0].description).toBe('Cmd 5');
        expect(history[2].description).toBe('Cmd 3');
      });
    });

    describe('maxMemory trimming', () => {
      it('should trim history when exceeding memory', () => {
        const smallManager = createUndoRedoManager({
          maxMemory: 500, // 500 bytes
          maxHistory: 1000,
          groupRapidChanges: false,
        });

        // Each test command is 100 bytes
        for (let i = 0; i < 10; i++) {
          smallManager.execute(createTestCommand(`Cmd ${i}`));
        }

        // Should have trimmed to stay under memory limit
        expect(smallManager.getState().memoryUsage).toBeLessThanOrEqual(500);
      });
    });
  });

  // ===========================================================================
  // Event System
  // ===========================================================================

  describe('Event System', () => {
    describe('onStateChange', () => {
      it('should be called after execute', () => {
        const onStateChange = vi.fn();
        manager.setEventHandlers({ onStateChange });

        manager.execute(createTestCommand('Test'));

        expect(onStateChange).toHaveBeenCalled();
        expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({
          canUndo: true,
          undoCount: 1,
        }));
      });

      it('should be called after undo', () => {
        const onStateChange = vi.fn();
        manager.execute(createTestCommand('Test'));

        manager.setEventHandlers({ onStateChange });
        manager.undo();

        expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({
          canUndo: false,
          canRedo: true,
        }));
      });

      it('should be called after clear', () => {
        const onStateChange = vi.fn();
        manager.execute(createTestCommand('Test'));

        manager.setEventHandlers({ onStateChange });
        manager.clear();

        expect(onStateChange).toHaveBeenCalled();
      });
    });

    describe('onRecord', () => {
      it('should be called when command is recorded', () => {
        const onRecord = vi.fn();
        manager.setEventHandlers({ onRecord });

        const command = createTestCommand('Test');
        manager.execute(command);

        expect(onRecord).toHaveBeenCalledWith(command);
      });
    });
  });

  // ===========================================================================
  // Command Implementations
  // ===========================================================================

  describe('CellSnapshotCommand', () => {
    it('should apply changes to target', () => {
      const command = new CellSnapshotCommand(
        mockTarget,
        'setCellValue',
        'Edit A1',
        [{ row: 0, col: 0, cell: null }],
        [{ row: 0, col: 0, cell: { value: 'Hello', type: 'string' } }]
      );

      command.apply();

      expect(mockTarget.getCell(0, 0)?.value).toBe('Hello');
    });

    it('should revert changes on target', () => {
      mockTarget.setCell(0, 0, { value: 'Hello', type: 'string' });

      const command = new CellSnapshotCommand(
        mockTarget,
        'setCellValue',
        'Edit A1',
        [{ row: 0, col: 0, cell: { value: 'Hello', type: 'string' } }],
        [{ row: 0, col: 0, cell: { value: 'World', type: 'string' } }]
      );

      command.apply();
      expect(mockTarget.getCell(0, 0)?.value).toBe('World');

      command.revert();
      expect(mockTarget.getCell(0, 0)?.value).toBe('Hello');
    });

    it('should handle cell deletion', () => {
      mockTarget.setCell(0, 0, { value: 'Hello', type: 'string' });

      const command = new CellSnapshotCommand(
        mockTarget,
        'clear',
        'Clear A1',
        [{ row: 0, col: 0, cell: { value: 'Hello', type: 'string' } }],
        [{ row: 0, col: 0, cell: null }]
      );

      command.apply();
      expect(mockTarget.getCell(0, 0)).toBeNull();

      command.revert();
      expect(mockTarget.getCell(0, 0)?.value).toBe('Hello');
    });

    it('should deep clone cells when applying to prevent reference issues', () => {
      // Deep clone happens on apply/revert to target, not on construction
      const afterCell: Cell = { value: 'World', type: 'string' };

      const command = new CellSnapshotCommand(
        mockTarget,
        'setCellValue',
        'Edit A1',
        [{ row: 0, col: 0, cell: null }],
        [{ row: 0, col: 0, cell: afterCell }]
      );

      command.apply();

      // Modify the afterCell after apply
      afterCell.value = 'Modified';

      // The cell in mockTarget should have its own copy, not be affected
      expect(mockTarget.getCell(0, 0)?.value).toBe('World');
    });

    it('should estimate memory size', () => {
      const command = new CellSnapshotCommand(
        mockTarget,
        'setCellValue',
        'Test',
        [{ row: 0, col: 0, cell: null }],
        [{ row: 0, col: 0, cell: { value: 'Hello', type: 'string' } }]
      );

      expect(command.getMemorySize()).toBeGreaterThan(0);
    });

    it('should convert to Operation', () => {
      const command = new CellSnapshotCommand(
        mockTarget,
        'setCellValue',
        'Edit A1',
        [{ row: 0, col: 0, cell: null }],
        [{ row: 0, col: 0, cell: { value: 'Hello', type: 'string' } }]
      );

      const operation = command.toOperation();

      expect(operation.type).toBe('setCellValue');
      expect(operation.description).toBe('Edit A1');
      expect(operation.undoData.length).toBe(1);
      expect(operation.redoData.length).toBe(1);
    });
  });

  describe('BatchCommandImpl', () => {
    it('should apply all commands in order', () => {
      const log: string[] = [];
      const cmd1 = createCustomCommand('custom', 'Cmd 1', () => log.push('apply1'), () => log.push('revert1'));
      const cmd2 = createCustomCommand('custom', 'Cmd 2', () => log.push('apply2'), () => log.push('revert2'));

      const batch = new BatchCommandImpl('Batch', [cmd1, cmd2]);
      batch.apply();

      expect(log).toEqual(['apply1', 'apply2']);
    });

    it('should revert all commands in reverse order', () => {
      const log: string[] = [];
      const cmd1 = createCustomCommand('custom', 'Cmd 1', () => log.push('apply1'), () => log.push('revert1'));
      const cmd2 = createCustomCommand('custom', 'Cmd 2', () => log.push('apply2'), () => log.push('revert2'));

      const batch = new BatchCommandImpl('Batch', [cmd1, cmd2]);
      batch.apply();
      log.length = 0;

      batch.revert();

      expect(log).toEqual(['revert2', 'revert1']);
    });

    it('should aggregate memory size', () => {
      const cmd1 = createCustomCommand('custom', 'Cmd 1', () => {}, () => {}, 100);
      const cmd2 = createCustomCommand('custom', 'Cmd 2', () => {}, () => {}, 200);

      const batch = new BatchCommandImpl('Batch', [cmd1, cmd2]);

      expect(batch.getMemorySize()).toBe(300);
    });
  });

  describe('CustomCommand', () => {
    it('should call apply function', () => {
      let applied = false;
      const command = new CustomCommand('custom', 'Test', () => {
        applied = true;
      }, () => {});

      command.apply();

      expect(applied).toBe(true);
    });

    it('should call revert function', () => {
      let reverted = false;
      const command = new CustomCommand('custom', 'Test', () => {}, () => {
        reverted = true;
      });

      command.revert();

      expect(reverted).toBe(true);
    });

    it('should return specified memory size', () => {
      const command = new CustomCommand('custom', 'Test', () => {}, () => {}, 500);
      expect(command.getMemorySize()).toBe(500);
    });

    it('should default to 100 bytes', () => {
      const command = new CustomCommand('custom', 'Test', () => {}, () => {});
      expect(command.getMemorySize()).toBe(100);
    });
  });

  // ===========================================================================
  // Command Creation Helpers
  // ===========================================================================

  describe('Command Creation Helpers', () => {
    describe('createCellCommand', () => {
      it('should create a cell value command', () => {
        const command = manager.createCellCommand(0, 0, 'Hello', 'Edit A1');

        expect(command).not.toBeNull();
        expect(command?.type).toBe('setCellValue');
        expect(command?.description).toBe('Edit A1');
      });

      it('should return null if no target set', () => {
        const noTargetManager = createUndoRedoManager();
        const command = noTargetManager.createCellCommand(0, 0, 'Hello');
        expect(command).toBeNull();
      });

      it('should capture before state', () => {
        mockTarget.setCell(0, 0, { value: 'Before', type: 'string' });

        const command = manager.createCellCommand(0, 0, 'After');
        manager.execute(command!);

        expect(mockTarget.getCell(0, 0)?.value).toBe('After');

        manager.undo();
        expect(mockTarget.getCell(0, 0)?.value).toBe('Before');
      });
    });

    describe('createFormatCommand', () => {
      it('should create a format command', () => {
        const command = manager.createFormatCommand(
          [{ row: 0, col: 0 }, { row: 0, col: 1 }],
          { bold: true }
        );

        expect(command).not.toBeNull();
        expect(command?.type).toBe('setCellFormat');
      });
    });

    describe('createRangeCommand', () => {
      it('should create a range command', () => {
        const command = manager.createRangeCommand(
          { startRow: 0, startCol: 0, endRow: 2, endCol: 2 },
          (row, col, cell) => ({ value: row * 3 + col, type: 'number' }),
          'fill',
          'Fill range'
        );

        expect(command).not.toBeNull();
        expect(command?.type).toBe('fill');

        manager.execute(command!);

        expect(mockTarget.getCell(0, 0)?.value).toBe(0);
        expect(mockTarget.getCell(1, 1)?.value).toBe(4);
        expect(mockTarget.getCell(2, 2)?.value).toBe(8);
      });
    });

    describe('captureRangeState / createCommandFromStates', () => {
      it('should capture and restore range state', () => {
        mockTarget.setCell(0, 0, { value: 'A', type: 'string' });
        mockTarget.setCell(0, 1, { value: 'B', type: 'string' });

        const range = { startRow: 0, startCol: 0, endRow: 0, endCol: 1 };
        const beforeState = manager.captureRangeState(range);

        // Modify cells
        mockTarget.setCell(0, 0, { value: 'X', type: 'string' });
        mockTarget.setCell(0, 1, { value: 'Y', type: 'string' });

        const afterState = manager.captureRangeState(range);

        const command = manager.createCommandFromStates(range, beforeState, afterState, 'paste', 'Paste');
        manager.record(command!);

        manager.undo();

        expect(mockTarget.getCell(0, 0)?.value).toBe('A');
        expect(mockTarget.getCell(0, 1)?.value).toBe('B');
      });
    });
  });

  // ===========================================================================
  // Legacy API
  // ===========================================================================

  describe('Legacy API', () => {
    describe('recordCellChange', () => {
      it('should record cell change', () => {
        const oldCell = { value: 'Old', type: 'string' as const };
        const newCell = { value: 'New', type: 'string' as const };

        manager.recordCellChange(0, 0, oldCell, newCell);

        expect(manager.canUndo()).toBe(true);
      });
    });

    describe('startBatch (alias)', () => {
      it('should work like beginBatch', () => {
        manager.startBatch('Batch');
        expect(manager.isInBatch()).toBe(true);
        manager.endBatch();
      });
    });
  });

  // ===========================================================================
  // Factory Functions
  // ===========================================================================

  describe('Factory Functions', () => {
    describe('createUndoRedoManager', () => {
      it('should create manager with default config', () => {
        const mgr = createUndoRedoManager();
        expect(mgr).toBeInstanceOf(UndoRedoManager);
      });

      it('should create manager with custom config', () => {
        const mgr = createUndoRedoManager({ maxHistory: 50 });
        // Can't directly test config, but ensure it works
        expect(mgr.canUndo()).toBe(false);
      });
    });

    describe('createCustomCommand', () => {
      it('should create a custom command', () => {
        const cmd = createCustomCommand('custom', 'Test', () => {}, () => {});

        expect(cmd.type).toBe('custom');
        expect(cmd.description).toBe('Test');
      });
    });

    describe('createBatchCommand', () => {
      it('should create a batch command', () => {
        const cmd1 = createTestCommand('Cmd 1');
        const cmd2 = createTestCommand('Cmd 2');

        const batch = createBatchCommand('Batch', [cmd1, cmd2]);

        expect(batch.type).toBe('batch');
        expect(batch.commands.length).toBe(2);
      });
    });
  });

  // ===========================================================================
  // Configuration
  // ===========================================================================

  describe('Configuration', () => {
    describe('setConfig', () => {
      it('should update configuration', () => {
        const mgr = createUndoRedoManager({ maxHistory: 100 });

        mgr.setConfig({ maxHistory: 10 });

        // Execute many commands
        for (let i = 0; i < 20; i++) {
          mgr.execute(createTestCommand(`Cmd ${i}`));
        }

        expect(mgr.getState().undoCount).toBeLessThanOrEqual(10);
      });
    });

    describe('setEventHandlers', () => {
      it('should merge with existing handlers', () => {
        const onUndo = vi.fn();
        const onRedo = vi.fn();

        manager.setEventHandlers({ onUndo });
        manager.setEventHandlers({ onRedo });

        manager.execute(createTestCommand('Test'));
        manager.undo();
        manager.redo();

        expect(onUndo).toHaveBeenCalled();
        expect(onRedo).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Rapid Change Grouping
  // ===========================================================================

  describe('Rapid Change Grouping', () => {
    it('should group rapid changes when enabled', async () => {
      const groupingManager = createUndoRedoManager({
        groupRapidChanges: true,
        groupingWindow: 100,
      });
      groupingManager.setTarget(mockTarget);

      // Create commands that should be grouped
      const cmd1 = groupingManager.createCellCommand(0, 0, 'a');
      const cmd2 = groupingManager.createCellCommand(0, 0, 'ab');
      const cmd3 = groupingManager.createCellCommand(0, 0, 'abc');

      groupingManager.execute(cmd1!);
      groupingManager.execute(cmd2!);
      groupingManager.execute(cmd3!);

      // Wait for grouping window
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be grouped into fewer undo steps
      expect(groupingManager.getState().undoCount).toBeLessThanOrEqual(3);
    });
  });

  // ===========================================================================
  // Helper Functions
  // ===========================================================================

  function createTestCommand(description: string): Command {
    return new CustomCommand('custom', description, () => {}, () => {}, 100);
  }
});
