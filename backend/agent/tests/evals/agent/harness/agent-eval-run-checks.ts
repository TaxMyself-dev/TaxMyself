import {
  ConversationalTestCase,
  LLMTestCase,
  ToolCall,
  Turn,
} from "deepeval/test-case";

import type { AgentEvalWrite } from "./agent-eval-fixtures";
import type { AgentEvalRun } from "./agent-eval-harness";

// What the agent eval files check on a run (AgentEvalRun): its test cases
// for the judges, and the tools it called and rows it wrote.

const israelTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const utcTimePattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z/gu;

// The user's message time as the input carries it (<message_time>), in
// local wall-clock minutes, so ages are computed without a time-zone offset.
const messageTimePattern =
  /<message_time>(?<day>\d{4}-\d{2}-\d{2}), (?<time>\d{2}:\d{2}) /u;

const wallClockMinutes = (day: string, time: string) =>
  Date.parse(`${day}T${time}:00Z`) / 60_000;

const messageMinutes = (input: string) => {
  const groups = messageTimePattern.exec(input)?.groups;

  return groups?.day === undefined || groups.time === undefined
    ? null
    : wallClockMinutes(groups.day, groups.time);
};

const ageBeforeMessage = (local: string, message: number | null) => {
  if (message === null) {
    return "";
  }

  const [day = "", time = ""] = local.split(" ");
  const minutes = message - wallClockMinutes(day, time);

  if (minutes < 0) {
    return "";
  }

  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);

  const parts = [
    ...(days > 0 ? [`${days} d`] : []),
    ...(hours > 0 ? [`${hours} h`] : []),
    `${minutes % 60} min`,
  ];

  return `, ${parts.join(" ")} before the user's message`;
};

// A tool's output for the judges, each UTC time followed by its local time
// and how long before the user's message it was, computed here. The agent
// shows tools' UTC times in the user's time zone (agent-instructions.ts);
// Jev could not confirm that conversion itself and failed correct scan
// reports on it (tool faithfulness, 0 of 3 in one run), nor "posted about
// two hours ago" (2 of 6): code computes, Jev judges.
const judgedToolOutput = (output: ToolCall["output"], message: number | null) =>
  JSON.stringify(output ?? null).replaceAll(utcTimePattern, (time) => {
    const local = israelTime.format(new Date(time));

    return `${time} (${local} Israel time${ageBeforeMessage(local, message)})`;
  });

/**
 * The run as a DeepEval test case: the input, the agent's answer, and each
 * tool call with its output as the judge reads it. The follow-up buttons
 * come after the answer, labeled as the app's, in the user's voice: unlabeled,
 * a judge read "can you find more from today?" as the agent saying it
 * searched again; some judges still accept an offer made in a button.
 *
 * @param run - The eval run.
 * @returns The test case.
 */
export const agentEvalTestCase = (run: AgentEvalRun) =>
  new LLMTestCase({
    input: run.input,
    actualOutput: [
      run.answer || "(no text)",
      ...(run.followUps.length > 0
        ? [
            [
              "[Follow-up buttons the app shows under the answer, written in the user's voice for them to tap, not words of the agent:]",
              ...run.followUps.map((question) => `- ${question}`),
            ].join("\n"),
          ]
        : []),
    ].join("\n\n"),
    toolsCalled: run.toolCalls.map(
      (call) =>
        new ToolCall({
          name: call.name,
          inputParameters: call.inputParameters,
          output: judgedToolOutput(call.output, messageMinutes(run.input)),
        })
    ),
  });

/**
 * The whole conversation as one case, for agentConversationJudge.
 *
 * @param run - The eval run.
 * @returns The conversational test case.
 */
export const agentEvalConversationCase = (run: AgentEvalRun) =>
  new ConversationalTestCase({ turns: run.turns });

/**
 * The names of the tools the run called, in order.
 *
 * @param run - The eval run.
 * @returns The names.
 */
