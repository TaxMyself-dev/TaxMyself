import { assert, it, describe } from "@effect/vitest";
import { tool } from "ai";
import { Schema } from "effect";

import { toStandardSchema } from "../../../../../backend/shared/schema/standard-schema";
import {
  AgentToolError,
  addAgentToolErrorNextSteps,
  agentSourceErrorText,
} from "../../../../../src/agent/core/tool-runtime/agent-tool-error-next-step";

const socketHangUp = "socket hang up";

// A failed tool call tells the model what to do next: by its error code, or,
// for a change that failed without one, that its outcome is unknown. Every
// failure reaches the chat as an AgentToolError, so the chat keeps its text;
// a stop passes through as it is.

const options = { toolCallId: "call", messages: [], context: {} };

const failingTool = (message: string) =>
  tool({
    description: "fails",
    inputSchema: toStandardSchema(Schema.Struct({})),
    execute: async (): Promise<string> => {
      await Promise.resolve();
      throw new Error(message);
    },
  });

// The error a tool call fails with, after the wrapper.
const failureError = async (
  name: string,
  message: string,
  abortSignal?: AbortSignal
) => {
  const tools = addAgentToolErrorNextSteps({ [name]: failingTool(message) });

  const [result] = await Promise.allSettled([
    tools[name].execute?.({}, { ...options, abortSignal }),
  ]);

  if (result.status === "fulfilled") {
    return null;
  }

  const reason: unknown = result.reason;

  return reason;
};

const failure = async (name: string, message: string) => {
  const error = await failureError(name, message);

  return error instanceof Error ? error.message : "";
};

describe("agent tool error next step", () => {
  it("a rate-limited search says to wait and not retry", async () => {
    const message = await failure(
      "searchWeb",
      "WEB_SEARCH_RATE_LIMITED: 100 a day"
    );

    assert.match(message, /^WEB_SEARCH_RATE_LIMITED: 100 a day Next step: /u);
    assert.include(message, "do not retry now");
  });

  it("a change that fails without a known code has an unknown outcome", async () => {
    const message = await failure("createTrackingTask", socketHangUp);
    assert.include(message, "outcome is unknown");
  });

  it("a read that fails without a known code stays as it is", async () => {
    assert.strictEqual(
      await failure("listTrackingTasks", socketHangUp),
      socketHangUp
    );
  });

  it("a failed search reaches the chat as the tool's own error, code and all", async () => {
    const error = await failureError(
      "searchWeb",
      "WEB_SEARCH_UNAVAILABLE: 503"
    );

    assert.instanceOf(error, AgentToolError);
    assert.match(
      error instanceof Error ? error.message : "",
      /^WEB_SEARCH_UNAVAILABLE: 503 Next step: The search service did not answer/u
    );
  });

  it("one source's failure inside a search result carries its next step", () => {
    assert.include(
      agentSourceErrorText("WEB_SEARCH_UNAVAILABLE: one source") ?? "",
      "Next step: The search service did not answer."
    );
    assert.strictEqual(agentSourceErrorText("WHATEVER: odd"), "WHATEVER: odd");
    assert.isNull(agentSourceErrorText(null));
  });

  it("a long failure is cut, keeping its code, start and next step", async () => {
    const message = await failure(
      "searchWeb",
      `WEB_SEARCH_UNAVAILABLE: ${"<div>".repeat(5000)}`
    );

    assert.match(message, /^WEB_SEARCH_UNAVAILABLE: <div>/u);
    assert.match(
      message,
      /characters cut\] Next step: The search service did not answer/u
    );
    assert.isBelow(message.length, 4300);
  });

  it("a stopped tool call passes its error through as it is", async () => {
    const stop = new AbortController();
    stop.abort();

    const error = await failureError(
      "searchWeb",
      "The operation was aborted",
      stop.signal
    );

    assert.notInstanceOf(error, AgentToolError);
  });
});
