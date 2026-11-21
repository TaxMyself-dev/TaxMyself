import { Predicate } from "effect";
import type { Schema } from "effect";

import { textMentionsWords } from "../../../../backend/shared/text/text-mentions-words";

// What the conversation said and found before, searched by words, for the
// agent's searchEarlierResults: every message, and every result, record, item
// or group a tool returned, stays in the chat's saved messages, also once the
// older part is no longer sent to the model (short-term-memory.server.ts).
// In a chat of 2026-10-17 the agent searched the job sites again to answer
// about a PassportCard job it had already found, whose details a summary no
// longer held.

// Each found item's and message's texts are kept to this length.
const earlierResultTextMax = 1500;

/**
 * One saved message as the search reads it: who wrote it and its parts as
 * stored JSON.
 */
export interface EarlierChatMessage {
  role: string;
  parts: readonly Schema.Json[];
}

/**
 * One thing a tool found earlier in the conversation: the tool, and the item
 * as it returned it (texts cut to earlierResultTextMax).
 */
export interface EarlierResultItem {
  tool: string;
  item: Schema.JsonObject;
}

/**
 * One earlier message's text that mentions the words: who wrote it, and the
 * text (cut to earlierResultTextMax).
 */
export interface EarlierChatText {
  role: string;
  text: string;
}

/**
 * What the search found: the tools' items and the messages' texts.
 */
export interface EarlierChatFound {
  items: EarlierResultItem[];
  said: EarlierChatText[];
}

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value) && !Array.isArray(value);

// The items in a tool's result: every object in it with a link (url).
const linkedItems = (
  value: Schema.Json
): { url: string; item: Schema.JsonObject }[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item: Schema.Json) => linkedItems(item));
  }

  if (!isJsonObject(value)) {
    return [];
  }

  const nested = Object.values(value).flatMap((item) => linkedItems(item));
  const { url } = value;

  return Predicate.isString(url) ? [{ url, item: value }, ...nested] : nested;
};

// A finished tool call's name and result, from a stored part: a typed tool
// part ("tool-searchJobs") or a dynamic one; null for any other part.
const toolResultOf = (part: Schema.Json) => {
  if (!isJsonObject(part) || part.state !== "output-available") {
    return null;
  }

  const { type, toolName, output } = part;

  if (output === undefined || !Predicate.isString(type)) {
    return null;
  }

  if (type.startsWith("tool-")) {
    return { tool: type.slice("tool-".length), output };
  }

  return type === "dynamic-tool" && Predicate.isString(toolName)
    ? { tool: toolName, output }
    : null;
};

// Every item the messages' tools returned, with its tool, newest first.
const messagesToolItems = (messages: readonly EarlierChatMessage[]) =>
  messages.toReversed().flatMap(({ parts }) =>
    parts.toReversed().flatMap((part) => {
      const result = toolResultOf(part);

      return result === null
        ? []
        : linkedItems(result.output).map((found) => ({
            tool: result.tool,
            ...found,
          }));
    })
  );

const cutText = (text: string) =>
  text.length > earlierResultTextMax
    ? `${text.slice(0, earlierResultTextMax)}…`
    : text;

// The item with its long texts cut.
const shortItem = (item: Schema.JsonObject): Schema.JsonObject =>
  Object.fromEntries(
    Object.entries(item).map(([key, field]) => [
      key,
      Predicate.isString(field) ? cutText(field) : field,
    ])
  );

/**
 * A message's own text: its text parts, joined.
 *
 * @param parts - The message's parts.
 * @returns The text, empty when it has none.
 */
export const earlierChatMessageText = (parts: readonly Schema.Json[]) =>
  parts
    .flatMap((part) =>
      isJsonObject(part) &&
      part.type === "text" &&
      Predicate.isString(part.text)
        ? [part.text]
        : []
    )
    .join("\n");

// The headline fields of a found item, in the order one is picked.
const earlierResultTitleKeys = ["title", "name", "headline", "text"] as const;

const earlierResultTitleMax = 80;

/**
 * What one stored part's tool found, in a line's worth: the tool, how many
 * items with a link it returned, and the first titles. null for a part that
 * is not a finished tool call or found no linked items.
 *
 * @param part - A stored message part.
 * @param titleLimit - How many titles at most.
 * @returns The tool, the item count and the titles, or null.
 */
export const earlierResultHeadlines = (
  part: Schema.Json,
  titleLimit: number
) => {
  const result = toolResultOf(part);

  if (result === null) {
    return null;
  }

  const items = linkedItems(result.output);

  if (items.length === 0) {
    return null;
  }

  const titles = items.slice(0, titleLimit).flatMap(({ item }) => {
    const title = earlierResultTitleKeys
      .map((key) => item[key])
      .find((field) => Predicate.isString(field));

    return Predicate.isString(title)
      ? [title.replaceAll(/\s+/gu, " ").slice(0, earlierResultTitleMax)]
      : [];
  });

  return { tool: result.tool, count: items.length, titles };
};

/**
 * What the conversation said and found that mentions every word, newest
 * first: the tools' items, each once (by its link), and the messages' texts,
 * each up to limit.
 *
 * @param messages - The conversation's saved messages, oldest first.
 * @param words - The words each item or text must mention (quote marks
 *   ignored).
 * @param limit - How many items, and how many texts, at most.
 * @returns The items, with the tool that found each, and the texts, with who
 *   wrote each.
 */
export const findEarlierChat = (
  messages: readonly EarlierChatMessage[],
  words: string,
  limit: number
): EarlierChatFound => {
  const found = new Map<string, EarlierResultItem>();

  for (const { tool, url, item } of messagesToolItems(messages)) {
    if (
      found.size < limit &&
      !found.has(url) &&
      textMentionsWords(JSON.stringify(item), words)
    ) {
      found.set(url, { tool, item: shortItem(item) });
    }
  }

  const said = messages
    .toReversed()
    .flatMap(({ role, parts }) => {
      const text = earlierChatMessageText(parts);

      return textMentionsWords(text, words)
        ? [{ role, text: cutText(text) }]
        : [];
    })
    .slice(0, limit);

  return { items: [...found.values()], said };
};
