---
name: docs-sync-on-commit
description: Before creating a git commit, update the topic CLAUDE.md file(s) covering the staged changes so per-topic docs stay in sync with the code. Auto-triggers right before running `git commit`. Depends on the topic CLAUDE.md structure already existing (see docs-app-map) — if it doesn't, say so and suggest running docs-app-map first instead of improvising a structure.
---

# Sync Topic Docs on Commit

## When to activate

Automatically, right before creating a git commit (after staging, before running `git commit`).

## Precondition

If no topic `CLAUDE.md` files exist yet under `backend/src/*` or `frontend/src/app/**`, don't invent the structure here — tell the user to run `/docs-app-map` first, then continue with the commit as normal.

## Process

1. Get staged files (`git diff --cached --name-only`).
2. For each staged file, find its nearest ancestor directory that has a topic `CLAUDE.md` (created by docs-app-map).
3. For each affected topic, look at the actual diff (`git diff --cached -- <path>`) and update only what changed in that topic's CLAUDE.md — new/removed entities, changed flows, new related topics. Don't re-investigate or rewrite the whole file from scratch.
4. If staged changes touch a module directory with no topic CLAUDE.md yet (a genuinely new topic), create a minimal one following docs-app-map's template (Purpose / Key entities/files / Main flows / Related topics), and add it to the root CLAUDE.md index.
5. `git add` the updated CLAUDE.md file(s) so they're included in the same commit.
6. Keep this fast and delta-based — it should not turn every commit into a full re-audit.
