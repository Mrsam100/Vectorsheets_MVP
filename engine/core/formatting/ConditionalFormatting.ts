/**
 * VectorSheet Engine - Conditional Formatting (Pure Rule Engine)
 *
 * Mass-scale rule engine for conditional cell formatting.
 * Designed for thousands of rules with deterministic evaluation.
 *
 * Rule types:
 * - Cell value rules (greater than, less than, between, equal to)
 * - Text rules (contains, begins with, ends with)
 * - Color scales (2-color, 3-color gradients) - logical model
 * - Data bars - logical model
 * - Icon sets - logical model
 * - Top/Bottom rules
 * - Date rules
 * - Formula rules (logical structure only)
 * - Simple rules (blanks, errors, duplicates)
 *
 * Design:
 * - Pure: No data store coupling, takes value as input
 * - Deterministic: Same inputs always produce same outputs
 * - Fast: O(rules) lookup with priority-ordered evaluation
 * - Testable: Fully isolated, no side effects
 */

import { CellRef, CellRange, CellFormat, rangeContains } from '../types/index.js';

// =============================================================================
// Types - Rule Types
// =============================================================================

export type RuleType =
  | 'cellValue'
  | 'topBottom'
  | 'text'
  | 'date'
  | 'colorScale'
  | 'dataBar'
  | 'iconSet'
  | 'formula'
  | 'duplicates'
  | 'unique'
  | 'blanks'
  | 'noBlanks'
  | 'errors'
  | 'noErrors';

export type ComparisonOperator =
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'equal'
  | 'notEqual'
  | 'between'
  | 'notBetween';

export type TextOperator =
  | 'contains'
  | 'notContains'
  | 'beginsWith'
  | 'endsWith';

export type DateOperator =
  | 'yesterday'
  | 'today'
  | 'tomorrow'
  | 'last7Days'
  | 'lastWeek'
  | 'thisWeek'
  | 'nextWeek'
  | 'lastMonth'
  | 'thisMonth'
  | 'nextMonth';

export type TopBottomType = 'top' | 'bottom';
export type TopBottomUnit = 'items' | 'percent';

// =============================================================================
// Types - Rule Configurations
// =============================================================================

export interface CellValueConfig {
  type: 'cellValue';
  operator: ComparisonOperator;
  value1: number | string;
  value2?: number | string; // For between/notBetween
}

export interface TopBottomConfig {
  type: 'topBottom';
  topBottom: TopBottomType;
  rank: number;
  unit: TopBottomUnit;
}

export interface TextConfig {
  type: 'text';
  operator: TextOperator;
  text: string;
  caseSensitive?: boolean;
}

export interface DateConfig {
  type: 'date';
  operator: DateOperator;
}

export interface ColorScaleConfig {
  type: 'colorScale';
  minType: 'min' | 'number' | 'percent' | 'percentile';
  minValue?: number;
  minColor: string;
  midType?: 'number' | 'percent' | 'percentile';
  midValue?: number;
  midColor?: string;
  maxType: 'max' | 'number' | 'percent' | 'percentile';
  maxValue?: number;
  maxColor: string;
}

export interface DataBarConfig {
  type: 'dataBar';
  minType: 'min' | 'number' | 'percent';
  minValue?: number;
  maxType: 'max' | 'number' | 'percent';
  maxValue?: number;
  color: string;
  showValue: boolean;
  gradient: boolean;
  negativeFillColor?: string;
  negativeBorderColor?: string;
  axisColor?: string;
}

export interface IconSetConfig {
  type: 'iconSet';
  iconStyle:
    | '3Arrows'
    | '3ArrowsGray'
    | '3Flags'
    | '3TrafficLights'
    | '3Signs'
    | '3Symbols'
    | '4Arrows'
    | '4ArrowsGray'
    | '4TrafficLights'
    | '4RedToBlack'
    | '4Rating'
    | '5Arrows'
    | '5ArrowsGray'
    | '5Quarters'
    | '5Rating';
  reverseOrder: boolean;
  showIconOnly: boolean;
  thresholds: Array<{
    type: 'number' | 'percent' | 'percentile';
    value: number;
    operator: '>=' | '>';
  }>;
}

