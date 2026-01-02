// packages/opencode/src/context/review-publisher.ts

import type { ReviewResult, ReviewComment } from "./review-comment"
import type { Octokit } from "@octokit/rest"

/**
 * Parameters required to publish a PR review
 */
export type PublishReviewParams = {
  octokit: Octokit
  owner: string
  repo: string
  pullNumber: number
  commitId: string
  review: ReviewResult
}

/**
 * Result of publishing a review
 */
export type PublishResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Publish inline review comments to GitHub.
 *
 * Strategy:
 * - Prefer inline review (pulls.createReview)
 * - If inline fails → fallback to PR-level comment
 *
 * This function NEVER throws.
 */
export async function publishReview(
  params: PublishReviewParams,
): Promise<PublishResult> {
  const { octokit, owner, repo, pullNumber, commitId, review } =
    params

  const comments = review.comments ?? []

  // Nothing to publish
  if (comments.length === 0 && !review.summary) {
    return { ok: true }
  }

  // Try inline review first
  if (comments.length > 0) {
    try {
      await octokit.pulls.createReview({
        owner,
        repo,
        pull_number: pullNumber,
        commit_id: commitId,
        event: "COMMENT",
        comments: comments.map(mapToGitHubComment),
      })

      return { ok: true }
    } catch (err: any) {
      console.error(
        "[review-publisher] inline review failed, falling back",
        err,
      )
      // fall through to fallback
    }
  }

  // Fallback: normal PR comment
  try {
    const body = buildFallbackBody(review)
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    })

    return { ok: true }
  } catch (err: any) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : String(err),
    }
  }
}

/* ============================================================================
 * Helpers
 * ========================================================================== */

/**
 * Convert ReviewComment → GitHub API format
 */
function mapToGitHubComment(
  comment: ReviewComment,
): {
  path: string
  line: number
  side: "RIGHT"
  body: string
} {
  return {
    path: comment.path,
    line: comment.line,
    side: "RIGHT",
    body: formatCommentBody(comment),
  }
}

/**
 * Add severity marker to comment body
 */
function formatCommentBody(comment: ReviewComment): string {
  const prefix = (() => {
    switch (comment.severity) {
      case "error":
        return "❌ **Error**"
      case "warning":
        return "⚠️ **Warning**"
      case "info":
        return "ℹ️ **Info**"
      case "suggestion":
        return "💡 **Suggestion**"
    }
  })()

  return `${prefix}\n\n${comment.message}`
}

/**
 * Build fallback PR-level comment if inline review fails
 */
function buildFallbackBody(review: ReviewResult): string {
  const lines: string[] = []

  if (review.summary) {
    lines.push("### Review Summary")
    lines.push(review.summary)
    lines.push("")
  }

  if (review.comments.length > 0) {
    lines.push("### Inline Findings")
    for (const c of review.comments) {
      lines.push(
        `- **${c.path}:${c.line}** (${c.severity}) — ${c.message}`,
      )
    }
  }

  return lines.join("\n")
}
