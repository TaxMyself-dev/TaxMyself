import { tool } from "ai";
import { Schema } from "effect";

import { expenseGroupings } from "@/agent/core/ports/keepintax-ports";
import { appRuntime } from "@/server/runtime/app-runtime.server";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { trimmedLengthString } from "../../../../backend/shared/schema/trimmed-length-string";
import { agentToolContextSchema } from "../../core/tool-runtime/agent-tool-context";

// The agent's read of the user's expenses (KeepInTaxBooks): totals for a
// range, by category, supplier or month, and the expenses themselves. It
// answers questions like "how much did I spend on fuel this year?". It reads
// what the expenses page reads, as the data owner the request acts for, and
// changes nothing.

const businessNumberSchema = Schema.String.check(
  Schema.isPattern(/^\d{5,12}$/u)
);

const isoDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u)
);

// The JSON Schema the model reads describes the input side
// (trimmed-length-string.ts).
const filterText = (description: string) =>
  trimmedLengthString(1, 100).pipe(Schema.annotateEncoded({ description }));

export const queryExpensesTool = tool({
  description:
    "Read the user's expenses in KeepInTax for a date range (by the expense's date), in one of their businesses (the active one unless another is named) or, with businessNumbers or allBusinesses, in several, each with its subtotal and a combined total computed for you: the totals the reports count (approved and booked; paid, VAT recognized, recognized for income tax), optionally grouped, the expenses themselves, and apart what is not counted (waiting for review, private, rejected). Use it for any question about what they spent, on what or with whom. Words the user uses for a kind of expense (fuel, phone) go in search, which matches the category, sub-category, supplier and note; when nothing matches, the result lists the categories the range has, to search again with one of them.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      from: isoDate.annotate({
        description:
          'The range\'s first day, YYYY-MM-DD. "This year" starts on January 1 of the current year',
      }),
      to: isoDate.annotate({
        description: "The range's last day, YYYY-MM-DD, inclusive",
      }),
      search: Schema.optionalKey(
        filterText(
          'Words to find in the category, sub-category, supplier or note, as the user said them ("דלק"); every word must match'
        )
      ),
      category: Schema.optionalKey(filterText("An exact category name")),
      subCategory: Schema.optionalKey(filterText("An exact sub-category name")),
      supplier: Schema.optionalKey(
        filterText("The supplier's name, or part of it")
      ),
      groupBy: Schema.optionalKey(
        Schema.Literals(expenseGroupings).annotate({
          description:
            "Totals per category, sub-category or supplier (largest first), or per month (in order)",
        })
      ),
      includeRows: Schema.optionalKey(
        Schema.Boolean.annotate({
          description:
            "Also return the expenses themselves, newest first (up to 50): when the user asks which expenses, not only how much",
        })
      ),
      businessNumber: Schema.optionalKey(
        businessNumberSchema.annotate({
          description:
            "Another of the user's businesses (from otherBusinesses in an earlier result); left out, their active one",
        })
      ),
      businessNumbers: Schema.optionalKey(
        Schema.Array(businessNumberSchema)
          .check(Schema.isMinLength(2), Schema.isMaxLength(20))
          .annotate({
            description:
              "Several of the user's businesses (numbers from business and otherBusinesses), for a question about them together: the same query in each, with their combined total",
          })
      ),
      allBusinesses: Schema.optionalKey(
        Schema.Boolean.annotate({
          description:
            'true for every one of the user\'s businesses ("in all my businesses", "both businesses"): the same query in each, with their combined total',
        })
      ),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async (query, { context, abortSignal }) =>
    await appRuntime.runPromise(context.books.queryExpenses(query), {
      signal: abortSignal,
    }),
});
