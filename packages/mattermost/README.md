# Mattermost local WebSocket probe

This is a deliberately scoped local probe. It authenticates as the bot, resolves the configured channel, and logs messages that mention the bot. It only posts a validation response when both an explicit opt-in and a user allowlist are configured. It does not invoke OpenCode or access GitHub.

## Setup

```bash
cp .env.example .env
```

Edit `packages/mattermost/.env` with the bot token. The repository ignores `.env` files.

For the initial test, leave `MATTERMOST_ALLOWED_USER_IDS` empty. Once the bot's connection is confirmed, obtain the test user's Mattermost ID from the output/API and add it to that allowlist before enabling replies:

```dotenv
MATTERMOST_ALLOWED_USER_IDS=your-mattermost-user-id
MATTERMOST_ALLOWED_REPOSITORIES=rakamindev/opencode
GITHUB_DISPATCH_TOKEN=your-fine-grained-token
GITHUB_WORKFLOW=rakaheal-self-heal.yml
MATTERMOST_REPLY_ENABLED=true
```

## Run

```bash
bun run --cwd packages/mattermost dev
```

The only accepted command is an exact bot mention followed by a GitHub issue URL:

```text
@rakaheal fix https://github.com/rakamindev/opencode/issues/123
```

The process validates the command shape and repository allowlist, then dispatches the configured GitHub workflow from `dev`. It rejects pull request URLs, extra instructions, and repositories outside the allowlist. GitHub validates the issue and skips any issue that already has an open `self-heal/issue-<number>` PR. Stop it with `Ctrl+C`.
