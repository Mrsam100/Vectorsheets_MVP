/**
 * VectorSheet Engine - Data Validation (Rule-Based Guard System)
 *
 * Production-grade cell validation to prevent data corruption.
 * Validates values before they're committed to cells.
 *
 * Features:
 * - Whole number / Decimal validation
 * - Date / Time validation
 * - Text length validation
 * - List (dropdown) validation
 * - Custom formula validation
 * - Input messages for guidance
 * - Error messages with severity levels
 * - Range-based rule management
 *
 * Design:
 * - Deterministic: Same input → same result
 * - Engine-level only: No UI/DOM
 * - Decoupled: Works via FormulaEvaluator interface
 * - Strict TypeScript
 */

import { CellRef, CellRange, rangeContains } from '../types/index.js';

// =============================================================================
// Types - Validation Configuration
// =============================================================================

export type ValidationType =
  | 'any'           // No validation
  | 'wholeNumber'   // Integer only
  | 'decimal'       // Any number
  | 'list'          // From dropdown
  | 'date'          // Date values
  | 'time'          // Time values
  | 'textLength'    // Character count
  | 'custom';       // Formula-based

export type ValidationOperator =
  | 'between'
  | 'notBetween'
  | 'equal'
  | 'notEqual'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual';

export type ErrorStyle = 'stop' | 'warning' | 'information';

export type RuleID = string;

// =============================================================================
// Types - Rule Definition
// =============================================================================

export interface ValidationRuleConfig {
  /** Validation type */
  type: ValidationType;
  /** Comparison operator (for numbers, dates, text length) */
  operator?: ValidationOperator;
  /** Primary comparison value or formula */
  value1?: string | number | Date;
  /** Secondary value (for between operators) */
  value2?: string | number | Date;
  /** List items for dropdown */
  listItems?: string[];
  /** Custom validation formula (returns TRUE/FALSE) */
  formula?: string;
  /** Allow blank/empty cells (default: true) */
  allowBlank?: boolean;
  /** Ignore errors in custom formula (default: false) */
  ignoreError?: boolean;
  /** Show dropdown arrow for list type (default: true) */
  showDropdown?: boolean;
  /** Show input message when cell selected (default: false) */
  showInputMessage?: boolean;
  /** Input message title */
  inputTitle?: string;
  /** Input message body */
  inputMessage?: string;
  /** Show error alert on invalid (default: true) */
  showErrorAlert?: boolean;
  /** Error severity level (default: 'stop') */
  errorStyle?: ErrorStyle;
  /** Error dialog title */
  errorTitle?: string;
  /** Error dialog message */
  errorMessage?: string;
}

export interface ValidationRule extends ValidationRuleConfig {
  /** Unique rule ID */
  id: RuleID;
  /** Range this rule applies to */
  range: CellRange;
}

// =============================================================================
// Types - Validation Result
// =============================================================================

export interface ValidationResult {
  /** Is the value valid */
  isValid: boolean;
  /** Error message if invalid */
  message?: string;
  /** Error title if invalid */
  title?: string;
  /** Severity level */
  severity?: ErrorStyle;
  /** The rule that was violated */
  ruleId?: RuleID;
  /** Whether to allow the value despite invalidity (warning/info) */
  allowAnyway?: boolean;
}

// =============================================================================
// Types - Events
// =============================================================================

export interface DataValidationEvents {
  /** Called when rule is added */
  onRuleAdd?: (rule: ValidationRule) => void;
  /** Called when rule is removed */
  onRuleRemove?: (ruleId: RuleID) => void;
  /** Called when rule is updated */
  onRuleUpdate?: (rule: ValidationRule) => void;
  /** Called when validation fails */
  onValidationFail?: (cell: CellRef, result: ValidationResult) => void;
}

// =============================================================================
// Types - Formula Evaluator Interface
// =============================================================================

/**
 * Interface for evaluating custom validation formulas.
 * Allows custom formula validation without coupling to FormulaEngine.
 */
export interface FormulaEvaluator {
  /**
   * Evaluate a formula and return the result.
   * @param formula The formula string (without leading =)
   * @param context The cell being validated
   * @returns The formula result (should be boolean for validation)
   */
  evaluate(formula: string, context: CellRef): unknown;
}

