// packages/opencode/src/context/injector.ts

import fs from "fs"
import path from "path"
import fg from "fast-glob"
import { CONTEXT_RULES } from "./rules"
import type { ContextRule } from "./rules"

export type InjectedFile = {
  path: string
  content: string
}

export type InjectedContext = {
  ruleId: string
  reason: string
  files: InjectedFile[]
}

/**
 * Inject additional repository context based on changed files
 */
export async function injectContextFromChanges(params: {
  repoRoot: string
  changedFiles: string[]
}): Promise<InjectedContext[]> {
  const { repoRoot, changedFiles } = params

  const results: InjectedContext[] = []

  for (const rule of CONTEXT_RULES) {
    const shouldApply =
      rule.always === true ||
      (rule.match &&
        changedFiles.some((file) => rule.match!.test(file)))

    if (!shouldApply) continue

    const matchedFiles = await resolveRuleFiles({
      repoRoot,
      rule,
    })

    if (matchedFiles.length === 0) continue

    results.push({
      ruleId: rule.id,
      reason: rule.reason,
      files: matchedFiles,
    })
  }

  return results
}

/**
 * Resolve glob patterns and read file contents safely
 */
async function resolveRuleFiles(params: {
  repoRoot: string
  rule: ContextRule
}): Promise<InjectedFile[]> {
  const { repoRoot, rule } = params

  const globPatterns = rule.include.map((p) =>
    path.posix.join(repoRoot.replace(/\\/g, "/"), p),
  )

  const paths = await fg(globPatterns, {
    dot: false,
    onlyFiles: true,
    unique: true,
  })

  const limited = rule.maxFiles
    ? paths.slice(0, rule.maxFiles)
    : paths

  const files: InjectedFile[] = []

  for (const absPath of limited) {
    try {
      const content = fs.readFileSync(absPath, "utf8")

      files.push({
        path: path.relative(repoRoot, absPath),
        content,
      })
    } catch {
      // Skip unreadable files silently
    }
  }

  return files
}
