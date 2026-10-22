import type { Database } from "../../../src/lib/supabase/supabase-database";
import type { TaskPostJevAnswers } from "../scoring/task-post-jev-questions";

// What the task monitor reads and writes through TaskMonitorStore
// (task-monitor-store.ts).

type UserSettingsRow = Database["public"]["Tables"]["user_settings"]["Row"];

/**
 * A task this worker claimed, with the scan run opened for it.
 */
export type MonitoredTask =
  Database["public"]["Functions"]["claim_due_tracking_tasks"]["Returns"][number];

/**
 * The user's settings the monitor scores with: what they seek and offer,
 * what is not relevant, their areas, languages and app language.
 */
export type MonitorUserPreferences = Pick<
  UserSettingsRow,
  "seeking" | "not_relevant" | "offer" | "areas" | "languages" | "app_locale"
>;

/**
 * One item's score for a task, with the Jev answers it came from.
 */
export interface TaskPostScore {
  source: string;
  itemId: string;
  score: number;
  jevAnswers: TaskPostJevAnswers;
}

/**
 * A match the scan records for a task: the item (or its reply), its score,
 * and the AI's intent and reason.
 */
export interface TaskOpportunityInput {
  source: string;
  itemId: string;
  // The reply that is the match, or "" when the item itself is.
  commentId: string;
  score: number;
  intent: string;
  reason: string;
  postedAt: string | null;
}

/**
 * A match the task already has: where it is, who wrote it and what it says,
 * so a repost of the same request is not a second opportunity
 * (task-match-repeats.ts).
 */
export interface EarlierTaskMatch {
  source: string;
  itemId: string;
  authorId: string;
  text: string;
}