// =============================================================================
// Data Validation Engine
// =============================================================================

export class DataValidation {
  /** Rules indexed by ID */
  private rules: Map<RuleID, ValidationRule> = new Map();

  /** Reverse index: cell key -> rule IDs (supports overlapping rules) */
  private cellRules: Map<string, Set<RuleID>> = new Map();

  /** Event handlers */
  private events: DataValidationEvents = {};

  /** Optional formula evaluator for custom validation */
  private formulaEvaluator: FormulaEvaluator | null = null;

  /** Rule ID counter */
  private ruleIdCounter = 0;

  constructor(formulaEvaluator?: FormulaEvaluator) {
    this.formulaEvaluator = formulaEvaluator ?? null;
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Set formula evaluator for custom validation.
   */
  setFormulaEvaluator(evaluator: FormulaEvaluator): void {
    this.formulaEvaluator = evaluator;
  }

  /**
   * Set event handlers.
   */
  setEventHandlers(events: DataValidationEvents): void {
    this.events = { ...this.events, ...events };
  }

  // ===========================================================================
  // Primary API: addRule()
  // ===========================================================================

  /**
   * Add a validation rule to a range.
   *
   * @param range The range to validate
   * @param config The validation configuration
   * @returns The rule ID
   */
  addRule(range: CellRange, config: ValidationRuleConfig): RuleID {
    const id: RuleID = `val_${++this.ruleIdCounter}_${Date.now()}`;

    const rule: ValidationRule = {
      ...config,
      id,
      range: { ...range },
      allowBlank: config.allowBlank ?? true,
      showDropdown: config.showDropdown ?? true,
      showInputMessage: config.showInputMessage ?? false,
      showErrorAlert: config.showErrorAlert ?? true,
      errorStyle: config.errorStyle ?? 'stop',
    };

    this.rules.set(id, rule);

    // Index cells
    this.indexRuleCells(rule);

    this.events.onRuleAdd?.(rule);

    return id;
  }

  // ===========================================================================
  // Primary API: removeRule()
  // ===========================================================================

  /**
   * Remove a validation rule by ID.
   *
   * @param ruleId The rule ID to remove
   * @returns True if removed
   */
  removeRule(ruleId: RuleID): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    // Remove from cell index
    this.unindexRuleCells(rule);

    this.rules.delete(ruleId);
    this.events.onRuleRemove?.(ruleId);

    return true;
  }

  // ===========================================================================
  // Primary API: validate()
  // ===========================================================================

  /**
   * Validate a value for a cell.
   *
   * @param cellRef The cell being validated
   * @param value The value to validate
   * @returns Validation result
   */
  validate(cellRef: CellRef, value: unknown): ValidationResult {
    const ruleIds = this.getRuleIdsForCell(cellRef);

    if (ruleIds.size === 0) {
      return { isValid: true };
    }

    // Check all rules (first failure wins)
    for (const ruleId of ruleIds) {
      const rule = this.rules.get(ruleId);
      if (!rule) continue;

      // Skip 'any' type
      if (rule.type === 'any') continue;

      const result = this.validateAgainstRule(value, rule, cellRef);

      if (!result.isValid) {
        this.events.onValidationFail?.(cellRef, result);
        return result;
      }
    }

    return { isValid: true };
  }

  /**
   * Validate a value using cell coordinates.
   */
  validateCell(row: number, col: number, value: unknown): ValidationResult {
    return this.validate({ row, col }, value);
  }

  // ===========================================================================
  // Additional API
  // ===========================================================================

  /**
   * Update an existing rule.
   */
  updateRule(ruleId: RuleID, config: Partial<ValidationRuleConfig>): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    // Update rule properties
    Object.assign(rule, config);

