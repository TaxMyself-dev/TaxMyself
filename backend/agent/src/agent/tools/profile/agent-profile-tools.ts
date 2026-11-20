import { tool } from "ai";
import { Schema } from "effect";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import type { AgentToolContext } from "../../core/tool-runtime/agent-tool-context";
import { agentToolContextSchema } from "../../core/tool-runtime/agent-tool-context";
import { agentToolCallKey } from "../../core/tool-runtime/agent-tool-idempotency";

const nullableText = Schema.NullOr(Schema.String);

const fact = Schema.Struct({
  field: Schema.NullOr(
    Schema.Literals([
      "preferred_name",
      "employment",
      "activity",
      "business_stage",
      "registration",
      "workplace",
      "vehicle",
      "employees",
      "partners",
      "international",
      "current_need",
    ])
  ),
  scope: Schema.Literals(["person", "business"]),
  statement: Schema.String,
  value: nullableText,
  state: Schema.Literals(["known", "unknown", "skipped", "not_applicable"]),
  replaces: Schema.optionalKey(nullableText),
  change: Schema.Literals(["add", "transition", "correction"]),
  effectiveDate: Schema.optionalKey(nullableText),
  precision: Schema.Literals(["day", "month", "unknown"]),
  evidence: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
  invalidates: Schema.optionalKey(Schema.Array(Schema.String)),
  workplaceModes: Schema.optionalKey(
    Schema.NullOr(
      Schema.Array(Schema.Literals(["home", "office", "field", "other"]))
    )
  ),
});

const profilePort = (context: AgentToolContext) => {
  const port = context.profileMemory;

  if (!port) {
    throw new Error(
      "AGENT_PROFILE_UNAVAILABLE: Profile memory is unavailable; do not claim a save."
    );
  }

  return port;
};

export const readUserProfileTool = tool({
  description:
    "Read the shared personal and selected business profile, narrative, fact IDs, historical periods, versions and missing basic fields. Read before any update. Same memory in ordinary chat and onboarding. Business number must belong to the verified owner; delegates cannot access this personal memory.",
  inputSchema: toStandardSchema(
    Schema.Struct({ businessNumber: Schema.String })
  ),
  contextSchema: agentToolContextSchema,
  execute: async ({ businessNumber }, { context }) => {
    if (
      context.profileBusiness !== undefined &&
      context.profileBusiness !== businessNumber
    ) {
      throw new Error(
        "AGENT_PROFILE_BUSINESS_MISMATCH: Use the business chosen for this interface."
      );
    }

    return await profilePort(context).read(businessNumber);
  },
});

export const updateUserProfileTool = tool({
  description:
    "Apply focused changes to the shared profile using the version and fact IDs just read. Facts are grounded ONLY in exact evidence from the current user message (server supplied). A short yes/no answers the last assistant question, never an older question. field=null stores any other relevant narrative detail. Transition preserves the past; correction marks the old fact erroneous. Registration/workplace transitions require the actual effective date (YYYY-MM allowed); never invent a day. WorkplaceModes describes all continuing locations. For unknown/skipped use the user's explicit uncertainty/deferral. forget_facts deletes IDs without asserting their opposite; forget_all clears profile memory across owned businesses, not chat/accounting records/backups. Return success before claiming anything saved/deleted. A version conflict requires rereading and reevaluating the same current message.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      businessNumber: Schema.String,
      version: Schema.Struct({ person: Schema.Int, business: Schema.Int }),
      intent: Schema.Literals(["share", "defer", "forget_facts", "forget_all"]),
      facts: Schema.Array(fact).check(Schema.isMaxLength(30)),
      forgetIds: Schema.optionalKey(
        Schema.Array(Schema.String).check(Schema.isMaxLength(50))
      ),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async (input, { context, toolCallId }) => {
    if (
      context.profileBusiness !== undefined &&
      context.profileBusiness !== input.businessNumber
    ) {
      throw new Error(
        "AGENT_PROFILE_BUSINESS_MISMATCH: Use the business chosen for this interface."
      );
    }

    if (
      context.profileMessage === undefined ||
      context.profileMessage.trim() === ""
    ) {
      throw new Error(
        "AGENT_PROFILE_NO_SOURCE: A new user message is required for profile updates."
      );
    }

    const snapshot = await profilePort(context).update({
      businessNumber: input.businessNumber,
      version: input.version,
      message: context.profileMessage,
      extraction: {
        intent: input.intent,
        facts: input.facts.map((entry) => ({
          ...entry,
          replaces: entry.replaces ?? null,
          effectiveDate: entry.effectiveDate ?? null,
          invalidates: entry.invalidates ?? [],
          workplaceModes: entry.workplaceModes ?? null,
        })),
        forgetIds: input.forgetIds ?? [],
        clarification: null,
      },
      operationId: agentToolCallKey(context.conversationId, toolCallId),
    });

    return { ...snapshot, profileOperation: input.intent };
  },
});
