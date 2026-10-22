import { tool } from "ai";
import { Schema } from "effect";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";

// A question with a few answers to choose from, shown in the chat as buttons
// (AgentChatQuestion): Codex's request_user_input and Claude Code's
// AskUserQuestion. The chosen answer is sent as the user's next message, and
// the user can type their own answer instead. Calling it ends the answer
// (agentAskedUser), since the user's reply comes next.
export const askUserQuestionTool = tool({
  description:
    "Ask one question with 2 to 4 answers as buttons; the pick, or the user's own words, comes back as their next message. Use it when the next step depends on a few clear options (a task's setup, which groups or tasks, which match). Open questions (what they offer, a price) stay in your text. It ends your turn, so first write everything the answer has to say (what you found, with links); write the question only here, and call nothing after it.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      question: Schema.String.check(
        Schema.isMinLength(1),
        Schema.isMaxLength(200)
      ).annotate({
        description: "The question, in the user's language and voice",
      }),
      options: Schema.Array(
        Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80))
      )
        .check(Schema.isMinLength(2), Schema.isMaxLength(4))
        .annotate({
          description:
            "2 to 4 short answers as the user would say them, the recommended one first",
        }),
    })
  ),
  execute: () => ({ asked: true }),
});
