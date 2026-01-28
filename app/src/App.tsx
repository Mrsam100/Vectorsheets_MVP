import { useRef, useCallback } from 'react';
import { Workbook, WorkbookInstance } from '@fortune-sheet/react';
import { Sheet } from '@fortune-sheet/core';
import '@fortune-sheet/react/dist/index.css';

// Sample data
const initialData: Sheet[] = [
  {
    name: 'Sheet1',
    celldata: [
      { r: 0, c: 0, v: { v: 'Product', m: 'Product' } },
      { r: 0, c: 1, v: { v: 'Q1', m: 'Q1' } },
      { r: 0, c: 2, v: { v: 'Q2', m: 'Q2' } },
      { r: 0, c: 3, v: { v: 'Q3', m: 'Q3' } },
      { r: 0, c: 4, v: { v: 'Q4', m: 'Q4' } },
      { r: 1, c: 0, v: { v: 'Widget A', m: 'Widget A' } },
      { r: 1, c: 1, v: { v: 1200, m: '1200' } },
      { r: 1, c: 2, v: { v: 1350, m: '1350' } },
      { r: 1, c: 3, v: { v: 1100, m: '1100' } },
      { r: 1, c: 4, v: { v: 1500, m: '1500' } },
      { r: 2, c: 0, v: { v: 'Widget B', m: 'Widget B' } },
      { r: 2, c: 1, v: { v: 800, m: '800' } },
      { r: 2, c: 2, v: { v: 950, m: '950' } },
      { r: 2, c: 3, v: { v: 1200, m: '1200' } },
      { r: 2, c: 4, v: { v: 1100, m: '1100' } },
    ],
  },
];

function App() {
  // Ref to access FortuneSheet's API
  const workbookRef = useRef<WorkbookInstance>(null);

  // =========================================================================
  // Programmatic Control Hooks (for AI integration)
  // =========================================================================

  // Get cell value
  const getCellValue = useCallback((row: number, col: number) => {
    const api = workbookRef.current;
    if (!api) return null;
    return api.getCellValue(row, col);
  }, []);

  // Set cell value
  const setCellValue = useCallback((row: number, col: number, value: string | number) => {
    const api = workbookRef.current;
    if (!api) return;
    api.setCellValue(row, col, value);
  }, []);

  // Get current selection
  const getSelection = useCallback(() => {
    const api = workbookRef.current;
    if (!api) return null;
    return api.getSelection();
  }, []);

  // Get all sheet data
  const getAllSheets = useCallback(() => {
    const api = workbookRef.current;
    if (!api) return null;
    return api.getAllSheets();
  }, []);

  // Example: AI fills a range with values
  const aiExample = useCallback(() => {
    const api = workbookRef.current;
    if (!api) return;

    // Example: Set multiple cells programmatically
    api.setCellValue(3, 0, 'AI Generated');
    api.setCellValue(3, 1, Math.floor(Math.random() * 1000));
    api.setCellValue(3, 2, Math.floor(Math.random() * 1000));
    api.setCellValue(3, 3, Math.floor(Math.random() * 1000));
    api.setCellValue(3, 4, Math.floor(Math.random() * 1000));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Simple toolbar for demo */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        backgroundColor: '#f8f9fa'
      }}>
        <span style={{ fontWeight: 600, color: '#1a73e8' }}>VectorSheet</span>
        <button
          onClick={aiExample}
          style={{
            padding: '6px 12px',
            backgroundColor: '#1a73e8',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          AI: Add Row
        </button>
        <button
          onClick={() => console.log('Sheets:', getAllSheets())}
          style={{
            padding: '6px 12px',
            backgroundColor: '#fff',
            border: '1px solid #dadce0',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Log Data
        </button>
        <button
          onClick={() => console.log('Cell A1:', getCellValue(0, 0))}
          style={{
            padding: '6px 12px',
            backgroundColor: '#fff',
            border: '1px solid #dadce0',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Get A1
        </button>
        <button
          onClick={() => setCellValue(0, 5, 'Total')}
          style={{
            padding: '6px 12px',
            backgroundColor: '#fff',
            border: '1px solid #dadce0',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Set F1
        </button>
        <button
          onClick={() => console.log('Selection:', getSelection())}
          style={{
            padding: '6px 12px',
            backgroundColor: '#fff',
            border: '1px solid #dadce0',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Log Selection
        </button>
      </div>

      {/* FortuneSheet - the spreadsheet */}
      <div style={{ flex: 1 }}>
        <Workbook
          ref={workbookRef}
          data={initialData}
          onChange={(data) => {
            // Hook: called when any data changes
            console.log('Sheet data changed:', data);
          }}
          onOp={(op) => {
            // Hook: called for every operation (fine-grained)
            // Useful for undo/redo, collaboration, AI triggers
            console.log('Operation:', op);
          }}
        />
      </div>
    </div>
  );
}

export default App;
