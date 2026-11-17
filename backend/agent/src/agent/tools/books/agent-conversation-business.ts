import { Effect, Option, Schema } from "effect";

import type {
  BusinessView,
  KeepInTaxBooks,
} from "@/agent/core/ports/keepintax-ports";
import type {
  AgentChatMessage,
  AgentChatMessagePart,
} from "@/lib/agent-chat/conversation/agent-chat-messages";

// KeepInTax (2026-11-15, business selection; docs/research/
// assistant-qa-verification-2026-11-15.md §8): which business a chat read is
// about. The chat never takes the page's businessnumber header as a default:
// it is whatever another screen left behind (a transaction classified, an
// expense edited), hidden from the chat, and it made a question about one
// named business read another one (S20). A single-business read uses, in
// order:
//
// 1. the business the model names (businessNumber), from the server's
//    directory of the data owner's businesses (listBusinesses);
// 2. the business this conversation established: the user named exactly one
//    (a server-written data-businessContext part on their message), pressed
//    a business button, or an answer read exactly one business by number;
// 3. the owner's only business (the Nest side's own rule);
// 4. else BUSINESS_REQUIRED, and the chat shows the business buttons.
//
// The conversation's business is derived from its stored messages, so a
// reload or another tab gets the same one, with no schema change. The
// legacy agent_chat_conversations.business_number (the header the first
// request carried) is never read for it. A read that covers several
// businesses (queryExpenses' businessNumbers / allBusinesses, the "all"
// button, two businesses read in one answer, two named in one message)
// clears it: a multi-business request never picks one for later questions.
// Nothing here trusts a name or a number from the page: the directory and
// every read are the Nest backend's, for the verified user, which checks
// ownership and delegated access again on each call.

/** The data part a user message records the businesses it names in. */
export const businessContextPart = "data-businessContext";

// ─── Names in the user's words ────────────────────────────────────────────

// Hebrew one-letter prefixes written onto the next word ("בסטודיו",
// "לייעוץ"; at most two, "ובסטודיו").
const hebrewPrefixes = "בהולמשכ";
const maxPrefixLetters = 2;

/**
 * A name or a message as compared: no quotes, gershayim or geresh, dashes
 * and punctuation as spaces, one space between words, lower case.
 *
 * @param text - The text.
 * @returns Its comparable form.
 */
