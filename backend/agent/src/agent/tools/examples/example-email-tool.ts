import { tool } from "ai";
import { Schema } from "effect";

import { appRuntime } from "@/server/runtime/app-runtime.server";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { agentToolContextSchema } from "../../core/tool-runtime/agent-tool-context";

// EXAMPLE TOOL: an action in the user's name outside the app (EmailSender,
// example-ports.ts). It is "approval" in agent-tool-traits.ts, and messaging
// tools take only "ask" or "never" as the user's rule
// (agent-action-rules.ts): something sent in the user's name is never sent
// without their card. Put rare tools like this in a deferred namespace
// (agent-tool-search.ts), so most requests do not carry their schema.

export const sendEmailTool = tool({
  description:
    "Send an email in the user's name to someone they chose. It waits for the user's approval card, which shows the email: write it fully first, and call it last in your answer.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      to: Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+$/u)).annotate({
        description: "The recipient's email address, as the user gave it",
      }),
      subject: Schema.Trim.check(
        Schema.isMinLength(1),
        Schema.isMaxLength(200)
      ),
      body: Schema.Trim.check(
        Schema.isMinLength(1),
        Schema.isMaxLength(5000)
      ).annotate({
        description: "The email, in the user's language and voice",
      }),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async (email, { context }) =>
    await appRuntime.runPromise(context.email.send(email)),
});
