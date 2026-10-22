import { assert, effect as test } from "@effect/vitest";
import { createClient } from "@supabase/supabase-js";
import { Effect, Schema } from "effect";
import { TestClock } from "effect/testing";

import { isNonEmptyText } from "../../../../../backend/shared/text/non-empty-text";
import {
  claimAgentChatAnswer,
  releaseAgentChatAnswer,
  renewAgentChatAnswer,
} from "../../../../../src/agent/chat/turn/agent-chat-answer-lease.server";
import type { Database } from "../../../../../src/lib/supabase/supabase-database";
import {
  fakeFetchBodyText,
  fakeFetchUrl,
} from "../../../../backend/shared/fixtures/fake-fetch-request";

const decodeLeaseUpdate = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ answering_until: Schema.NullOr(Schema.String) })
  )
);

test("only the current live answer can renew or release its lease", () =>
  Effect.gen(function* onlyCurrentLiveAnswer() {
    // The fake database checks leases against the real time, as Postgres
    // would; the answer's clock starts there too.
    yield* TestClock.setTime(Date.now());
    let expiresAt: string | null = null;

    const supabase = createClient<Database>(
      "https://lease-test.supabase.co",
      "test-key",
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (request, options) => {
            const url = new URL(fakeFetchUrl(request));
            const query = url.searchParams;
            const expected = query.get("answering_until");

            // A claim (claim_agent_chat_answer) takes the lease unless a
            // live one holds it.
            if (url.pathname.endsWith("/rpc/claim_agent_chat_answer")) {
              if (
                isNonEmptyText(expiresAt) &&
                Date.parse(expiresAt) > Date.now()
              ) {
                return await Promise.resolve(
                  Response.json([{ status: "busy", answering_until: null }])
                );
              }

              expiresAt = new Date(Date.now() + 300_000).toISOString();

              return await Promise.resolve(
                Response.json([
                  { status: "claimed", answering_until: expiresAt },
                ])
              );
            }

            // A renewal or release of another lease.
            const otherLease =
              expected?.startsWith("eq.") === true &&
              expiresAt !== expected.slice(3);

            if (otherLease) {
              return await Promise.resolve(Response.json([]));
            }

            expiresAt = decodeLeaseUpdate(
              fakeFetchBodyText(options?.body)
            ).answering_until;

            return await Promise.resolve(
              Response.json([{ answering_until: expiresAt }])
            );
          },
        },
      }
    );

    const answer = {
      conversationId: "conversation",
      name: null,
      pinned: false,
      streamId: "stream",
    };

    const first = yield* claimAgentChatAnswer(supabase, answer);

    assert.ok(
      first !== "busy" && first !== "missing",
      "the first claim takes the lease"
    );

    assert.strictEqual(yield* claimAgentChatAnswer(supabase, answer), "busy");
    const stale = { ...first };
    // The database now holds a replacement lease from a newer answer.
    expiresAt = new Date(Date.now() + 600_000).toISOString();
    assert.strictEqual(yield* renewAgentChatAnswer(supabase, stale), false);
    yield* releaseAgentChatAnswer(supabase, stale);
    assert.notStrictEqual(expiresAt, null);
    const current = { ...first, expiresAt };
    assert.strictEqual(yield* renewAgentChatAnswer(supabase, current), true);
    assert.strictEqual(current.expiresAt, expiresAt);
    yield* releaseAgentChatAnswer(supabase, current);
    assert.strictEqual(expiresAt, null);
  }));
