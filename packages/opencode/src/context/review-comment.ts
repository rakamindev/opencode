import z from "zod"

/**
 * Schema for inline review comments that can be posted to specific lines in a PR
 */
export namespace ReviewComment {
  /**
   * A single inline comment on a specific line or range of lines
   */
  export const InlineComment = z.object({
    /** File path relative to repository root */
    path: z.string().describe("The file path where the comment should be placed"),

    /** Starting line number for multi-line comments (optional) */
    start_line: z.number().optional().describe("Starting line for multi-line comment range"),

    /** Line number where the comment should appear */
    line: z.number().describe("The line number to comment on (end line for multi-line)"),

    /** Side of the diff to comment on */
    side: z.enum(["LEFT", "RIGHT"]).optional().default("RIGHT").describe("Which side of the diff to comment on"),

    /** The comment body */
    body: z.string().describe("The comment text in markdown"),

    /** Optional code suggestion to replace the commented lines */
    suggestion: z.string().optional().describe("Code suggestion to replace the commented lines"),

    /** Severity of the issue */
    severity: z.enum(["error", "warning", "info", "suggestion"]).optional().default("info"),
  })
  export type InlineComment = z.infer<typeof InlineComment>

  /**
   * A single checklist item for the review
   */
  export const ChecklistItem = z.object({
    /** The criterion being checked */
    item: z.string().describe("The criterion being checked"),
    /** Whether it passed */
    passed: z.boolean().nullable().describe("true=passed, false=failed, null=skipped"),
    /** Note explaining the result */
    note: z.string().describe("Why it passed/failed/skipped"),
  })
  export type ChecklistItem = z.infer<typeof ChecklistItem>

  /**
   * The full structured review output from the LLM
   */
  export const ReviewOutput = z.object({
    /** Overall summary of the review */
    summary: z.string().describe("Overall summary of the code review"),

    /** Dynamic checklist based on PR type */
    checklist: z.array(ChecklistItem).optional().describe("Dynamic checklist based on PR type"),

    /** List of inline comments on specific lines */
    comments: z.array(InlineComment).describe("List of inline comments on specific lines"),

    /** General observations that don't map to specific lines */
    general_observations: z.array(z.string()).optional().describe("General observations not tied to specific lines"),

    /** Review decision */
    decision: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]).optional().describe("Review decision"),

    /** Reason for the decision */
    decision_reason: z.string().optional().describe("Why this decision was made"),
  })
  export type ReviewOutput = z.infer<typeof ReviewOutput>

  /**
   * Format an inline comment for GitHub's review API
   * Handles the suggestion syntax for auto-fixable changes
   */
  export function formatForGitHub(comment: InlineComment): {
    path: string
    line: number
    start_line?: number
    side?: "LEFT" | "RIGHT"
    body: string
  } {
    let body = comment.body

    // Add suggestion block if provided
    if (comment.suggestion) {
      body += `\n\n\`\`\`suggestion\n${comment.suggestion}\n\`\`\``
    }

    // Add severity emoji prefix
    const severityEmoji = {
      error: "🚨",
      warning: "⚠️",
      info: "ℹ️",
      suggestion: "💡",
    }
    body = `${severityEmoji[comment.severity || "info"]} ${body}`

    return {
      path: comment.path,
      line: comment.line,
      ...(comment.start_line ? { start_line: comment.start_line } : {}),
      ...(comment.side ? { side: comment.side } : {}),
      body,
    }
  }

  /**
   * Generate the prompt instructions for structured review output
   */
  export function getReviewPromptInstructions(): string {
    return `
## Output Format

You MUST respond with a JSON object matching this exact schema:

\`\`\`json
{
  "summary": "Overall summary of your review (1-3 sentences)",
  "comments": [
    {
      "path": "relative/path/to/file.ts",
      "line": 42,
      "start_line": 40,  // optional, for multi-line comments
      "body": "Your comment explaining the issue",
      "suggestion": "// corrected code here",  // optional, for auto-fix suggestions
      "severity": "warning"  // error | warning | info | suggestion
    }
  ],
  "general_observations": [
    "Any high-level observations not tied to specific lines"
  ]
}
\`\`\`

### Guidelines for Comments:
- **Be specific**: Reference exact variable names, function calls, or patterns
- **Be actionable**: Explain what should be changed and why
- **Use suggestions**: When you know the fix, include a \`suggestion\` with corrected code
- **Set severity appropriately**:
  - \`error\`: Bugs, security issues, will cause failures
  - \`warning\`: Code smells, potential issues, missing error handling
  - \`info\`: Style issues, minor improvements
  - \`suggestion\`: Optional enhancements, alternative approaches

### Important:
- Line numbers must match the NEW version of the file (right side of diff)
- For multi-line suggestions, set \`start_line\` to the first line and \`line\` to the last
- Keep comments concise but informative
`
  }
}
