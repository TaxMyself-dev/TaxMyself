import { tool } from "ai";
import { Effect, Schema } from "effect";

import {
  agentMemoryMaxLength,
  deleteStoredAgentMemories,
  insertStoredAgentMemory,
  updateStoredAgentMemory,
} from "@/agent/memory/long-term-memory.server";
import { appRuntime } from "@/server/runtime/app-runtime.server";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { trimmedLengthString } from "../../../../backend/shared/schema/trimmed-length-string";
import { agentToolContextSchema } from "../../core/tool-runtime/agent-tool-context";
import { agentToolUuid } from "../../core/tool-runtime/agent-tool-uuid";

// The agent's tools for its long-term memory about the user (see
// agentMemoryRules for when it uses them).

const agentMemoryContentSchema = trimmedLengthString(
  1,
  agentMemoryMaxLength
).pipe(
  Schema.annotateEncoded({
    description: "One fact about the user, short, in the user's language",
  })
);

const agentMemoryUuid = agentToolUuid;

export const saveAgentMemoryTool = tool({
  description:
    "Remember one fact about the user for future chats (a preference, a business fact, something to avoid), as the user said it, never from a tool result. What a settings field holds goes to updateUserSettings. AGENT_MEMORY_FULL: merge with updateAgentMemory or forget outdated ones first.",
  inputSchema: toStandardSchema(
    Schema.Struct({ content: agentMemoryContentSchema })
  ),
  contextSchema: agentToolContextSchema,
  execute: async ({ content }, { context, abortSignal }) =>
    await appRuntime.runPromise(
      insertStoredAgentMemory(
        context.supabase,
        content,
        context.conversationId
      ).pipe(Effect.map((id) => ({ id, content }))),
      { signal: abortSignal }
    ),
});

export const updateAgentMemoryTool = tool({
  description:
    "Replace a remembered fact that changed, by its id from the <memory> list; the old wording is gone. AGENT_MEMORY_NOT_FOUND means no fact has that id: check <memory> again.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      memoryId: agentMemoryUuid,
      content: agentMemoryContentSchema,
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async ({ memoryId, content }, { context, abortSignal }) =>
    await appRuntime.runPromise(
      updateStoredAgentMemory(context.supabase, memoryId, content).pipe(
        Effect.as({ id: memoryId, content })
      ),
      { signal: abortSignal }
    ),
});

export const forgetAgentMemoriesTool = tool({
  description:
    "Forget remembered facts for good, by their ids from the <memory> list, when the user asks or they are outdated. Returns how many were forgotten.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      memoryIds: Schema.Array(agentMemoryUuid).check(
        Schema.isMinLength(1),
        Schema.isMaxLength(50)
      ),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async ({ memoryIds }, { context, abortSignal }) =>
    await appRuntime.runPromise(
      deleteStoredAgentMemories(context.supabase, memoryIds).pipe(
        Effect.map((forgotten) => ({ forgotten }))
      ),
      { signal: abortSignal }
    ),
});