export interface FormulaConfig {
  type: 'formula';
  formula: string;
}

export interface EmptyConfig {
  type: 'empty';
}

export type RuleConfig =
  | CellValueConfig
  | TopBottomConfig
  | TextConfig
  | DateConfig
  | ColorScaleConfig
  | DataBarConfig
  | IconSetConfig
  | FormulaConfig
  | EmptyConfig;

// =============================================================================
// Types - Rule Definition
// =============================================================================

export interface ConditionalFormatRule {
  /** Unique rule ID */
  id: string;
  /** Rule type */
  type: RuleType;
  /** Range this rule applies to */
  range: CellRange;
  /** Priority (lower = higher priority, like Excel) */
  priority: number;
  /** Stop if true (don't apply lower priority rules) */
  stopIfTrue: boolean;
  /** Format to apply when rule matches */
  format?: CellFormat;
  /** Rule-specific configuration */
  config: RuleConfig;
}

/** Input for addRule - excludes id (auto-generated) */
export type RuleInput = Omit<ConditionalFormatRule, 'id' | 'range'>;

// =============================================================================
// Types - Computed Results
// =============================================================================

/**
 * Computed format result for a cell.
 * Contains the overlay format plus any scale-specific data.
 */
export interface ComputedCellFormat {
  /** Applied format from conditional rules */
  format?: CellFormat;
  /** Data bar configuration (if applicable) */
  dataBar?: {
    /** Fill percentage (0-100) */
    percent: number;
    /** Bar color */
    color: string;
    /** Use gradient fill */
    gradient: boolean;
    /** Is negative value */
    isNegative?: boolean;
  };
  /** Icon (if applicable) */
  icon?: {
    /** Icon set name */
    set: string;
    /** Icon index within set (0-based) */
    index: number;
    /** Show icon only (hide value) */
    showOnly: boolean;
  };
  /** Background from color scale (if applicable) */
  colorScaleBackground?: string;
  /** IDs of rules that matched */
  matchedRules: string[];
}

/**
 * Range statistics for scale-based rules.
 * Must be provided for color scales, data bars, icon sets, and top/bottom rules.
 */
export interface RangeStatistics {
  /** Minimum numeric value in range */
  min: number;
  /** Maximum numeric value in range */
  max: number;
  /** All numeric values in range (sorted ascending) */
  values: number[];
  /** Count of numeric values */
  count: number;
}

/**
 * Cell value for evaluation.
 */
export type CellValue = string | number | boolean | null | undefined;

// =============================================================================
// Rule ID Type
// =============================================================================

export type RuleID = string;

// =============================================================================
// Conditional Formatting Engine
// =============================================================================

export class ConditionalFormatting {
  /** Rule storage by ID */
  private rules: Map<RuleID, ConditionalFormatRule> = new Map();

  /** Counter for generating unique rule IDs */
  private ruleIdCounter = 0;

  /** Rules sorted by priority (cached, invalidated on changes) */
  private sortedRulesCache: ConditionalFormatRule[] | null = null;

  // ===========================================================================
  // Rule Management API
  // ===========================================================================

  /**
   * Add a conditional formatting rule.
   *
   * @param range The cell range this rule applies to
   * @param rule The rule configuration (without id)
   * @returns The generated rule ID
   */
  addRule(range: CellRange, rule: RuleInput): RuleID {
    const id = this.generateRuleId();

    const fullRule: ConditionalFormatRule = {
      ...rule,
      id,
      range: this.normalizeRange(range),
    };

    this.rules.set(id, fullRule);
    this.invalidateCache();

    return id;
  }

  /**
   * Remove a rule by ID.
   *
   * @param id The rule ID to remove
   * @returns true if removed, false if not found
   */
  removeRule(id: RuleID): boolean {
    const removed = this.rules.delete(id);
    if (removed) {
      this.invalidateCache();
    }
    return removed;
  }

