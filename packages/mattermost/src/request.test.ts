import { expect, test } from "bun:test"
import { isAllowedRepository, parseSelfHealRequest } from "./request"

test("parses an exact bot mention and GitHub issue URL", () => {
  expect(parseSelfHealRequest("@rakaheal fix https://github.com/rakamindev/opencode/issues/123", "rakaheal")).toEqual({
    owner: "rakamindev",
    repo: "opencode",
    issueNumber: 123,
    url: "https://github.com/rakamindev/opencode/issues/123",
  })
})

test("rejects pull request URLs and extra instructions", () => {
  expect(parseSelfHealRequest("@rakaheal fix https://github.com/rakamindev/opencode/pull/123", "rakaheal")).toBeUndefined()
  expect(
    parseSelfHealRequest("@rakaheal fix https://github.com/rakamindev/opencode/issues/123 and push it", "rakaheal"),
  ).toBeUndefined()
})

test("compares repository allowlists case-insensitively", () => {
  const request = parseSelfHealRequest("@rakaheal fix https://github.com/RakaminDev/OpenCode/issues/123", "rakaheal")!
  expect(isAllowedRepository(request, new Set(["rakamindev/opencode"]))).toBe(true)
})
