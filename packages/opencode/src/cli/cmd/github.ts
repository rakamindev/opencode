// packages/opencode/src/cli/cmd/github.ts

import * as github from "@actions/github"
import { Octokit } from "@octokit/rest"
import { graphql } from "@octokit/graphql"
import type { PullRequestEvent } from "@octokit/webhooks-types"

import { cmd } from "./cmd"
import { bootstrap } from "../bootstrap"
import { Instance } from "@/project/instance"

import { Session } from "../../session"
import { Identifier } from "../../id/id"
import { Provider } from "../../provider/provider"
import { SessionPrompt } from "@/session/prompt"
import type { MessageV2 } from "../../session/message-v2"

/* =========================
 * REVIEW ENGINE IMPORTS
 * ========================= */
import { classifyPR } from "@/command/review/classify"
import { loadReviewTemplate } from "@/command/review"

import { injectContextFromChanges } from "@/context/injector"
import { formatInjectedContext } from "@/context/formatter"

import { buildReviewSystemPrompt } from "@/context/review-prompt"
import { parseReviewResult } from "@/context/review-parser"
import { publishReview } from "@/context/review-publisher"

/* =========================
 * UTILITIES (REQUIRED BY TESTS)
 * ========================= */
export function parseGitHubRemote(
  url: string,
): { owner: string; repo: string } | null {
  const match = url.match(
    /^(?:(?:https?|ssh):\/\/)?(?:git@)?github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/,
  )
  if (!match) return null
  return { owner: match[1], repo: match[2] }
}

export function extractResponseText(
  parts: MessageV2.Part[],
): string | null {
  const textPart = parts.findLast((p) => p.type === "text")
  if (textPart) return textPart.text

  const reasoningPart = parts.findLast((p) => p.type === "reasoning")
  if (reasoningPart) return null

  const toolParts = parts.filter(
    (p) => p.type === "tool" && p.state.status === "completed",
  )
  if (toolParts.length > 0) return null

  const partTypes = parts.map((p) => p.type).join(", ") || "none"
  throw new Error(
    `Failed to parse response. Part types found: [${partTypes}]`,
  )
}

/* =========================
 * COMMAND REGISTRATION
 * ========================= */
export const GithubCommand = cmd({
  command: "github",
  describe: "GitHub PR review agent",
  builder: (yargs) =>
    yargs.command(GithubRunCommand).demandCommand(),
  async handler() {},
})

/* =========================
 * RUN COMMAND (FULL ENGINE)
 * ========================= */
export const GithubRunCommand = cmd({
  command: "run",
  describe: "run GitHub PR review",
  async handler() {
    await bootstrap(process.cwd(), async () => {
      const context = github.context

      if (context.eventName !== "pull_request") {
        console.log("Not a pull_request event, exiting.")
        return
      }

      const payload = context.payload as PullRequestEvent
      const prNumber = payload.pull_request?.number
      if (!prNumber) return

      const { owner, repo } = context.repo
      const commitId = payload.pull_request.head.sha

      const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN,
      })

      /* --------------------------------------------------
       * Fetch PR metadata (files only)
       * -------------------------------------------------- */
      const prResult = await graphql<{
        repository: {
          pullRequest: {
            title: string
            author: { login: string }
            baseRefName: string
            headRefName: string
            additions: number
            deletions: number
            files: {
              nodes: { path: string }[]
            }
          }
        }
      }>(
        `
query ($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      title
      author { login }
      baseRefName
      headRefName
      additions
      deletions
      files(first: 100) {
        nodes { path }
      }
    }
  }
}
`,
        { owner, repo, number: prNumber },
      )

      const pr = prResult.repository.pullRequest
      if (!pr) throw new Error("PR not found")

      const changedFiles = pr.files.nodes.map((f) => f.path)

      /* --------------------------------------------------
       * STEP 6 — Review classification & template
       * -------------------------------------------------- */
      const reviewType = classifyPR(changedFiles)
      const reviewInstruction = loadReviewTemplate(reviewType)

      /* --------------------------------------------------
       * STEP 1–2 — Context injection
       * -------------------------------------------------- */
      const injected = await injectContextFromChanges({
        repoRoot: Instance.worktree,
        changedFiles,
      })

      const formattedContext = formatInjectedContext(injected)

      /* --------------------------------------------------
       * STEP 7.2 — Build FINAL prompt
       * -------------------------------------------------- */
      const systemPrompt = buildReviewSystemPrompt()

      const userPrompt = [
        reviewInstruction,
        "",
        formattedContext,
        "",
        "<pull_request>",
        `Title: ${pr.title}`,
        `Author: ${pr.author.login}`,
        `Base: ${pr.baseRefName}`,
        `Head: ${pr.headRefName}`,
        `Additions: ${pr.additions}`,
        `Deletions: ${pr.deletions}`,
        "",
        "Changed files:",
        ...changedFiles.map((f) => `- ${f}`),
        "</pull_request>",
      ].join("\n")

      /* --------------------------------------------------
       * LLM EXECUTION
       * -------------------------------------------------- */
      const session = await Session.create({})

      const result = await SessionPrompt.prompt({
        sessionID: session.id,
        messageID: Identifier.ascending("message"),
        model: Provider.parseModel(
          process.env.MODEL || "opencode/default",
        ),
        parts: [
          {
            id: Identifier.ascending("part"),
            type: "text",
            text: systemPrompt,
          },
          {
            id: Identifier.ascending("part"),
            type: "text",
            text: userPrompt,
          },
        ],
      })

      const raw = extractResponseText(result.parts)
      if (!raw) {
        console.warn("LLM returned no usable output")
        return
      }

      /* --------------------------------------------------
       * STEP 7.3 — Parse structured review
       * -------------------------------------------------- */
      const parsed = parseReviewResult(raw)

      if (!parsed.ok) {
        console.error("Review parse failed:", parsed.error)
        await octokit.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body: parsed.raw,
        })
        return
      }

      /* --------------------------------------------------
       * STEP 7.4 — Publish inline review
       * -------------------------------------------------- */
      const publish = await publishReview({
        octokit,
        owner,
        repo,
        pullNumber: prNumber,
        commitId,
        review: parsed.result,
      })

      if (!publish.ok) {
        console.error("Publish failed:", publish.error)
      }
    })
  },
})
