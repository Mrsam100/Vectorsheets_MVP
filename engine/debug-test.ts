import { EditModeManager } from './core/editing/EditModeManager';

const mgr = new EditModeManager();

console.log('1. Starting editing with "=SUM("');
mgr.startEditing({ row: 0, col: 0 }, '=SUM(', 'edit');
console.log('   Current value:', mgr.getCurrentValue());
console.log('   Session text:', (mgr as any).session?.text);
console.log('   Session cursor:', (mgr as any).session?.cursor);

console.log('\n2. Setting mode to point');
mgr.setMode('point');
console.log('   Session mode:', (mgr as any).session?.mode);

console.log('\n3. Setting cursor to position 5');
mgr.setCursorPosition(5);
console.log('   Session cursor:', (mgr as any).session?.cursor);

console.log('\n4. Inserting cell reference "A1"');
mgr.insertCellReference('A1');
console.log('   Session text:', (mgr as any).session?.text);
console.log('   Session cursor:', (mgr as any).session?.cursor);
console.log('   Current value (legacy):', mgr.getCurrentValue());

console.log('\nExpected: "=SUM(A1"');
console.log('Got:      "' + mgr.getCurrentValue() + '"');