    this.events.onRuleUpdate?.(rule);
    return true;
  }

  /**
   * Get rule by ID.
   */
  getRule(ruleId: RuleID): ValidationRule | null {
    return this.rules.get(ruleId) ?? null;
  }

  /**
   * Get all rules for a cell.
   */
  getRulesForCell(cellRef: CellRef): ValidationRule[] {
    const ruleIds = this.getRuleIdsForCell(cellRef);
    const rules: ValidationRule[] = [];

    for (const id of ruleIds) {
      const rule = this.rules.get(id);
      if (rule) rules.push(rule);
    }

    return rules;
  }

  /**
   * Get the primary rule for a cell (first match).
   */
  getRuleForCell(row: number, col: number): ValidationRule | null {
    const rules = this.getRulesForCell({ row, col });
    return rules[0] ?? null;
  }

  /**
   * Get all rules.
   */
  getAllRules(): ValidationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Check if a cell has validation.
   */
  hasValidation(cellRef: CellRef): boolean {
    return this.getRuleIdsForCell(cellRef).size > 0;
  }

  /**
   * Get input message for a cell.
   */
  getInputMessage(cellRef: CellRef): { title: string; message: string } | null {
    const rules = this.getRulesForCell(cellRef);

    for (const rule of rules) {
      if (rule.showInputMessage && (rule.inputTitle || rule.inputMessage)) {
        return {
          title: rule.inputTitle ?? '',
          message: rule.inputMessage ?? '',
        };
      }
    }

    return null;
  }

  /**
   * Get dropdown items for a cell.
   */
  getDropdownItems(cellRef: CellRef): string[] | null {
    const rules = this.getRulesForCell(cellRef);

    for (const rule of rules) {
      if (rule.type === 'list' && rule.showDropdown && rule.listItems) {
        return [...rule.listItems];
      }
    }

    return null;
  }

  /**
   * Clear validation from a range.
   */
  clearValidation(range: CellRange): void {
    const affectedRules = new Set<RuleID>();

    for (let row = range.startRow; row <= range.endRow; row++) {
      for (let col = range.startCol; col <= range.endCol; col++) {
        const key = this.cellKey(row, col);
        const ruleIds = this.cellRules.get(key);

        if (ruleIds) {
          for (const id of ruleIds) {
            affectedRules.add(id);
          }
          this.cellRules.delete(key);
        }
      }
    }

    // Remove orphaned rules
    for (const ruleId of affectedRules) {
      const rule = this.rules.get(ruleId);
      if (rule && !this.hasAnyCellMapped(rule)) {
        this.rules.delete(ruleId);
        this.events.onRuleRemove?.(ruleId);
      }
    }
  }

  /**
   * Clear all validation rules.
   */
  clear(): void {
    this.rules.clear();
    this.cellRules.clear();
  }

  // ===========================================================================
  // Serialization
  // ===========================================================================

  /**
   * Export all rules for persistence.
   */
  exportRules(): ValidationRule[] {
    return this.getAllRules().map(rule => ({
      ...rule,
      // Convert Date objects to ISO strings for serialization
      value1: rule.value1 instanceof Date ? rule.value1.toISOString() : rule.value1,
      value2: rule.value2 instanceof Date ? rule.value2.toISOString() : rule.value2,
    }));
  }

  /**
   * Import rules from persistence.
   */
  importRules(rules: ValidationRule[]): void {
    this.clear();

    for (const rule of rules) {
      this.rules.set(rule.id, { ...rule });
      this.indexRuleCells(rule);

      // Update counter to avoid ID collisions
      const match = rule.id.match(/^val_(\d+)_/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > this.ruleIdCounter) {
          this.ruleIdCounter = num;
        }
      }
    }
  }

  // ===========================================================================
  // Convenience Rule Creators
  // ===========================================================================

  /**
   * Create a dropdown list rule.
   */
  createDropdownRule(
    range: CellRange,
    items: string[],
    options?: Partial<ValidationRuleConfig>
  ): RuleID {
    return this.addRule(range, {
      type: 'list',
      listItems: items,
      showDropdown: true,
      allowBlank: options?.allowBlank ?? true,
      showInputMessage: options?.showInputMessage ?? false,
      inputTitle: options?.inputTitle,
      inputMessage: options?.inputMessage,
      showErrorAlert: true,
      errorStyle: 'stop',
      errorTitle: options?.errorTitle ?? 'Invalid Entry',
      errorMessage: options?.errorMessage ?? 'Please select a value from the list',
      ...options,
    });
  }

  /**
   * Create a whole number rule.
   */
  createWholeNumberRule(
    range: CellRange,
    operator: ValidationOperator,
    value1: number,
    value2?: number,
    options?: Partial<ValidationRuleConfig>
  ): RuleID {
    return this.addRule(range, {
      type: 'wholeNumber',
      operator,
      value1,
      value2,
      showErrorAlert: true,
      errorStyle: 'stop',
      errorTitle: options?.errorTitle ?? 'Invalid Entry',
      ...options,
    });
  }

  /**
   * Create a decimal number rule.
   */
  createDecimalRule(
    range: CellRange,
    operator: ValidationOperator,
    value1: number,
    value2?: number,
    options?: Partial<ValidationRuleConfig>
  ): RuleID {
    return this.addRule(range, {
      type: 'decimal',
      operator,
      value1,
      value2,
      showErrorAlert: true,
      errorStyle: 'stop',
      errorTitle: options?.errorTitle ?? 'Invalid Entry',
      ...options,
    });
  }

  /**
   * Create a date rule.
   */
  createDateRule(
    range: CellRange,
    operator: ValidationOperator,
    value1: Date,
    value2?: Date,
    options?: Partial<ValidationRuleConfig>
  ): RuleID {
    return this.addRule(range, {
      type: 'date',
      operator,
      value1,
      value2,
      showErrorAlert: true,
      errorStyle: 'stop',
      errorTitle: options?.errorTitle ?? 'Invalid Entry',
      ...options,
    });
  }

  /**
   * Create a time rule.
   */
  createTimeRule(
    range: CellRange,
    operator: ValidationOperator,
    value1: string | number,
    value2?: string | number,
    options?: Partial<ValidationRuleConfig>
  ): RuleID {
    return this.addRule(range, {
      type: 'time',
      operator,
      value1,
      value2,
      showErrorAlert: true,
      errorStyle: 'stop',
      errorTitle: options?.errorTitle ?? 'Invalid Entry',
      ...options,
    });
  }

  /**
   * Create a text length rule.
   */
  createTextLengthRule(
    range: CellRange,
    operator: ValidationOperator,
    value1: number,
    value2?: number,
    options?: Partial<ValidationRuleConfig>
  ): RuleID {
    return this.addRule(range, {
      type: 'textLength',
      operator,
      value1,
      value2,
      showErrorAlert: true,
      errorStyle: 'stop',
      errorTitle: options?.errorTitle ?? 'Invalid Entry',
      ...options,
    });
  }

  /**
   * Create a custom formula rule.
   */
  createCustomRule(
    range: CellRange,
    formula: string,
    options?: Partial<ValidationRuleConfig>
  ): RuleID {
    return this.addRule(range, {
      type: 'custom',
      formula,
      showErrorAlert: true,
      errorStyle: 'stop',
      errorTitle: options?.errorTitle ?? 'Invalid Entry',
      errorMessage: options?.errorMessage ?? 'The value does not meet the validation criteria',
      ...options,
    });
  }

  // ===========================================================================
  // Private: Validation Logic
  // ===========================================================================

  private validateAgainstRule(
    value: unknown,
    rule: ValidationRule,
    context: CellRef
  ): ValidationResult {
    // Check blank
    const isBlank = value === null || value === undefined || value === '';

    if (isBlank) {
      if (rule.allowBlank) {
        return { isValid: true };
      }
      return this.createFailResult(rule, 'This cell cannot be empty');
    }

    // Validate based on type
    switch (rule.type) {
      case 'wholeNumber':
        return this.validateWholeNumber(value, rule);

      case 'decimal':
        return this.validateDecimal(value, rule);

      case 'list':
        return this.validateList(value, rule);

      case 'date':
        return this.validateDate(value, rule);

      case 'time':
        return this.validateTime(value, rule);

      case 'textLength':
        return this.validateTextLength(value, rule);

      case 'custom':
        return this.validateCustom(value, rule, context);

      default:
        return { isValid: true };
    }
  }

  private validateWholeNumber(value: unknown, rule: ValidationRule): ValidationResult {
    const num = this.toNumber(value);

    if (isNaN(num)) {
      return this.createFailResult(rule, 'The value must be a number');
    }

    if (!Number.isInteger(num)) {
      return this.createFailResult(rule, 'The value must be a whole number');
    }

    if (!this.checkOperator(num, rule)) {
      return this.createFailResult(rule, this.getNumberErrorMessage(rule));
    }

    return { isValid: true };
  }

  private validateDecimal(value: unknown, rule: ValidationRule): ValidationResult {
    const num = this.toNumber(value);

    if (isNaN(num)) {
      return this.createFailResult(rule, 'The value must be a number');
    }

    if (!this.checkOperator(num, rule)) {
      return this.createFailResult(rule, this.getNumberErrorMessage(rule));
    }

    return { isValid: true };
  }

  private validateList(value: unknown, rule: ValidationRule): ValidationResult {
    if (!rule.listItems || rule.listItems.length === 0) {
      return { isValid: true };
    }

    const strValue = String(value).toLowerCase().trim();
    const found = rule.listItems.some(item => item.toLowerCase().trim() === strValue);

    if (!found) {
      return this.createFailResult(rule, 'The value must be from the list');
    }

    return { isValid: true };
  }

  private validateDate(value: unknown, rule: ValidationRule): ValidationResult {
    const date = this.toDate(value);

    if (!date) {
      return this.createFailResult(rule, 'The value must be a valid date');
    }

    const v1 = this.toDate(rule.value1);
    const v2 = this.toDate(rule.value2);

    if (!this.checkDateOperator(date, v1, v2, rule.operator)) {
      return this.createFailResult(rule, this.getDateErrorMessage(rule));
    }

    return { isValid: true };
  }

  private validateTime(value: unknown, rule: ValidationRule): ValidationResult {
    const time = this.toTime(value);

    if (time === null) {
      return this.createFailResult(rule, 'The value must be a valid time');
    }

    const v1 = this.toTime(rule.value1);
    const v2 = this.toTime(rule.value2);

    if (v1 === null) {
      return { isValid: true };
    }

    if (!this.checkTimeOperator(time, v1, v2, rule.operator)) {
      return this.createFailResult(rule, this.getTimeErrorMessage(rule));
    }

    return { isValid: true };
  }

  private validateTextLength(value: unknown, rule: ValidationRule): ValidationResult {
    const length = String(value).length;

    if (!this.checkOperator(length, rule)) {
      return this.createFailResult(rule, this.getTextLengthErrorMessage(rule));
    }

    return { isValid: true };
  }

  private validateCustom(_value: unknown, rule: ValidationRule, context: CellRef): ValidationResult {
    if (!rule.formula) {
      return { isValid: true };
    }

    if (!this.formulaEvaluator) {
      // No evaluator - skip custom validation
      return { isValid: true };
    }

    try {
      const result = this.formulaEvaluator.evaluate(rule.formula, context);

      // Treat truthy as valid
      const isValid = Boolean(result);

      if (!isValid) {
        return this.createFailResult(
          rule,
          rule.errorMessage ?? 'The value does not meet the validation criteria'
        );
      }

      return { isValid: true };
    } catch (error) {
      if (rule.ignoreError) {
        return { isValid: true };
      }
      return this.createFailResult(rule, 'Error evaluating validation formula');
    }
  }

  // ===========================================================================
  // Private: Operator Checks
  // ===========================================================================

  private checkOperator(value: number, rule: ValidationRule): boolean {
    const v1 = this.toNumber(rule.value1);
    const v2 = this.toNumber(rule.value2);

    switch (rule.operator) {
      case 'between':
        return value >= Math.min(v1, v2) && value <= Math.max(v1, v2);
      case 'notBetween':
        return value < Math.min(v1, v2) || value > Math.max(v1, v2);
      case 'equal':
        return value === v1;
      case 'notEqual':
        return value !== v1;
      case 'greaterThan':
        return value > v1;
      case 'lessThan':
        return value < v1;
      case 'greaterThanOrEqual':
        return value >= v1;
      case 'lessThanOrEqual':
        return value <= v1;
      default:
        return true;
    }
  }

  private checkDateOperator(value: Date, v1: Date | null, v2: Date | null, operator?: ValidationOperator): boolean {
    if (!v1) return true;

    const t = value.getTime();
    const t1 = v1.getTime();
    const t2 = v2?.getTime() ?? t1;

    switch (operator) {
      case 'between':
        return t >= Math.min(t1, t2) && t <= Math.max(t1, t2);
      case 'notBetween':
        return t < Math.min(t1, t2) || t > Math.max(t1, t2);
      case 'equal':
        return t === t1;
      case 'notEqual':
        return t !== t1;
      case 'greaterThan':
        return t > t1;
      case 'lessThan':
        return t < t1;
      case 'greaterThanOrEqual':
        return t >= t1;
      case 'lessThanOrEqual':
        return t <= t1;
      default:
        return true;
    }
  }

  private checkTimeOperator(value: number, v1: number, v2: number | null, operator?: ValidationOperator): boolean {
    const t2 = v2 ?? v1;

    switch (operator) {
      case 'between':
        return value >= Math.min(v1, t2) && value <= Math.max(v1, t2);
      case 'notBetween':
        return value < Math.min(v1, t2) || value > Math.max(v1, t2);
      case 'equal':
        return Math.abs(value - v1) < 0.00001; // ~1 second tolerance
      case 'notEqual':
        return Math.abs(value - v1) >= 0.00001;
      case 'greaterThan':
        return value > v1;
      case 'lessThan':
        return value < v1;
      case 'greaterThanOrEqual':
        return value >= v1;
      case 'lessThanOrEqual':
        return value <= v1;
      default:
        return true;
    }
  }

  // ===========================================================================
  // Private: Type Conversion
  // ===========================================================================

  private toNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value);
    return NaN;
  }

  private toDate(value: unknown): Date | null {
    if (value instanceof Date) return value;

    if (typeof value === 'number') {
      // Excel serial date (days since 1900-01-01)
      const date = new Date((value - 25569) * 86400 * 1000);
      return isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === 'string') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  private toTime(value: unknown): number | null {
    if (typeof value === 'number') {
      // Fraction of day (0-1)
      return value % 1;
    }

    if (typeof value === 'string') {
      // Parse time string like "14:30" or "2:30 PM"
      const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = match[3] ? parseInt(match[3], 10) : 0;
        const period = match[4]?.toUpperCase();

        if (period === 'PM' && hours < 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;

        return (hours * 3600 + minutes * 60 + seconds) / 86400;
      }
    }

    return null;
  }

  // ===========================================================================
  // Private: Error Messages
  // ===========================================================================

  private createFailResult(rule: ValidationRule, defaultMessage: string): ValidationResult {
    const severity = rule.errorStyle ?? 'stop';

    return {
      isValid: false,
      message: rule.showErrorAlert !== false ? (rule.errorMessage ?? defaultMessage) : undefined,
      title: rule.errorTitle,
      severity,
      ruleId: rule.id,
      allowAnyway: severity !== 'stop',
    };
  }

  private getNumberErrorMessage(rule: ValidationRule): string {
    const v1 = rule.value1;
    const v2 = rule.value2;

    switch (rule.operator) {
      case 'between': return `The value must be between ${v1} and ${v2}`;
      case 'notBetween': return `The value must not be between ${v1} and ${v2}`;
      case 'equal': return `The value must equal ${v1}`;
      case 'notEqual': return `The value must not equal ${v1}`;
      case 'greaterThan': return `The value must be greater than ${v1}`;
      case 'lessThan': return `The value must be less than ${v1}`;
      case 'greaterThanOrEqual': return `The value must be greater than or equal to ${v1}`;
      case 'lessThanOrEqual': return `The value must be less than or equal to ${v1}`;
      default: return 'Invalid value';
    }
  }

  private getDateErrorMessage(rule: ValidationRule): string {
    const v1 = rule.value1;
    const v2 = rule.value2;

    switch (rule.operator) {
      case 'between': return `The date must be between ${v1} and ${v2}`;
      case 'notBetween': return `The date must not be between ${v1} and ${v2}`;
      case 'equal': return `The date must be ${v1}`;
      case 'notEqual': return `The date must not be ${v1}`;
      case 'greaterThan': return `The date must be after ${v1}`;
      case 'lessThan': return `The date must be before ${v1}`;
      case 'greaterThanOrEqual': return `The date must be on or after ${v1}`;
      case 'lessThanOrEqual': return `The date must be on or before ${v1}`;
      default: return 'Invalid date';
    }
  }

  private getTimeErrorMessage(rule: ValidationRule): string {
    const v1 = rule.value1;
    const v2 = rule.value2;

    switch (rule.operator) {
      case 'between': return `The time must be between ${v1} and ${v2}`;
      case 'notBetween': return `The time must not be between ${v1} and ${v2}`;
      case 'equal': return `The time must be ${v1}`;
      case 'notEqual': return `The time must not be ${v1}`;
      case 'greaterThan': return `The time must be after ${v1}`;
      case 'lessThan': return `The time must be before ${v1}`;
      case 'greaterThanOrEqual': return `The time must be at or after ${v1}`;
      case 'lessThanOrEqual': return `The time must be at or before ${v1}`;
      default: return 'Invalid time';
    }
  }

  private getTextLengthErrorMessage(rule: ValidationRule): string {
    const v1 = rule.value1;
    const v2 = rule.value2;

    switch (rule.operator) {
      case 'between': return `Text length must be between ${v1} and ${v2} characters`;
      case 'notBetween': return `Text length must not be between ${v1} and ${v2} characters`;
      case 'equal': return `Text length must be exactly ${v1} characters`;
      case 'notEqual': return `Text length must not be ${v1} characters`;
      case 'greaterThan': return `Text length must be more than ${v1} characters`;
      case 'lessThan': return `Text length must be less than ${v1} characters`;
      case 'greaterThanOrEqual': return `Text length must be at least ${v1} characters`;
      case 'lessThanOrEqual': return `Text length must be at most ${v1} characters`;
      default: return 'Invalid text length';
    }
  }

  // ===========================================================================
  // Private: Cell Indexing
  // ===========================================================================

  private cellKey(row: number, col: number): string {
    return `${row}_${col}`;
  }

  private getRuleIdsForCell(cellRef: CellRef): Set<RuleID> {
    // Check direct mapping first (fast path)
    const key = this.cellKey(cellRef.row, cellRef.col);
    const direct = this.cellRules.get(key);
    if (direct && direct.size > 0) {
      return direct;
    }

    // Check all rules for containment (for large ranges we don't fully index)
    const result = new Set<RuleID>();
    for (const [id, rule] of this.rules) {
      if (rangeContains(rule.range, cellRef.row, cellRef.col)) {
        result.add(id);
      }
    }

    return result;
  }

  private indexRuleCells(rule: ValidationRule): void {
    // Only index cells for small ranges (performance optimization)
    const cellCount = (rule.range.endRow - rule.range.startRow + 1) *
                     (rule.range.endCol - rule.range.startCol + 1);

    if (cellCount > 10000) {
      // Large range - don't index individual cells
      return;
    }

    for (let row = rule.range.startRow; row <= rule.range.endRow; row++) {
      for (let col = rule.range.startCol; col <= rule.range.endCol; col++) {
        const key = this.cellKey(row, col);
        let ruleSet = this.cellRules.get(key);
        if (!ruleSet) {
          ruleSet = new Set();
          this.cellRules.set(key, ruleSet);
        }
        ruleSet.add(rule.id);
      }
    }
  }

  private unindexRuleCells(rule: ValidationRule): void {
    for (let row = rule.range.startRow; row <= rule.range.endRow; row++) {
      for (let col = rule.range.startCol; col <= rule.range.endCol; col++) {
        const key = this.cellKey(row, col);
        const ruleSet = this.cellRules.get(key);
        if (ruleSet) {
          ruleSet.delete(rule.id);
          if (ruleSet.size === 0) {
            this.cellRules.delete(key);
          }
        }
      }
    }
  }

  private hasAnyCellMapped(rule: ValidationRule): boolean {
    for (let row = rule.range.startRow; row <= rule.range.endRow; row++) {
      for (let col = rule.range.startCol; col <= rule.range.endCol; col++) {
        const key = this.cellKey(row, col);
        const ruleSet = this.cellRules.get(key);
        if (ruleSet?.has(rule.id)) {
          return true;
        }
      }
    }
    return false;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a DataValidation instance.
 */
export function createDataValidation(formulaEvaluator?: FormulaEvaluator): DataValidation {
  return new DataValidation(formulaEvaluator);
}
