import { describe, expect, test } from "bun:test"
import { repairAndParseJson } from "../../src/util/json-repair"

import { parsePatchForValidLines } from "../../src/util/git-diff"

describe("PR Review Utilities", () => {
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
