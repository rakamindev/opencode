// packages/opencode/src/command/review/classify.ts

export type ReviewType =
  | "infra"
  | "migration"
  | "backend"
  | "refactor"
  | "default"

export function classifyPR(changedFiles: string[]): ReviewType {
  if (changedFiles.some(isInfraFile)) return "infra"
  if (changedFiles.some(isMigrationFile)) return "migration"
  if (changedFiles.some(isBackendFile)) return "backend"
  if (looksLikeRefactor(changedFiles)) return "refactor"

  return "default"
}

function isInfraFile(file: string): boolean {
  return (
    file.startsWith(".github/") ||
    file.startsWith("infra/") ||
    file.endsWith(".yml") ||
    file.endsWith(".yaml") ||
    file.endsWith(".tf") ||
    file.toLowerCase().includes("dockerfile") ||
    file.endsWith(".nix")
  )
}

function isMigrationFile(file: string): boolean {
  return (
    file.includes("migration") ||
    file.includes("migrations") ||
    file.includes("schema") ||
    file.endsWith(".sql")
  )
}

function isBackendFile(file: string): boolean {
  return (
    file.includes("api") ||
    file.includes("routes") ||
    file.includes("controller") ||
    file.includes("service") ||
    file.includes("handler")
  )
}

function looksLikeRefactor(files: string[]): boolean {
  // heuristic:
  // many files, low infra/migration signal
  if (files.length < 4) return false
  if (files.some(isInfraFile)) return false
  if (files.some(isMigrationFile)) return false

  return true
}
