import { assert, it, describe } from "@effect/vitest";
import type { ModelMessage } from "ai";
import { ConfigProvider, Effect, Layer } from "effect";

import { JevClient } from "../../../../../backend/shared/ai/typesafe-jev-client";
import { prepareAppAgentStep } from "../../../../../src/agent/core/agent/app-agent";
import {
  agentTurnSignalsFromAnswers,
  noAgentTurnSignals,
  readAgentTurnSignals,
} from "../../../../../src/agent/core/turn/agent-turn-signals";
import { timedOutJevClient } from "../../../../backend/shared/fixtures/timed-out-jev-client";

const analyzeInDepth = "תנתח לעומק";

// Jev reads the user's new message: a confident depth answer starts the turn
// at xhigh, a confident kind answer becomes a hint the first step
// reads, and Jev failing or missing leaves the turn as without signals.

type JevTurnAnswers = Parameters<typeof agentTurnSignalsFromAnswers>[0];

// Jev's answers, built from the choices its answer schema allows.
const answers = (
  depth: JevTurnAnswers["depth"]["choice"],
  kind: JevTurnAnswers["kind"]["choice"],
  confidence = 0.95,
  parts: JevTurnAnswers["parts"]["choice"] = "one"
): JevTurnAnswers => ({
  depth: { choice: depth, confidence },
  kind: { choice: kind, confidence },
  parts: { choice: parts, confidence },
});

const ask = (text: string): ModelMessage => ({
  role: "user",
  content: [{ type: "text", text }],
});

describe("agent turn signals", () => {
  it("a confident depth answer starts the turn at xhigh", () => {
    const signals = agentTurnSignalsFromAnswers(answers("thorough", "work"));
    assert.isTrue(signals.thorough);

    const step = prepareAppAgentStep(
      { messages: [ask(analyzeInDepth)], steps: [] },
      signals
    );

    assert.deepStrictEqual(step?.messages?.at(-1), {
      role: "system",
      content: "",
      providerOptions: { openai: { reasoningEffortUpdate: "xhigh" } },
    });
  });

  it("a confident kind answer becomes a hint on the first step only", () => {
    const signals = agentTurnSignalsFromAnswers(
      answers("normal", "small_talk")
    );

    assert.isFalse(signals.thorough);
    assert.include(signals.hints[0], "small talk");

    const first = prepareAppAgentStep(
      { messages: [ask("היי")], steps: [] },
      signals
    );

    assert.ok(
      first?.messages?.some(
        (message) =>
          message.role === "system" && message.content.includes("small talk")
      ) === true
    );

    const later = prepareAppAgentStep(
      {
        messages: [ask("היי")],
        steps: [{ toolCalls: [], content: [] }],
      },
      signals
    );

    assert.strictEqual(later, undefined);
  });

  it("several requests in a work message become the plan hint", () => {
    const signals = agentTurnSignalsFromAnswers(
      answers("normal", "work", 0.95, "several")
    );

    assert.strictEqual(signals.kind, "work");
    assert.isTrue(signals.several);
    assert.deepStrictEqual(signals.hints, [
      "Turn signal: several requests in one message. Show the plan: send updatePlan in this first step, with the reads the request needs, then finish every part.",
    ]);
  });

  it("several requests let the first step plan; one request keeps it out", () => {
    const tools = ["listTrackingTasks", "searchWeb"] as const;

    const first = {
      messages: [ask("Create a task, then show me the latest scans")],
      steps: [],
    };

    assert.isUndefined(
      prepareAppAgentStep(
        first,
        agentTurnSignalsFromAnswers(answers("normal", "work", 0.95, "several")),
        tools
      )?.activeTools
    );
    assert.deepStrictEqual(
      prepareAppAgentStep(
        first,
        agentTurnSignalsFromAnswers(answers("normal", "work")),
        tools
      )?.activeTools,
      [...tools]
    );
  });

  it("one request, or an unsure count, adds no plan hint", () => {
    assert.deepStrictEqual(
      agentTurnSignalsFromAnswers(answers("normal", "work")).hints,
      []
    );
    assert.deepStrictEqual(
      agentTurnSignalsFromAnswers(answers("normal", "work", 0.79, "several"))
        .hints,
      []
    );
  });

  it("small talk never gets the plan hint", () => {
    assert.deepStrictEqual(
      agentTurnSignalsFromAnswers(
        answers("normal", "small_talk", 0.95, "several")
      ).hints,
      [
        "Turn signal: small talk. Answer in one friendly line, then ask for the details <profile_gaps> lists, and nothing else; without it, offer one thing you can do.",
      ]
    );
  });

  it("an unsure answer adds nothing", () => {
    assert.deepStrictEqual(
      agentTurnSignalsFromAnswers(answers("thorough", "small_talk", 0.6)),
      noAgentTurnSignals
    );
  });

  it.effect(
    "without Jev, or when it fails, the turn runs without signals",
    () =>
      Effect.gen(function* signalsFallBack() {
        assert.deepStrictEqual(
          yield* readAgentTurnSignals(analyzeInDepth),
          noAgentTurnSignals
        );

        assert.deepStrictEqual(
          yield* readAgentTurnSignals(analyzeInDepth).pipe(
            Effect.provide(timedOutJevClient)
          ),
          noAgentTurnSignals
        );
      })
  );

  it.effect(
    "AGENT_TURN_SIGNALS=false switches the signals off without asking Jev",
    () =>
      Effect.gen(function* signalsSwitchedOff() {
        let asked = false;

        const jev = Layer.succeed(
          JevClient,
          JevClient.of({
            ask: () =>
              Effect.sync(() => {
                asked = true;
              }).pipe(Effect.andThen(Effect.die("not reached"))),
          })
        );

        const off = ConfigProvider.layer(
          ConfigProvider.fromUnknown({ AGENT_TURN_SIGNALS: "false" })
        );

        assert.deepStrictEqual(
          yield* readAgentTurnSignals(analyzeInDepth).pipe(
            Effect.provide(Layer.merge(jev, off))
          ),
          noAgentTurnSignals
        );
        assert.isFalse(asked);
      })
  );
});
