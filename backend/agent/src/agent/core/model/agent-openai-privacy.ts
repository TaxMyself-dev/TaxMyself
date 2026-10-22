import { createHash } from "node:crypto";

import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";

/**
 * The user as OpenAI sees them: a SHA-256 of the user id, so the id itself
 * never reaches OpenAI.
 *
 * @param userId - The app user's id.
 * @returns The hashed id.
 */
export const agentOpenAiUserHash = (userId: string) =>
  `gh_${createHash("sha256").update(userId).digest("hex").slice(0, 32)}`;

/**
 * What OpenAI keeps of the agent's model calls (the answers and chat
 * titles), as love, coffee's assistant sends them
 * (buildMainAgentProviderOptions):
 * - store: false: OpenAI keeps no copy of the request or the response. The
 *   AI SDK then asks for the reasoning's encrypted content itself
 *   (include: ["reasoning.encrypted_content"]) and sends earlier items in
 *   full instead of by reference, so reasoning still carries across steps.
 * - safetyIdentifier: one stable id per user for OpenAI's abuse monitoring,
 *   a SHA-256 of the user id, so the id itself never reaches OpenAI.
 * The prompt cache is unaffected: it keys on promptCacheKey (agent-cache.ts),
 * the same hash.
 *
 * @param userId - The app user's id, hashed into the safety identifier.
 * @returns The options: nothing stored, and the user's hashed safety
 *   identifier.
 */
export const agentOpenAiPrivacyOptions = (
  userId: string
): Pick<OpenAILanguageModelResponsesOptions, "store" | "safetyIdentifier"> => ({
  store: false,
  safetyIdentifier: agentOpenAiUserHash(userId),
});
