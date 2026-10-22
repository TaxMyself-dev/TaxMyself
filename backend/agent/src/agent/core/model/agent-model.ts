import { createOpenAI } from "@ai-sdk/openai";
import type { OpenAIProvider } from "@ai-sdk/openai";
import { Config, Context, Effect, Layer, Option, Redacted } from "effect";

// The model behind the agent: gpt-6-luna, the model the rest of the app's AI
// uses (join answers, monitor scoring), through the Responses API.
// Not a pinned snapshot: OpenAI lists no dated gpt-6-luna version, and its
// answers name only "gpt-6-luna" (checked 2026-10-15), so when OpenAI
// announces a change to it, run the evals again before trusting it.
export const agentModelId = "gpt-6-luna";

/**
 * The agent's model as the AI SDK calls it (the chat's agent loop, chat
 * titles, conversation summaries). OPENAI_API_KEY (.env.local, server only)
 * is read when the layer is built; without it the layer still builds and
 * each model call fails as the AI SDK fails without a key.
 */
export class AgentLanguageModel extends Context.Service<
  AgentLanguageModel,
  { readonly model: ReturnType<OpenAIProvider> }
>()("app/agent/AgentLanguageModel") {
  static readonly layer = Layer.effect(
    AgentLanguageModel,
    Effect.gen(function* makeAgentLanguageModel() {
      const key = yield* Effect.orDie(
        Config.option(Config.Redacted("OPENAI_API_KEY"))
      );

      const openai = createOpenAI({
        apiKey: key.pipe(Option.map(Redacted.value), Option.getOrUndefined),
      });

      return AgentLanguageModel.of({ model: openai(agentModelId) });
    })
  );
}