  /**
   * Update an existing rule.
   *
   * @param id The rule ID to update
   * @param rule Partial rule updates
   * @returns true if updated, false if not found
   */
  updateRule(id: RuleID, rule: Partial<Omit<ConditionalFormatRule, 'id'>>): boolean {
    const existing = this.rules.get(id);
    if (!existing) return false;

    const updated: ConditionalFormatRule = {
      ...existing,
      ...rule,
      id, // Preserve original ID
      range: rule.range ? this.normalizeRange(rule.range) : existing.range,
    };

    this.rules.set(id, updated);
    this.invalidateCache();

    return true;
  }

  /**
   * Get a rule by ID.
   */
  getRule(id: RuleID): ConditionalFormatRule | undefined {
    return this.rules.get(id);
  }

  /**
   * Get all rules sorted by priority.
   */
  getAllRules(): ConditionalFormatRule[] {
    return this.getSortedRules();
  }

  /**
   * Get rules that apply to a specific cell.
   */
  getRulesForCell(cellRef: CellRef): ConditionalFormatRule[] {
    return this.getSortedRules().filter((rule) =>
      rangeContains(rule.range, cellRef.row, cellRef.col)
    );
  }

  /**
   * Get rules that apply to a specific range (any overlap).
   */
  getRulesForRange(range: CellRange): ConditionalFormatRule[] {
    const normalized = this.normalizeRange(range);
    return this.getSortedRules().filter((rule) => this.rangesOverlap(rule.range, normalized));
  }

  /**
   * Clear all rules.
   */
  clearAllRules(): void {
    this.rules.clear();
    this.invalidateCache();
  }

  /**
   * Get total rule count.
   */
  getRuleCount(): number {
    return this.rules.size;
  }

  // ===========================================================================
  // Evaluation API
  // ===========================================================================

  /**
   * Evaluate conditional formatting for a cell.
   *
   * @param cellRef The cell reference
   * @param value The cell's current value
   * @param rangeStats Optional range statistics (required for scale-based rules)
   * @returns Computed format overlay or null if no rules match
   */
  evaluate(
    cellRef: CellRef,
    value: CellValue,
    rangeStats?: RangeStatistics
  ): ComputedCellFormat | null {
    const applicableRules = this.getRulesForCell(cellRef);

    if (applicableRules.length === 0) {
      return null;
    }

    const result: ComputedCellFormat = {
      matchedRules: [],
    };

    let hasMatch = false;

    for (const rule of applicableRules) {
      const matched = this.evaluateRule(rule, value, rangeStats);

      if (matched) {
        hasMatch = true;
        result.matchedRules.push(rule.id);

        // Apply format overlay
        if (rule.format) {
          result.format = this.mergeFormats(result.format, rule.format);
        }

        // Handle scale-based rules
        this.applyScaleResult(result, rule, value, rangeStats);

        // Stop if this rule says so
        if (rule.stopIfTrue) {
          break;
        }
      }
    }

    return hasMatch ? result : null;
  }

  /**
   * Batch evaluate multiple cells.
   * More efficient than calling evaluate() repeatedly.
   *
   * @param cells Array of cell references with values
   * @param rangeStats Optional range statistics
   * @returns Map of cell key ("row_col") to computed format
   */
  evaluateBatch(
    cells: Array<{ ref: CellRef; value: CellValue }>,
    rangeStats?: RangeStatistics
  ): Map<string, ComputedCellFormat> {
    const results = new Map<string, ComputedCellFormat>();

    for (const { ref, value } of cells) {
      const format = this.evaluate(ref, value, rangeStats);
      if (format) {
        results.set(`${ref.row}_${ref.col}`, format);
      }
    }

    return results;
  }

  // ===========================================================================
  // Rule Evaluation
  // ===========================================================================

