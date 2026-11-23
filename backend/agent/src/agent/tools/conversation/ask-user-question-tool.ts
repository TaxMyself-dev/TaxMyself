import { tool } from "ai";
import { Schema } from "effect";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";

// A question with a few answers to choose from, shown in the chat as buttons
// (AgentChatQuestion): Codex's request_user_input and Claude Code's
// AskUserQuestion.
//
// KeepInTax change (Phase 3.1, A18, plan §2.6; GUIDE.md "What KeepInTax
// changed"): the page answers the tool, not the server. It has no execute,
// so the answer stops on the open call (the AI SDK ends the loop on a call it
// cannot run). Each option carries a value as well as a label. The page
// sends the chosen value back on the stored message, the server accepts only
// one of that open question's own values, once
// (agent-chat-question-answers.ts), and the same answer continues with the
// result { value, label }, so the original request, its range and filters
// and the reads already made stay in the same turn. A message the user types
// instead closes the question as { superseded: true }.
//
// The template's questions were label-only and answered as the next user
// message, their call returning { asked: true }. Conversations stored
// before Phase 3.1 hold such calls, so a plain string option still
// validates (its label is its value) and those questions show as answered.

/**
 * The most options one question offers: every business of a data owner who
 * has a few, plus "all".
 */
export const agentQuestionMaxOptions = 6;

/**
 * One answer to pick: what the button says and what the agent gets back.
 */
export const agentQuestionOptionSchema = Schema.Struct({
  label: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(80)
  ).annotate({
    description: "The button's text, as the user would say it",
  }),
  value: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(100)
  ).annotate({
    description:
      "What you get back when it is picked: a business number, an id, or a short code such as all",
  }),
});

// A label-only option, as the template stored them.
const agentLegacyQuestionOptionSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(80)
);

export const agentQuestionInputSchema = Schema.Struct({
  question: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(200)
  ).annotate({
    description: "The question, in the user's language and voice",
  }),
  options: Schema.Array(
    Schema.Union([agentQuestionOptionSchema, agentLegacyQuestionOptionSchema])
  )
    .check(Schema.isMinLength(2), Schema.isMaxLength(agentQuestionMaxOptions))
    .annotate({
      description: `2 to ${agentQuestionMaxOptions} answers, each { label, value }, the recommended one first`,
    }),
});

// What the call returns, as stored: the answer picked ({ value, label }, the
// label the stored option's), superseded by a typed message, or the
// template's { asked: true } in conversations stored before Phase 3.1.
// Stored outputs are validated against it.
export const agentQuestionOutputSchema = Schema.Union([
  Schema.Struct({
    value: Schema.String.check(Schema.isMaxLength(100)),
    label: Schema.String.check(Schema.isMaxLength(80)),
  }),
  Schema.Struct({ superseded: Schema.Literal(true) }),
  Schema.Struct({ asked: Schema.Literal(true) }),
]);

export const askUserQuestionTool = tool({
  description:
    "Ask one question the current request cannot be completed without (which business, which of several matches), with 2 to 6 answers as buttons. Each answer has a label the user reads and a value you get back. The page answers it: its result { value, label } comes back in this same answer, and you then finish the request you were doing. Never for preferences, the user's goals, details about them, or anything for later. First write what you can already say; write the question only here, and call nothing after it.",
  inputSchema: toStandardSchema(agentQuestionInputSchema),
  outputSchema: toStandardSchema(agentQuestionOutputSchema),
});
