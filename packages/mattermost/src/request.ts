export type SelfHealRequest = {
  owner: string
  repo: string
  issueNumber: number
  url: string
}

export function parseSelfHealRequest(message: string, botUsername: string): SelfHealRequest | undefined {
  const mention = `@${botUsername}`
  const expression = new RegExp(
    `^\\s*${escapeRegExp(mention)}\\s+fix\\s+(https://github\\.com/([^/\\s]+)/([^/\\s]+)/issues/(\\d+))\\s*$`,
    "i",
  )
  const match = message.match(expression)
  if (!match) return

  const [, url, owner, repo, issueNumber] = match
  if (!url || !owner || !repo || !issueNumber) return
  return { owner, repo, issueNumber: Number(issueNumber), url }
}

export function isAllowedRepository(request: SelfHealRequest, allowedRepositories: Set<string>) {
  return allowedRepositories.has(`${request.owner}/${request.repo}`.toLowerCase())
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