  private evaluateRule(
    rule: ConditionalFormatRule,
    value: CellValue,
    rangeStats?: RangeStatistics
  ): boolean {
    const config = rule.config;

    switch (config.type) {
      case 'cellValue':
        return this.evaluateCellValueRule(config, value);
      case 'text':
        return this.evaluateTextRule(config, value);
      case 'topBottom':
        return this.evaluateTopBottomRule(config, value, rangeStats);
      case 'date':
        return this.evaluateDateRule(config, value);
      case 'formula':
        // Formula rules need external evaluation - return false by default
        // Caller can override by pre-evaluating and using cellValue rule
        return false;
      case 'colorScale':
      case 'dataBar':
      case 'iconSet':
        // Scale rules always "match" for numeric values - they compute a visual
        return typeof value === 'number' && !isNaN(value);
      case 'empty':
        return this.evaluateSimpleRule(rule.type, value);
      default:
        return this.evaluateSimpleRule(rule.type, value);
    }
  }

  private evaluateCellValueRule(config: CellValueConfig, value: CellValue): boolean {
    // Handle string comparisons
    if (typeof config.value1 === 'string' && typeof value === 'string') {
      return this.evaluateStringComparison(config, value);
    }

    // Numeric comparisons
    const numValue = this.toNumber(value);
    if (numValue === null) return false;

    const value1 = this.toNumber(config.value1);
    if (value1 === null) return false;

    const value2 = config.value2 !== undefined ? this.toNumber(config.value2) : null;

    switch (config.operator) {
      case 'greaterThan':
        return numValue > value1;
      case 'lessThan':
        return numValue < value1;
      case 'greaterThanOrEqual':
        return numValue >= value1;
      case 'lessThanOrEqual':
        return numValue <= value1;
      case 'equal':
        return numValue === value1;
      case 'notEqual':
        return numValue !== value1;
      case 'between':
        if (value2 === null) return false;
        return numValue >= Math.min(value1, value2) && numValue <= Math.max(value1, value2);
      case 'notBetween':
        if (value2 === null) return false;
        return numValue < Math.min(value1, value2) || numValue > Math.max(value1, value2);
      default:
        return false;
    }
  }

  private evaluateStringComparison(config: CellValueConfig, value: string): boolean {
    const compareValue = String(config.value1);

    switch (config.operator) {
      case 'equal':
        return value === compareValue;
      case 'notEqual':
        return value !== compareValue;
      case 'greaterThan':
        return value > compareValue;
      case 'lessThan':
        return value < compareValue;
      case 'greaterThanOrEqual':
        return value >= compareValue;
      case 'lessThanOrEqual':
        return value <= compareValue;
      default:
        return false;
    }
  }

  private evaluateTextRule(config: TextConfig, value: CellValue): boolean {
    if (value === null || value === undefined) return false;

    const textValue = config.caseSensitive ? String(value) : String(value).toLowerCase();
    const searchText = config.caseSensitive ? config.text : config.text.toLowerCase();

    switch (config.operator) {
      case 'contains':
        return textValue.includes(searchText);
      case 'notContains':
        return !textValue.includes(searchText);
      case 'beginsWith':
        return textValue.startsWith(searchText);
      case 'endsWith':
        return textValue.endsWith(searchText);
      default:
        return false;
    }
  }

  private evaluateTopBottomRule(
    config: TopBottomConfig,
    value: CellValue,
    rangeStats?: RangeStatistics
  ): boolean {
    if (!rangeStats || rangeStats.values.length === 0) return false;

    const numValue = this.toNumber(value);
    if (numValue === null) return false;

    const { values } = rangeStats;
    const sortedAsc = values; // Assumed sorted ascending

    // Calculate threshold count
    let count: number;
    if (config.unit === 'percent') {
      count = Math.max(1, Math.ceil(sortedAsc.length * (config.rank / 100)));
    } else {
      count = Math.min(config.rank, sortedAsc.length);
    }

    if (config.topBottom === 'top') {
      // Top N: value must be >= the Nth largest value
      const threshold = sortedAsc[sortedAsc.length - count];
      return numValue >= threshold;
    } else {
      // Bottom N: value must be <= the Nth smallest value
      const threshold = sortedAsc[count - 1];
      return numValue <= threshold;
    }
  }

