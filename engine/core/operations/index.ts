/**
 * VectorSheet Engine - Operations Module Exports
 */

export {
  FindReplace,
  createFindReplace,
  createFindReplaceWithWriter,
} from './FindReplace.js';
export type {
  SearchScope,
  SearchIn,
  SearchDirection,
  FindOptions,
  ReplaceOptions,
  Match,
  FindResult,
  FindAllResult,
  ReplaceResult,
  ReplaceAllResult,
  FindReplaceState,
  FindReplaceEvents,
  DataReader,
  DataWriter,
} from './FindReplace.js';

export {
  SortFilter,
  createSortFilter,
  createSortFilterWithWriter,
} from './SortFilter.js';
export type {
  SortOrder,
  SortRule,
  SortOptions,
  SortResult,
  FilterOperator,
  FilterType,
  FilterCondition,
  ColumnFilter,
  Filter,
  AutoFilterState,
  FilterResult,
  FilterEvents,
  SortFilterDataReader,
  SortFilterDataWriter,
} from './SortFilter.js';
