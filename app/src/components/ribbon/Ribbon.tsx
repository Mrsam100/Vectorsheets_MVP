/**
 * Ribbon - Excel-style command surface
 *
 * Stateless: all visual state derived from RibbonState props.
 * Intent-only: every button click emits a SpreadsheetIntent via onIntent.
 * Does NOT import GridViewport, engine, or grid overlays.
 */

import React, { memo, useCallback } from 'react';
import type { CellFormat } from '../../../../engine/core/types/index';
import type { SpreadsheetIntent } from '../grid/IntentHandler';
import type { ApplyFormatIntent, ClipboardActionIntent, UndoRedoIntent } from '../grid/KeyboardAdapter';
import type { RibbonState } from './types';

import { RibbonButton, RibbonToggleButton } from './RibbonButton';
import { RibbonDropdown, type RibbonDropdownOption } from './RibbonDropdown';
import { RibbonColorPicker } from './RibbonColorPicker';
import { RibbonGroup, RibbonSeparator } from './RibbonGroup';
import { RibbonOverflowMenu } from './RibbonOverflowMenu';
import {
  CutIcon, CopyIcon, PasteIcon, FormatPainterIcon,
  UndoIcon, RedoIcon,
  BoldIcon, ItalicIcon, UnderlineIcon, StrikethroughIcon,
  FontColorIcon, BgColorIcon,
  AlignLeftIcon, AlignCenterIcon, AlignRightIcon, WrapTextIcon,
} from './icons';

// =============================================================================
// Hoisted Icon Elements (stable references — preserves child memo)
// =============================================================================

const ICON_CUT = <CutIcon />;
const ICON_COPY = <CopyIcon />;
const ICON_PASTE = <PasteIcon />;
const ICON_FORMAT_PAINTER = <FormatPainterIcon />;
const ICON_UNDO = <UndoIcon />;
const ICON_REDO = <RedoIcon />;
const ICON_BOLD = <BoldIcon />;
const ICON_ITALIC = <ItalicIcon />;
const ICON_UNDERLINE = <UnderlineIcon />;
const ICON_STRIKETHROUGH = <StrikethroughIcon />;
const ICON_FONT_COLOR = <FontColorIcon />;
const ICON_BG_COLOR = <BgColorIcon />;
const ICON_ALIGN_LEFT = <AlignLeftIcon />;
const ICON_ALIGN_CENTER = <AlignCenterIcon />;
const ICON_ALIGN_RIGHT = <AlignRightIcon />;
const ICON_WRAP_TEXT = <WrapTextIcon />;

// =============================================================================
// Option Lists (hoisted — stable references, zero per-render allocation)
// =============================================================================