  private evaluateDateRule(config: DateConfig, value: CellValue): boolean {
    const numValue = this.toNumber(value);
    if (numValue === null) return false;

    // Convert Excel serial date to JS Date
    const cellDate = this.serialToDate(numValue);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (config.operator) {
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return this.isSameDay(cellDate, yesterday);
      }
      case 'today':
        return this.isSameDay(cellDate, today);
      case 'tomorrow': {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return this.isSameDay(cellDate, tomorrow);
      }
      case 'last7Days': {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return cellDate >= sevenDaysAgo && cellDate <= today;
      }
      case 'lastWeek':
        return this.isInWeekOffset(cellDate, today, -1);
      case 'thisWeek':
        return this.isInWeekOffset(cellDate, today, 0);
      case 'nextWeek':
        return this.isInWeekOffset(cellDate, today, 1);
      case 'lastMonth':
        return this.isInMonthOffset(cellDate, today, -1);
      case 'thisMonth':
        return this.isInMonthOffset(cellDate, today, 0);
      case 'nextMonth':
        return this.isInMonthOffset(cellDate, today, 1);
      default:
        return false;
    }
  }

  private evaluateSimpleRule(ruleType: RuleType, value: CellValue): boolean {
    switch (ruleType) {
      case 'blanks':
        return value === null || value === undefined || value === '';
      case 'noBlanks':
        return value !== null && value !== undefined && value !== '';
      case 'errors':
        return typeof value === 'string' && value.startsWith('#');
      case 'noErrors':
        return !(typeof value === 'string' && value.startsWith('#'));
      // Duplicates/unique require range context - handled at higher level
      case 'duplicates':
      case 'unique':
        return false;
      default:
        return false;
    }
  }

  // ===========================================================================
  // Scale-Based Rule Results
  // ===========================================================================

  private applyScaleResult(
    result: ComputedCellFormat,
    rule: ConditionalFormatRule,
    value: CellValue,
    rangeStats?: RangeStatistics
  ): void {
    const numValue = this.toNumber(value);
    if (numValue === null) return;

    switch (rule.config.type) {
      case 'colorScale':
        result.colorScaleBackground = this.computeColorScale(
          rule.config,
          numValue,
          rangeStats
        );
        break;
      case 'dataBar':
        result.dataBar = this.computeDataBar(rule.config, numValue, rangeStats);
        break;
      case 'iconSet':
        result.icon = this.computeIcon(rule.config, numValue, rangeStats);
        break;
    }
  }

  private computeColorScale(
    config: ColorScaleConfig,
    value: number,
    rangeStats?: RangeStatistics
  ): string | undefined {
    const { min, max } = this.getScaleBounds(config, rangeStats);
    const range = max - min;

    if (range === 0) return config.minColor;

    // Calculate position (0-1)
    let position: number;
    if (config.minType === 'percent' && config.minValue !== undefined) {
      const minThreshold = min + range * (config.minValue / 100);
      if (value < minThreshold) return config.minColor;
    }
    if (config.maxType === 'percent' && config.maxValue !== undefined) {
      const maxThreshold = min + range * (config.maxValue / 100);
      if (value > maxThreshold) return config.maxColor;
    }

    position = Math.max(0, Math.min(1, (value - min) / range));

    if (config.midColor && config.midType) {
      // 3-color scale
      const midPosition = config.midValue !== undefined
        ? (config.midType === 'percent' ? config.midValue / 100 : (config.midValue - min) / range)
        : 0.5;

      if (position <= midPosition) {
        const subPosition = midPosition > 0 ? position / midPosition : 0;
        return this.interpolateColor(config.minColor, config.midColor, subPosition);
      } else {
        const subPosition = midPosition < 1 ? (position - midPosition) / (1 - midPosition) : 1;
        return this.interpolateColor(config.midColor, config.maxColor, subPosition);
      }
    } else {
      // 2-color scale
      return this.interpolateColor(config.minColor, config.maxColor, position);
    }
  }

  private computeDataBar(
    config: DataBarConfig,
    value: number,
    rangeStats?: RangeStatistics
  ): ComputedCellFormat['dataBar'] {
    const { min, max } = this.getDataBarBounds(config, rangeStats);
    const range = max - min;

    const isNegative = value < 0;
    const percent = range === 0 ? 0 : Math.max(0, Math.min(100, ((value - min) / range) * 100));

    return {
      percent,
      color: isNegative && config.negativeFillColor ? config.negativeFillColor : config.color,
      gradient: config.gradient,
      isNegative,
    };
  }

  private computeIcon(
    config: IconSetConfig,
    value: number,
    rangeStats?: RangeStatistics
  ): ComputedCellFormat['icon'] {
    const min = rangeStats?.min ?? 0;
    const max = rangeStats?.max ?? 100;
    const range = max - min;

    // Calculate value's percentile position
    let position: number;
    if (rangeStats && rangeStats.values.length > 0) {
      // Find percentile in sorted values
      const sortedValues = rangeStats.values;
      const index = sortedValues.findIndex((v) => v >= value);
      position = index === -1 ? 100 : (index / sortedValues.length) * 100;
    } else {
      position = range === 0 ? 50 : ((value - min) / range) * 100;
    }

    // Determine icon index based on thresholds
    const iconCount = this.getIconCount(config.iconStyle);
    let iconIndex = 0;

    for (let i = 0; i < config.thresholds.length && i < iconCount - 1; i++) {
      const threshold = config.thresholds[i];
      let thresholdValue: number;

      switch (threshold.type) {
        case 'percent':
          thresholdValue = threshold.value;
          break;
        case 'percentile':
          thresholdValue = threshold.value;
          break;
        case 'number':
          thresholdValue = range === 0 ? 50 : ((threshold.value - min) / range) * 100;
          break;
        default:
          thresholdValue = threshold.value;
      }

      const matches =
        threshold.operator === '>='
          ? position >= thresholdValue
          : position > thresholdValue;

      if (matches) {
        iconIndex = i + 1;
      }
    }

    if (config.reverseOrder) {
      iconIndex = iconCount - 1 - iconIndex;
    }

    return {
      set: config.iconStyle,
      index: Math.max(0, Math.min(iconCount - 1, iconIndex)),
      showOnly: config.showIconOnly,
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private generateRuleId(): RuleID {
    return `cf_${++this.ruleIdCounter}_${Date.now()}`;
  }

  private invalidateCache(): void {
    this.sortedRulesCache = null;
  }

  private getSortedRules(): ConditionalFormatRule[] {
    if (!this.sortedRulesCache) {
      this.sortedRulesCache = Array.from(this.rules.values()).sort(
        (a, b) => a.priority - b.priority
      );
    }
    return this.sortedRulesCache;
  }

  private normalizeRange(range: CellRange): CellRange {
    return {
      startRow: Math.min(range.startRow, range.endRow),
      startCol: Math.min(range.startCol, range.endCol),
      endRow: Math.max(range.startRow, range.endRow),
      endCol: Math.max(range.startCol, range.endCol),
    };
  }

  private rangesOverlap(a: CellRange, b: CellRange): boolean {
    return !(
      a.endRow < b.startRow ||
      b.endRow < a.startRow ||
      a.endCol < b.startCol ||
      b.endCol < a.startCol
    );
  }

  private toNumber(value: CellValue): number | null {
    if (typeof value === 'number') return isNaN(value) ? null : value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? null : parsed;
    }
    if (typeof value === 'boolean') return value ? 1 : 0;
    return null;
  }

  private getScaleBounds(
    config: ColorScaleConfig,
    rangeStats?: RangeStatistics
  ): { min: number; max: number } {
    let min: number;
    let max: number;

    if (config.minType === 'min') {
      min = rangeStats?.min ?? 0;
    } else if (config.minType === 'number') {
      min = config.minValue ?? 0;
    } else {
      min = rangeStats?.min ?? 0;
    }

    if (config.maxType === 'max') {
      max = rangeStats?.max ?? 100;
    } else if (config.maxType === 'number') {
      max = config.maxValue ?? 100;
    } else {
      max = rangeStats?.max ?? 100;
    }

    return { min, max };
  }

  private getDataBarBounds(
    config: DataBarConfig,
    rangeStats?: RangeStatistics
  ): { min: number; max: number } {
    let min: number;
    let max: number;

    if (config.minType === 'min') {
      min = rangeStats?.min ?? 0;
    } else if (config.minType === 'number') {
      min = config.minValue ?? 0;
    } else {
      min = 0;
    }

    if (config.maxType === 'max') {
      max = rangeStats?.max ?? 100;
    } else if (config.maxType === 'number') {
      max = config.maxValue ?? 100;
    } else {
      max = 100;
    }

    return { min, max };
  }

  private getIconCount(iconStyle: string): number {
    if (iconStyle.startsWith('3')) return 3;
    if (iconStyle.startsWith('4')) return 4;
    if (iconStyle.startsWith('5')) return 5;
    return 3;
  }

  private serialToDate(serial: number): Date {
    // Excel epoch is December 30, 1899
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  private isInWeekOffset(date: Date, reference: Date, weekOffset: number): boolean {
    const refDay = reference.getDay();
    const weekStart = new Date(reference);
    weekStart.setDate(reference.getDate() - refDay + weekOffset * 7);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return date >= weekStart && date <= weekEnd;
  }

  private isInMonthOffset(date: Date, reference: Date, monthOffset: number): boolean {
    const targetMonth = new Date(reference.getFullYear(), reference.getMonth() + monthOffset, 1);
    return (
      date.getFullYear() === targetMonth.getFullYear() &&
      date.getMonth() === targetMonth.getMonth()
    );
  }

  private interpolateColor(color1: string, color2: string, percent: number): string {
    const c1 = this.hexToRgb(color1);
    const c2 = this.hexToRgb(color2);

    if (!c1 || !c2) return color1;

    const r = Math.round(c1.r + (c2.r - c1.r) * percent);
    const g = Math.round(c1.g + (c2.g - c1.g) * percent);
    const b = Math.round(c1.b + (c2.b - c1.b) * percent);

    return `#${this.toHex(r)}${this.toHex(g)}${this.toHex(b)}`;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  private toHex(n: number): string {
    return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  }

  private mergeFormats(base: CellFormat | undefined, overlay: CellFormat): CellFormat {
    if (!base) return { ...overlay };

    return {
      ...base,
      ...overlay,
    };
  }

  // ===========================================================================
  // Serialization
  // ===========================================================================

  /**
   * Export all rules for serialization.
   */
  exportRules(): ConditionalFormatRule[] {
    return this.getAllRules();
  }

  /**
   * Import rules from serialized data.
   * Optionally clears existing rules first.
   */
  importRules(rules: ConditionalFormatRule[], clearExisting = true): void {
    if (clearExisting) {
      this.clearAllRules();
    }

    for (const rule of rules) {
      this.rules.set(rule.id, rule);
      // Update counter to avoid ID collisions
      const match = rule.id.match(/cf_(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= this.ruleIdCounter) {
          this.ruleIdCounter = num + 1;
        }
      }
    }

    this.invalidateCache();
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new ConditionalFormatting engine instance.
 */
export function createConditionalFormatting(): ConditionalFormatting {
  return new ConditionalFormatting();
}

/**
 * Create range statistics from an array of values.
 * Helper for providing rangeStats to evaluate().
 */
export function createRangeStatistics(values: number[]): RangeStatistics {
  const numericValues = values.filter((v) => typeof v === 'number' && !isNaN(v));
  const sorted = [...numericValues].sort((a, b) => a - b);

  return {
    min: sorted.length > 0 ? sorted[0] : 0,
    max: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
    values: sorted,
    count: sorted.length,
  };
}
