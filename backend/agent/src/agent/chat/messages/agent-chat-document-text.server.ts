import { formatFromExtension, toMarkdownBytes } from "@firecrawl/anydoc";
import { Effect } from "effect";
import { forEach as effectForEach } from "effect/Effect";

import { isAgentChatDocumentType } from "@/lib/agent-chat/attachments/agent-chat-file-types";
import type {
  AgentChatDocumentText,
  AgentChatMessagePart,
} from "@/lib/agent-chat/conversation/agent-chat-messages";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import { runSupabaseQuery } from "@/server/runtime/supabase-query";
import type { SupabaseQueryError } from "@/server/runtime/supabase-query";

// Attached documents become text the agent reads: anydoc (Firecrawl's
// converter, https://github.com/firecrawl/anydoc) turns PDF, Word, Excel,
// PowerPoint, OpenDocument, RTF, EPUB and CSV into Markdown on this server
// in milliseconds; plain text is read as it is. anydoc does no OCR, so a
// scanned PDF has no text. The whole text is saved once in
// agent_chat_documents; the message keeps its start (AgentChatDocumentText)
// and the agent reads the rest with readAttachedDocument, as ChatGPT and
// Claude read large files through a file tool instead of the prompt.

// A document up to this length reaches the agent whole in every turn; a
// longer one shows this much. Five such documents in Hebrew stay well
// inside agent_chat_messages' 256KB parts limit and the agent's short-term
// memory (agentShortTermTokenBudget).
export const agentChatDocumentPreviewLength = 12_000;

// agent_chat_documents' content limit.
const agentChatDocumentMaxLength = 5_000_000;

type AgentChatSentPart = Extract<
  AgentChatMessagePart,
  { type: "text" } | { type: "file" }
>;

const agentChatDocumentMarkdown = async (
  mediaType: string,
  bytes: Uint8Array
) => {
  if (mediaType === "text/plain" || mediaType === "text/markdown") {
    return new TextDecoder().decode(bytes);
  }

  // CSV has no signature to detect its format by.
  return await toMarkdownBytes(
    bytes,
    mediaType === "text/csv" ? formatFromExtension(".csv") : null
  );
};

/**
 * The document's whole text, or null when it has none anydoc can read; a
 * failure is logged with anydoc's error code (needsOcr, encrypted...).
 */
export const readAgentChatDocumentText = Effect.fn("readAgentChatDocumentText")(
  function* readAgentChatDocumentText(file: {
    mediaType: string;
    url: string;
  }) {
    const bytes = Buffer.from(
      file.url.slice(file.url.indexOf(",") + 1),
      "base64"
    );

    return yield* Effect.tryPromise(
      async () => await agentChatDocumentMarkdown(file.mediaType, bytes)
    ).pipe(
      Effect.map(
        (text) => text.trim().slice(0, agentChatDocumentMaxLength) || null
      ),
      Effect.matchEffect({
        onFailure: (error) =>
          Effect.logWarning("AGENT_CHAT_DOCUMENT_UNREADABLE", {
            mediaType: file.mediaType,
            code:
              error.cause instanceof Error && "code" in error.cause
                ? String(error.cause.code)
                : undefined,
          }).pipe(Effect.as(null)),
        onSuccess: Effect.succeed,
      })
    );
  }
);

// Reads one attached document, saves its whole text to the conversation,
// and answers what the message keeps of it.
const saveAgentChatDocument = Effect.fn("saveAgentChatDocument")(
  function* saveAgentChatDocument(
    supabase: UserSupabaseClient,
    conversationId: string,
    file: { mediaType: string; filename?: string; url: string }
  ): Effect.fn.Return<AgentChatDocumentText, SupabaseQueryError> {
    const filename = (file.filename ?? file.mediaType).slice(0, 512);
    const text = yield* readAgentChatDocumentText(file);

    if (text === null) {
      return { documentId: null, filename, text: null, length: 0 };
    }

    const { data } = yield* runSupabaseQuery(
      "AGENT_CHAT_DOCUMENT_WRITE_FAILED",
      () =>
        supabase
          .from("agent_chat_documents")
          .insert({ conversation_id: conversationId, filename, content: text })
          .select("id")
          .single()
    );

    return {
      documentId: data.id,
      filename,
      text: text.slice(0, agentChatDocumentPreviewLength),
      length: text.length,
    };
  }
);

/**
 * The user's new message with each document's text right after its file.
 */
export const addAgentChatDocumentTexts = Effect.fn("addAgentChatDocumentTexts")(
  function* addAgentChatDocumentTexts(
    supabase: UserSupabaseClient,
    conversationId: string,
    parts: readonly AgentChatSentPart[]
  ): Effect.fn.Return<AgentChatMessagePart[], SupabaseQueryError> {
    const read = yield* effectForEach(
      parts,
      (part) =>
        part.type === "file" && isAgentChatDocumentType(part.mediaType)
          ? Effect.map(
              saveAgentChatDocument(supabase, conversationId, part),
              (data): AgentChatMessagePart[] => [
                part,
                { type: "data-documentText", data },
              ]
            )
          : Effect.succeed<AgentChatMessagePart[]>([part]),
      { concurrency: "unbounded" }
    );

    return read.flat();
  }
);