export const comparableBusinessText = (text: string) =>
  text
    .replaceAll(/["'`״׳‘’“”]/gu, "")
    .replaceAll(/[‐-―\-_,.:;!?()[\]{}/\\|+*]/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .toLowerCase();

// Whether the phrase found at `at` stands as whole words: a space or the
// start before it (after at most two Hebrew prefix letters), a space or the
// end after it.
const standsAlone = (text: string, at: number, length: number) => {
  let start = at;

  while (start > 0 && hebrewPrefixes.includes(text.charAt(start - 1))) {
    start -= 1;
  }

  const end = at + length;
  const wordStart = start === 0 || text.charAt(start - 1) === " ";
  const wordEnd = end === text.length || text.charAt(end) === " ";

  return at - start <= maxPrefixLetters && wordStart && wordEnd;
};

// Whether `phrase` appears in `text` as whole words (standsAlone).
const containsWords = (text: string, phrase: string) => {
  if (phrase === "") {
    return false;
  }

  for (
    let at = text.indexOf(phrase);
    at !== -1;
    at = text.indexOf(phrase, at + 1)
  ) {
    if (standsAlone(text, at, phrase.length)) {
      return true;
    }
  }

  return false;
};

// The ways a business is named: its full name, and the part before " - "
// (a name like "סטודיו הדגמה - מורשה" is often said "סטודיו הדגמה").
const businessNameForms = (name: string) => {
  const full = comparableBusinessText(name);

  const core = comparableBusinessText(name.split(/\s[‐-―-]\s/u)[0] ?? "");

  return [...new Set([full, core].filter((form) => form.length >= 2))];
};

/**
 * The businesses a message names: by number, or by a whole-word match of
 * its name (or the name's part before " - "), punctuation and quotes aside.
 * It only finds; a name it misses leaves the model to name the business
 * (businessNumber) from the directory, and a name that fits several
 * businesses returns all of them, which establishes none.
 *
 * @param text - The user's message.
 * @param directory - The data owner's businesses.
 * @returns The numbers of the businesses named, in directory order.
 */
export const namedBusinesses = (
  text: string,
  directory: readonly BusinessView[]
): string[] => {
  const comparable = comparableBusinessText(text);
  const digits = ` ${text.replaceAll(/\D+/gu, " ")} `;

  return directory.flatMap((business) =>
    digits.includes(` ${business.number} `) ||
    businessNameForms(business.name).some((form) =>
      containsWords(comparable, form)
    )
      ? [business.number]
      : []
  );
};

/**
 * The user message with the businesses it names recorded on it (replacing
 * any earlier record, so a retried message is recorded once). Any other
 * last message is left as it is. The page sends only text and file parts
 * (agentChatSentPartsSchema), so only the server writes this part.
 *
 * @param messages - The conversation, newest last.
 * @param directory - The data owner's businesses.
 * @returns The messages to store and answer.
 */
export const withAgentBusinessContext = (
  messages: AgentChatMessage[],
  directory: readonly BusinessView[]
): AgentChatMessage[] => {
  const last = messages.at(-1);

  if (last?.role !== "user") {
    return messages;
  }

  const parts = last.parts.filter((part) => part.type !== businessContextPart);

  const text = parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");

  const numbers = namedBusinesses(text, directory);

  const recorded: AgentChatMessagePart[] =
    numbers.length === 0
      ? parts
      : [{ type: businessContextPart, data: { numbers } }, ...parts];

  return [...messages.slice(0, -1), { ...last, parts: recorded }];
};

// ─── The conversation's business ──────────────────────────────────────────

// The reads of one business that take businessNumber.
const singleBusinessReads = new Set([
  "queryTransactions",
  "queryIssuedDocuments",
  "listCategories",
  "listClients",
  "getProfitAndLoss",
  "getVatSummary",
  "getAdvanceTaxStatus",
  "getReportReadiness",
  "listUpcomingReports",
]);

/** A stored message part, decoded below for what the business needs. */
interface StoredPart {
  readonly type: string;
}

// A stored message, as far as the conversation's business needs it: the
// stored parts are decoded below, so any message shape is read safely.
interface StoredMessage {
  readonly role: string;
  readonly parts: readonly StoredPart[];
}

const decodeBusinessContextPart = Schema.decodeUnknownOption(
  Schema.Struct({
    type: Schema.Literal(businessContextPart),
    data: Schema.Struct({ numbers: Schema.Array(Schema.String) }),
  })
);

// A tool call that returned: its tool and the business fields of its input.
const decodeReturnedToolPart = Schema.decodeUnknownOption(
  Schema.Struct({
    type: Schema.String,
    state: Schema.Literal("output-available"),
    input: Schema.Struct({
      businessNumber: Schema.optionalKey(Schema.String),
      businessNumbers: Schema.optionalKey(Schema.Array(Schema.String)),
      allBusinesses: Schema.optionalKey(Schema.Boolean),
    }),
  })
);

// An answered question's choice (agent-chat-question-answers.ts).
const decodeQuestionChoice = Schema.decodeUnknownOption(
  Schema.Struct({
    type: Schema.Literal("tool-askUserQuestion"),
    state: Schema.Literal("output-available"),
    output: Schema.Struct({ value: Schema.String }),
  })
);

/** What one read or answer did to the conversation's business. */
type BusinessEvent =
  | { readonly kind: "business"; readonly number: string }
  | { readonly kind: "several" };

const several: BusinessEvent = { kind: "several" };

// One business, when it is one of the owner's.
const businessEvent = (
  number: string | undefined,
  known: ReadonlySet<string>
): BusinessEvent[] =>
  number !== undefined && known.has(number)
    ? [{ kind: "business", number }]
    : [];

// What a stored tool part says about the business, when it returned.
const toolPartEvents = (
  part: StoredPart,
  known: ReadonlySet<string>
): BusinessEvent[] => {
  const choice = Option.getOrUndefined(decodeQuestionChoice(part));

  if (choice !== undefined) {
    return choice.output.value === "all"
      ? [several]
      : businessEvent(choice.output.value, known);
  }

  const call = Option.getOrUndefined(decodeReturnedToolPart(part));
  const name = call?.type.replace(/^tool-/u, "");

  if (call === undefined || name === undefined) {
    return [];
  }

  const { input } = call;

  if (name === "queryExpenses") {
    if (
      input.allBusinesses === true ||
      (input.businessNumbers !== undefined &&
        input.businessNumbers.length !== 1)
    ) {
      return [several];
    }

    return businessEvent(
      input.businessNumbers?.[0] ?? input.businessNumber,
      known
    );
  }

  return singleBusinessReads.has(name)
    ? businessEvent(input.businessNumber, known)
    : [];
};

// The businesses a stored user message named (data-businessContext).
const userMessageEvents = (
  message: StoredMessage,
  known: ReadonlySet<string>
): BusinessEvent[] => {
  const named = message.parts.flatMap((part) =>
    Option.match(decodeBusinessContextPart(part), {
      onNone: () => [],
      onSome: ({ data }) => data.numbers.filter((number) => known.has(number)),
    })
  );

  return named.length > 1
    ? [several]
    : named.flatMap((number) => businessEvent(number, known));
};

/**
 * Applies one message's business events: exactly one business establishes
 * it, several clear it, none leave it.
 *
 * @param current - The business before the message, or null.
 * @param events - What the message did.
 * @returns The business after it, or null.
 */
const applyEvents = (
  current: string | null,
  events: readonly BusinessEvent[]
): string | null => {
  if (events.length === 0) {
    return current;
  }

  if (events.some((event) => event.kind === "several")) {
    return null;
  }

  const numbers = new Set(
    events.flatMap((event) => (event.kind === "business" ? [event.number] : []))
  );

  const [only] = numbers;

  return numbers.size === 1 && only !== undefined ? only : null;
};

/**
 * The business this conversation is about, from its stored messages: the
 * newest message that named exactly one of the owner's businesses, pressed
 * a business button, or read exactly one by number. Null when none did, or
 * when the newest such message covered several. A business no longer in
 * the directory (access ended, or it was removed) is never returned.
 *
 * @param messages - The conversation, oldest first.
 * @param directory - The data owner's businesses, read for this request.
 * @returns The business number, or null.
 */
export const agentConversationBusiness = (
  messages: readonly StoredMessage[],
  directory: readonly BusinessView[]
): string | null => {
  const known = new Set(directory.map((business) => business.number));
  let current: string | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      current = applyEvents(current, userMessageEvents(message, known));
    } else if (message.role === "assistant") {
      current = applyEvents(
        current,
        message.parts.flatMap((part) => toolPartEvents(part, known))
      );
    }
  }

  return current;
};

// ─── The books, with the conversation's business ──────────────────────────

/**
 * The conversation's business while an answer runs: the directory read for
 * this request, the business now, and the businesses the answer has read
 * by number so far.
 */
export interface AgentConversationBusinessState {
  readonly directory: readonly BusinessView[];
  current: string | null;
  readonly readByNumber: Set<string>;
}

/**
 * The state an answer starts with.
 *
 * @param directory - The data owner's businesses, read for this request.
 * @param messages - The conversation as answered (the new user message, or
 *   the answer being continued, last).
 * @returns The state.
 */
export const agentConversationBusinessState = (
  directory: readonly BusinessView[],
  messages: readonly StoredMessage[]
): AgentConversationBusinessState => ({
  directory,
  current: agentConversationBusiness(messages, directory),
  readByNumber: new Set(),
});

// An explicit single-business read returned: the answer now reads that
// business, or several when it has read more than one.
const noteRead = (
  state: AgentConversationBusinessState,
  number: string | undefined
) => {
  if (
    number === undefined ||
    !state.directory.some((business) => business.number === number)
  ) {
    return;
  }

  state.readByNumber.add(number);
  state.current = state.readByNumber.size === 1 ? number : null;
};

const noteSeveral = (state: AgentConversationBusinessState) => {
  state.current = null;
  state.readByNumber.clear();
};

// The same, once a read has returned.
const recordRead = (
  state: AgentConversationBusinessState,
  number: string | undefined
) =>
  Effect.sync(() => {
    noteRead(state, number);
  });

const recordSeveral = (state: AgentConversationBusinessState) =>
  Effect.sync(() => {
    noteSeveral(state);
  });

// The conversation's business as the model reads it in upcoming reports.
const withActiveBusiness =
  (state: AgentConversationBusinessState) =>
  <Result extends { readonly activeBusiness: BusinessView | null }>(
    result: Result
  ): Result => {
    const current = state.directory.find(
      (business) => business.number === state.current
    );

    return current === undefined
      ? result
      : { ...result, activeBusiness: current };
  };

/**
 * The books, reading the conversation's business when the model names
 * none (see the top of this file). A read with businessNumber reads that
 * business and, once it returns, makes it the conversation's; a read
 * across businesses clears it. listUpcomingReports' activeBusiness is the
 * conversation's business. listBusinesses is unchanged.
 *
 * @param books - The request's books.
 * @param state - The conversation's business (agentConversationBusinessState).
 * @returns The books the tools use.
 */
export const withConversationBusiness = (
  books: KeepInTaxBooks,
  state: AgentConversationBusinessState
): KeepInTaxBooks => {
  const single =
    <Query extends { readonly businessNumber?: string }, Answer>(
      read: (query: Query) => Effect.Effect<Answer, Error>
    ) =>
    (query: Query): Effect.Effect<Answer, Error> => {
      const asked = query.businessNumber;
      const business = asked ?? state.current ?? undefined;

      return read(
        business === undefined ? query : { ...query, businessNumber: business }
      ).pipe(Effect.tap(() => recordRead(state, asked)));
    };

  return {
    queryExpenses: (query) => {
      if (
        query.allBusinesses === true ||
        (query.businessNumbers !== undefined &&
          query.businessNumbers.length !== 1)
      ) {
        return books
          .queryExpenses(query)
          .pipe(Effect.tap(() => recordSeveral(state)));
      }

      const asked = query.businessNumbers?.[0] ?? query.businessNumber;
      const business = asked ?? state.current ?? undefined;

      return books
        .queryExpenses(
          business === undefined || query.businessNumbers !== undefined
            ? query
            : { ...query, businessNumber: business }
        )
        .pipe(Effect.tap(() => recordRead(state, asked)));
    },
    prepareTransactionClassification:
      books.prepareTransactionClassification === undefined
        ? undefined
        : single(books.prepareTransactionClassification),
    classifyTransaction: books.classifyTransaction,
    queryTransactions: single(books.queryTransactions),
    queryIssuedDocuments: single(books.queryIssuedDocuments),
    listCategories: single(books.listCategories),
    listClients: single(books.listClients),
    getProfitAndLoss: single(books.getProfitAndLoss),
    getVatSummary: single(books.getVatSummary),
    getAdvanceTaxStatus: single(books.getAdvanceTaxStatus),
    getReportReadiness: single(books.getReportReadiness),
    // Without a business it lists every one (never filled in); its
    // activeBusiness is the conversation's.
    listUpcomingReports: (query) =>
      books.listUpcomingReports(query).pipe(
        Effect.tap(() => recordRead(state, query.businessNumber)),
        Effect.map(withActiveBusiness(state))
      ),
    listBusinesses: books.listBusinesses,
  };
};

/**
 * The directory and the conversation's business as the model reads them,
 * in the user context (agent-user-context.ts). Empty when the directory is.
 *
 * @param directory - The data owner's businesses.
 * @param current - The conversation's business, or null.
 * @returns The section's text.
 */
export const agentBusinessesSection = (
  directory: readonly BusinessView[],
  current: string | null
) => {
  if (directory.length === 0) {
    return "";
  }

  const lines = directory.map(
    (business) => `- ${business.number}: ${business.name}`
  );

  const established = directory.find((business) => business.number === current);

  let settled =
    "This conversation has not settled on one business: a question that names none is read without a business, and the read asks which (never read them all unless the user asked for all).";

  if (directory.length === 1) {
    settled = "They have one business: every read is about it.";
  } else if (established !== undefined) {
    settled = `This conversation is about ${established.number} (${established.name}), the business the user chose or named; reads that name no business read it.`;
  }

  return `<businesses>
The user's businesses (number: name), from KeepInTax:
${lines.join("\n")}
${settled}
</businesses>`;
};