export const calledToolNames = (run: AgentEvalRun) =>
  run.toolCalls.map((call) => call.name);

/**
 * The inputs of every call to the named tool, as one JSON text to search.
 *
 * @param run - The eval run.
 * @param name - The tool's name.
 * @returns The inputs, as JSON joined by spaces.
 */
export const calledToolInputs = (run: AgentEvalRun, name: string) =>
  run.toolCalls
    .filter((call) => call.name === name)
    .map((call) => JSON.stringify(call.inputParameters))
    .join(" ");

/**
 * The run's first call to the named tool.
 *
 * @param run - The eval run.
 * @param name - The tool's name.
 * @returns The call, or undefined when the tool was not called.
 */
export const findRunToolCall = (run: AgentEvalRun, name: string) =>
  run.toolCalls.find((call) => call.name === name);

/**
 * The run's first write of the action to the table.
 *
 * @param run - The eval run.
 * @param table - The table written.
 * @param action - The write's action.
 * @returns The write, or undefined when there was none.
 */
export const findRunWrite = (
  run: AgentEvalRun,
  table: string,
  action: AgentEvalWrite["action"]
) =>
  run.writes.find((write) => write.table === table && write.action === action);

const answerLinkPattern = /https?:\/\/[^\s)\]]+/gu;

/**
 * The links in the answer that no tool returned, for answers too long for
 * the faithfulness judge: on a long report (four items, their scores and
 * links) Jev scored faithful and unfaithful answers alike at 0.60-0.76
 * around its 0.7 threshold.
 *
 * @param run - The eval run.
 * @returns The links missing from every tool output.
 */
export const answerLinksNotFromTools = (run: AgentEvalRun) => {
  const toolOutputs = run.toolCalls
    .map((call) => JSON.stringify(call.output ?? null))
    .join(" ");

  return (run.answer.match(answerLinkPattern) ?? []).filter(
    (link) => !toolOutputs.includes(link)
  );
};

const answerNumberPattern = /\d+(?:[.,]\d+)*/gu;

// Counts the agent works out itself ("3 of the 4 are videos") are small.
const smallCountMax = 10;

const numbersIn = (text: string) =>
  new Set(
    (text.match(answerNumberPattern) ?? []).map((number) =>
      number.replaceAll(",", "")
    )
  );

/**
 * The numbers in the answer that neither the input nor any tool gave,
 * counts up to smallCountMax aside, for answers too long for the
 * faithfulness judge (see answerLinksNotFromTools). Written for the ad
 * report, whose figures are scores, counts, ids and prices as the tools
 * return them; an answer that converts times or sums money needs the judge.
 *
 * @param run - The eval run.
 * @returns The numbers missing from the input and every tool output.
 */
export const answerNumbersNotFromTools = (run: AgentEvalRun) => {
  const given = numbersIn(
    [
      run.input,
      ...run.toolCalls.map((call) => JSON.stringify(call.output ?? null)),
    ].join(" ")
  );

  return [...numbersIn(run.answer)].filter(
    (number) => !given.has(number) && Number(number) > smallCountMax
  );
};

/**
 * The run deleted no row of any table.
 *
 * @param run - The eval run.
 * @returns Whether it deleted nothing.
 */
export const runDeletedNothing = (run: AgentEvalRun) =>
  !run.writes.some((write) => write.action === "delete");

/**
 * A user turn and the agent's answer to it, as the conversation judge reads
 * them.
 *
 * @param input - The user's message.
 * @param run - The answer's text and tool calls.
 * @returns The user's turn and the agent's.
 */
export const agentEvalTurns = (
  input: string,
  run: { output: string; toolCalls: ToolCall[] }
) => [
  new Turn({ role: "user", content: input }),
  new Turn({
    role: "assistant",
    content: run.output || "(no text)",
    toolsCalled: run.toolCalls,
  }),
];
