// packages/opencode/src/command/review/index.ts

import fs from "fs"
import path from "path"
import type { ReviewType } from "./classify"

const TEMPLATE_DIR = path.join(__dirname, "templates")

export function loadReviewTemplate(type: ReviewType): string {
  const filename = `${type}.md`
  const filePath = path.join(TEMPLATE_DIR, filename)

  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf8")
  }

  // fallback safety
  return fs.readFileSync(
    path.join(TEMPLATE_DIR, "default.md"),
    "utf8",
  )
}
