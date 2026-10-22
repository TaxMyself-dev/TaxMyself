import { Schema } from "effect";

// One fact the agent keeps about the user across conversations
// (agent_memories; see long-term-memory.server.ts).
export const agentMemorySchema = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

/**
 * One thing the agent remembers about the user: its id, text, and when it was
 * saved and last changed.
 */
export type AgentMemory = typeof agentMemorySchema.Type;
