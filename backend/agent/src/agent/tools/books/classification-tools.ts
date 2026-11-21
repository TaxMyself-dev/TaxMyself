import { tool } from "ai";
import { Effect, Option, Schema } from "effect";

import { runSupabaseQuery } from "@/server/runtime/supabase-query";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { agentToolContextSchema } from "../../core/tool-runtime/agent-tool-context";
import type { AgentToolContext } from "../../core/tool-runtime/agent-tool-context";
import { businessNumberInput, runBooksRead } from "./books-tool-schema";

class ClassificationError extends Schema.TaggedError<
  ClassificationError,
  { readonly brand: unique symbol }
>()("ClassificationError", { code: Schema.String, detail: Schema.String }) {
  /** The actionable domain failure.
   * @returns The code and detail. */
  override get message() {
    return `${this.code}: ${this.detail}`;
  }
}

const decodeEnvelope = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ signature: Schema.String, payload: Schema.String })
  )
);

const decodePayload = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ display: Schema.Record(Schema.String, Schema.Json) })
  )
);

const storedProposal = Schema.decodeUnknownOption(
  Schema.Struct({
    type: Schema.Literal("tool-prepareTransactionClassification"),
    state: Schema.Literal("output-available"),
    output: Schema.Struct({
      proposalId: Schema.String,
      proposal: Schema.String,
    }),
  })
);

// Stored preparations from before the preview option have no flag.
const classificationApprovalState = (requestApproval = true) =>
  requestApproval ? "card_required_next" : "proposal_only_no_card";

const storedParts = Schema.decodeUnknownOption(Schema.Array(Schema.Unknown));

const approvedModePart = Schema.decodeUnknownOption(
  Schema.Struct({
    type: Schema.Literal("tool-classifyTransaction"),
    toolCallId: Schema.String,
    state: Schema.Literal("approval-responded"),
    input: Schema.Struct({ proposalId: Schema.String }),
    approval: Schema.Struct({
      approved: Schema.Literal(true),
      reason: Schema.optionalKey(Schema.String),
    }),
  })
);

/** Read only the authenticated, stored decision for THIS tool invocation.
 * The model and client cannot replace the signed transaction/category.
 * @param parts - Stored assistant parts.
 * @param proposalId - The proposal being executed.
 * @param toolCallId - The SDK's server-selected invocation.
 * @returns The user's checkbox choice, or the proposal's signed default. */
export const classificationApprovalMode = (
  parts: readonly unknown[],
  proposalId: string,
  toolCallId?: string
) => {
  for (const part of parts) {
    const parsed = approvedModePart(part);

    if (
      Option.isSome(parsed) &&
      parsed.value.toolCallId === toolCallId &&
      parsed.value.input.proposalId === proposalId
    ) {
      if (parsed.value.approval.reason === "classification-mode:one-time") {
        return true;
      }

      if (parsed.value.approval.reason === "classification-mode:rule") {
        return false;
      }
    }
  }

  return null;
};

/** Resolve a short ID only from successful assistant results in THIS owned
 * conversation. The client never supplies the signed operation on approval.
 * @param context - The owned conversation and scoped database client.
 * @param proposalId - The short identifier from a successful preparation.
 * @param toolCallId - The SDK invocation whose stored approval may select a mode.
 * @returns The original signed proposal or a stale-proposal failure. */
export const readClassificationProposal = (
  context: Pick<AgentToolContext, "supabase" | "conversationId">,
  proposalId: string,
  toolCallId?: string
) =>
  runSupabaseQuery("CLASSIFICATION_PROPOSAL_READ_FAILED", () =>
    context.supabase
      .from("agent_chat_messages")
      .select("role, parts")
      .eq("conversation_id", context.conversationId)
      .eq("role", "assistant")
  ).pipe(
    Effect.flatMap(({ data }) => {
      const decisionParts = data
        .filter((row) => row.role === "assistant")
        .flatMap((row) => Option.getOrElse(storedParts(row.parts), () => []));

      const isSingleUpdate = classificationApprovalMode(
        decisionParts,
        proposalId,
        toolCallId
      );

      for (const row of data) {
        if (row.role !== "assistant") {
          continue;
        }

        const parts = Option.getOrElse(storedParts(row.parts), () => []);

        for (const part of parts) {
          const parsed = storedProposal(part);

          if (
            Option.isSome(parsed) &&
            parsed.value.output.proposalId === proposalId
          ) {
            return Effect.succeed({
              proposal: parsed.value.output.proposal,
              ...(isSingleUpdate !== null && { isSingleUpdate }),
            });
          }
        }
      }

      return Effect.fail(
        new ClassificationError({
          code: "CLASSIFICATION_STALE",
          detail: "proposal not found in this conversation; prepare again",
        })
      );
    })
  );

