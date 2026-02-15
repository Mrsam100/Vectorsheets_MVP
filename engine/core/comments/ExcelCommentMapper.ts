/**
 * ExcelCommentMapper - Convert between VectorSheet and Excel comment formats
 *
 * Excel Limitations:
 * - One comment per cell (not threaded)
 * - Author is just a name (no ID or avatar)
 * - No creation timestamp in format
 * - Rich text XML format (complex)
 *
 * VectorSheet Capabilities:
 * - Multiple threads per cell
 * - Multiple comments per thread
 * - Rich author information
 * - Timestamps for all comments
 * - Resolution status
 *
 * Mapping Strategy:
 * - Import: Convert single Excel comment → CommentThread with one comment
 * - Export: Concatenate multiple comments in thread → single Excel comment
 * - Resolution: Add [RESOLVED] marker in comment text
 *
 * @module ExcelCommentMapper
 */

import { generateCommentId, generateThreadId } from './CommentId.js';
import type {
  CommentThread,
  ExcelComment,
  ExcelRichText,
} from './types.js';

/**
 * Excel Comment Mapper
 *
 * Handles bidirectional conversion between VectorSheet CommentThreads
 * and Excel comment format.
 */
export class ExcelCommentMapper {
  /**
   * Convert Excel comment to VectorSheet CommentThread
   *
   * Excel limitations handled:
   * - No thread ID → Generate new UUID
   * - No comment ID → Generate new UUID
   * - No timestamp → Use import time
   * - Author is string → Create synthetic author object
   * - No resolution status → Default to unresolved
   *
   * Complexity: O(1) for single comment, O(n) for rich text parsing
   *
   * @param excelComment - Excel comment data
   * @returns VectorSheet CommentThread
   *
   * @example
   * const mapper = new ExcelCommentMapper();
   * const thread = mapper.fromExcel({
   *   ref: { row: 0, col: 0 },
   *   authorId: 0,
   *   authorName: "John Smith",
   *   text: "This is a comment",
   * });
   */
  fromExcel(excelComment: ExcelComment): CommentThread {
    const now = Date.now();

    // Extract plain text from Excel format
    const text = typeof excelComment.text === 'string'
      ? excelComment.text
      : this.extractPlainText(excelComment.text);

    // Create synthetic author from Excel's limited data
    const author = {
      id: `excel_${excelComment.authorId}`,  // Synthetic ID
      displayName: excelComment.authorName,
      // No avatar URL in Excel format
    };

    // Create CommentThread with single comment
    return {
      id: generateThreadId(),
      cell: excelComment.ref,
      comments: [
        {
          id: generateCommentId(),
          author,
          text,
          createdAt: excelComment.createdAt ?? now,
          // No edit tracking in Excel format
        },
      ],
      resolved: false,  // Excel doesn't have resolution status
      createdAt: now,
      version: 1,
    };
  }

  /**
   * Convert VectorSheet CommentThread to Excel comment
   *
   * Mapping strategy:
   * - Multiple comments → Concatenate with "---" separator
   * - Multiple threads → Caller must handle (Excel: 1 comment per cell)
   * - Resolution status → Add [RESOLVED] prefix to text
   * - Author ID → Use first comment's author
   *
   * Complexity: O(k) where k = number of comments in thread
   *
   * @param thread - VectorSheet CommentThread
   * @param authorRegistry - Optional map of user IDs to Excel author IDs
   * @returns Excel comment format
   *
   * @example
   * const excelComment = mapper.toExcel(thread);
   * // Excel format ready for .xlsx export
   */
  toExcel(
    thread: CommentThread,
    authorRegistry?: Map<string, number>
  ): ExcelComment {
    if (thread.comments.length === 0) {
      throw new Error(`Thread ${thread.id} has no comments`);
    }

    const firstComment = thread.comments[0];

    // If multiple comments, concatenate with author attribution
    let text: string;
    if (thread.comments.length === 1) {
      text = firstComment.text;
    } else {
      text = thread.comments
        .filter(c => !c.deletedAt)  // Exclude soft-deleted comments
        .map(c => `[${c.author.displayName}]: ${c.text}`)
        .join('\n---\n');
    }

    // Add resolution marker if resolved
    if (thread.resolved) {
      text = `[RESOLVED]\n${text}`;
    }

    // Get Excel author ID (or default to 0)
    const authorId = authorRegistry?.get(firstComment.author.id) ?? 0;

    return {
      ref: thread.cell,
      authorId,
      authorName: firstComment.author.displayName,
      text: this.createRichText(text),
      createdAt: firstComment.createdAt,
    };
  }

