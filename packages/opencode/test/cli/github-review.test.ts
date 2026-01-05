import { describe, expect, test } from "bun:test"
import { repairAndParseJson } from "../../src/util/json-repair"
import { parsePatchForValidLines } from "../../src/util/git-diff"
import { renderReviewMarkdown, filterCommentsByDiff } from "../../src/util/github-review-logic"

describe("PR Review Utilities", () => {
  describe("github-review-logic", () => {
    describe("renderReviewMarkdown", () => {
      test("renders a basic review correctly", () => {
        const data = {
          summary: "Great job!",
          decision: "APPROVE"
        }
        const rendered = renderReviewMarkdown(data, { fallbackFooter: "\nFooter" })
        expect(rendered).toContain("## 🤖 AI Code Review")
        expect(rendered).toContain("> Great job!")
        expect(rendered).toContain("### 🎯 Decision: **APPROVE** ✅")
        expect(rendered).toContain("Footer")
      })

      test("renders complex review with checklist and observations", () => {
        const data = {
          summary: "Summary here",
          checklist: [
            { item: "Bug check", passed: true, note: "Clean" },
            { item: "Syntax", passed: false, note: "Typo on L10" }
          ],
          general_observations: ["Good style", "Missing docs"],
          decision: "REQUEST_CHANGES",
          decision_reason: "Needs typo fix"
        }
        const rendered = renderReviewMarkdown(data, { fallbackFooter: "" })
        expect(rendered).toContain("| 1 | Bug check | ✅ Pass | Clean |")
        expect(rendered).toContain("| 2 | Syntax | ❌ Fail | Typo on L10 |")
        expect(rendered).toContain("- Good style")
        expect(rendered).toContain("- Missing docs")
        expect(rendered).toContain("### 🎯 Decision: **REQUEST_CHANGES** 🔄")
        expect(rendered).toContain("**Reason:** Needs typo fix")
      })

      test("renders context summary and not_reviewed section", () => {
        const data = {
          summary: "Summary",
          context_summary: "Reviewing PR #1",
          not_reviewed: [
            { item: "Tests", reason: "Out of scope" }
          ]
        }
        const rendered = renderReviewMarkdown(data, { fallbackFooter: "" })
        expect(rendered).toContain("> **Context:** Reviewing PR #1")
        expect(rendered).toContain("- ~~Tests~~ → Out of scope")
      })
    })

    describe("filterCommentsByDiff", () => {
      test("filters comments correctly based on diff match", () => {
        const comments = [
          { path: "src/a.ts", line: 10, body: "Valid" },
          { path: "src/a.ts", line: 20, body: "Invalid Line" },
          { path: "src/b.ts", line: 10, body: "Invalid Path" }
        ]
        const prFiles = [
          { filename: "src/a.ts", patch: "@@ -1,1 +10,1 @@\n+line10\n-old\n+line11" }
        ]

        const { valid, invalid } = filterCommentsByDiff(comments, prFiles)

        expect(valid.length).toBe(1)
        expect(valid[0].body).toBe("Valid")
        expect(invalid.length).toBe(2)
        expect(invalid.some(c => c.body === "Invalid Line")).toBe(true)
        expect(invalid.some(c => c.body === "Invalid Path")).toBe(true)
      })

      test("handles multi-line comments validation", () => {
        const comments = [
          { path: "src/a.ts", line: 10, start_line: 5, body: "Invalid Range" },
        ]
        const prFiles = [
          { filename: "src/a.ts", patch: "@@ -1,1 +10,1 @@\n+line10" }
        ]
        const { valid, invalid } = filterCommentsByDiff(comments, prFiles)
        expect(valid.length).toBe(0)
        expect(invalid.length).toBe(1)
      })
    })
  })

  describe("git-diff", () => {
    test("parses valid lines correctly", () => {
      const patch = `@@ -10,1 +10,1 @@
-old
+new`
      const result = parsePatchForValidLines(patch)
      expect(result.has(10)).toBe(true)
    })

    test("handles multiple hunks", () => {
      const patch = `@@ -1,1 +1,1 @@
+line1
@@ -5,1 +5,1 @@
+line5`
      const result = parsePatchForValidLines(patch)
      expect(result.has(1)).toBe(true)
      expect(result.has(5)).toBe(true)
    })

    test("ignores deleted lines", () => {
      const patch = `@@ -1,1 +1,0 @@
-deleted`
      const result = parsePatchForValidLines(patch)
      expect(result.size).toBe(0)
    })

    test("handles context lines", () => {
      const patch = `@@ -1,3 +1,3 @@
 line1
+line2
 line3`
      const result = parsePatchForValidLines(patch)
      expect(result.has(1)).toBe(true)
      expect(result.has(2)).toBe(true)
      expect(result.has(3)).toBe(true)
    })
  })

  describe("repairAndParseJson", () => {
    test("parses valid JSON accurately", () => {
      const input = '{"key": "value"}'
      const result = repairAndParseJson(input)
      expect(result).toEqual({ key: "value" })
    })

    test("handles unescaped newlines in strings", () => {
      // Simulating LLM output where newlines are raw literals
      const input = `{"key": "line1
      line2"}`
      const result = repairAndParseJson(input)
      expect(result.key).toContain("line1")
      expect(result.key).toContain("line2")
    })

    test("handles unescaped tabs and quotes", () => {
      const input = `{"key": "some "quoted" text and a tab	"}`
      const result = repairAndParseJson(input)
      expect(result.key).toBe('some "quoted" text and a tab	')
    })

    test("normalizes trailing commas", () => {
      const input = `
      {
        "arr": [1, 2, ],
        "obj": {"a": 1, },
      }`
      const result = repairAndParseJson(input)
      expect(result.arr).toEqual([1, 2])
      expect(result.obj).toEqual({ a: 1 })
    })

    test("strips markdown code blocks in values", () => {
      const input = `
      {
        "suggestion": "\`\`\`javascript
const x = 1
\`\`\`"
      }`
      const result = repairAndParseJson(input)
      expect(result.suggestion.trim()).toBe("const x = 1")
    })

    test("strips simple invalid markdown blocks", () => {
      const input = `
      {
        "suggestion": "\`\`\`
const x = 1
\`\`\`"
      }`
      const result = repairAndParseJson(input)
      expect(result.suggestion.trim()).toBe("const x = 1")
    })

    test("handles complex nested objects with mixed issues", () => {
      const input = `
      {
        "comments": [
          {
            "body": "Multiligne
            body",
            "suggestion": "\`\`\`ts
            console.log('hello')
            \`\`\`"
          },
        ]
      }`
      const result = repairAndParseJson(input)
      expect(result.comments[0].body).toContain("Multiligne")
      expect(result.comments[0].suggestion).toContain("console.log")
    })

    test("handles already escaped backslashes", () => {
      const input = '{"key": "a\\\\b"}'
      const result = repairAndParseJson(input)
      expect(result.key).toBe("a\\b")
    })

    test("throws on truly un-repairable JSON", () => {
      const input = '{"key": "value" ... partially broken'
      expect(() => repairAndParseJson(input)).toThrow("JSON Repair failed")
    })
  })
})
