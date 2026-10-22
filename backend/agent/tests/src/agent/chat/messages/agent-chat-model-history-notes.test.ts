import { assert, it, describe } from "@effect/vitest";

import { agentChatModelHistory } from "../../../../../src/agent/chat/messages/agent-chat-model-history";
import {
  documentTextPart,
  userMessage,
} from "./agent-chat-model-history-fixtures";

// The model history's messages as the model reads them: when each was
// written, files and documents, stop hook notes, and messages sent into an
// answer.

describe("agent chat model history: messages, files and notes", () => {
  it("a user message starts with when it was written, in Israel time", () => {
    const [message] = agentChatModelHistory([userMessage("u1", "היי")]);
    assert.deepStrictEqual(message.parts[0], {
      type: "text",
      text: "<message_time>2026-10-04, 12:01 Asia/Jerusalem</message_time>",
    });
  });

  // A message that attaches files comes after a note on reading them.
  it("a stored image without contents reads as a note", () => {
    const [, message] = agentChatModelHistory([
      {
        id: "u1",
        role: "user",
        parts: [
          { type: "file", mediaType: "image/png", filename: "a.png", url: "" },
        ],
      },
    ]);

    assert.deepStrictEqual(message.parts, [
      {
        type: "text",
        text: "[attached image: a.png; you saw it when it was sent]",
      },
    ]);
  });

  const xlsx =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  const documentId = "6f1c2a1e-2222-4a1a-8a1a-222222222222";

  it("an attached document reads as its text on every turn, not as a file", () => {
    const text = "| טיפול | מחיר |\n| --- | --- |\n| ניקוי עור | 250 |";

    const [, message] = agentChatModelHistory([
      {
        id: "u1",
        role: "user",
        parts: [
          { type: "file", mediaType: xlsx, filename: "מחירון.xlsx", url: "" },
          {
            type: documentTextPart,
            data: {
              documentId,
              filename: "מחירון.xlsx",
              text,
              length: text.length,
            },
          },
          { type: "text", text: "תשתמש במחירון" },
        ],
      },
    ]);

    assert.deepStrictEqual(message.parts, [
      {
        type: "text",
        text: `<attached_file name="מחירון.xlsx" id="${documentId}" length="${text.length}">\n${text}\n</attached_file>`,
      },
      { type: "text", text: "תשתמש במחירון" },
    ]);
  });

  it("a long document shows its start and points to readAttachedDocument", () => {
    const [, message] = agentChatModelHistory([
      {
        id: "u1",
        role: "user",
        parts: [
          {
            type: documentTextPart,
            data: {
              documentId,
              filename: "big.csv",
              text: "abc",
              length: 90_000,
            },
          },
        ],
      },
    ]);

    const [read] = message.parts;
    assert.ok(read.type === "text");
    assert.match(read.text, /shown="3"/u);
    assert.match(
      read.text,
      /the first 3 of 90000 characters; read the rest with readAttachedDocument/u
    );
  });

  it("a scanned PDF goes as it is in the turn it was sent, with a note that it has no text", () => {
    const pdf = {
      type: "file" as const,
      mediaType: "application/pdf",
      filename: "scan.pdf",
      url: "data:application/pdf;base64,JVBERi0=",
    };

    const unread = {
      type: documentTextPart,
      data: { documentId: null, filename: "scan.pdf", text: null, length: 0 },
    };

    const [, sent] = agentChatModelHistory([
      { id: "u1", role: "user", parts: [pdf, unread] },
    ]);

    assert.deepStrictEqual(sent.parts[0], pdf);
    assert.match(
      JSON.stringify(sent.parts[1]),
      /No text could be read from this file/u
    );

    // Stored, the PDF's contents are gone and only the note is left.
    const [, stored] = agentChatModelHistory([
      { id: "u1", role: "user", parts: [{ ...pdf, url: "" }, unread] },
    ]);

    assert.strictEqual(stored.parts.length, 1);
    assert.strictEqual(stored.parts[0].type, "text");
  });

  it("the note on reading files comes once, before the first message with one", () => {
    const image = {
      type: "file" as const,
      mediaType: "image/png",
      filename: "a.png",
      url: "",
    };

    const history = agentChatModelHistory([
      userMessage("u1", "היי"),
      { id: "u2", role: "user", parts: [image] },
      { id: "u3", role: "user", parts: [image] },
    ]);

    assert.deepStrictEqual(
      history.map((message) => message.id),
      ["u1", "u2-attachments", "u2", "u3"]
    );
    assert.include(JSON.stringify(history[1].parts), "readAttachedDocument");
  });

  it("a stop hook's saved note reads as a system message where it came", () => {
    const history = agentChatModelHistory([
      userMessage("u1", "תבדוק את המשימות"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "text", text: "בודק" },
          {
            type: "data-agentNote",
            data: { text: "Your plan has open steps" },
          },
          { type: "text", text: "סיימתי" },
        ],
      },
    ]);

    assert.deepStrictEqual(
      history.map((message) => [message.id, message.role]),
      [
        ["u1", "user"],
        ["a1", "assistant"],
        ["a1-note-0", "system"],
        ["a1-run-1", "assistant"],
      ]
    );
    assert.deepStrictEqual(history[2].parts, [
      { type: "text", text: "Your plan has open steps" },
    ]);
  });

  it("a message the user sent into an answer reads as theirs, with its time, where the agent read it", () => {
    const history = agentChatModelHistory([
      userMessage("u1", "תמצא דירות"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "text", text: "מחפש" },
          {
            type: "data-userSteer",
            data: {
              id: "s1",
              text: "רק בחיפה",
              createdAt: "2026-10-04T09:02:00.000Z",
            },
          },
          { type: "text", text: "מצאתי בחיפה" },
        ],
      },
    ]);

    assert.deepStrictEqual(
      history.map((message) => [message.id, message.role]),
      [
        ["u1", "user"],
        ["a1", "assistant"],
        ["s1", "user"],
        ["a1-run-1", "assistant"],
      ]
    );
    // 09:02 UTC is 12:02 in Israel (UTC+3 in October).
    assert.deepStrictEqual(history[2].parts, [
      {
        type: "text",
        text: "<message_time>2026-10-04, 12:02 Asia/Jerusalem</message_time>",
      },
      { type: "text", text: "רק בחיפה" },
    ]);
  });
});
