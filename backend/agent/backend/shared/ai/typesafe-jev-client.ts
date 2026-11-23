import {
  Config,
  Context,
  Effect,
  Layer,
  Metric,
  Option,
  Result,
  Schedule,
  Schema,
} from "effect";
import type { Redacted } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";

import { JevRequestError } from "./jev-request-error";

// TypeSafe's Jev (System One): the state and the questions in, the parsed
// JSON answer out. Used by the monitor's post scoring
// (backend/monitor/scoring/task-post-scoring.ts), its repeat check
// (task-match-repeats.ts) and the agent's group ranking
// (src/server/groups/group-search-ranking.server.ts); each parses its own answers.
//
// A busy (429/529) or slow answer is retried with exponential backoff (1, 2,
// then 4 seconds), as TypeSafe's API docs advise ("Handling rate limits":
// its limits change without notice while demand is high); the last failure
// fails with JevRequestError, and the caller decides whether that fails its
// work or skips Jev.
// TYPESAFE_API_KEY is read when the layer is built; without it the layer
// still builds and every request fails with `missing_key`.

const typesafeEndpoint = "https://api.typesafe.ai/v1/systemone";

// Jev is priced on input tokens only, $0.042 per million (TypeSafe's price,
// as DeepEval's TypeSafe model carries it: JEV_INPUT_PRICE); output is free.
export const jevInputPriceUsd = 0.042 / 1e6;

// Input tokens Jev reported in its answers' usage: the cost of every Jev
// call (times jevInputPriceUsd), in Grafana for the app and read with
// Metric.value by a script that wants its own total. The callers pin their
// models, so it carries no model attribute.
export const jevInputTokens = Metric.counter("typesafe_jev_input_tokens", {
  description: "Input tokens Jev reported using",
  incremental: true,
});

const jevAnswerUsage = Schema.decodeUnknownOption(
  Schema.Struct({ usage: Schema.Struct({ input_tokens: Schema.Finite }) })
);

// The version that answered, logged with each answer (JEV_MODEL).
const jevAnswerModel = Schema.decodeUnknownOption(
  Schema.Struct({ model: Schema.String })
);

const jevRequestTimeout = "20 seconds";
const jevBusyStatuses: ReadonlySet<number> = new Set([429, 529]);
const jevBusyRetries = 3;

/**
 * The Jev version every call asks for: TypeSafe's newest release, which
 * jev-preview serves (jev-1.14.0 on 2026-10-16, with images and boxes;
 * jev-latest is the older stable one, 1.13.0), so a new release reaches the
 * app without a code change (the owner's choice, 2026-10-16). The answering
 * version is logged with each answer (JEV_MODEL); when it changes, run the
 * Jev evals and the judge self-tests again, since the thresholds were
 * checked on the versions they name.
 */
export const jevNewestModel = "jev-preview";

// One Jev request: the model (jevNewestModel), the state and the questions,
// and the images they name (images, by the name the state or a question
// writes them as, PNG or JPEG bytes).
interface JevRequest {
  model: string;
  state: object;
  questions: object;
  images?: ReadonlyMap<string, Uint8Array>;
}

// Images go as multipart/form-data, as TypeSafe's SDK sends them
// (@typesafe-ai/sdk 0.7, encodeAssets): a "request" part holding the JSON,
// with `assets` naming each image's part, then one part per image. Jev's
// images are experimental: every request with one carries this header
// (TypeSafe's docs, "Images and boxes").
const jevImagesHeader = "TypeSafe-Danger-Zone-Images";

const jevImageContentType = (bytes: Uint8Array) =>
  bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : "image/jpeg";

const jevMultipartBody = (
  request: Omit<JevRequest, "images">,
  images: ReadonlyMap<string, Uint8Array>
) => {
  const boundary = crypto.randomUUID().replaceAll("-", "");
  const encoder = new TextEncoder();

  const parts = [...images].map(([name, bytes], index) => ({
    name,
    part: `asset-${index}`,
    bytes,
  }));

  const json = JSON.stringify({
    ...request,
    assets: Object.fromEntries(
      parts.map(({ name, part }) => [name, { type: "image", part }])
    ),
  });

  const chunks = [
    encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="request"\r\nContent-Type: application/json\r\n\r\n${json}\r\n`
    ),
    ...parts.flatMap(({ part, bytes }) => [
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${part}"; filename="${part}"\r\nContent-Type: ${jevImageContentType(bytes)}\r\n\r\n`
      ),
      bytes,
      encoder.encode("\r\n"),
    ]),
    encoder.encode(`--${boundary}--\r\n`),
  ];

  const body = new Uint8Array(
    chunks.reduce((length, chunk) => length + chunk.byteLength, 0)
  );

  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
};

