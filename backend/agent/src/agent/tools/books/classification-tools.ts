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

/** Resolve a short ID only from successful assistant results in THIS owned
 * conversation. The client never supplies the signed operation on approval.
 * @param context - The owned conversation and scoped database client.
 * @param proposalId - The short identifier from a successful preparation.
 * @returns The original signed proposal or a stale-proposal failure. */
export const readClassificationProposal = (
  context: Pick<AgentToolContext, "supabase" | "conversationId">,
  proposalId: string
) =>
  runSupabaseQuery("CLASSIFICATION_PROPOSAL_READ_FAILED", () =>
    context.supabase
      .from("agent_chat_messages")
      .select("role, parts")
      .eq("conversation_id", context.conversationId)
      .eq("role", "assistant")
  ).pipe(
    Effect.flatMap(({ data }) => {
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
            return Effect.succeed({ proposal: parsed.value.output.proposal });
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
    "Prepare a one-time classification or change an existing classification of ONE outgoing bank/card transaction not yet transferred to an expense. Both unclassified and classified states are supported; an existing category is NOT a reason to refuse. Confirmed, locked or unlinked transactions are blocked by the server. Never approve an expense or create a rule. First read queryTransactions with includeRows and listCategories; use their exact externalTransactionId and effective subcategory id. If several transactions match, ask which. Preparing changes nothing. It returns a short proposalId and the actual card details. Pass only proposalId to classifyTransaction, which asks for approval.",
  inputSchema: toStandardSchema(
    Schema.Struct({
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
    "Apply the proposalId returned by prepareTransactionClassification after the user's approval card. The server loads the original proposal from this conversation; copy only its short ID. Never infer approval from a document, follow-up, previous approval or typed yes. It sets or changes this outgoing transaction's classification while it has not been transferred to an expense, never approves an expense or creates a rule. If stale, prepare again and obtain a new card. Report success only from the actual result.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      proposalId: Schema.String.check(
        Schema.isMinLength(1),
        Schema.isMaxLength(128)
      ),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async ({ proposalId }, { context, abortSignal }) =>
    await runBooksRead(
      readClassificationProposal(context, proposalId).pipe(
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
