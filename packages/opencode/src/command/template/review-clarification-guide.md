# PR Review Clarification Guide

This guide helps the AI reviewer ask relevant clarifying questions before reviewing a PR.

## Trigger Keywords

| Trigger | Behavior |
|---------|----------|
| `/oc` | Full two-phase flow (ask questions first, then review) |
| `/oc!` | Direct review (skip questions, go straight to review) |

## Review Philosophy

**Every PR deserves context-aware review.** Before diving into code, understand what the PR is trying to achieve and what constraints apply.

**Exception:** If user uses `/oc!`, respect their intent to skip questions and proceed directly to review.

---

## PR Type Detection

Analyze the PR diff to detect what type of changes are being made:

### Migration Only
**Signals:** Files in `**/migrations/**`, no model/controller changes
**Focus areas to ask about:**
- Related model PR (upcoming or existing?)
- Index strategy requirements
- Data migration concerns
- Rollback safety

### Model Only  
**Signals:** Files in `**/models/**`, no migration in this PR
**Focus areas to ask about:**
- Migration location (separate PR? already merged?)
- Association requirements
- Validation rules expected
- Soft delete requirements

### API/Controller Changes
**Signals:** Files in `**/routes/**`, `**/controllers/**`, `**/services/**`
**Focus areas to ask about:**
- Expected request/response format
- Authentication/authorization requirements
- Rate limiting considerations
- Error handling expectations

### Test Only
**Signals:** Files in `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`
**Focus areas to ask about:**
- What behavior is being tested
- Edge cases to cover
- Mock requirements

### Full Feature (Multiple Types)
**Signals:** Migration + Model + Controller + Tests together
**Focus areas to ask about:**
- Priority of review (what's most critical?)
- Known limitations or shortcuts
- Performance requirements

---

## Clarifying Questions Template

```markdown
🤔 **Before I review, a few questions:**

**PR Type Detected:** [Migration Only / Model Only / API / Full Feature]

**I noticed:**
- [Observation 1: e.g., "No model file for this migration"]
- [Observation 2: e.g., "This adds a new endpoint"]

**Questions:**
1. [Context question: e.g., "Will the model be in a separate PR?"]
2. [Constraint question: e.g., "Any specific performance requirements?"]
3. [Focus question: e.g., "Should I prioritize X or Y?"]

Please reply with context so I can provide a focused review.
```

---

## After User Responds

Once the user provides context:

1. **Acknowledge** the constraints provided
2. **Generate checklist** based on PR type + user context
3. **Review with inline comments** on specific lines
4. **Provide decision** with reasoning

---

## Example Scenarios

### Scenario 1: Migration-Only PR

**PR:** "Add video_post_views table migration"

**AI asks:**
```
🤔 Before I review, a few questions:

**PR Type:** Migration Only

I noticed this adds a new table but no corresponding model file.

Questions:
1. Will VideoPostView model be in a separate PR?
2. Should I verify the schema matches any existing design doc?
3. Any specific indexing requirements for query performance?
```

**User responds:** "Model is in PR #354. Focus on FK constraints and indexes."

**AI reviews:** Focused checklist on FKs + indexes, inline comments only on those issues.

---

### Scenario 2: Refactoring PR

**PR:** "Extract helper functions from UserService"

**AI asks:**
```
🤔 Before I review:

**PR Type:** Refactoring

I noticed this moves code without changing behavior.

Questions:
1. Should I focus on maintaining existing behavior?
2. Any specific naming conventions for the new helpers?
3. Are there tests that should still pass unchanged?
```

---

## Key Principles

1. **Don't assume** - Ask if something is unclear
2. **Detect scope** - Migration? Model? API? Mixed?
3. **Focus questions** - Max 3-4 questions, relevant to PR type
4. **Respect user's time** - Be concise, get to the point
5. **Block on confirmation** - Don't review until user responds
