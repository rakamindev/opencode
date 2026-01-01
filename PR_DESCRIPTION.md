# Enhanced PR Review System

## Problem

The opencode GitHub agent currently has limitations when reviewing PRs:
- **No context awareness**: Only sees the diff, not related files (e.g., migrations when reviewing models)
- **Generic feedback**: Same review approach for all PR types
- **No inline comments**: Feedback posted as a single PR comment, not on specific lines
- **No conversation threading**: Replies to inline comments go to main PR thread
- **One-shot review**: No clarification before reviewing

## Solution

This PR introduces a comprehensive enhancement to opencode's PR review capabilities:

### 1. Context Injection System
Automatically fetches relevant files from the repository based on what changed:
- Model changes → fetch related migrations
- API changes → fetch type definitions
- Memory bank/conventions files → always injected for institutional knowledge

**Files:**
- `src/context/rules.ts` - Defines trigger patterns and context to fetch
- `src/context/injector.ts` - Fetches and formats context files
- `src/context/index.ts` - Module exports

### 2. Inline Review Comments
Posts feedback directly on specific lines instead of a single PR comment:
- Supports code suggestions with GitHub's suggestion syntax
- Severity levels: 🚨 error, ⚠️ warning, ℹ️ info, 💡 suggestion
- Falls back to regular comment if line-specific posting fails

**Files:**
- `src/context/review-comment.ts` - Schema and formatting for inline comments
- `src/cli/cmd/github.ts` - `createPullRequestReview()` and `parseAndPostInlineReview()`

### 3. Threaded Reply Support
When users reply to inline comments with `/oc`, the response is posted **in the same thread** instead of creating a new PR comment.

**Changes:**
- `src/cli/cmd/github.ts` - `createReviewCommentReply()` function

### 4. Two-Phase Review Workflow
Smart review flow that asks clarifying questions before diving into code:

| Trigger | Behavior |
|---------|----------|
| `/oc` | Ask clarifying questions first, then review |
| `/oc!` | Skip questions, direct review |

**Smart detection:**
- Detects if user's message contains answers to previous questions
- Auto-proceeds to Phase 2 when answers are detected

**Files:**
- `src/command/template/review.txt` - Two-phase workflow instructions
- `src/command/template/review-clarification-guide.md` - PR type detection and question templates

### 5. Memory Bank / Conventions Injection
Automatically injects project-specific conventions files as context:
- `MEMORY_BANK.md`, `CONVENTIONS.md`, `AGENTS.md`, `CLAUDE.md`
- Allows repos to define institutional knowledge that guides reviews

## Files Changed

| File | Description |
|------|-------------|
| `src/context/rules.ts` | Review rules schema + default rules (model-migration, api-types, test-coverage, memory-bank) |
| `src/context/injector.ts` | Context fetching and prompt building |
| `src/context/review-comment.ts` | Inline comment schema and GitHub formatting |
| `src/context/index.ts` | Module exports |
| `src/cli/cmd/github.ts` | PR review functions, threaded replies |
| `src/command/template/review.txt` | Two-phase workflow, smart detection |
| `src/command/template/review-clarification-guide.md` | PR type detection, question templates |

## Usage Examples

### Two-Phase Flow
```
User: /oc review this PR

opencode: 🤔 Before I review, a few questions:
          1. Are migrations in a separate PR?
          2. Should I focus on models?

User: /oc 1. Yes, PR #352. 2. Models only.

opencode: ✅ [Focused review with inline comments]
```

### Direct Review
```
User: /oc! just review the changes

opencode: ✅ [Direct review without questions]
```

### Re-review After Fixes
```
User: /oc! I fixed the issues, please check again
```

## Checklist

- [x] Context injection for model-migration relationships
- [x] Inline review comments with suggestions
- [x] Threaded replies to inline comments
- [x] Two-phase review workflow (`/oc` vs `/oc!`)
- [x] Smart phase detection from conversation history
- [x] Memory bank / conventions injection
- [x] PR type detection (migration-only, model-only, API, etc.)
