import { assert, effect as test } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { isNonEmptyText } from "../../../../../backend/shared/text/non-empty-text";
import {
  addAgentChatDocumentTexts,
  agentChatDocumentPreviewLength,
  readAgentChatDocumentText,
} from "../../../../../src/agent/chat/messages/agent-chat-document-text.server";
import { createAgentEvalDatabase } from "../../../../evals/agent/harness/agent-eval-database";
import type { AgentEvalWrite } from "../../../../evals/agent/harness/agent-eval-fixtures";
import { evalConversationId } from "../../../../evals/agent/harness/agent-eval-fixtures";

const documentTextPart = "data-documentText";

// The saved document row, as far as this test reads it.
const decodeDocumentRow = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ conversation_id: Schema.String, content: Schema.String })
  )
);

// Attached documents are read into text when the user's message arrives
// (anydoc): the whole text is saved to agent_chat_documents and the message
// keeps its start, so the agent reads it in every turn and the rest with
// readAttachedDocument.

const dataUrl = (mediaType: string, content: string) =>
  `data:${mediaType};base64,${Buffer.from(content).toString("base64")}`;

const docx =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

test("a CSV becomes a Markdown table", () =>
  Effect.gen(function* readCsv() {
    const text = yield* readAgentChatDocumentText({
      mediaType: "text/csv",
      url: dataUrl("text/csv", "שם,עיר\nדנה,חיפה\nיוסי,חדרה\n"),
    });

    assert.match(text ?? "", /\| *דנה *\| *חיפה *\|/u);
  }));

test("a file anydoc cannot read has no text instead of failing", () =>
  Effect.gen(function* readBroken() {
    const text = yield* readAgentChatDocumentText({
      mediaType: docx,
      url: dataUrl(docx, "not a word document"),
    });

    assert.strictEqual(text, null);
  }));

test("a long document is saved whole and its message keeps the start", () =>
  Effect.gen(function* saveLongDocument() {
    const writes: AgentEvalWrite[] = [];
    const supabase = createAgentEvalDatabase({}, writes);
    const long = "שורה במסמך ארוך\n".repeat(2000);

    const image = {
      type: "file" as const,
      mediaType: "image/png",
      url: "data:image/png;base64,AQ==",
    };

    const parts = yield* addAgentChatDocumentTexts(
      supabase,
      evalConversationId,
      [
        { type: "text", text: "הנה" },
        image,
        {
          type: "file",
          mediaType: "text/plain",
          filename: "ארוך.txt",
          url: dataUrl("text/plain", long),
        },
        {
          type: "file",
          mediaType: docx,
          filename: "broken.docx",
          url: dataUrl(docx, "not a word document"),
        },
      ]
    );

    // Step: each document's text follows its file; text and images stay.
    assert.deepStrictEqual(
      parts.map((part) => part.type),
      ["text", "file", "file", documentTextPart, "file", documentTextPart]
    );

    const [saved, unread] = parts.flatMap((part) =>
      part.type === documentTextPart ? [part.data] : []
    );

    // Step: the long one keeps its start and whole length, and an id.
    assert.strictEqual(saved.text?.length, agentChatDocumentPreviewLength);
    assert.strictEqual(saved.length, long.trim().length);
    assert.ok(isNonEmptyText(saved.documentId));
    // Step: its whole text is saved once, in this conversation.
    assert.strictEqual(writes.length, 1);
    assert.strictEqual(writes[0].table, "agent_chat_documents");
    const row = decodeDocumentRow(writes[0].body);
    assert.strictEqual(row.conversation_id, evalConversationId);
    assert.strictEqual(row.content, long.trim());
    // Step: the unreadable one is kept with no text and nothing saved.
    assert.deepStrictEqual(unread, {
      documentId: null,
      filename: "broken.docx",
      text: null,
      length: 0,
    });
  }));
