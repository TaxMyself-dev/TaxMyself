import { Config, Context, Effect, Layer, Option } from "effect";
import { PostHog } from "posthog-node";

import type { UserSupabaseClient } from "@/server/runtime/supabase-client";

// The app's product events in PostHog (EU Cloud), sent from the server so ad
// blockers can't drop them and the counts are exact: sign-ups, searches,
// tasks, opportunities, the agent's messages and tools. Each event goes to the signed-in user's
// Supabase id, the id the browser identifies them with
// (useIdentifyAnalyticsUser), so the browser's page views and the server's
// events are one person. Events are queued and sent after each response with
// the app's other telemetry (flushAppTelemetry).
//
// Config: VITE_POSTHOG_PROJECT_TOKEN (the same public project token as the
// browser's); POSTHOG_HOST overrides the EU host. Without the token nothing
// is sent. Properties never carry what a user typed (search words, messages)
// or contact details; identify puts the email on the person once.

/**
 * Every product event the server sends: one static name per action (rule:
 * never interpolate a name; put the variation in a property).
 */
export type ProductEventName =
  | "user_signed_up"
  | "user_signed_in"
  | "user_signed_out"
  | "tracking_task_created"
  | "tracking_task_updated"
  | "tracking_tasks_deleted"
  | "tracking_task_scan_requested"
  | "opportunity_status_changed"
  | "agent_message_sent"
  | "agent_tool_used";

/**
 * An event's properties: names and counts, never user content.
 */
export type ProductEventProperties = Readonly<
  Record<string, string | number | boolean | null>
>;

/**
 * PostHog's server client for the app's product events.
 */
export class PostHogProductEvents extends Context.Service<
  PostHogProductEvents,
  {
    readonly capture: (
      userId: string,
      event: ProductEventName,
      properties?: ProductEventProperties
    ) => Effect.Effect<void>;
    // Sends the queued events: a serverless function freezes once its
    // response ends (flushAppTelemetry).
    readonly flush: Effect.Effect<void>;
  }
>()("app/server/PostHogProductEvents") {
  static readonly layer = Layer.effect(
    PostHogProductEvents,
    Effect.gen(function* makePostHogProductEvents() {
      const token = yield* Config.option(
        Config.String("VITE_POSTHOG_PROJECT_TOKEN")
      );

      if (Option.isNone(token)) {
        return PostHogProductEvents.of({
          capture: () => Effect.void,
          flush: Effect.void,
        });
      }

      const host = yield* Config.String("POSTHOG_HOST").pipe(
        Config.withDefault("https://eu.i.posthog.com")
      );

      // Which deployment sent the event, so development and previews can be
      // filtered out (Vercel's VERCEL_ENV).
      const environment = yield* Config.String("VERCEL_ENV").pipe(
        Config.withDefault("development")
      );

      const client = new PostHog(token.value, { host });

      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          await client.shutdown();
        })
      );

      return PostHogProductEvents.of({
        capture: (userId, event, properties = {}) =>
          Effect.sync(() => {
            client.capture({
              distinctId: userId,
              event,
              properties: { ...properties, environment, source: "server" },
            });
          }),
        flush: Effect.tryPromise(async () => {
          await client.flush();
        }).pipe(Effect.timeoutOption("5 seconds"), Effect.ignore),
      });
    }).pipe(Effect.orDie)
  );
}

/**
 * Records a product event for the user; nothing where PostHogProductEvents
 * is not provided (unit tests).
 *
 * @param userId - The user's Supabase id.
 * @param event - The event.
 * @param properties - Its properties.
 * @returns An effect that never fails.
 */
export const recordProductEvent = (
  userId: string,
  event: ProductEventName,
  properties?: ProductEventProperties
) =>
  Effect.flatMap(
    Effect.serviceOption(PostHogProductEvents),
    Option.match({
      onNone: () => Effect.void,
      onSome: (events) => events.capture(userId, event, properties),
    })
  );

/**
 * Records a product event for the user a Supabase client is signed in as
 * (its verified session); nothing when it has none.
 *
 * @param supabase - The user's Supabase client.
 * @param event - The event.
 * @param properties - Its properties.
 * @returns An effect that never fails.
 */
export const recordSignedInProductEvent = (
  supabase: UserSupabaseClient,
  event: ProductEventName,
  properties?: ProductEventProperties
) =>
  Effect.gen(function* recordSignedInProductEventForUser() {
    // tryPromise, so a failing session read is ignored, never a defect.
    const { data } = yield* Effect.tryPromise(
      async () => await supabase.auth.getClaims()
    );

    if (data?.claims.sub !== undefined) {
      yield* recordProductEvent(data.claims.sub, event, properties);
    }
  }).pipe(Effect.ignore);

/**
 * Sends the queued product events; nothing without PostHogProductEvents.
 */
export const flushProductEvents = Effect.flatMap(
  Effect.serviceOption(PostHogProductEvents),
  Option.match({
    onNone: () => Effect.void,
    onSome: ({ flush }) => flush,
  })
);
