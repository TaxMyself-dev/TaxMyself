import { assert, it, describe } from "@effect/vitest";
import { APICallError, RetryError } from "ai";

import { getLocale, overwriteGetLocale } from "#/paraglide/runtime";

import {
  agentChatErrorMessage,
  agentChatRequestFailure,
} from "../../../../../src/agent/chat/turn/agent-chat-errors";

const callError = (statusCode: number, responseBody = "") =>
  new APICallError({
    message: "failed",
    url: "https://api.openai.com/v1/responses",
    requestBodyValues: {},
    statusCode,
    responseBody,
  });

describe("agent chat errors", () => {
  it("each kind of failure says what to do next", () => {
    assert.match(agentChatErrorMessage(callError(429), "he"), /בעוד דקה/u);
    assert.match(
      agentChatErrorMessage(callError(401), "he"),
      /OPENAI_API_KEY/u
    );
    assert.match(
      agentChatErrorMessage(
        callError(400, '{"code":"context_length_exceeded"}'),
        "he"
      ),
      /בשיחה חדשה/u
    );
    assert.match(
      agentChatErrorMessage(new Error("boom"), "he"),
      /אפשר לנסות שוב/u
    );
  });

  it("a failure is explained in the chat request's language", () => {
    assert.match(agentChatErrorMessage(callError(429), "en"), /in a minute/u);
    assert.match(agentChatErrorMessage(new Error("boom"), "en"), /try again/u);
  });

  it("a failure after the SDK's retries is judged by its last error", () => {
    const retried = new RetryError({
      message: "retries exhausted",
      reason: "maxRetriesExceeded",
      errors: [callError(500), callError(429)],
    });

    assert.match(agentChatErrorMessage(retried, "he"), /בעוד דקה/u);
  });

  it("an unsafe regeneration explains recovery and offers no replay button", () => {
    // The page's failure, in the page's language (paraglide's getLocale):
    // a Hebrew page here, since nothing outside a page sets it.
    const pageLocale = getLocale;
    overwriteGetLocale(() => "he");

    const failure = (() => {
      try {
        return agentChatRequestFailure(
          new Error(
            JSON.stringify({
              error: {
                code: "AGENT_CHAT_RETRY_UNSAFE",
                message: "send a new message",
              },
            })
          )
        );
      } finally {
        overwriteGetLocale(pageLocale);
      }
    })();

    assert.strictEqual(failure.retry, false);
    assert.match(failure.message, /הודעה חדשה/u);
    assert.deepStrictEqual(
      agentChatRequestFailure(new Error("הסוכן עמוס כרגע.")),
      {
        message: "הסוכן עמוס כרגע.",
        retry: true,
      }
    );
  });
});
