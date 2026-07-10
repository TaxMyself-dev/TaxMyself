---
name: dev-new-skill
description: Interview the user to gather everything needed to author a new Claude Code skill in this project's .claude/skills/ convention, then draft and create it. Use only when explicitly requested.
disable-model-invocation: true
---

# New Skill Creator

## When to activate

Activate when the user explicitly asks to create, add, or scaffold a new skill (e.g. `/dev-new-skill`, "create a new skill for X", "add a skill that does Y").

Do not activate proactively. Do not suggest creating a skill just because you notice a repeated workflow — only act when asked.

## Project convention

This project keeps skills flat under `.claude/skills/<name>/SKILL.md` (one level deep — do not nest under category subfolders, since Claude Code's skill discovery for this is only confirmed to work one level deep). Categories are expressed as a prefix on the skill name, e.g. `dev-grill-me`, `dev-conversation-handoff`.

Before asking about category, scan `.claude/skills/*/SKILL.md` and extract the prefix (the part of the directory name before the first `-`) from each existing skill to build the current list of categories. Offer that list plus the option to type a new category.

There is a browsable index at `.claude/skills/README.md`, grouped by category. It does not affect Claude Code's own discovery (that scans SKILL.md files regardless of the index) — it exists purely for humans browsing the library. Keep it updated whenever a skill is added.

## Interview

Ask one question at a time, waiting for the answer before continuing. For each question, propose a recommended default based on what the user has said so far, but let them decide. Resolve dependencies in this order:

1. **Purpose** — what task or workflow is this skill for? Get this in the user's own words first; everything else depends on it.
2. **Category** — which existing prefix does it belong to, or is it a new category? (see Project convention above for how to derive the list)
3. **Name** — propose a kebab-case `<category>-<short-name>` based on the purpose, let the user confirm or adjust.
4. **Trigger mode** — should it auto-trigger when Claude judges it relevant, or only on explicit invocation (`disable-model-invocation: true`)? Recommend explicit-only for anything that writes files, runs destructive/expensive operations, or could misfire; recommend auto-triggerable only for narrow, low-risk, clearly-scoped helpers.
5. **Description wording** — draft the frontmatter `description` together. This is the only thing preloaded into every conversation (~100 tokens), so it must be specific enough to (a) match the right intent if auto-triggerable, or (b) clearly state "use only when explicitly requested" if not.
6. **Supporting files** — ask about each, and skip creating any subfolder that isn't needed:
   - `references/` — only if the skill needs supplementary docs too long to inline in SKILL.md itself (loaded on demand rather than always in context).
   - `scripts/` — only if the workflow involves deterministic code better run via Bash than re-derived by Claude each time (e.g. a fixed transform, a repeatable check).
   - `assets/` — only if the skill produces output from a fixed template, boilerplate, or binary file it should copy/fill in.
7. **Output format** — if the skill produces a structured document (like `dev-conversation-handoff` and `dev-feature-summary` do), draft the exact output structure together.

## Drafting and confirmation

After the interview, draft the complete `SKILL.md` (frontmatter + body) and show it to the user in full, along with a list of any `references/`, `scripts/`, or `assets/` files planned. Do not write anything to disk yet.

Wait for explicit approval. If the user asks for changes, revise and show the draft again.

## Creating the skill

Once approved:

1. Create `.claude/skills/<name>/SKILL.md` with the confirmed content.
2. Create any confirmed `references/`, `scripts/`, or `assets/` files.
3. Append one line to `.claude/skills/README.md` under the appropriate `## <category>` heading (creating the heading if it's a new category): `- <name> — <one-line summary of the description>`.
4. Report the files created and stop — do not take further action unless asked.
