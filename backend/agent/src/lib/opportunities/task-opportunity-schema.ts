import { Schema } from "effect";

import {
  app_opportunity_closed,
  app_opportunity_in_progress,
  app_opportunity_irrelevant,
  app_opportunity_new,
  app_opportunity_replied,
} from "#/paraglide/messages";

import { taskItemSchema } from "../../../backend/monitor/sources/task-source";

// Opportunities: items (or one of their replies) a task's sources found that
// the task monitor's AI judged a match for one of the user's tasks, with
// what the person wants and why it fits. The user moves each through its
// statuses.
export const taskOpportunityStatuses = [
  "new",
  "in_progress",
  "replied",
  "closed",
  "irrelevant",
] as const;

/**
 * Where the user put an opportunity, one of taskOpportunityStatuses.
 */
export type TaskOpportunityStatus = (typeof taskOpportunityStatuses)[number];

const taskOpportunityStatusMessages: Record<
  TaskOpportunityStatus,
  () => string
> = {
  new: app_opportunity_new,
  in_progress: app_opportunity_in_progress,
  replied: app_opportunity_replied,
  closed: app_opportunity_closed,
  irrelevant: app_opportunity_irrelevant,
};

/**
 * An opportunity status's label, read when shown, in the page's language.
 *
 * @param status - The status.
 * @returns Its label.
 */
export const taskOpportunityStatusLabel = (status: TaskOpportunityStatus) =>
  taskOpportunityStatusMessages[status]();

export const taskOpportunitySchema = Schema.Struct({
  id: Schema.String.check(Schema.isUUID()),
  taskId: Schema.String.check(Schema.isUUID()),
  taskSentence: Schema.String,
  source: Schema.String,
  itemId: Schema.String,
  // The matching reply, when the match is a reply and not the item.
  commentId: Schema.NullOr(Schema.String),
  score: Schema.Int.check(
    Schema.isGreaterThanOrEqualTo(0),
    Schema.isLessThanOrEqualTo(100)
  ),
  intent: Schema.String,
  reason: Schema.String,
  status: Schema.Literals(taskOpportunityStatuses),
  postedAt: Schema.NullOr(Schema.String),
  foundAt: Schema.String,
  // The item as its source returned it, for the match's card.
  item: taskItemSchema,
});

/**
 * A match a task found: the item or reply, its score, the AI's intent and
 * reason, and its status.
 */
export type TaskOpportunity = typeof taskOpportunitySchema.Type;