  /**
   * Extract plain text from Excel rich text format
   *
   * Complexity: O(n) where n = number of text runs
   *
   * @param richText - Excel rich text object
   * @returns Plain text string
   */
  private extractPlainText(richText: ExcelRichText): string {
    return richText.runs.map(run => run.text).join('');
  }

  /**
   * Create Excel rich text from plain text
   *
   * For now, creates simple rich text with default formatting.
   * Future: Support actual formatting (bold, italic, etc.)
   *
   * Complexity: O(1)
   *
   * @param plainText - Plain text string
   * @returns Excel rich text object
   */
  private createRichText(plainText: string): ExcelRichText {
    return {
      runs: [
        {
          text: plainText,
          fontSize: 9,
          fontFamily: 'Tahoma',
          // Default formatting (no bold/italic)
        },
      ],
    };
  }

  /**
   * Merge multiple threads into single Excel comment
   *
   * Since Excel only supports one comment per cell, this merges
   * multiple VectorSheet threads into a single Excel comment.
   *
   * Strategy:
   * - Concatenate all threads with "=== Thread {n} ===" separators
   * - Use first thread's first comment's author as Excel author
   *
   * Complexity: O(t * k) where t = threads, k = avg comments per thread
   *
   * @param threads - Multiple threads for same cell
   * @param authorRegistry - Optional map of user IDs to Excel author IDs
   * @returns Single Excel comment
   */
  mergeThreadsToExcel(
    threads: CommentThread[],
    authorRegistry?: Map<string, number>
  ): ExcelComment {
    if (threads.length === 0) {
      throw new Error('Cannot merge empty thread list');
    }

    if (threads.length === 1) {
      return this.toExcel(threads[0], authorRegistry);
    }

    const cell = threads[0].cell;
    const firstAuthor = threads[0].comments[0].author;

    // Merge all threads into single text
    const mergedText = threads
      .map((thread, index) => {
        const excelComment = this.toExcel(thread, authorRegistry);
        const threadText = typeof excelComment.text === 'string'
          ? excelComment.text
          : this.extractPlainText(excelComment.text);

        return `=== Thread ${index + 1} ===\n${threadText}`;
      })
      .join('\n\n');

    const authorId = authorRegistry?.get(firstAuthor.id) ?? 0;

    return {
      ref: cell,
      authorId,
      authorName: firstAuthor.displayName,
      text: this.createRichText(mergedText),
      createdAt: threads[0].createdAt,
    };
  }

  /**
   * Build author registry for Excel export
   *
   * Excel uses numeric author IDs (0, 1, 2, ...).
   * This creates a mapping from VectorSheet user IDs to Excel author IDs.
   *
   * Complexity: O(n * k) where n = threads, k = avg comments per thread
   *
   * @param threads - All threads to export
   * @returns Map of user ID → Excel author ID
   */
  buildAuthorRegistry(threads: CommentThread[]): Map<string, number> {
    const registry = new Map<string, number>();
    let nextAuthorId = 0;

    for (const thread of threads) {
      for (const comment of thread.comments) {
        const userId = comment.author.id;
        if (!registry.has(userId)) {
          registry.set(userId, nextAuthorId++);
        }
      }
    }

    return registry;
  }

  /**
   * Check if Excel comment has resolution marker
   *
   * VectorSheet exports resolved threads with [RESOLVED] prefix.
   * This detects that marker on import.
   *
   * @param text - Comment text
   * @returns true if text starts with [RESOLVED]
   */
  isResolved(text: string): boolean {
    return text.trim().startsWith('[RESOLVED]');
  }

  /**
   * Remove resolution marker from text
   *
   * @param text - Comment text with possible [RESOLVED] prefix
   * @returns Text without marker
   */
  stripResolutionMarker(text: string): string {
    return text.replace(/^\[RESOLVED\]\s*\n?/, '');
  }
}

/**
 * HTML Entity Escaping (for clipboard HTML format)
 *
 * When copying to clipboard, comments may be in HTML format.
 * These utilities handle HTML entity encoding/decoding.
 */

/**
 * Escape HTML entities
 *
 * @param text - Plain text
 * @returns HTML-safe text
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Unescape HTML entities
 *
 * @param html - HTML text
 * @returns Plain text
 */
export function unescapeHtml(html: string): string {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&');  // Must be last
}
