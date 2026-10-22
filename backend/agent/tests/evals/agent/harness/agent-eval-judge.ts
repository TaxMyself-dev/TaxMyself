import { Choice, ConversationalJevEval, JevEval, Noul } from "deepeval/metrics";
import { MultiTurnParams, SingleTurnParams } from "deepeval/test-case";

import { jevNewestModel } from "../../../../backend/shared/ai/typesafe-jev-client";

// The judges of the agent evals: TypeSafe's Jev, through DeepEval's JevEval
// metrics, answers bounded questions about a case with calibrated
// probabilities, and DeepEval turns them into a score with fixed math (no
// generated verdict). Four kinds:
// - agentAnswerJudge: yes/no statements about the message and the answer,
//   or a Choice where the answer can go several ways (each way earns its own
//   credit; a way marked null means the case does not apply); the score is
//   their mean, a case passes at the threshold.
// - agentRuleJudge: hard rules (strict mode); every statement must lean
//   true, so one broken rule fails the case however well the rest score.
// - agentToolFaithfulnessJudge: the answer against the tools' outputs, so
//   the agent never reports a figure or a name its tools did not return.
// - agentConversationJudge: statements about a whole conversation, turn by
//   turn, for what only shows across turns.
// What can be checked exactly (tools called, rows written, literal words) is
// asserted in the eval files instead, with no judge.

// The Jev version the judges ask for, as the app's classifiers do.
export const agentEvalJudgeModel = jevNewestModel;

// A statement is a Noul; a Choice goes as it is.
const agentJudgeQuestions = (questions: (string | Choice)[]) =>
  questions.map((question) =>
    question instanceof Choice ? question : new Noul({ statement: question })
  );

/**
 * A Jev judge of the agent's answer to the user's message.
 *
 * @param name - The judge's name.
 * @param questions - Its statements, or choices.
 * @param threshold - The score an answer needs to pass.
 * @returns The judge.
 */
export const agentAnswerJudge = (
  name: string,
  questions: (string | Choice)[],
  threshold = 0.7
) =>
  new JevEval({
    name,
    evaluationParams: [SingleTurnParams.INPUT, SingleTurnParams.ACTUAL_OUTPUT],
    questions: agentJudgeQuestions(questions),
    threshold,
    systemOneModel: agentEvalJudgeModel,
  });

/**
 * Strict mode passes a Noul at P(true) \>= 0.5 and scores 1 only when every
 * statement passes; the breakdown names the one that failed.
 *
 * @param name - The judge's name.
 * @param statements - The statements every answer must make true.
 * @returns The strict judge.
 */
export const agentRuleJudge = (name: string, statements: string[]) =>
  new JevEval({
    name,
    evaluationParams: [SingleTurnParams.INPUT, SingleTurnParams.ACTUAL_OUTPUT],
    questions: statements.map((statement) => new Noul({ statement })),
    strictMode: true,
    systemOneModel: agentEvalJudgeModel,
  });

// Judge statements reworded after a run belong here, with why, so a case
// and its calibration read the same words. A judge question that read a
// right answer wrong at low confidence is reworded, never loosened.

/**
 * Whether the answer leaves ongoing tracking to the user: offering a task
 * or asking about one is right, saying one was created is not.
 *
 * @returns The judge's question.
 */
export const trackingLeftToUserQuestion = () =>
  new Choice({
    question:
      "What does `test_case.actual_output` say about ongoing tracking (a task that keeps checking on a schedule)? Searching once now is not tracking.",
    options: {
      says_it_was_created_or_started: 0,
      offers_it_or_asks: 1,
      does_not_mention_it: 1,
    },
  });

/**
 * A delete still waiting for its approval is not reported as done.
 *
 * @returns The judge.
 */
export const taskDeleteNotReportedJudge = () =>
  agentRuleJudge("Does not report the delete", [
    "`test_case.actual_output` does not say that the task was deleted.",
  ]);

/**
 * The answer reports only what its tools returned (agent-instructions.ts:
 * facts come from the tools). Only figures and the names of found results
 * are asked about: the business's own details come from the instructions, which Jev
 * does not see. A fact made up weighs twice a value copied wrong. A case
 * whose tools returned everything the user asked drops the last question.
 * Calibrated on our runs: answers that counted the returned results or gave
 * a UTC time in local time scored "unclear" when the first
 * statement asked for figures "as they appear", so it allows figures worked
 * out from the tools' output. A Choice on "information the tools did not
 * return" failed 6 of 6 answers whose every figure was in the tools' output
 * (fixes-1), so it was dropped. Not yet validated on human labels.
 *
 * @param threshold - The score an answer needs to pass.
 * @returns The judge.
 */
export const agentToolFaithfulnessJudge = (threshold = 0.7) =>
  new JevEval({
    name: "Tool faithfulness",
    evaluationParams: [
      SingleTurnParams.INPUT,
      SingleTurnParams.ACTUAL_OUTPUT,
      SingleTurnParams.TOOLS_CALLED,
    ],
    questions: [
      new Noul({
        statement:
          "Every figure in `test_case.actual_output` (a count, number, price, date or time) comes from `test_case.input` or from the output of a call in `test_case.tools_called`, either as written there or worked out from it, such as the number of items a tool returned or a UTC time given in local time.",
        weight: 2,
      }),
      new Noul({
        statement:
          "Every record, search result or link that `test_case.actual_output` names appears in the output of a call in `test_case.tools_called`.",
        weight: 2,
      }),
      new Noul({
        statement:
          "`test_case.actual_output` reports the values returned in `test_case.tools_called` accurately.",
      }),
    ],
    threshold,
    systemOneModel: agentEvalJudgeModel,
  });

/**
 * Statements about `turns` (each with its role, content and tool calls), for
 * cases where the order matters: what was asked before what was done.
 *
 * @param name - The judge's name.
 * @param statements - The statements about the conversation's turns, or
 *   choices.
 * @param threshold - The score a conversation needs to pass.
 * @returns The judge.
 */
export const agentConversationJudge = (
  name: string,
  statements: (string | Choice)[],
  threshold = 0.7
) =>
  new ConversationalJevEval({
    name,
    evaluationParams: [MultiTurnParams.TOOLS_CALLED],
    questions: agentJudgeQuestions(statements),
    threshold,
    systemOneModel: agentEvalJudgeModel,
  });

// Words that address one gender (agent-instructions.ts asks for neutral or
// plural forms), as whole words, also after ו or ש. A fixed word list has
// one exact answer, so code checks it: Jev reads את literally, and on
// 2026-10-13 failed "את השם שלכם", where את is the object marker.
export const genderMarkedHebrewWords =
  /(?<!\p{L})[וש]?(?:אתה|תגדיר|תגדירי|מגדירה|תבחר|תבחרי|שימי לב|שים לב)(?!\p{L})/u;

/**
 * The voice the instructions ask for (agent-instructions.ts, <voice>).
 * Statements are concrete and positive: on 2026-10-04 Jev read "the way a
 * colleague texts on a messaging app" as unclear on a natural answer, and this
 * wording scored a natural answer 0.91 and a chatbot-style one 0.32.
 *
 * @returns The judge.
 */
export const hebrewVoiceJudge = () =>
  agentAnswerJudge("Hebrew voice", [
    "`test_case.actual_output` is written in plain, conversational Hebrew with short, direct sentences.",
    "`test_case.actual_output` uses none of these stock chatbot phrases: בהחלט, שאלה מצוינת, אשמח לעזור, חשוב לציין, לסיכום, מקווה שזה עוזר.",
    "`test_case.actual_output` gets straight to the answer, without an introduction or a closing recap.",
  ]);
