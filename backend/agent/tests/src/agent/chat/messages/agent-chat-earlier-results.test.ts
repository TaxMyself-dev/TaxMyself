import { assert, describe, it } from "@effect/vitest";
import type { Schema } from "effect";

import { findEarlierChat } from "../../../../../src/agent/chat/messages/agent-chat-earlier-results";

// searchEarlierResults finds what this chat said and its tools returned
// before, by words, so a follow-up about a job found earlier needs no new
// search (a chat of 2026-10-17 searched the job sites again for a
// PassportCard job).

const passportCard = {
  site: "careers",
  title: "מנהל/ת צוות שירות לקוחות",
  company: "PassportCard Relocation",
  url: "https://careers.example.com/job/38568578/",
  description:
    "ניהול צוות, חלוקת משימות, הדרכה. דרישות: ניסיון בניהול צוות שנתיים",
};

const cellcom = {
  site: "jobsboard",
  title: "מנהל/ת צוות ENT ציבורי",
  company: "סלקום",
  url: "https://jobsboard.example.com/job/1",
  description: "ניהול צוות מכירות",
};

// A search's stored part, as the chat saves it.
const jobSearch = (jobs: Schema.JsonObject[]): Schema.JsonObject => ({
  type: "tool-searchWeb",
  toolCallId: "call_1",
  state: "output-available",
  input: {},
  output: { sites: [{ site: "jobsboard", jobs }] },
});

const answer = (parts: Schema.Json[]) => ({ role: "assistant", parts });

describe("earlier chat search", () => {
  it("finds the items earlier searches returned that mention every word, with their tool", () => {
    const found = findEarlierChat(
      [
        answer([
          { type: "text", text: "מצאתי 8 משרות" },
          jobSearch([passportCard, cellcom]),
        ]),
      ],
      "passportcard ניהול",
      10
    );

    assert.deepStrictEqual(found, {
      items: [{ tool: "searchWeb", item: passportCard }],
      said: [],
    });
  });

  it("finds the messages that mention every word, newest first, with who wrote them", () => {
    const found = findEarlierChat(
      [
        {
          role: "user",
          parts: [{ type: "text", text: "תקציב עד 5,000 בחיפה" }],
        },
        answer([{ type: "text", text: "מחפש דירות בחיפה עד 5,000" }]),
        { role: "user", parts: [{ type: "text", text: "ובתל אביב?" }] },
      ],
      "חיפה 5,000",
      10
    );

    assert.deepStrictEqual(found, {
      items: [],
      said: [
        { role: "assistant", text: "מחפש דירות בחיפה עד 5,000" },
        { role: "user", text: "תקציב עד 5,000 בחיפה" },
      ],
    });
  });

  it("an item found twice comes once, from the newest search", () => {
    const newer = { ...passportCard, description: "עודכן" };

    const found = findEarlierChat(
      [answer([jobSearch([passportCard])]), answer([jobSearch([newer])])],
      "PassportCard",
      10
    );

    assert.deepStrictEqual(found.items, [{ tool: "searchWeb", item: newer }]);
  });

  it("a call still running, or without a link, adds nothing", () => {
    const found = findEarlierChat(
      [
        answer([
          Object.assign(jobSearch([passportCard]), {
            state: "input-available",
          }),
          jobSearch([{ title: "PassportCard", company: "PassportCard" }]),
        ]),
      ],
      "PassportCard",
      10
    );

    assert.deepStrictEqual(found, { items: [], said: [] });
  });
});
