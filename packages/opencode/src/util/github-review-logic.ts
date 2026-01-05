import { ReviewComment } from "../context/review-comment"
import { parsePatchForValidLines } from "./git-diff"

export interface RenderOptions {
    fallbackFooter: string
}

/**
 * Renders the structured review data into a comprehensive Markdown body for GitHub.
 */
export function renderReviewMarkdown(reviewData: any, opts: RenderOptions): string {
    const reviewParts: string[] = []

    // Header
    reviewParts.push("## 🤖 AI Code Review")
    reviewParts.push("")

    // Context summary (if present)
    if (reviewData.context_summary) {
        reviewParts.push(`> **Context:** ${reviewData.context_summary}`)
        reviewParts.push("")
    }

    // Summary
    reviewParts.push(`> ${reviewData.summary}`)
    reviewParts.push("")
    reviewParts.push("---")
    reviewParts.push("")

    // Checklist table (if present)
    if (reviewData.checklist && reviewData.checklist.length > 0) {
        reviewParts.push("### ✅ Review Checklist")
        reviewParts.push("")
        reviewParts.push("| # | Criterion | Status | Note |")
        reviewParts.push("|---|-----------|--------|------|")
        reviewData.checklist.forEach((item: any, index: number) => {
            const status = item.passed === true ? "✅ Pass" :
                item.passed === false ? "❌ Fail" :
                    "⏭️ Skipped"
            reviewParts.push(`| ${index + 1} | ${item.item} | ${status} | ${item.note} |`)
        })
        reviewParts.push("")
        reviewParts.push("---")
        reviewParts.push("")
    }

    // General observations
    if (reviewData.general_observations && reviewData.general_observations.length > 0) {
        reviewParts.push("### 📝 General Observations")
        reviewParts.push("")
        reviewData.general_observations.forEach((obs: string) => {
            reviewParts.push(`- ${obs}`)
        })
        reviewParts.push("")
        reviewParts.push("---")
        reviewParts.push("")
    }

    // Decision (if present)
    if (reviewData.decision) {
        const decisionEmoji = reviewData.decision === "APPROVE" ? "✅" :
            reviewData.decision === "REQUEST_CHANGES" ? "🔄" : "💬"
        reviewParts.push(`### 🎯 Decision: **${reviewData.decision}** ${decisionEmoji}`)
        reviewParts.push("")
        if (reviewData.decision_reason) {
            reviewParts.push(`**Reason:** ${reviewData.decision_reason}`)
            reviewParts.push("")
        }
    }

    // Not reviewed section (if present)
    if (reviewData.not_reviewed && reviewData.not_reviewed.length > 0) {
        reviewParts.push("**Not reviewed (per your context):**")
        reviewData.not_reviewed.forEach((item: any) => {
            reviewParts.push(`- ~~${item.item}~~ → ${item.reason}`)
        })
        reviewParts.push("")
    }

    return reviewParts.join("\n") + opts.fallbackFooter
}

export interface ValidComment {
    path: string
    line: number
    side: "LEFT" | "RIGHT"
    body: string
    start_line?: number
    start_side?: "LEFT" | "RIGHT"
}

/**
 * Filters generated comments against the PR's valid line ranges from the diff.
 */
export function filterCommentsByDiff(
    comments: any[],
    prFiles: { filename: string, patch?: string }[]
): { valid: ValidComment[], invalid: ValidComment[] } {
    // Build a map of valid paths and their line ranges from the diff
    const validPathsWithLines = new Map<string, Set<number>>()
    for (const file of prFiles) {
        if (!file.patch) continue
        const validLines = parsePatchForValidLines(file.patch)
        validPathsWithLines.set(file.filename, validLines)
    }

    const valid: ValidComment[] = []
    const invalid: ValidComment[] = []

    const formattedComments = comments.map(c => ReviewComment.formatForGitHub(c)) as ValidComment[]

    for (const comment of formattedComments) {
        const validLines = validPathsWithLines.get(comment.path)
        if (!validLines) {
            invalid.push(comment)
            continue
        }

        // Check if the comment's line (or range) is in the diff
        const lineInDiff = validLines.has(comment.line)
        const startLineInDiff = comment.start_line ? validLines.has(comment.start_line) : true

        if (lineInDiff && startLineInDiff) {
            valid.push(comment)
        } else {
            invalid.push(comment)
        }
    }

    return { valid, invalid }
}
