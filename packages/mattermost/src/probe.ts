import { isAllowedRepository, parseSelfHealRequest } from "./request"

type MattermostUser = {
  id: string
  username: string
}

type MattermostChannel = {
  id: string
  name: string
}

type MattermostPost = {
  id: string
  user_id: string
  channel_id: string
  message: string
  root_id: string
  type: string
}

type WebSocketMessage = {
  event?: string
  status?: number | "OK"
  error?: { message?: string }
  data?: { post?: string }
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} must be set in packages/mattermost/.env`)
  return value
}

function apiUrl(path: string) {
  return new URL(`/api/v4${path}`, required("MATTERMOST_URL")).toString()
}

async function get<T>(path: string): Promise<T> {
  return request<T>(path)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    headers: { Authorization: `Bearer ${required("MATTERMOST_BOT_TOKEN")}` },
    ...init,
  })
  if (!response.ok) throw new Error(`Mattermost API ${path} failed: ${response.status} ${await response.text()}`)
  return (await response.json()) as T
}

async function reply(post: MattermostPost, message: string) {
  await request("/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${required("MATTERMOST_BOT_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel_id: post.channel_id,
      root_id: post.root_id || post.id,
      message,
    }),
  })
}

async function dispatchSelfHeal(post: MattermostPost, request: { owner: string; repo: string; url: string }) {
  const token = required("GITHUB_DISPATCH_TOKEN")
  const workflow = required("GITHUB_WORKFLOW")
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      body: JSON.stringify({
        ref: "dev",
        inputs: {
          issue_url: request.url,
          mattermost_post_id: post.id,
        },
      }),
    },
  )
  if (!response.ok) throw new Error(`GitHub workflow dispatch failed: ${response.status} ${await response.text()}`)
}

function websocketUrl() {
  const url = new URL(required("MATTERMOST_URL"))
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = "/api/v4/websocket"
  url.search = ""
  return url.toString()
}

const bot = await get<MattermostUser>("/users/me")
const team = required("MATTERMOST_TEAM")
const channelName = required("MATTERMOST_CHANNEL")
const channel = await get<MattermostChannel>(`/teams/name/${encodeURIComponent(team)}/channels/name/${encodeURIComponent(channelName)}`)
const botUsername = required("MATTERMOST_BOT_USERNAME")
const mention = `@${botUsername.toLowerCase()}`
const allowedUsers = new Set(
  (process.env.MATTERMOST_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
)
const allowedRepositories = new Set(
  (process.env.MATTERMOST_ALLOWED_REPOSITORIES ?? "")
    .split(",")
    .map((repository) => repository.trim().toLowerCase())
    .filter(Boolean),
)
const repliesEnabled = process.env.MATTERMOST_REPLY_ENABLED === "true"
const dispatchedPosts = new Set<string>()

console.log(`Connected as @${bot.username}; listening in #${channel.name} (${channel.id}).`)
console.log(
  repliesEnabled
    ? `Matching allowlisted self-heal commands that mention ${mention} are dispatched to GitHub Actions.`
    : `Matching messages must mention ${mention}. Replies and GitHub dispatch are disabled.`,
)

const socket = new WebSocket(websocketUrl())

socket.addEventListener("open", () => {
  socket.send(
    JSON.stringify({
      seq: 1,
      action: "authentication_challenge",
      data: { token: required("MATTERMOST_BOT_TOKEN") },
    }),
  )
})

socket.addEventListener("message", (event) => {
  const payload = JSON.parse(String(event.data)) as WebSocketMessage

  if (payload.status && payload.status !== 200 && payload.status !== "OK") {
    console.error(`WebSocket authentication failed: ${payload.error?.message ?? `status ${payload.status}`}`)
    socket.close()
    return
  }
  if (payload.status === 200 || payload.status === "OK") {
    console.log("Mattermost WebSocket authenticated.")
    return
  }
  if (payload.event !== "posted" || !payload.data?.post) return

  const post = JSON.parse(payload.data.post) as MattermostPost
  if (post.user_id === bot.id || post.channel_id !== channel.id || post.type) return
  if (!post.message.toLowerCase().includes(mention)) return
  if (allowedUsers.size === 0) {
    console.log(`Ignored mention from ${post.user_id}: MATTERMOST_ALLOWED_USER_IDS is not configured.`)
    return
  }
  if (!allowedUsers.has(post.user_id)) {
    console.log(`Ignored mention from unapproved user ${post.user_id} (post ${post.id}).`)
    return
  }

  console.log(JSON.stringify({ postID: post.id, userID: post.user_id, threadID: post.root_id || post.id, message: post.message }))
  if (!repliesEnabled) return
  const request = parseSelfHealRequest(post.message, botUsername)
  const response = (() => {
    if (!request) {
      return `I only accept: \`${mention} fix https://github.com/<owner>/<repo>/issues/<number>\`.`
    }
    if (!isAllowedRepository(request, allowedRepositories)) {
      return `Rejected: \`${request.owner}/${request.repo}\` is not an approved repository.`
    }
    return undefined
  })()
  if (response) {
    void reply(post, response).catch((error) => console.error(`Failed to respond to post ${post.id}:`, error))
    return
  }
  if (dispatchedPosts.has(post.id)) return
  dispatchedPosts.add(post.id)
  void dispatchSelfHeal(post, request!)
    .then(() => reply(post, `Accepted: GitHub is validating ${request!.url} against the dev branch.`))
    .then(() => console.log(`Dispatched self-heal workflow for post ${post.id}.`))
    .catch(async (error) => {
      dispatchedPosts.delete(post.id)
      console.error(`Failed to dispatch self-heal for post ${post.id}:`, error)
      await reply(post, "I could not start the self-heal workflow. The request was not applied.").catch(() => {})
    })
})

socket.addEventListener("close", (event) => {
  console.error(`Mattermost WebSocket closed (${event.code}): ${event.reason || "no reason provided"}`)
  process.exitCode = 1
})

socket.addEventListener("error", () => {
  console.error("Mattermost WebSocket error")
})
