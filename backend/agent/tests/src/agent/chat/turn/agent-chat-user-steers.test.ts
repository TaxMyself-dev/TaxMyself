import { assert, describe, it } from "@effect/vitest";
import type { ModelMessage } from "ai";

import { placeAgentChatUserSteers } from "../../../../../src/agent/chat/turn/agent-chat-user-steers.server";

// A run a stop hook starts after another reads the earlier run's messages
// with each steer where its step read it, so the user's message is not lost
// or moved.

const assistant = (text: string): ModelMessage => ({
  role: "assistant",
  content: text,
});

const user = (text: string): ModelMessage => ({ role: "user", content: text });

describe("agent chat user steers in a run", () => {
  it("a run without steers keeps its messages as they are", () => {
    const messages = [assistant("a"), assistant("b")];

    assert.deepStrictEqual(placeAgentChatUserSteers(messages, []), messages);
  });

  it("each steer goes after the messages its step had answered, in order", () => {
    const [a, b, c] = [assistant("a"), assistant("b"), assistant("c")];
    const [first, second] = [user("רק בחיפה"), user("עד 5000")];

    assert.deepStrictEqual(
      placeAgentChatUserSteers(
        [a, b, c],
        [
          { after: 1, messages: [first] },
          { after: 2, messages: [second] },
        ]
      ),
      [a, first, b, second, c]
    );
  });

  it("a steer read before the run's last step comes after every earlier message", () => {
    const [a, b] = [assistant("a"), assistant("b")];
    const steer = user("רק בחיפה");

    assert.deepStrictEqual(
      placeAgentChatUserSteers([a, b], [{ after: 2, messages: [steer] }]),
      [a, b, steer]
    );
  });
});
