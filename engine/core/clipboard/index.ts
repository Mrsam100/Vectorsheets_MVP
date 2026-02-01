/**
 * VectorSheet Engine - Clipboard Module Exports
 */

export { ClipboardManager } from './ClipboardManager.js';
export type {
  ClipboardCell,
  ClipboardData,
  PasteResult,
  PasteType,
  PasteOperation,
  PasteOptions,
  ClipboardManagerEvents,
} from './ClipboardManager.js';

export { FillSeries, createFillSeries } from './FillSeries.js';
export type {
  FillDirection,
  SeriesType,
  DateUnit,
  FillOptions,
  DetectedPattern,
  PatternType,
  SourceValue,
  TextNumberPattern,
  FillResult,
  GeneratedValue,
} from './FillSeries.js';

export { FillHandle } from './FillHandle.js';
export type {
  FillHandleState,
  FillHandlePosition,
  FillHandleEvents,
} from './FillHandle.js';

export {
  FormatPainter,
  createFormatPainter,
  createFormatReaderFromDataStore,
  createFormatWriterFromDataStore,
} from './FormatPainter.js';
export type {
  FormatPainterMode,
  StoredFormat,
  FormatPainterState,
  ApplyResult,
  PickOptions,
  FormatProperty,
  FormatPainterEvents,
  FormatReader,
  FormatWriter,
} from './FormatPainter.js';
