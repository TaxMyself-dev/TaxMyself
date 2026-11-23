import { createHash } from "node:crypto";

// KeepInTax change (Phase 3.1, plan §2.7 item 6; GUIDE.md "What KeepInTax
// changed"): every write takes a key derived from its tool call, so a
// retried, resumed or repeated answer cannot create a second record. A
// write that creates a row (a memory, a tracking task) uses the key as the
// row's id and saves nothing when a row with that id exists; the other
// writes set values (update a memory, change a setting or a rule) or delete
// by id, which repeat to the same result. No schema change: the key is the
// existing uuid primary key.

/**
 * The idempotency key of one tool call, as a uuid: the same conversation and
 * tool call always give the same key, and different ones never collide in
 * practice (SHA-256). The version and variant bits make it a valid v4-shaped
 * uuid for the uuid columns and schemas.
 *
 * @param conversationId - The conversation the call ran in.
 * @param toolCallId - The model's id for the call.
 * @returns The key.
 */
export const agentToolCallKey = (
  conversationId: string,
  toolCallId: string
) => {
  const hex = createHash("sha256")
    .update(
      `keepintax-agent-tool-call\u0000${conversationId}\u0000${toolCallId}`
    )
    .digest("hex");

  const variant = ((Number.parseInt(hex.charAt(16), 16) % 4) + 8).toString(16);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
};
