import { Config, Effect, Option, Redacted, Schedule, Schema } from "effect";

// Soniox (https://soniox.com/docs): transcribes an ad's video from its URL
// (async transcription), so the video never reaches our server, about $0.10
// an hour of audio; each transcription is deleted from Soniox once read. It
// also hands the agent chat's dictation a short-lived key for its real-time
// WebSocket (createSonioxDictationKey). SONIOX_API_KEY is read from
// .env.local (server only).

class SonioxError extends Schema.TaggedError<
  SonioxError,
  { readonly brand: unique symbol }
>()("SonioxError", {
  detail: Schema.String,
}) {
  override get message() {
    return `SONIOX_TRANSCRIPTION_FAILED: ${this.detail}`;
  }
}

const sonioxApi = "https://api.soniox.com/v1";
const sonioxModel = "stt-async-v5";

// An ad's audio is short; give up after about 2 minutes.
const sonioxPollInterval = "2 seconds";
const sonioxPollTimes = 60;

const transcriptionSchema = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(["queued", "processing", "completed", "error"]),
  error_message: Schema.optional(Schema.NullOr(Schema.String)),
});

const transcriptSchema = Schema.Struct({ text: Schema.String });

// One Soniox API call, its JSON answer decoded with `schema` (a DELETE
// answers nothing).
const sonioxRequest = Effect.fnUntraced(function* sonioxRequest<
  S extends Schema.ConstraintDecoder<unknown>,
>(
  path: string,
  init: { method: "GET" | "POST" | "DELETE"; body?: object },
  schema: S
) {
  const key = yield* Effect.orDie(
    Config.option(Config.Redacted("SONIOX_API_KEY"))
  );

  if (Option.isNone(key)) {
    return yield* new SonioxError({ detail: "SONIOX_API_KEY is not set" });
  }

  const answer = yield* Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${sonioxApi}${path}`, {
        method: init.method,
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${Redacted.value(key.value)}`,
          "Content-Type": "application/json",
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });

      if (!response.ok) {
        throw new Error(
          `${init.method} ${path}: ${response.status} ${await response.text()}`
        );
      }

      if (init.method === "DELETE") {
        return null;
      }

      const body: unknown = await response.json();

      return body;
    },
    catch: (cause) => new SonioxError({ detail: String(cause) }),
  });

  return yield* Schema.decodeUnknownEffect(schema)(answer).pipe(
    Effect.mapError((issue) => new SonioxError({ detail: issue.message }))
  );
});

/**
 * The audio's transcript, in whatever languages it speaks.
 */
export const transcribeAudioUrl = Effect.fn("transcribeAudioUrl")(
  function* transcribeAudioUrl(audioUrl: string) {
    const created = yield* sonioxRequest(
      "/transcriptions",
      { method: "POST", body: { model: sonioxModel, audio_url: audioUrl } },
      transcriptionSchema
    );

    const done = yield* sonioxRequest(
      `/transcriptions/${created.id}`,
      { method: "GET" },
      transcriptionSchema
    ).pipe(
      Effect.filterOrFail(
        (transcription) =>
          transcription.status !== "queued" &&
          transcription.status !== "processing",
        () => new SonioxError({ detail: "still processing" })
      ),
      Effect.retry({
        schedule: Schedule.spaced(sonioxPollInterval),
        times: sonioxPollTimes,
        while: (error) => error.detail === "still processing",
      })
    );

    const transcript =
      done.status === "completed"
        ? yield* sonioxRequest(
            `/transcriptions/${created.id}/transcript`,
            { method: "GET" },
            transcriptSchema
          )
        : null;

    yield* Effect.ignore(
      sonioxRequest(
        `/transcriptions/${created.id}`,
        { method: "DELETE" },
        Schema.Null
      )
    );

    if (!transcript) {
      return yield* new SonioxError({
        detail: done.error_message ?? "transcription failed",
      });
    }

    return transcript.text;
  }
);

/**
 * A key for one dictation in the browser (Soniox's real-time WebSocket, see
 * useAgentChatDictation), so SONIOX_API_KEY never leaves the server: it
 * connects once, within a minute, and its session ends after 10 minutes.
 */
export const createSonioxDictationKey = Effect.fn("createSonioxDictationKey")(
  function* createSonioxDictationKey() {
    const created = yield* sonioxRequest(
      "/auth/temporary-api-key",
      {
        method: "POST",
        body: {
          usage_type: "transcribe_websocket",
          expires_in_seconds: 60,
          single_use: true,
          max_session_duration_seconds: 600,
        },
      },
      Schema.Struct({ api_key: Schema.String })
    );

    return created.api_key;
  }
);
