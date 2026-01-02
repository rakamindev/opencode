// packages/opencode/src/context/formatter.ts

import type { InjectedContext } from "./injector"

const MAX_FILE_CHARS = 6_000
const MAX_TOTAL_CHARS = 20_000

/**
 * Format injected repository context into LLM-friendly prompt blocks
 */
export function formatInjectedContext(
  contexts: InjectedContext[],
): string {
  if (contexts.length === 0) return ""

  let totalChars = 0
  const blocks: string[] = []

  for (const ctx of contexts) {
    const files: string[] = []

    for (const file of ctx.files) {
      if (totalChars >= MAX_TOTAL_CHARS) break

      const truncated =
        file.content.length > MAX_FILE_CHARS
          ? file.content.slice(0, MAX_FILE_CHARS) +
            "\n\n// [truncated]"
          : file.content

      totalChars += truncated.length

      files.push(
        [
          `--- FILE: ${file.path} ---`,
          truncated,
          `--- END FILE ---`,
        ].join("\n"),
      )
    }

    if (files.length === 0) continue

    blocks.push(
      [
        `<context rule="${ctx.ruleId}">`,
        `Reason: ${ctx.reason}`,
        "",
        files.join("\n\n"),
        `</context>`,
      ].join("\n"),
    )
  }

  if (blocks.length === 0) return ""

  return [
    "### Repository Context",
    "The following files are provided as **read-only context**.",
    "They exist to help you understand architectural intent, conventions, and side-effects.",
    "",
    ...blocks,
  ].join("\n\n")
}
