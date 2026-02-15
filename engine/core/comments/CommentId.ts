/**
 * CommentId - ID generation utilities for comment system
 *
 * ID Format:
 * - CommentId: "c_{timestamp}_{uuid}"
 * - ThreadId: "t_{timestamp}_{uuid}"
 *
 * Benefits:
 * - Globally unique (UUID v4)
 * - Sortable by creation time (timestamp prefix)
 * - Collision-resistant in offline/multi-user scenarios
 * - Type-safe (branded types)
 *
 * @module CommentId
 */

/**
 * Unique identifier for a comment
 * Format: c_{timestamp}_{uuid}
 * Example: c_1707926400000_a3f2c8d1-4b5e-6789-abcd-ef0123456789
 */
export type CommentId = string & { readonly __brand: 'CommentId' };

/**
 * Unique identifier for a comment thread
 * Format: t_{timestamp}_{uuid}
 * Example: t_1707926400000_f4e3d2c1-5b6a-7890-bcde-f0123456789a
 */
export type ThreadId = string & { readonly __brand: 'ThreadId' };

/**
 * Generate unique comment ID with timestamp prefix
 *
 * The timestamp prefix enables chronological sorting without database queries.
 * The UUID ensures global uniqueness even in offline/distributed scenarios.
 *
 * Complexity: O(1)
 *
 * @returns New CommentId
 *
 * @example
 * const id = generateCommentId();
 * // => "c_1707926400000_a3f2c8d1-4b5e-6789-abcd-ef0123456789"
 */
export function generateCommentId(): CommentId {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();
  return `c_${timestamp}_${uuid}` as CommentId;
}

/**
 * Generate unique thread ID with timestamp prefix
 *
 * Complexity: O(1)
 *
 * @returns New ThreadId
 *
 * @example
 * const id = generateThreadId();
 * // => "t_1707926400000_f4e3d2c1-5b6a-7890-bcde-f0123456789a"
 */
export function generateThreadId(): ThreadId {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();
  return `t_${timestamp}_${uuid}` as ThreadId;
}

/**
 * Extract timestamp from ID for sorting
 *
 * Complexity: O(1)
 *
 * @param id - CommentId or ThreadId
 * @returns Timestamp (milliseconds since epoch)
 *
 * @example
 * const timestamp = getIdTimestamp("c_1707926400000_...");
 * // => 1707926400000
 */
export function getIdTimestamp(id: CommentId | ThreadId): number {
  const parts = id.split('_');
  if (parts.length < 2) {
    throw new Error(`Invalid ID format: ${id}`);
  }
  const timestamp = parseInt(parts[1], 10);
  if (isNaN(timestamp)) {
    throw new Error(`Invalid timestamp in ID: ${id}`);
  }
  return timestamp;
}

/**
 * Compare IDs by timestamp (for sorting)
 *
 * Complexity: O(1)
 *
 * @param a - First ID
 * @param b - Second ID
 * @returns Negative if a < b, positive if a > b, 0 if equal
 *
 * @example
 * const ids = [id2, id1, id3];
 * ids.sort(compareIds);  // Sorts by creation time
 */
export function compareIds(
  a: CommentId | ThreadId,
  b: CommentId | ThreadId
): number {
  return getIdTimestamp(a) - getIdTimestamp(b);
}

/**
 * Validate ID format
 *
 * Complexity: O(1)
 *
 * @param id - ID to validate
 * @param type - Expected type prefix ('c' for CommentId, 't' for ThreadId)
 * @returns true if valid, false otherwise
 *
 * @example
 * isValidId("c_1707926400000_...", 'c')  // => true
 * isValidId("invalid", 'c')  // => false
 */
export function isValidId(
  id: string,
  type: 'c' | 't'
): id is CommentId | ThreadId {
  const pattern = type === 'c'
    ? /^c_\d+_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    : /^t_\d+_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return pattern.test(id);
}

/**
 * Type guard for CommentId
 */
export function isCommentId(id: string): id is CommentId {
  return isValidId(id, 'c');
}

/**
 * Type guard for ThreadId
 */
export function isThreadId(id: string): id is ThreadId {
  return isValidId(id, 't');
}