const jevTimeoutError = () =>
  new JevRequestError({ failure: "timeout", detail: "no answer in time" });

const isJevBusy = (error: JevRequestError) =>
  error.failure === "timeout" ||
  (error.status !== undefined && jevBusyStatuses.has(error.status));

/**
 * Jev, TypeSafe's judgment model: asks it questions about a piece of state and
 * parses its answers with the caller's schema.
 */
export class JevClient extends Context.Service<
  JevClient,
  {
    // Jev's answer for the questions about the state, parsed with the
    // caller's schema.
    readonly ask: <AnswerSchema extends Schema.ConstraintDecoder<unknown>>(
      request: JevRequest,
      answerSchema: AnswerSchema
    ) => Effect.Effect<AnswerSchema["Type"], JevRequestError>;
  }
>()("app/shared/JevClient") {
  static readonly layerNoDeps = Layer.effect(
    JevClient,
    Effect.gen(function* makeJevClient() {
      const key = yield* Effect.orDie(
        Config.option(Config.Redacted("TYPESAFE_API_KEY"))
      );

      // No trace headers: the request carries only what TypeSafe asks for.
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.transformResponse(
          Effect.provideService(HttpClient.TracerPropagationEnabled, false)
        )
      );

      // One attempt: the answer's JSON (null when it is not JSON). Any
      // transport failure counts as a timeout, and the 20 seconds cover
      // reading the body; the timeout interrupts the attempt, which aborts
      // the request.
      const postJevRequest = Effect.fnUntraced(
        function* postJevRequest(
          apiKey: Redacted.Redacted,
          { images, ...request }: JevRequest
        ) {
          const post = HttpClientRequest.post(typesafeEndpoint).pipe(
            HttpClientRequest.bearerToken(apiKey)
          );

          const multipart =
            images === undefined || images.size === 0
              ? null
              : jevMultipartBody(request, images);

          const response = yield* client
            .execute(
              multipart === null
                ? HttpClientRequest.bodyText(
                    post,
                    JSON.stringify(request),
                    "application/json"
                  )
                : post.pipe(
                    HttpClientRequest.setHeader(jevImagesHeader, "true"),
                    HttpClientRequest.bodyUint8Array(
                      multipart.body,
                      multipart.contentType
                    )
                  )
            )
            .pipe(Effect.mapError(jevTimeoutError));

          if (response.status < 200 || response.status > 299) {
            return yield* new JevRequestError({
              failure: "rejected",
              detail: `status ${response.status}`,
              status: response.status,
            });
          }

          return yield* response.json.pipe(Effect.orElseSucceed(() => null));
        },
        Effect.timeoutOrElse({
          duration: jevRequestTimeout,
          orElse: () => Effect.fail(jevTimeoutError()),
        })
      );

      const ask = Effect.fn("JevClient.ask")(function* ask<
        AnswerSchema extends Schema.ConstraintDecoder<unknown>,
      >(
        request: JevRequest,
        answerSchema: AnswerSchema
      ): Effect.fn.Return<AnswerSchema["Type"], JevRequestError> {
        if (Option.isNone(key)) {
          return yield* new JevRequestError({
            failure: "missing_key",
            detail: "TYPESAFE_API_KEY is not set",
          });
        }

        const answer = yield* postJevRequest(key.value, request).pipe(
          Effect.retry({
            schedule: Schedule.exponential("1 second"),
            times: jevBusyRetries,
            while: isJevBusy,
          })
        );

        const usage = jevAnswerUsage(answer);
        const answeredBy = jevAnswerModel(answer);

        if (Option.isSome(answeredBy)) {
          yield* Effect.logDebug("JEV_MODEL", answeredBy.value.model);
        }

        if (Option.isSome(usage)) {
          yield* Metric.update(jevInputTokens, usage.value.usage.input_tokens);
        }

        const parsed = Schema.decodeResult(answerSchema)(answer);

        if (Result.isFailure(parsed)) {
          return yield* new JevRequestError({
            failure: "invalid",
            detail: "the answer has another shape",
          });
        }

        return parsed.success;
      });

      return JevClient.of({ ask });
    })
  );

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(FetchHttpClient.layer)
  );
}
