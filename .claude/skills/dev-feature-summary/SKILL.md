---
name: dev-feature-summary
description: Generate long-term technical documentation for a completed feature, refactor, or significant implementation — for maintenance, onboarding, and architecture history. Use only when explicitly requested.
---

# Feature Summary

## When to activate

Activate when the user explicitly requests any of the following intentions:

- a feature summary
- summarizing a feature
- documenting a feature
- writing up what was built
- preparing documentation for a completed implementation or refactor

The wording does not need to match a specific phrase exactly — judge intent, not exact text. This covers the trigger phrases (`/feature-summary`, `feature summary`, `summarize the feature`, `document the feature`, `סכם את הפיצ'ר`, `תעד את הפיצ'ר`, `סיכום פיצ'ר`) as well as other phrasings that express the same intent.

Do not activate proactively. Never trigger this just because a feature, refactor, or large change was completed — only act when the user asks.

## Purpose vs. Conversation Handoff

This skill is NOT for context reduction. It produces long-term documentation, not a compact pointer for resuming a chat. See [[dev-conversation-handoff]] for that use case.

This summary is meant to be useful:

- as feature documentation
- for future maintenance
- for onboarding someone new to the code
- for understanding what was built, months later
- for release notes preparation
- as architecture history

## Documentation Rules

Unlike Conversation Handoff:

- More detail is allowed.
- Architecture decisions should be preserved, with the reasoning behind them.
- Important implementation details should be preserved.
- Business decisions and the "why" behind the feature should be preserved.

Still avoid:

- Huge logs or command output dumps
- Stack traces
- Repetitive back-and-forth discussion
- Unnecessary code dumps — describe what code does rather than pasting it, unless a snippet is essential to understanding a non-obvious decision

## Repository usage

When creating a feature summary:

- Use the conversation as the primary source.
- Use files already discussed.
- Use targeted repository inspection (e.g. reading a specific file, checking a specific entity/migration/component) when needed to confirm details.
- Avoid scanning the entire repository unless absolutely necessary to answer a specific open question about the implementation.

## Output format

Produce the summary in exactly this structure:

```markdown
# Feature

Feature name.

# Business Purpose

Why this feature exists.

# Problem

What problem existed before.

# Solution

High-level description of the implemented solution.

# Backend Changes

Backend architecture, services, entities, jobs, APIs, etc.

# Frontend Changes

UI, components, pages, dialogs, forms, tables, etc.

# Database Changes

Tables, columns, migrations, indexes, constraints.

# API Changes

Endpoints added, modified, or removed.

# Files Changed

Most important files involved.

# Risks

Known limitations, technical debt, unresolved concerns.

# Future Improvements

Potential future work.
```

Omit a section entirely if it has no content rather than leaving it empty with a placeholder (e.g. skip "Database Changes" if the feature touched no schema).

## Output style

Write it like an internal technical design document, not like a chat conversation:

- Use sections and bullet points, not narrative prose.
- Be concise but complete — favor clarity over brevity here, unlike a handoff summary.
- State decisions and their rationale directly ("Chose X because Y"), not as a recap of the discussion that led to them.
