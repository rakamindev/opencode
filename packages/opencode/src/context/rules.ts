// packages/opencode/src/context/rules.ts

export type ContextRule = {
  /** Rule identifier (for debugging / logs) */
  id: string

  /** Regex to match changed file paths */
  match?: RegExp

  /** Always applied rule (ignore match) */
  always?: boolean

  /** Glob patterns to include as additional context */
  include: string[]

  /** Why this context exists (used for prompt explanation) */
  reason: string

  /** Max number of files to include (safety guard) */
  maxFiles?: number
}

/**
 * Context injection rules
 *
 * These rules determine which additional files should be
 * injected into the LLM prompt based on PR file changes.
 */
export const CONTEXT_RULES: ContextRule[] = [
  // =========================
  // 🧠 Institutional Memory
  // =========================
  {
    id: "project-conventions",
    always: true,
    include: [
      "AGENTS.md",
      "CONVENTIONS.md",
      "MEMORY_BANK.md",
      "CLAUDE.md",
    ],
    reason:
      "Project-level conventions and institutional knowledge must always guide reviews",
    maxFiles: 4,
  },

  // =========================
  // 🧱 Domain Models
  // =========================
  {
    id: "model-migration",
    match: /(models|entity|domain)\/.*\.(ts|js)$/,
    include: [
      "migrations/**",
      "db/schema/**",
    ],
    reason:
      "Model or domain changes must be reviewed together with database migrations",
    maxFiles: 10,
  },

  // =========================
  // 🌐 API / Backend
  // =========================
  {
    id: "api-types",
    match: /(api|routes|controllers)\/.*\.(ts|js)$/,
    include: [
      "types/**",
      "schemas/**",
      "openapi.*",
    ],
    reason:
      "API changes require type definitions and schemas for correctness",
    maxFiles: 10,
  },

  // =========================
  // 🧪 Tests
  // =========================
  {
    id: "test-coverage",
    match: /(src|lib)\/.*\.(ts|js)$/,
    include: [
      "**/*.test.ts",
      "**/*.spec.ts",
      "tests/**",
    ],
    reason:
      "Code changes should be reviewed alongside existing or missing tests",
    maxFiles: 10,
  },

  // =========================
  // 🎨 Frontend / UI
  // =========================
  {
    id: "ui-context",
    match: /(components|pages|ui)\/.*\.(tsx|jsx|ts|js)$/,
    include: [
      "styles/**",
      "theme/**",
      "design/**",
    ],
    reason:
      "UI changes must consider styling, theming, and design consistency",
    maxFiles: 8,
  },

  // =========================
  // ⚙️ Infrastructure / CI
  // =========================
  {
    id: "infra-context",
    match: /\.(yml|yaml|tf|nix|dockerfile)$/i,
    include: [
      ".github/workflows/**",
      "infra/**",
      "scripts/**",
    ],
    reason:
      "Infrastructure changes must be reviewed with CI/CD and automation context",
    maxFiles: 8,
  },
]
