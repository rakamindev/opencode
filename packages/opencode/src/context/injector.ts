import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { Ripgrep } from "../file/ripgrep"
import { File } from "../file"
import { ReviewRules } from "./rules"
import path from "path"

export namespace ContextInjector {
    const log = Log.create({ service: "context-injector" })

    /**
     * Represents a file fetched as context
     */
    export interface ContextFile {
        path: string
        content: string
        truncated: boolean
    }

    /**
     * Result of context injection for a PR review
     */
    export interface InjectionResult {
        /** Rules that were triggered by the changed files */
        matchedRules: ReviewRules.Rule[]
        /** Files fetched as additional context */
        contextFiles: ContextFile[]
        /** Additional prompts from matched rules */
        rulePrompts: string[]
        /** Summary of what context was injected */
        summary: string
    }

    /**
     * Fetch context files based on matched rules
     */
    async function fetchContextFiles(
        rules: ReviewRules.Rule[],
        cwd: string
    ): Promise<ContextFile[]> {
        const seenPaths = new Set<string>()
        const contextFiles: ContextFile[] = []

        for (const rule of rules) {
            const patterns = rule.context.include
            const maxFiles = rule.context.maxFiles ?? 10
            const maxLines = rule.context.maxLinesPerFile ?? 500
            let fileCount = 0

            for (const pattern of patterns) {
                if (fileCount >= maxFiles) break

                try {
                    for await (const file of Ripgrep.files({
                        cwd,
                        glob: [pattern],
                        maxDepth: 10,
                    })) {
                        if (fileCount >= maxFiles) break

                        const fullPath = path.join(cwd, file)
                        if (seenPaths.has(fullPath)) continue
                        seenPaths.add(fullPath)

                        try {
                            const bunFile = Bun.file(fullPath)
                            if (!(await bunFile.exists())) continue

                            // Skip binary files
                            const type = bunFile.type?.toLowerCase() ?? ""
                            if (type.startsWith("image/") || type.startsWith("video/") || type.startsWith("audio/")) {
                                continue
                            }

                            let content = await bunFile.text()
                            let truncated = false

                            // Truncate if too long
                            const lines = content.split("\n")
                            if (lines.length > maxLines) {
                                content = lines.slice(0, maxLines).join("\n") + `\n\n... (truncated, ${lines.length - maxLines} more lines)`
                                truncated = true
                            }

                            contextFiles.push({
                                path: file,
                                content,
                                truncated,
                            })
                            fileCount++

                            log.info("fetched context file", { rule: rule.name, file, lines: lines.length, truncated })
                        } catch (e) {
                            log.warn("failed to read context file", { file, error: e })
                        }
                    }
                } catch (e) {
                    log.warn("failed to glob for context files", { pattern, error: e })
                }
            }
        }

        return contextFiles
    }

    /**
     * Format context files into a prompt section
     */
    function formatContextSection(contextFiles: ContextFile[]): string {
        if (contextFiles.length === 0) return ""

        const sections: string[] = [
            "<repository_context>",
            "The following files are provided as additional context from the repository:",
            "",
        ]

        for (const file of contextFiles) {
            sections.push(`<file path="${file.path}"${file.truncated ? " truncated=\"true\"" : ""}>`)
            sections.push(file.content)
            sections.push("</file>")
            sections.push("")
        }

        sections.push("</repository_context>")
        return sections.join("\n")
    }

    /**
     * Format rule prompts into a prompt section
     */
    function formatRulePrompts(rules: ReviewRules.Rule[]): string {
        const prompts = rules
            .filter((r) => r.prompt)
            .map((r) => `### ${r.name}\n${r.prompt}`)

        if (prompts.length === 0) return ""

        return [
            "<review_guidelines>",
            "Based on the types of files changed, apply these specific review guidelines:",
            "",
            ...prompts,
            "</review_guidelines>",
        ].join("\n")
    }

    /**
     * Main entry point: inject context for a PR review
     */
    export async function inject(changedFiles: string[]): Promise<InjectionResult> {
        using _ = log.time("inject")
        const cwd = Instance.directory

        // Load rules (default + custom)
        const rules = await ReviewRules.load()

        // Match rules against changed files
        const matchedRules = await ReviewRules.match(changedFiles, rules)

        if (matchedRules.length === 0) {
            log.info("no rules matched", { changedFiles: changedFiles.length })
            return {
                matchedRules: [],
                contextFiles: [],
                rulePrompts: [],
                summary: "No context injection rules matched the changed files.",
            }
        }

        log.info("rules matched", { count: matchedRules.length, rules: matchedRules.map((r) => r.name) })

        // Fetch context files based on matched rules
        const contextFiles = await fetchContextFiles(matchedRules, cwd)

        // Collect rule prompts
        const rulePrompts = matchedRules
            .filter((r) => r.prompt)
            .map((r) => r.prompt!)

        // Generate summary
        const summary = [
            `Context injection applied:`,
            `- ${matchedRules.length} rules matched: ${matchedRules.map((r) => r.name).join(", ")}`,
            `- ${contextFiles.length} context files fetched`,
            contextFiles.length > 0 ? `- Files: ${contextFiles.map((f) => f.path).join(", ")}` : "",
        ].filter(Boolean).join("\n")

        log.info("context injection complete", {
            rules: matchedRules.length,
            files: contextFiles.length,
        })

        return {
            matchedRules,
            contextFiles,
            rulePrompts,
            summary,
        }
    }

    /**
     * Build the full context prompt to inject into the review
     */
    export function buildPrompt(result: InjectionResult): string {
        const sections: string[] = []

        // Add context files section
        const contextSection = formatContextSection(result.contextFiles)
        if (contextSection) {
            sections.push(contextSection)
        }

        // Add rule prompts section
        const ruleSection = formatRulePrompts(result.matchedRules)
        if (ruleSection) {
            sections.push(ruleSection)
        }

        if (sections.length === 0) {
            return ""
        }

        return sections.join("\n\n")
    }
}