export const prepareTransactionClassificationTool = tool({
  description:
    "Prepare classification or reclassification of an outgoing bank/card transaction not yet transferred to an expense. Default is a permanent merchant rule for this account; explicitly one-time requests use isSingleUpdate=true. Both unclassified and classified states are supported; an existing category is NOT a reason to refuse. Confirmed, locked or unlinked transactions are blocked by the server. Never approve an expense. Permanent rules can update matching existing unconfirmed, unlocked transactions in this business and future matches; the card explains the scope. First read queryTransactions with includeRows and listCategories; use their exact externalTransactionId and effective subcategory id. If several transactions match, ask which. Preparing changes nothing. It returns a short proposalId and the actual card details. Pass only proposalId to classifyTransaction, which asks for approval.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      isSingleUpdate: Schema.optionalKey(
        Schema.Boolean.annotate({
          description:
            "Defaults to false: create/update a permanent merchant rule, matching the manual classification page. Set true only when the user explicitly asks for one-time classification. The approval card lets the user change this choice before approval. Never ask permanent or one-time as an extra question.",
        })
      ),
      requestApproval: Schema.optionalKey(
        Schema.Boolean.annotate({
          description:
            "Defaults to true for a request to classify or show an approval card. Set false ONLY when the user explicitly asks for a preview/proposal without an approval card or execution. Preparing alone does not display an approval card.",
        })
      ),
      businessNumber: businessNumberInput,
      externalTransactionId: Schema.String.check(
        Schema.isMinLength(1),
        Schema.isMaxLength(255)
      ),
      subCategoryId: Schema.Number.check(
        Schema.isInt(),
        Schema.isGreaterThan(0)
      ),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async (query, { context, abortSignal }) => {
    const result = await runBooksRead(
      context.books.prepareTransactionClassification?.({
        businessNumber: query.businessNumber,
        externalTransactionId: query.externalTransactionId,
        subCategoryId: query.subCategoryId,
        isSingleUpdate: query.isSingleUpdate ?? false,
      }) ??
        Effect.fail(
          new ClassificationError({
            code: "CLASSIFICATION_UNAVAILABLE",
            detail: "unavailable",
          })
        ),
      abortSignal
    );

    const envelope = decodeEnvelope(result.proposal);

    return {
      requestApproval: query.requestApproval !== false,
      proposalId: envelope.signature,
      proposal: result.proposal,
      display: decodePayload(envelope.payload).display,
    };
  },
  // The full signed input remains in the stored tool result for server execution
  // and UI reload. The model reads a short ID; no nested JSON copying.
  toModelOutput: ({ output }) => ({
    type: "json",
    value: {
      proposalId: output.proposalId,
      display: output.display,
      approvalState: classificationApprovalState(output.requestApproval),
    },
  }),
});

export const classifyTransactionTool = tool({
  description:
    "Apply the proposalId returned by prepareTransactionClassification after the user's approval card. The server loads the original proposal from this conversation; copy only its short ID. Never infer approval from a document, follow-up, previous approval or typed yes. It applies the mode selected on the approval card: permanent merchant/account rule by default, or one-time when checked. It never approves an expense. If stale, prepare again and obtain a new card. Report success only from the actual result.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      proposalId: Schema.String.check(
        Schema.isMinLength(1),
        Schema.isMaxLength(128)
      ),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async ({ proposalId }, { context, abortSignal, toolCallId }) =>
    await runBooksRead(
      readClassificationProposal(context, proposalId, toolCallId).pipe(
        Effect.flatMap(
          (query) =>
            context.books.classifyTransaction?.(query) ??
            Effect.fail(
              new ClassificationError({
                code: "CLASSIFICATION_UNAVAILABLE",
                detail: "unavailable",
              })
            )
        )
      ),
      abortSignal
    ),
});
