import { assert, it, describe } from "@effect/vitest";
import { Effect, Result, Schema } from "effect";

import {
  agentChatSentPartsSchema,
  agentChatSentText,
  readAgentChatRequest,
} from "../../../../../src/agent/chat/turn/agent-chat-request.server";
import { agentChatMaxFileBytes } from "../../../../../src/lib/agent-chat/conversation/agent-chat-messages";

const decodeSentParts = Schema.decodeUnknownResult(agentChatSentPartsSchema);

const fileOfTypeSent = (mediaType: string) =>
  Result.isSuccess(
    decodeSentParts([
      { type: "file", mediaType, url: `data:${mediaType};base64,AQ==` },
    ])
  );

describe("agent chat request", () => {
  it("a sent message's words are its text parts, files left out; invalid parts have none", () => {
    assert.strictEqual(
      agentChatSentText([
        { type: "text", text: "תמצא לי ספה" },
        {
          type: "file",
          mediaType: "image/png",
          url: "data:image/png;base64,AQ==",
        },
        { type: "text", text: "עד 1,500" },
      ]),
      "תמצא לי ספה\n\nעד 1,500"
    );
    assert.strictEqual(
      agentChatSentText([{ type: "file", url: "https://example.com/a.png" }]),
      ""
    );
  });

  it("inline uploads accept the byte limit and reject remote, mismatched and oversized files", () => {
    const file = {
      type: "file",
      mediaType: "image/png",
      url: "data:image/png;base64,AQ==",
    };

    assert.strictEqual(Result.isSuccess(decodeSentParts([file])), true);

    for (const url of [
      "https://example.com/a.png",
      "data:application/pdf;base64,AQ==",
      "data:image/png;base64,?",
      "data:image/png;base64,",
    ]) {
      assert.strictEqual(
        Result.isSuccess(decodeSentParts([{ ...file, url }])),
        false
      );
    }

    const encoded = Buffer.alloc(agentChatMaxFileBytes).toString("base64");
    assert.strictEqual(
      Result.isSuccess(
        decodeSentParts([{ ...file, url: `data:image/png;base64,${encoded}` }])
      ),
      true
    );
    assert.strictEqual(
      Result.isSuccess(
        decodeSentParts([
          {
            ...file,
            url: `data:image/png;base64,${Buffer.alloc(agentChatMaxFileBytes + 1).toString("base64")}`,
          },
        ])
      ),
      false
    );
  });

  it("documents are accepted by their type, and other files are not", () => {
    for (const mediaType of [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/csv",
      "text/plain",
    ]) {
      assert.strictEqual(fileOfTypeSent(mediaType), true, mediaType);
    }

    for (const mediaType of ["application/zip", "text/html", "video/mp4"]) {
      assert.strictEqual(fileOfTypeSent(mediaType), false, mediaType);
    }
  });

  it("new messages strip provider controls and enforce meaningful text and total limits", () => {
    assert.deepStrictEqual(
      Schema.decodeUnknownSync(agentChatSentPartsSchema)([
        {
          type: "text",
          text: "שלום",
          providerMetadata: { openai: { itemId: "client-controlled" } },
        },
      ]),
      [{ type: "text", text: "שלום" }]
    );

    for (const parts of [
      [],
      [{ type: "text", text: "  " }],
      [
        { type: "text", text: "a".repeat(3000) },
        { type: "text", text: "b".repeat(3000) },
      ],
      Array.from({ length: 6 }, () => ({
        type: "file",
        mediaType: "image/png",
        url: "data:image/png;base64,AQ==",
      })),
    ]) {
      assert.strictEqual(Result.isSuccess(decodeSentParts(parts)), false);
    }
  });

  it.effect("oversized chunked requests stop reading before JSON parsing", () =>
    Effect.gen(function* oversizedChunkedRequestsStop() {
      let chunksRead = 0;

      const requestOptions = {
        method: "POST",
        body: new ReadableStream({
          pull(controller) {
            chunksRead += 1;
            controller.enqueue(new Uint8Array(1024 * 1024));
          },
        }),
        duplex: "half" as const,
      };

      const request = new Request(
        "http://localhost/api/agent/chat",
        requestOptions
      );

      assert.strictEqual(yield* readAgentChatRequest(request), null);
      assert.ok(chunksRead <= 72);
    })
  );
});
