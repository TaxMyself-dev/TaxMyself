---
name: conversation-handoff
description: Generate a concise handoff summary so work can continue in a brand new Claude chat without losing important context. Use only when explicitly requested.
---

# Conversation Handoff

## When to activate

Activate when the user explicitly requests any of the following intentions:

- a handoff summary
- a conversation summary
- a new-chat summary
- a context summary
- a summary for continuing work in another conversation
- a summary before opening a new chat

The wording does not need to match a specific phrase exactly — judge intent, not exact text. This still covers the original trigger phrases (`/handoff`, `handoff`, `create handoff`, `conversation summary`, `תן סיכום לשיחה חדשה`, `סכם את השיחה`, `סיכום שיחה`) as well as other phrasings that express the same intent.

Do not activate proactively. Do not trigger this workflow just because a conversation is getting long — only act when the user asks. Never interrupt the user with an unsolicited offer to create a handoff.

## Compression Rule

The purpose of the handoff is to replace a long conversation with a much smaller summary.

Target compression ratio:

- At least 80% reduction in size whenever possible.

Keep only:

- Current goal
- Completed work
- Relevant files
- Important decisions
- Open issues
- Next steps

Remove:

- Logs
- Stack traces
- Debugging history
- Failed attempts that no longer matter
- Repeated explanations
- Unnecessary implementation details

Prefer:

- Bullet points over paragraphs
- Summaries over transcripts
- Decisions over discussions

The resulting handoff should be compact enough to serve as the opening message of a brand-new Claude chat.

## How to build the summary

Build the summary from the conversation itself — the goals, decisions, and progress already discussed. The conversation history is the primary source; do not avoid it, since it's what is being summarized.

When generating a handoff summary, avoid scanning the entire repository.

Use:

- conversation context
- files already discussed
- targeted file checks when necessary

Do not perform broad repository analysis solely for the purpose of creating a handoff.

Avoid including:

- Large logs or command output dumps
- Stack traces
- Repetitive back-and-forth discussion
- Failed attempts that are no longer relevant to where things stand now
- Entire code snippets, unless a specific snippet is absolutely necessary to continue safely (e.g. a non-obvious signature or schema that would otherwise be guessed wrong)

The summary must be short enough to paste directly into a brand new Claude chat as the opening message. Favor compression: a sentence beats a paragraph, a paragraph beats a code block.

## Output format

Produce the summary in exactly this structure:

```markdown
# Current Goal

What we are trying to achieve.

# Current Status

What has already been completed.

# Relevant Files

Important files and folders.

# Key Decisions

Architectural and implementation decisions already made.

# Open Issues

Problems still unresolved.

# Next Steps

Recommended next actions.

# Important Context

Only context that is required for continuing work.
```

Omit a section entirely if it has no content rather than leaving it empty with a placeholder.

After producing the summary, present it in a single copy-pasteable markdown block and stop — do not take further action unless the user asks.
