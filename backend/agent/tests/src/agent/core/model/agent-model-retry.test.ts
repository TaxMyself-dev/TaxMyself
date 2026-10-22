import { assert, it, describe } from "@effect/vitest";
import { APICallError } from "ai";

import { retryAgentModelCall } from "../../../../../src/agent/core/model/agent-model-retry";

// A model call that fails before streaming is tried again in sight of the
// user, and only when trying again can help.

const failure = (isRetryable: boolean) =>
  new APICallError({
    message: isRetryable ? "Service Unavailable" : "context_length_exceeded",
    url: "https://api.openai.com/v1/responses",
    requestBodyValues: {},
    statusCode: isRetryable ? 503 : 400,
    isRetryable,
  });

describe("agent model retry", () => {
  it("a dropped call is tried again, and the chat is told", async () => {
    const retries: string[] = [];
    let calls = 0;

    const answer = await retryAgentModelCall(
      async () => {
        calls += 1;
        await Promise.resolve();

        if (calls === 1) {
          throw failure(true);
        }

        return "answer";
      },
      undefined,
      (attempt, of) => {
        retries.push(`${attempt}/${of}`);
      }
    );

    assert.strictEqual(answer, "answer");
    assert.deepStrictEqual(retries, ["1/3"]);
  });

  it("an error a second try cannot fix fails at once", async () => {
    const retries: string[] = [];

    const [result] = await Promise.allSettled([
      retryAgentModelCall(
        async (): Promise<string> => {
          await Promise.resolve();
          throw failure(false);
        },
        undefined,
        (attempt, of) => {
          retries.push(`${attempt}/${of}`);
        }
      ),
    ]);

    assert.strictEqual(result.status, "rejected");
    assert.deepStrictEqual(retries, []);
  });
});
