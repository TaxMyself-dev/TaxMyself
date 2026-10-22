import { tool } from "ai";
import { Effect, Schema } from "effect";

import { appRuntime } from "@/server/runtime/app-runtime.server";
import { runSupabaseQuery } from "@/server/runtime/supabase-query";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { isNonEmptyText } from "../../../../backend/shared/text/non-empty-text";
import { agentToolContextSchema } from "../../core/tool-runtime/agent-tool-context";
import { agentOptional } from "../../core/tool-runtime/agent-tool-input";
import { agentToolModelOutput } from "../../core/tool-runtime/agent-tool-output";

// Reads a document the user attached in this conversation, from its whole
// text in agent_chat_documents (saved by addAgentChatDocumentTexts). The
// message shows the agent only a document's start; this tool finds lines by
// words, or reads it part by part, so a long file (a big spreadsheet, a
// long PDF) never fills the prompt.

// One read. JSON escaping (newlines, quotes) grows the text, and the model
// reads at most agentToolOutputMaxLength of a result, so a read stays well
// under it and nextOffset is never cut off.
const attachedDocumentReadLength = 12_000;
const attachedDocumentMaxMatches = 40;
const attachedDocumentMatchLength = 300;

// Lines holding every search word, or, when none does, any of them; each
// with its line number, cut to attachedDocumentMatchLength.
const searchAttachedDocumentLines = (content: string, search: string) => {
  const words = search
    .toLocaleLowerCase()
    .split(/\s+/u)
    .filter((word) => word.length > 1);

  const lines = content.split("\n").map((text, index) => ({
    line: index + 1,
    text,
    lower: text.toLocaleLowerCase(),
  }));

  const all = lines.filter((line) =>
    words.every((word) => line.lower.includes(word))
  );

  const matched =
    all.length > 0
      ? all
      : lines.filter((line) => words.some((word) => line.lower.includes(word)));

  return {
    matchCount: matched.length,
    matches: matched
      .slice(0, attachedDocumentMaxMatches)
      .map(({ line, text }) => ({
        line,
        text: text.slice(0, attachedDocumentMatchLength),
      })),
  };
};

export const readAttachedDocumentTool = tool({
  description:
    "Read a document the user attached in this conversation, by the id on its <attached_file> block. With search, answers the lines that hold the search words (every word first, else any), with line numbers, such as one product's row in a large spreadsheet. Without search, answers 12,000 characters from offset (0 by default) and nextOffset; keep reading with it to go through the whole document.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      documentId: Schema.String.check(Schema.isUUID()),
      search: agentOptional(
        Schema.String.check(Schema.isMinLength(2), Schema.isMaxLength(200))
      ),
      offset: agentOptional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async (input, { context, abortSignal }) =>
    await appRuntime.runPromise(
      Effect.gen(function* readAttachedDocument() {
        const { data } = yield* runSupabaseQuery(
          "ATTACHED_DOCUMENT_READ_FAILED",
          () =>
            context.supabase
              .from("agent_chat_documents")
              .select("filename, content")
              .eq("id", input.documentId)
              .eq("conversation_id", context.conversationId)
              .maybeSingle()
        );

        if (!data) {
          return {
            error:
              "ATTACHED_DOCUMENT_NOT_FOUND: no document with this id was attached in this conversation.",
          };
        }

        const { filename, content } = data;

        if (isNonEmptyText(input.search)) {
          return {
            filename,
            length: content.length,
            ...searchAttachedDocumentLines(content, input.search),
          };
        }

        const offset = Math.min(input.offset ?? 0, content.length);
        const end = offset + attachedDocumentReadLength;

        return {
          filename,
          length: content.length,
          offset,
          nextOffset: end < content.length ? end : null,
          text: content.slice(offset, end),
        };
      }),
      { signal: abortSignal }
    ),
  toModelOutput: ({ output, toolCallId }) =>
    agentToolModelOutput({ output, toolCallId }),
});
