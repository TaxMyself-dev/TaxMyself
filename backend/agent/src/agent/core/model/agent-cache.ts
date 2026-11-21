import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";

import { agentOpenAiUserHash } from "./agent-openai-privacy";

/**
 * The agent's OpenAI prompt caching. Each request starts with the same
 * tools, instructions and earlier messages as the last one in its
 * conversation, so OpenAI reuses that start instead of reading it again
 * (about 90-99% of a request's input after the first, measured 2026-10-04 on
 * gpt-6-luna). The cache only matches an identical start, so anything that
 * changes per request (such as the time) must stay out of the instructions
 * and tools; see agentInstructions.
 *
 * The key keeps a user's requests on the same cache, so a new chat reuses
 * the instructions and tools its user's other chats cached: with a key per
 * conversation, the first answer in a chat read 59.5% of its input from the
 * cache, against 83% for answers within 30 minutes of the last
 * (agent_usage, 2026-10-10 to 2026-10-17). Implicit mode caches up to the
 * newest message; 30 minutes is the one ttl GPT-6 models offer (the 24h
 * promptCacheRetention is for older models only). Hits show as
 * usage.inputTokenDetails.cacheReadTokens.
 *
 * @param userId - The signed-in user, hashed into the cache key
 *   (agentOpenAiUserHash), so the id itself never reaches OpenAI.
 * @returns The cache options.
 */
export const agentPromptCacheOptions = (
  userId: string
): Pick<
  OpenAILanguageModelResponsesOptions,
  "promptCacheKey" | "promptCacheOptions"
> => ({
  promptCacheKey: `agent-chat:${agentOpenAiUserHash(userId)}`,
  promptCacheOptions: { mode: "implicit", ttl: "30m" },
});
