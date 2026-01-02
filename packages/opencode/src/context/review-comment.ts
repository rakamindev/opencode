// packages/opencode/src/context/review-comment.ts

/**
 * Severity level for inline review comments
 * Matches human review semantics + UI clarity
 */
export type ReviewSeverity =
  | "error"
  | "warning"
  | "info"
  | "suggestion"

/**
 * Single inline review comment
 * This maps directly to GitHub Pull Request Review API
 */
export type ReviewComment = {
  /** File path relative to repo root */
  path: string

  /**
   * Line number on the RIGHT side of the diff
   * GitHub requires this for inline comments
   */
  line: number

  /** Severity classification */
  severity: ReviewSeverity

  /** Human-readable feedback */
  message: string
}

/**
 * Structured review response from LLM
 * This is the ONLY allowed machine-readable output
 */
export type ReviewResult = {
  /** Inline review comments (preferred) */
  comments: ReviewComment[]

  /**
   * Optional high-level summary
   * Used as fallback or PR-level comment
   */
  summary?: string
}

/* ============================================================================
 * Validation helpers
 * ========================================================================== */

/**
 * Runtime validation for a single review comment
 * Prevents malformed payloads from breaking GitHub API calls
 */
export function isValidReviewComment(
  value: unknown,
): value is ReviewComment {
  if (!value || typeof value !== "object") return false

  const v = value as ReviewComment

  return (
    typeof v.path === "string" &&
    v.path.length > 0 &&
    typeof v.line === "number" &&
    Number.isInteger(v.line) &&
    v.line > 0 &&
    typeof v.message === "string" &&
    v.message.length > 0 &&
    isValidSeverity(v.severity)
  )
}

/**
 * Runtime validation for full review result
 */
export function isValidReviewResult(
  value: unknown,
): value is ReviewResult {
  if (!value || typeof value !== "object") return false

  const v = value as ReviewResult

  if (!Array.isArray(v.comments)) return false
  if (!v.comments.every(isValidReviewComment)) return false

  if (
    v.summary !== undefined &&
    typeof v.summary !== "string"
  ) {
    return false
  }

  return true
}

/**
 * Severity guard
 */
function isValidSeverity(
  value: unknown,
): value is ReviewSeverity {
  return (
    value === "error" ||
    value === "warning" ||
    value === "info" ||
    value === "suggestion"
  )
}
