/**
 * VectorSheet Engine - Formatting Module Exports
 */

export {
  FormatPainter,
  createFormatPainter,
  createFormatReaderFromDataStore,
  createFormatWriterFromDataStore,
  applyFormatToRange,
  clearFormatFromRange,
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
  CopiedFormat, // Legacy compatibility
} from './FormatPainter.js';

export {
  MergeManager,
  createMergeManager,
  createMergeReaderFromDataStore,
  createMergeWriterFromDataStore,
} from './MergeManager.js';
export type {
  MergeInfo,
  MergedRegion, // Legacy compatibility
  MergeResult,
  UnmergeResult,
  MergeManagerEvents,
  MergeReader,
  MergeWriter,
} from './MergeManager.js';

export {
  ConditionalFormatting,
  createConditionalFormatting,
  createRangeStatistics,
} from './ConditionalFormatting.js';
export type {
  RuleType,
  ComparisonOperator,
  TextOperator,
  DateOperator,
  TopBottomType,
  TopBottomUnit,
  ConditionalFormatRule,
  RuleInput,
  RuleID,
  RuleConfig,
  CellValueConfig,
  TopBottomConfig,
  TextConfig,
  DateConfig,
  ColorScaleConfig,
  DataBarConfig,
  IconSetConfig,
  FormulaConfig,
  EmptyConfig,
  ComputedCellFormat,
  RangeStatistics,
  CellValue,
} from './ConditionalFormatting.js';

export { NumberFormat, numberFormat, BUILTIN_FORMATS } from './NumberFormat.js';
export type {
  FormatResult,
  ParsedFormat,
  FormatSection,
  FormatToken,
} from './NumberFormat.js';
