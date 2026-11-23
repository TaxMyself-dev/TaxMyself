import { Config, Context, Effect, Layer, Option, Schema } from "effect";
import type { Duration, Redacted } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";

import { OpenAiResponseError } from "./openai-response-error";

// The one place that POSTs to the OpenAI Responses API (POST /v1/responses),
// for the gpt-6-luna callers, such as the monitor's match descriptions
// (backend/monitor/scoring/task-match-description.ts). Each caller builds its request
// body, picks its timeout, and maps OpenAiResponseError to its own message.
// OPENAI_API_KEY is read when the layer is built; without it the layer still
// builds and every request fails with `missing_key`, before any request.

// The parts of an OpenAI Responses API reply that the callers read: its
// status and the message content.
const openAiResponseSchema = Schema.Struct({
  status: Schema.String,
  output: Schema.Array(
    Schema.Struct({
      type: Schema.String,
      content: Schema.optional(
        Schema.Array(
          Schema.Struct({
            type: Schema.String,
            text: Schema.optional(Schema.String),
          })
        )
      ),
    })
  ),
});

type OpenAiResponse = typeof openAiResponseSchema.Type;

/**
 * Every content item of the reply's messages, refusals included.
 *
 * @param response - The reply.
 * @returns The content items, in order.
 */
export const readOpenAiMessageContent = (response: OpenAiResponse) =>
  response.output.flatMap((item) =>
    item.type === "message" ? (item.content ?? []) : []
  );

/**
 * The reply's output text, joined across its messages.
 *
 * @param response - The reply.
 * @returns The text, or an empty string when the reply has none.
 */
export const readOpenAiOutputText = (response: OpenAiResponse) =>
  readOpenAiMessageContent(response)
    .flatMap((item) => (item.type === "output_text" ? [item.text ?? ""] : []))
    .join("");

// The request body the callers build (POST /v1/responses): a gpt-6-luna
// request for one structured JSON answer.
interface OpenAiResponseRequest {
  model: string;
  store: boolean;
  reasoning: { effort: "none" | "low" };
  max_output_tokens: number;
  instructions: string;
  input: string;
  text: {
    format: {
      type: "json_schema";
      name: string;
      strict: boolean;
      schema: unknown;
    };
  };
}

const openAiResponseUnavailable = () =>
  new OpenAiResponseError({ failure: "unavailable" });

const decodeOpenAiResponse = Schema.decodeUnknownOption(
  Schema.fromJsonString(openAiResponseSchema)
);

/**
 * OpenAI's Responses API: creates one response from the caller's request body.
 */
export class OpenAiResponses extends Context.Service<
  OpenAiResponses,
  {
    // Creates one response from the caller's request body. The timeout
    // covers the request and reading its body.
    readonly create: (
      body: OpenAiResponseRequest,
      options: { readonly timeout: Duration.Input }
    ) => Effect.Effect<OpenAiResponse, OpenAiResponseError>;
  }
>()("app/shared/OpenAiResponses") {
  static readonly layerNoDeps = Layer.effect(
    OpenAiResponses,
    Effect.gen(function* makeOpenAiResponses() {
      const key = yield* Effect.orDie(
        Config.option(Config.Redacted("OPENAI_API_KEY"))
      );

      // No trace headers: the request carries only what OpenAI asks for.
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.transformResponse(
          Effect.provideService(HttpClient.TracerPropagationEnabled, false)
        )
      );

      const postOpenAiResponse = Effect.fnUntraced(function* postOpenAiResponse(
        apiKey: Redacted.Redacted,
        body: OpenAiResponseRequest
      ) {
        const response = yield* client
          .execute(
            HttpClientRequest.post("https://api.openai.com/v1/responses").pipe(
              HttpClientRequest.bearerToken(apiKey),
              HttpClientRequest.bodyText(
                JSON.stringify(body),
                "application/json"
              )
            )
          )
          .pipe(Effect.mapError(openAiResponseUnavailable));

        if (response.status < 200 || response.status > 299) {
          return yield* new OpenAiResponseError({ failure: "rejected" });
        }

        return yield* response.text.pipe(
          Effect.mapError(openAiResponseUnavailable)
        );
      });

      const create = Effect.fn("OpenAiResponses.create")(function* create(
        body: OpenAiResponseRequest,
        options: { readonly timeout: Duration.Input }
      ) {
        if (Option.isNone(key)) {
          return yield* new OpenAiResponseError({ failure: "missing_key" });
        }

        const text = yield* postOpenAiResponse(key.value, body).pipe(
          Effect.timeoutOrElse({
            duration: options.timeout,
            orElse: () => Effect.fail(openAiResponseUnavailable()),
          })
        );

        const parsed = decodeOpenAiResponse(text);

        if (Option.isNone(parsed)) {
          return yield* new OpenAiResponseError({ failure: "malformed" });
        }

        return parsed.value;
      });

      return OpenAiResponses.of({ create });
    })
  );

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(FetchHttpClient.layer)
  );
}
