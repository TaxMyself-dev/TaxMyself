import { describe, it } from "@effect/vitest";
import { Config, Effect } from "effect";
import { forEach as effectForEach } from "effect/Effect";

import { dropRepeatedTaskMatches } from "../../../backend/monitor/scoring/task-match-repeats";
import type { TaskScoredPost } from "../../../backend/monitor/scoring/task-scored-post";
import { JevClient } from "../../../backend/shared/ai/typesafe-jev-client";
import { jevEvalRunCount, repeatJevEvalRuns } from "../runner/jev-eval-runs";

// The repeat check (backend/monitor/scoring/task-match-repeats.ts) with the real Jev,
// on labeled pairs by one author in two sources: the same request in other
// words is dropped, and a different request by the same person is kept. The
// wording differs in every pair, so code never decides them.

const authorPost = (id: string, text: string): TaskScoredPost => ({
  id,
  text,
  createdAt: null,
  authorId: "77",
  attachments: [],
  comments: [],
});

const repeatedPairs = [
  [
    "מחפשים דירת 3 חדרים להשכרה בחדרה עד 5,000 ש״ח, כניסה בנובמבר",
    "זוג עם תינוק מחפש 3 חדרים בחדרה להשכרה, עד 5 אלף, מנובמבר",
  ],
  [
    "דרוש חשמלאי להחלפת לוח חשמל בדירה בנתניה, השבוע",
    "מישהו מכיר חשמלאי אמין בנתניה? צריך להחליף לוח חשמל בדחיפות",
  ],
  [
    "מוכרת ספה תלת מושבית אפורה, 800 ש״ח, ראשון לציון",
    "ספה אפורה 3 מושבים למכירה בראשל״צ – 800",
  ],
];

const differentPairs = [
  [
    "להשכרה 3 חדרים ברחוב הרצל בחדרה, 4,800 ש״ח",
    "להשכרה 4 חדרים בגבעת אולגה, 6,200 ש״ח, מרפסת",
  ],
  [
    "מחפשים דירת 3 חדרים להשכרה בחדרה",
    "מחפשים מובילים שיעבירו דירה מתל אביב לחדרה בסוף החודש",
  ],
  ["מוכרת ספה אפורה, 800 ש״ח", "מוכרת מקרר סמסונג במצב מצוין, 1,200 ש״ח"],
];

const isDropped = Effect.fn("isDropped")(function* isDropped([
  earlierText,
  laterText,
]: string[]) {
  const earlier = authorPost("100", earlierText ?? "");
  const later = authorPost("200", laterText ?? "");

  const { repeats } = yield* dropRepeatedTaskMatches(
    [{ post: later, source: "forum", commentId: null }],
    [
      {
        source: "web",
        itemId: earlier.id,
        authorId: "77",
        text: earlierText ?? "",
      },
    ]
  ).pipe(Effect.provide(JevClient.layer));

  return repeats === 1;
});

describe("task match repeats", () => {
  it.live(
    "drops the same request in other words and keeps the same person's other requests",
    ({ expect }) =>
      Effect.gen(function* dropRepeatsKeepOthers() {
        yield* Config.Redacted("TYPESAFE_API_KEY");

        const runs = yield* repeatJevEvalRuns(
          Effect.all(
            [
              effectForEach(repeatedPairs, (item) => isDropped(item), {
                concurrency: "unbounded",
              }),
              effectForEach(differentPairs, (item) => isDropped(item), {
                concurrency: "unbounded",
              }),
            ],
            { concurrency: "unbounded" }
          )
        );

        expect(runs, "repeats dropped, other requests kept").toEqual(
          Array.from({ length: jevEvalRunCount }, () => [
            [true, true, true],
            [false, false, false],
          ])
        );
      })
  );
});
