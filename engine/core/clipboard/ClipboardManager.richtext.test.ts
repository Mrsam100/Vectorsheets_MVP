/**
 * ClipboardManager - Rich Text Tests (Production Grade)
 * Tests FormattedText export/import for Excel compatibility
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ClipboardManager } from './ClipboardManager.js';
import { SparseDataStore } from '../data/SparseDataStore.js';
import type { FormattedText, Cell } from '../types/index.js';

describe('ClipboardManager - Rich Text Support', () => {
  let clipboardManager: ClipboardManager;
  let dataStore: SparseDataStore;

  beforeEach(() => {
    dataStore = new SparseDataStore();
    clipboardManager = new ClipboardManager(dataStore);
  });

  describe('FormattedText → HTML Export', () => {
    it('should export FormattedText with bold text to HTML', () => {
      // Setup: Cell with bold text
      const cell: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'Good morning',
          runs: [
            { start: 5, end: 12, format: { bold: true } },
          ],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, cell);

      // Action: Copy cell (use CellRange)
      const clipboardData = clipboardManager.copy({
        startRow: 0,
        startCol: 0,
        endRow: 0,
        endCol: 0,
      });

      // Assert: HTML contains bold span
      expect(clipboardData.html).toContain('<span');
      expect(clipboardData.html).toContain('font-weight:bold');
      expect(clipboardData.html).toContain('morning');
    });

    it('should export FormattedText with multiple formats to HTML', () => {
      // Setup: Cell with multiple formats
      const cell: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'Bold Italic Normal',
          runs: [
            { start: 0, end: 4, format: { bold: true } },
            { start: 5, end: 11, format: { italic: true } },
          ],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, cell);

      // Action: Copy cell (use CellRange)
      const clipboardData = clipboardManager.copy({
        startRow: 0,
        startCol: 0,
        endRow: 0,
        endCol: 0,
      });

      // Assert: HTML contains multiple spans
      expect(clipboardData.html).toContain('font-weight:bold');
      expect(clipboardData.html).toContain('font-style:italic');
      expect(clipboardData.html).toContain('Bold');
      expect(clipboardData.html).toContain('Italic');
      expect(clipboardData.html).toContain('Normal');
    });

    it('should export FormattedText with color to HTML', () => {
      // Setup: Cell with colored text
      const cell: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'Red Text',
          runs: [
            { start: 0, end: 8, format: { fontColor: '#FF0000' } },
          ],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, cell);

      // Action: Copy cell (use CellRange)
      const clipboardData = clipboardManager.copy({
        startRow: 0,
        startCol: 0,
        endRow: 0,
        endCol: 0,
      });

      // Assert: HTML contains color style
      expect(clipboardData.html).toContain('color:#FF0000');
    });

    it('should export FormattedText with font family and size to HTML', () => {
      // Setup: Cell with font family and size
      const cell: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'Arial 14pt',
          runs: [
            {
              start: 0,
              end: 10,
              format: { fontFamily: 'Arial', fontSize: 14 },
            },
          ],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, cell);

      // Action: Copy cell (use CellRange)
      const clipboardData = clipboardManager.copy({
        startRow: 0,
        startCol: 0,
        endRow: 0,
        endCol: 0,
      });

      // Assert: HTML contains font styles
      expect(clipboardData.html).toContain('font-family:Arial');
      expect(clipboardData.html).toContain('font-size:14pt');
    });

    it('should export FormattedText with underline and strikethrough to HTML', () => {
      // Setup: Cell with underline and strikethrough
      const cell: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'Underline Strike',
          runs: [
            { start: 0, end: 9, format: { underline: 1 } },
            { start: 10, end: 16, format: { strikethrough: true } },
          ],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, cell);

      // Action: Copy cell (use CellRange)
      const clipboardData = clipboardManager.copy({
        startRow: 0,
        startCol: 0,
        endRow: 0,
        endCol: 0,
      });

      // Assert: HTML contains text-decoration
      expect(clipboardData.html).toContain('text-decoration:underline');
      expect(clipboardData.html).toContain('text-decoration:line-through');
    });

    it('should handle plain text cells (backward compatibility)', () => {
      // Setup: Cell with plain string
      const cell: Cell = {
        value: 'Plain text',
        type: 'string',
      };

      dataStore.setCell(0, 0, cell);

      // Action: Copy cell (use CellRange)
      const clipboardData = clipboardManager.copy({
        startRow: 0,
        startCol: 0,
        endRow: 0,
        endCol: 0,
      });

      // Assert: HTML contains plain text (no spans)
      expect(clipboardData.html).toContain('Plain text');
      expect(clipboardData.html).not.toContain('<span');
    });

    it('should handle empty FormattedText', () => {
      // Setup: Cell with empty FormattedText
      const cell: Cell = {
        value: {
          _type: 'FormattedText',
          text: '',
          runs: [],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, cell);

      // Action: Copy cell (use CellRange)
      const clipboardData = clipboardManager.copy({
        startRow: 0,
        startCol: 0,
        endRow: 0,
        endCol: 0,
      });

      // Assert: HTML is valid (empty td)
      expect(clipboardData.html).toContain('<td');
      expect(clipboardData.html).toContain('</td>');
    });

    it('should handle FormattedText with gaps between runs', () => {
      // Setup: FormattedText with gaps
      const cell: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'Hello World Goodbye',
          runs: [
            { start: 0, end: 5, format: { bold: true } },   // "Hello"
            { start: 12, end: 19, format: { italic: true } }, // "Goodbye"
            // Gap: " World " (6-11) should use cell format
          ],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, cell);

      // Action: Copy cell (use CellRange)
      const clipboardData = clipboardManager.copy({
        startRow: 0,
        startCol: 0,
        endRow: 0,
        endCol: 0,
      });

      // Assert: HTML contains all parts
      expect(clipboardData.html).toContain('Hello');
      expect(clipboardData.html).toContain('World');
      expect(clipboardData.html).toContain('Goodbye');
    });
  });

  describe('HTML → FormattedText Import', () => {
    it('should import HTML with bold span to FormattedText', () => {
      // Setup: HTML with bold span (Excel format)
      const html = '<table><tr><td>Good <span style="font-weight:bold">morning</span></td></tr></table>';

      // Action: Paste HTML
      const result = clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: Cell has FormattedText with bold run
      const cell = dataStore.getCell(0, 0);
      expect(cell).toBeDefined();
      expect(cell?.value).toHaveProperty('_type', 'FormattedText');

      const value = cell?.value as FormattedText;
      expect(value.text).toBe('Good morning');
      expect(value.runs).toHaveLength(1);
      expect(value.runs[0]).toEqual({
        start: 5,
        end: 12,
        format: { bold: true },
      });
    });

    it('should import HTML with italic span to FormattedText', () => {
      // Setup: HTML with italic span
      const html = '<table><tr><td><span style="font-style:italic">Italic</span> Normal</td></tr></table>';

      // Action: Paste HTML
      clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: Cell has FormattedText with italic run
      const cell = dataStore.getCell(0, 0);
      const value = cell?.value as FormattedText;
      expect(value.text).toBe('Italic Normal');
      expect(value.runs).toHaveLength(1);
      expect(value.runs[0]).toEqual({
        start: 0,
        end: 6,
        format: { italic: true },
      });
    });

    it('should import HTML with color span to FormattedText', () => {
      // Setup: HTML with color span
      const html = '<table><tr><td><span style="color:#FF0000">Red</span></td></tr></table>';

      // Action: Paste HTML
      clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: Cell has FormattedText with color
      const cell = dataStore.getCell(0, 0);
      const value = cell?.value as FormattedText;
      expect(value.text).toBe('Red');
      expect(value.runs[0]?.format?.fontColor).toBe('#FF0000');
    });

    it('should import HTML with multiple spans to FormattedText', () => {
      // Setup: HTML with multiple spans
      const html = '<table><tr><td><span style="font-weight:bold">Bold</span> <span style="font-style:italic">Italic</span></td></tr></table>';

      // Action: Paste HTML
      clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: Cell has FormattedText with multiple runs
      const cell = dataStore.getCell(0, 0);
      const value = cell?.value as FormattedText;
      expect(value.text).toBe('Bold Italic');
      expect(value.runs).toHaveLength(2);
      expect(value.runs[0]?.format?.bold).toBe(true);
      expect(value.runs[1]?.format?.italic).toBe(true);
    });

    it('should import HTML with font-size (pt) to FormattedText', () => {
      // Setup: HTML with font-size in points
      const html = '<table><tr><td><span style="font-size:14pt">Text</span></td></tr></table>';

      // Action: Paste HTML
      clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: Cell has FormattedText with fontSize
      const cell = dataStore.getCell(0, 0);
      const value = cell?.value as FormattedText;
      expect(value.runs[0]?.format?.fontSize).toBe(14);
    });

    it('should import HTML with font-size (px) to FormattedText', () => {
      // Setup: HTML with font-size in pixels
      const html = '<table><tr><td><span style="font-size:16px">Text</span></td></tr></table>';

      // Action: Paste HTML
      clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: Cell has FormattedText with fontSize (converted from px to pt)
      const cell = dataStore.getCell(0, 0);
      const value = cell?.value as FormattedText;
      // 16px / 1.333 ≈ 12pt
      expect(value.runs[0]?.format?.fontSize).toBe(12);
    });

    it('should import HTML with font-family to FormattedText', () => {
      // Setup: HTML with font-family
      const html = '<table><tr><td><span style="font-family:Arial">Text</span></td></tr></table>';

      // Action: Paste HTML
      clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: Cell has FormattedText with fontFamily
      const cell = dataStore.getCell(0, 0);
      const value = cell?.value as FormattedText;
      expect(value.runs[0]?.format?.fontFamily).toBe('Arial');
    });

    it('should import HTML with underline to FormattedText', () => {
      // Setup: HTML with underline
      const html = '<table><tr><td><span style="text-decoration:underline">Text</span></td></tr></table>';

      // Action: Paste HTML
      clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: Cell has FormattedText with underline
      const cell = dataStore.getCell(0, 0);
      const value = cell?.value as FormattedText;
      expect(value.runs[0]?.format?.underline).toBe(1);
    });

    it('should import HTML with strikethrough to FormattedText', () => {
      // Setup: HTML with line-through
      const html = '<table><tr><td><span style="text-decoration:line-through">Text</span></td></tr></table>';

      // Action: Paste HTML
      clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: Cell has FormattedText with strikethrough
      const cell = dataStore.getCell(0, 0);
      const value = cell?.value as FormattedText;
      expect(value.runs[0]?.format?.strikethrough).toBe(true);
    });

    it('should handle plain HTML text (no spans)', () => {
      // Setup: HTML without spans
      const html = '<table><tr><td>Plain text</td></tr></table>';

      // Action: Paste HTML
      clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: Cell has plain string value
      const cell = dataStore.getCell(0, 0);
      expect(cell?.value).toBe('Plain text');
      expect(cell?.value).not.toHaveProperty('_type');
    });

    it('should handle HTML entities in text', () => {
      // Setup: HTML with entities
      const html = '<table><tr><td>&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;</td></tr></table>';

      // Action: Paste HTML
      clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: Entities are decoded
      const cell = dataStore.getCell(0, 0);
      expect(cell?.value).toBe('<script>alert("XSS")</script>');
    });

    it('should handle malformed HTML gracefully', () => {
      // Setup: Malformed HTML (no table)
      const html = 'Just plain text';

      // Action: Paste HTML (should fallback to plain text)
      const result = clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: Falls back to plain text paste
      expect(result.pastedCells).toHaveLength(1);
      const cell = dataStore.getCell(0, 0);
      expect(cell?.value).toBe('Just plain text');
    });

    it('should handle empty table', () => {
      // Setup: Empty table
      const html = '<table></table>';

      // Action: Paste HTML
      const result = clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: No cells pasted
      expect(result.pastedCells).toHaveLength(0);
    });

    it('should handle multi-row multi-column table', () => {
      // Setup: 2x2 table with formatting
      const html = `
        <table>
          <tr>
            <td><span style="font-weight:bold">A1</span></td>
            <td>B1</td>
          </tr>
          <tr>
            <td>A2</td>
            <td><span style="font-style:italic">B2</span></td>
          </tr>
        </table>
      `;

      // Action: Paste HTML
      const result = clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: 4 cells pasted with correct formatting
      expect(result.pastedCells).toHaveLength(4);

      const a1 = dataStore.getCell(0, 0);
      expect((a1?.value as FormattedText).text).toBe('A1');
      expect((a1?.value as FormattedText).runs[0]?.format?.bold).toBe(true);

      const b1 = dataStore.getCell(0, 1);
      expect(b1?.value).toBe('B1');

      const a2 = dataStore.getCell(1, 0);
      expect(a2?.value).toBe('A2');

      const b2 = dataStore.getCell(1, 1);
      expect((b2?.value as FormattedText).text).toBe('B2');
      expect((b2?.value as FormattedText).runs[0]?.format?.italic).toBe(true);
    });
  });

  describe('Deep Clone FormattedText', () => {
    it('should deep clone FormattedText when copying', () => {
      // Setup: Cell with FormattedText
      const originalValue: FormattedText = {
        _type: 'FormattedText',
        text: 'Bold',
        runs: [{ start: 0, end: 4, format: { bold: true } }],
      };

      const cell: Cell = {
        value: originalValue,
        type: 'string',
      };

      dataStore.setCell(0, 0, cell);

      // Action: Copy and paste
      clipboardManager.copy({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      clipboardManager.paste({ row: 1, col: 0 });

      // Assert: Pasted cell has deep-cloned FormattedText
      const pastedCell = dataStore.getCell(1, 0);
      const pastedValue = pastedCell?.value as FormattedText;

      expect(pastedValue).not.toBe(originalValue); // Different object
      expect(pastedValue.runs).not.toBe(originalValue.runs); // Different array
      expect(pastedValue.runs[0]).not.toBe(originalValue.runs[0]); // Different run object
      expect(pastedValue.runs[0]?.format).not.toBe(originalValue.runs[0]?.format); // Different format object

      // But values are equal
      expect(pastedValue).toEqual(originalValue);
    });

    it('should not mutate original FormattedText when modifying copy', () => {
      // Setup: Cell with FormattedText
      const cell: Cell = {
        value: {
          _type: 'FormattedText',
          text: 'Original',
          runs: [{ start: 0, end: 8, format: { bold: true } }],
        } as FormattedText,
        type: 'string',
      };

      dataStore.setCell(0, 0, cell);

      // Action: Copy, paste, and modify pasted cell
      clipboardManager.copy({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      clipboardManager.paste({ row: 1, col: 0 });

      const pastedCell = dataStore.getCell(1, 0);
      const pastedValue = pastedCell?.value as FormattedText;
      pastedValue.text = 'Modified';
      pastedValue.runs[0]!.format!.italic = true;

      // Assert: Original cell is unchanged
      const originalCell = dataStore.getCell(0, 0);
      const originalValue = originalCell?.value as FormattedText;
      expect(originalValue.text).toBe('Original');
      expect(originalValue.runs[0]?.format?.italic).toBeUndefined();
    });
  });

  describe('Round-Trip Compatibility (Export → Import)', () => {
    it('should preserve FormattedText through copy/paste via HTML', () => {
      // Setup: Cell with complex FormattedText
      const originalValue: FormattedText = {
        _type: 'FormattedText',
        text: 'Bold Italic Red Normal',
        runs: [
          { start: 0, end: 4, format: { bold: true } },
          { start: 5, end: 11, format: { italic: true } },
          { start: 12, end: 15, format: { fontColor: '#FF0000' } },
        ],
      };

      const cell: Cell = {
        value: originalValue,
        type: 'string',
      };

      dataStore.setCell(0, 0, cell);

      // Action: Copy to HTML, then paste HTML
      const clipboardData = clipboardManager.copy({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
      clipboardManager.pasteExternalHtml(clipboardData.html, { row: 1, col: 0 });

      // Assert: Pasted cell preserves FormattedText structure
      const pastedCell = dataStore.getCell(1, 0);
      const pastedValue = pastedCell?.value as FormattedText;

      expect(pastedValue._type).toBe('FormattedText');
      expect(pastedValue.text).toBe(originalValue.text);
      expect(pastedValue.runs).toHaveLength(3);
      expect(pastedValue.runs[0]?.format?.bold).toBe(true);
      expect(pastedValue.runs[1]?.format?.italic).toBe(true);
      expect(pastedValue.runs[2]?.format?.fontColor).toBe('#FF0000');
    });
  });

  describe('Excel Compatibility Edge Cases', () => {
    it('should handle font-weight numeric values (Excel)', () => {
      // Setup: Excel uses numeric font-weight
      const html = '<table><tr><td><span style="font-weight:700">Bold</span></td></tr></table>';

      // Action: Paste HTML
      clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: Recognized as bold
      const cell = dataStore.getCell(0, 0);
      const value = cell?.value as FormattedText;
      expect(value.runs[0]?.format?.bold).toBe(true);
    });

    it('should handle combined text-decoration (Excel)', () => {
      // Setup: Excel combines underline and strikethrough
      const html = '<table><tr><td><span style="text-decoration:underline line-through">Text</span></td></tr></table>';

      // Action: Paste HTML
      clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: Both underline and strikethrough detected
      const cell = dataStore.getCell(0, 0);
      const value = cell?.value as FormattedText;
      expect(value.runs[0]?.format?.underline).toBe(1);
      expect(value.runs[0]?.format?.strikethrough).toBe(true);
    });

    it('should handle quoted font-family (Excel)', () => {
      // Setup: Excel quotes font-family
      const html = `<table><tr><td><span style="font-family:'Times New Roman'">Text</span></td></tr></table>`;

      // Action: Paste HTML
      clipboardManager.pasteExternalHtml(html, { row: 0, col: 0 });

      // Assert: Quotes removed
      const cell = dataStore.getCell(0, 0);
      const value = cell?.value as FormattedText;
      expect(value.runs[0]?.format?.fontFamily).toBe('Times New Roman');
    });
  });
});
