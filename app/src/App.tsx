/**
 * VectorSheet - Main Application Entry
 *
 * This is the root component that renders the SpreadsheetShell.
 * The UI is a pure consumer of SpreadsheetEngine - no engine logic here.
 */

import React from 'react';
import { SpreadsheetShell } from './components';
import './styles/index.css';

const App: React.FC = () => {
  return (
    <div className="app h-screen w-screen overflow-hidden">
      <SpreadsheetShell />
    </div>
  );
};

export default App;
