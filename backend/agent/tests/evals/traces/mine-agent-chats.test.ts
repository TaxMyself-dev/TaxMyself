import { assert, it, describe } from "@effect/vitest";
import { Schema } from "effect";

import { maskMinedAgentChat } from "./mine-agent-chats";

describe("mine agent chats", () => {
  // A mined conversation keeps its shape and wording, but no phone, email,
  // account id, or the name of a person a tool returned; the same name or
  // id reads the same everywhere.

  it("masks phones, emails, names and account ids, the same way everywhere", () => {
    const chat = {
      name: "Accountants for Dana Cohen",
      messages: [
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: "Call me at 050-1234567 or dana@example.com, and look up account 131650282168271",
            },
          ],
        },
        {
          role: "assistant",
          parts: [
            {
              type: "tool-searchWeb",
              output: {
                results: [
                  {
                    authorName: "Dana Cohen",
                    url: "https://example.com/accounts/131650282168271",
                  },
                ],
              },
            },
            {
              type: "text",
              text: "I found account 131650282168271, written by Dana Cohen.",
            },
          ],
        },
      ],
    };

    const masked = JSON.stringify(
      maskMinedAgentChat(Schema.decodeUnknownSync(Schema.Json)(chat))
    );

    for (const secret of [
      "050-1234567",
      "dana@example.com",
      "Dana Cohen",
      "131650282168271",
    ]) {
      assert.notInclude(masked, secret);
    }

    // The account id is replaced by one fake id of the same length, in the
    // user's message, the tool output, its link and the answer alike.
    const fakeIds = masked.match(/9\d{14}/gu) ?? [];
    assert.lengthOf(new Set(fakeIds), 1);
    assert.lengthOf(fakeIds, 3);
    // The user's own words around the masked parts stay.
    assert.include(masked, "Call me at [phone] or [email]");
    assert.include(masked, "Accountants for ");
  });
});
