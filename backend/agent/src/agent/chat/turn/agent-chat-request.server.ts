import { Effect, Option, Schema, Stream } from "effect";

import { isAgentChatDocumentType } from "@/lib/agent-chat/attachments/agent-chat-file-types";
import {
  agentChatMaxFileBytes,
  agentChatMaxFiles,
  agentChatMessageMaxLength,
} from "@/lib/agent-chat/conversation/agent-chat-messages";
import { appLocales } from "@/lib/i18n/app-intl-locale";

import { trimmedLengthString } from "../../../../backend/shared/schema/trimmed-length-string";

const agentChatUuid = Schema.String.check(Schema.isUUID());

export const agentChatRequestSchema = Schema.Struct({
  userId: agentChatUuid,
  id: agentChatUuid,
  message: Schema.Struct({
    id: agentChatUuid,
    role: Schema.Literals(["user", "assistant"]),
    parts: Schema.Array(Schema.Unknown).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(100)
    ),
  }),
  conversation: Schema.Struct({
    name: Schema.NullOr(trimmedLengthString(1, 120)),
    pinned: Schema.Boolean,
  }),
  // The app's language, for the agent's replies and errors; Hebrew when a
  // page from before languages sends none.
  locale: Schema.optional(Schema.Literals(appLocales)),
});

// Only inline uploads reach the model: remote URLs can cause server-side
// downloads. Images and documents only (agent-chat-file-types.ts). Strip
// client-supplied provider options and metadata as well.
export const agentChatSentPartsSchema = Schema.Array(
  Schema.Union([
    Schema.Struct({
      type: Schema.Literal("text"),
      text: Schema.String.check(Schema.isMaxLength(agentChatMessageMaxLength)),
    }),
    Schema.Struct({
      type: Schema.Literal("file"),
      mediaType: Schema.String.check(
        Schema.makeFilter(
          (mediaType) =>
            /^image\/[a-z0-9.+-]+$/u.test(mediaType) ||
            isAgentChatDocumentType(mediaType)
        )
      ),
      filename: Schema.optional(Schema.String.check(Schema.isMaxLength(512))),
      url: Schema.String.check(
        Schema.isMaxLength(4 * Math.ceil(agentChatMaxFileBytes / 3) + 100)
      ),
    }).check(
      Schema.makeFilter((file) => {
        const prefix = `data:${file.mediaType};base64,`;

        if (!file.url.startsWith(prefix)) {
          return false;
        }

        const encoded = file.url.slice(prefix.length);

        if (
          encoded.length % 4 !== 0 ||
          !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)
        ) {
          return false;
        }

        const bytes =
          (encoded.length / 4) * 3 -
          (encoded.endsWith("==") ? 2 : Number(encoded.endsWith("=")));

        return bytes > 0 && bytes <= agentChatMaxFileBytes;
      })
    ),
  ])
).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(100),
  Schema.makeFilter((parts) => {
    const files = parts.filter((part) => part.type === "file");

    const text = parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("");

    return (
      files.length <= agentChatMaxFiles &&
      text.length <= agentChatMessageMaxLength &&
      (files.length > 0 || text.trim().length > 0)
    );
  })
);

const decodeAgentChatSentParts = Schema.decodeUnknownOption(
  agentChatSentPartsSchema
);

/**
 * The words of a sent message, its text parts joined by blank lines (as
 * agentChatMessageText joins a stored one); empty when its parts are not a
 * valid message, which the answer then refuses anyway.
 *
 * @param parts - The message's parts, as the page sent them.
 * @returns The message's text.
 */
export const agentChatSentText = (parts: readonly unknown[]) =>
  Option.match(decodeAgentChatSentParts(parts), {
    onNone: () => "",
    onSome: (sent) =>
      sent
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n\n"),
  });

// Five 10MB uploads expand to about 67MB as base64. Enforce a wire limit
// while reading, before JSON parsing allocates the full request.
const agentChatRequestBodyLimit = 70 * 1024 * 1024;

const decodeAgentChatRequestBody = Schema.decodeUnknownOption(
  Schema.fromJsonString(agentChatRequestSchema)
);

/**
 * Reads a chat request's JSON body up to its size limit; null when it is too
 * large or not valid JSON for a chat request.
 *
 * @param request - The incoming request.
 */
export const readAgentChatRequest = Effect.fn("readAgentChatRequest")(
  function* readAgentChatRequest(
    request: Request
  ): Effect.fn.Return<typeof agentChatRequestSchema.Type | null> {
    const { body } = request;
    const chunks: Uint8Array[] = [];
    let length = 0;

    // Failing the stream past the limit cancels the rest of it.
    const read = body
      ? Stream.fromReadableStream({
          evaluate: () => body,
          onError: () => "unreadable" as const,
        }).pipe(
          Stream.runForEach((chunk) => {
            length += chunk.length;

            if (length > agentChatRequestBodyLimit) {
              return Effect.fail("too-large" as const);
            }

            chunks.push(chunk);

            return Effect.void;
          })
        )
      : Effect.void;

    return yield* read.pipe(
      Effect.map(() =>
        Option.getOrNull(
          decodeAgentChatRequestBody(Buffer.concat(chunks).toString())
        )
      ),
      Effect.orElseSucceed(() => null)
    );
  }
);