const FONT_FAMILIES: ReadonlyArray<RibbonDropdownOption<string>> = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Calibri', label: 'Calibri' },
  { value: 'Cambria', label: 'Cambria' },
  { value: 'Comic Sans MS', label: 'Comic Sans MS' },
  { value: 'Consolas', label: 'Consolas' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Impact', label: 'Impact' },
  { value: 'Tahoma', label: 'Tahoma' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
  { value: 'Verdana', label: 'Verdana' },
];

const FONT_SIZES: ReadonlyArray<RibbonDropdownOption<number>> = [
  { value: 8, label: '8' },
  { value: 9, label: '9' },
  { value: 10, label: '10' },
  { value: 11, label: '11' },
  { value: 12, label: '12' },
  { value: 14, label: '14' },
  { value: 16, label: '16' },
  { value: 18, label: '18' },
  { value: 20, label: '20' },
  { value: 24, label: '24' },
  { value: 28, label: '28' },
  { value: 36, label: '36' },
  { value: 48, label: '48' },
  { value: 72, label: '72' },
];

const NUMBER_FORMATS: ReadonlyArray<RibbonDropdownOption<string>> = [
  { value: 'General', label: 'General' },
  { value: '#,##0', label: 'Number' },
  { value: '$#,##0.00', label: 'Currency' },
  { value: '#,##0.00', label: 'Accounting' },
  { value: '0%', label: 'Percent' },
  { value: '0.00E+00', label: 'Scientific' },
  { value: 'yyyy-mm-dd', label: 'Date' },
  { value: 'h:mm:ss', label: 'Time' },
  { value: '@', label: 'Text' },
];

// Stable no-op callback — avoids creating a new `() => {}` per render
const NOOP = () => {};

// =============================================================================
// Props
// =============================================================================

export interface RibbonProps {
  /** Current ribbon state from parent */
  state: RibbonState;
  /** Intent emitter */
  onIntent: (intent: SpreadsheetIntent) => void;
  /** Callback for format painter toggle (not an intent — parent owns FP engine) */
  onFormatPainterToggle?: () => void;
  /** Optional class name */
  className?: string;
}

// =============================================================================
// Ribbon Component
// =============================================================================

export const Ribbon: React.FC<RibbonProps> = memo(
  ({ state, onIntent, onFormatPainterToggle, className }) => {
    const fmt = state.activeCellFormat;
    const disabled = state.isProtected;
    // Disable mutating actions while user is editing a cell
    const editDisabled = disabled || state.isEditing;

    // =========================================================================
    // Intent Emitters (stable callbacks)
    // =========================================================================

    const emitFormat = useCallback(
      (format: Partial<CellFormat>) => {
        onIntent({
          type: 'ApplyFormat',
          format,
          timestamp: Date.now(),
        } as ApplyFormatIntent);
      },
      [onIntent],
    );

    const emitClipboard = useCallback(
      (action: 'copy' | 'cut' | 'paste') => {
        onIntent({
          type: 'ClipboardAction',
          action,
          timestamp: Date.now(),
        } as ClipboardActionIntent);
      },
      [onIntent],
    );

    const emitUndoRedo = useCallback(
      (action: 'undo' | 'redo') => {
        onIntent({
          type: 'UndoRedo',
          action,
          timestamp: Date.now(),
        } as UndoRedoIntent);
      },
      [onIntent],
    );

    // =========================================================================
    // Per-Button Callbacks (stable via useCallback + emitFormat)
    // =========================================================================

    const handleBold = useCallback(() => emitFormat({ bold: !fmt.bold }), [emitFormat, fmt.bold]);
    const handleItalic = useCallback(() => emitFormat({ italic: !fmt.italic }), [emitFormat, fmt.italic]);
    const handleUnderline = useCallback(
      () => emitFormat({ underline: fmt.underline ? 0 : 1 }),
      [emitFormat, fmt.underline],
    );
    const handleStrikethrough = useCallback(
      () => emitFormat({ strikethrough: !fmt.strikethrough }),
      [emitFormat, fmt.strikethrough],
    );

    const handleAlignLeft = useCallback(() => emitFormat({ horizontalAlign: 'left' }), [emitFormat]);
    const handleAlignCenter = useCallback(() => emitFormat({ horizontalAlign: 'center' }), [emitFormat]);
    const handleAlignRight = useCallback(() => emitFormat({ horizontalAlign: 'right' }), [emitFormat]);
    const handleWrapText = useCallback(() => emitFormat({ wrap: !fmt.wrap }), [emitFormat, fmt.wrap]);

    const handleFontFamily = useCallback((v: string) => emitFormat({ fontFamily: v }), [emitFormat]);
    const handleFontSize = useCallback((v: number) => emitFormat({ fontSize: v }), [emitFormat]);
    const handleFontColor = useCallback((c: string) => emitFormat({ fontColor: c || undefined }), [emitFormat]);
    const handleBgColor = useCallback((c: string) => emitFormat({ backgroundColor: c || undefined }), [emitFormat]);
    const handleNumberFormat = useCallback((v: string) => emitFormat({ numberFormat: v }), [emitFormat]);

    const handleCut = useCallback(() => emitClipboard('cut'), [emitClipboard]);
    const handleCopy = useCallback(() => emitClipboard('copy'), [emitClipboard]);
    const handlePaste = useCallback(() => emitClipboard('paste'), [emitClipboard]);
    const handleUndo = useCallback(() => emitUndoRedo('undo'), [emitUndoRedo]);
    const handleRedo = useCallback(() => emitUndoRedo('redo'), [emitUndoRedo]);

    // =========================================================================
    // Render
    // =========================================================================

    return (
      <div
        className={`ribbon ${className ?? ''}`}
        role="toolbar"
        aria-label="Formatting toolbar"
      >
        {/* Clipboard Group — priority 1 (always visible) */}
        <RibbonGroup label="Clipboard" priority={1}>
          <RibbonButton icon={ICON_CUT} tooltip="Cut (Ctrl+X)" onClick={handleCut} disabled={editDisabled || !state.hasSelection} preserveEdit={false} />
          <RibbonButton icon={ICON_COPY} tooltip="Copy (Ctrl+C)" onClick={handleCopy} disabled={!state.hasSelection} preserveEdit={false} />
          <RibbonButton icon={ICON_PASTE} tooltip="Paste (Ctrl+V)" onClick={handlePaste} disabled={editDisabled} preserveEdit={false} />
          <RibbonToggleButton
            icon={ICON_FORMAT_PAINTER}
            tooltip="Format Painter"
            pressed={state.formatPainterActive}
            onClick={onFormatPainterToggle ?? NOOP}
            disabled={editDisabled || !state.hasSelection}
            preserveEdit={true}
          />
        </RibbonGroup>

        <RibbonSeparator beforePriority={2} />

        {/* History Group — priority 2 (always visible) */}
        <RibbonGroup label="History" priority={2}>
          <RibbonButton icon={ICON_UNDO} tooltip="Undo (Ctrl+Z)" onClick={handleUndo} disabled={!state.canUndo} preserveEdit={false} />
          <RibbonButton icon={ICON_REDO} tooltip="Redo (Ctrl+Y)" onClick={handleRedo} disabled={!state.canRedo} preserveEdit={false} />
        </RibbonGroup>

        <RibbonSeparator beforePriority={3} />

        {/* Font Group — priority 3 (B/I/U/S always visible; dropdowns+colors overflow at medium) */}
        <RibbonGroup label="Font" priority={3}>
          {/* Font extras: dropdowns + colors hidden at medium breakpoint via CSS */}
          <span className="ribbon-font-extras">
            <RibbonDropdown
              value={fmt.fontFamily ?? 'Arial'}
              options={FONT_FAMILIES}
              onChange={handleFontFamily}
              tooltip="Font Family"
              ariaLabel="Font family"
              width={120}
              disabled={editDisabled}
              preserveEdit={true}
            />
            <RibbonDropdown
              value={fmt.fontSize ?? 11}
              options={FONT_SIZES}
              onChange={handleFontSize}
              tooltip="Font Size"
              ariaLabel="Font size"
              width={52}
              disabled={editDisabled}
              preserveEdit={true}
            />
          </span>
          <RibbonToggleButton icon={ICON_BOLD} tooltip="Bold (Ctrl+B)" pressed={!!fmt.bold} onClick={handleBold} disabled={editDisabled} preserveEdit={true} />
          <RibbonToggleButton icon={ICON_ITALIC} tooltip="Italic (Ctrl+I)" pressed={!!fmt.italic} onClick={handleItalic} disabled={editDisabled} preserveEdit={true} />
          <RibbonToggleButton icon={ICON_UNDERLINE} tooltip="Underline (Ctrl+U)" pressed={!!fmt.underline} onClick={handleUnderline} disabled={editDisabled} preserveEdit={true} />
          <RibbonToggleButton icon={ICON_STRIKETHROUGH} tooltip="Strikethrough" pressed={!!fmt.strikethrough} onClick={handleStrikethrough} disabled={editDisabled} preserveEdit={true} />
          <span className="ribbon-font-extras">
            <RibbonColorPicker icon={ICON_FONT_COLOR} value={fmt.fontColor} onChange={handleFontColor} tooltip="Font Color" disabled={editDisabled} preserveEdit={true} />
            <RibbonColorPicker icon={ICON_BG_COLOR} value={fmt.backgroundColor} onChange={handleBgColor} tooltip="Background Color" disabled={editDisabled} preserveEdit={true} />
          </span>
        </RibbonGroup>

        <RibbonSeparator beforePriority={4} />

        {/* Alignment Group — priority 4 (overflows at medium) */}
        <RibbonGroup label="Alignment" priority={4}>
          <RibbonToggleButton icon={ICON_ALIGN_LEFT} tooltip="Align Left" pressed={fmt.horizontalAlign === 'left'} onClick={handleAlignLeft} disabled={editDisabled} preserveEdit={true} />
          <RibbonToggleButton icon={ICON_ALIGN_CENTER} tooltip="Align Center" pressed={fmt.horizontalAlign === 'center'} onClick={handleAlignCenter} disabled={editDisabled} preserveEdit={true} />
          <RibbonToggleButton icon={ICON_ALIGN_RIGHT} tooltip="Align Right" pressed={fmt.horizontalAlign === 'right'} onClick={handleAlignRight} disabled={editDisabled} preserveEdit={true} />
          <RibbonToggleButton icon={ICON_WRAP_TEXT} tooltip="Wrap Text" pressed={!!fmt.wrap} onClick={handleWrapText} disabled={editDisabled} preserveEdit={true} />
        </RibbonGroup>

        <RibbonSeparator beforePriority={5} />

        {/* Number Group — priority 5 (overflows first) */}
        <RibbonGroup label="Number" priority={5}>
          <RibbonDropdown
            value={fmt.numberFormat ?? 'General'}
            options={NUMBER_FORMATS}
            onChange={handleNumberFormat}
            tooltip="Number Format"
            ariaLabel="Number format"
            width={100}
            disabled={editDisabled}
            preserveEdit={true}
          />
        </RibbonGroup>

        {/* Overflow menu — shown via container query when groups are hidden */}
        <RibbonOverflowMenu>
          {/* Font extras (dropdowns + colors) */}
          <RibbonGroup label="Font">
            <RibbonDropdown
              value={fmt.fontFamily ?? 'Arial'}
              options={FONT_FAMILIES}
              onChange={handleFontFamily}
              tooltip="Font Family"
              ariaLabel="Font family"
              width={120}
              disabled={editDisabled}
              preserveEdit={true}
            />
            <RibbonDropdown
              value={fmt.fontSize ?? 11}
              options={FONT_SIZES}
              onChange={handleFontSize}
              tooltip="Font Size"
              ariaLabel="Font size"
              width={52}
              disabled={editDisabled}
              preserveEdit={true}
            />
            <RibbonColorPicker icon={ICON_FONT_COLOR} value={fmt.fontColor} onChange={handleFontColor} tooltip="Font Color" disabled={editDisabled} preserveEdit={true} />
            <RibbonColorPicker icon={ICON_BG_COLOR} value={fmt.backgroundColor} onChange={handleBgColor} tooltip="Background Color" disabled={editDisabled} preserveEdit={true} />
          </RibbonGroup>
          <RibbonSeparator />
          {/* Alignment */}
          <RibbonGroup label="Alignment">
            <RibbonToggleButton icon={ICON_ALIGN_LEFT} tooltip="Align Left" pressed={fmt.horizontalAlign === 'left'} onClick={handleAlignLeft} disabled={editDisabled} preserveEdit={true} />
            <RibbonToggleButton icon={ICON_ALIGN_CENTER} tooltip="Align Center" pressed={fmt.horizontalAlign === 'center'} onClick={handleAlignCenter} disabled={editDisabled} preserveEdit={true} />
            <RibbonToggleButton icon={ICON_ALIGN_RIGHT} tooltip="Align Right" pressed={fmt.horizontalAlign === 'right'} onClick={handleAlignRight} disabled={editDisabled} preserveEdit={true} />
            <RibbonToggleButton icon={ICON_WRAP_TEXT} tooltip="Wrap Text" pressed={!!fmt.wrap} onClick={handleWrapText} disabled={editDisabled} preserveEdit={true} />
          </RibbonGroup>
          <RibbonSeparator />
          {/* Number */}
          <RibbonGroup label="Number">
            <RibbonDropdown
              value={fmt.numberFormat ?? 'General'}
              options={NUMBER_FORMATS}
              onChange={handleNumberFormat}
              tooltip="Number Format"
              ariaLabel="Number format"
              width={100}
              disabled={editDisabled}
              preserveEdit={true}
            />
          </RibbonGroup>
        </RibbonOverflowMenu>
      </div>
    );
  },
);

Ribbon.displayName = 'Ribbon';

export default Ribbon;
