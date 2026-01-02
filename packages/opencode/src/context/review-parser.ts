// packages/opencode/src/context/review-parser.ts

import {
  isValidReviewResult,
  type ReviewResult,
} from "./review-comment"

/**
 * Result of parsing LLM review output
 */
export type ParsedReview =
  | {
      ok: true
      result: ReviewResult
    }
  | {
      ok: false
      error: string
      raw: string
    }

/**
 * Parse and validate LLM output into ReviewResult
 *
 * This function is intentionally defensive:
 * - Never throws
 * - Never trusts LLM output
 */
export function parseReviewResult(
  rawOutput: string,
): ParsedReview {
  if (!rawOutput || typeof rawOutput !== "string") {
    return {
      ok: false,
      error: "Empty or non-string LLM output",
      raw: String(rawOutput),
    }
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(rawOutput)
  } catch (err) {
    return {
      ok: false,
      error: "Invalid JSON output",
      raw: rawOutput,
    }
  }

  if (!isValidReviewResult(parsed)) {
    return {
      ok: false,
      error: "JSON does not match ReviewResult schema",
      raw: rawOutput,
    }
  }

  return {
    ok: true,
    result: parsed,
  }
}
