import { Effect } from "effect";

import type { WebSearch } from "@/agent/core/ports/example-ports";
import type { TaskOpportunity } from "@/lib/opportunities/task-opportunity-schema";
import type { Json } from "@/lib/supabase/supabase-json";
import { newTrackingTask } from "@/lib/tasks/tracking-task-schema";
import type { TrackingTask } from "@/lib/tasks/tracking-task-schema";

// The stand-in user's rows and settings for the agent evals: the ids the
// cases refer to, and rows as the agent's tools read them. EXAMPLE settings
// and tasks: write the people your product serves.

export const evalUserId = "00000000-0000-4000-8000-000000000001";

// The conversation every eval runs in.
export const evalConversationId = "00000000-0000-4000-8000-0000000000c1";

export const evalMemoryId = "5b1c2a1e-3333-4a1a-8a1a-333333333333";

export const evalTaskId = "6f1c2a1e-1111-4a1a-8a1a-111111111111";
export const evalOpportunityId = "7a1c2a1e-2222-4a1a-8a1a-222222222222";

// When the user writes in an eval conversation: a fixed time on the day the
// fixtures are from, so "today" and "how long ago" read as they would in the
// chat.
export const evalMessageTime = "2026-10-04T10:00:00.000Z";

/**
 * A row as Supabase returns it, with the embedded rows the tools' selects
 * ask for.
 */
export type AgentEvalRow = Record<string, Json>;

/**
 * What the stand-in database holds, by table: the agent's own tables. Add
 * your tables that tools read through the database client.
 */
export type AgentEvalData = Partial<
  Record<
    | "agent_memories"
    | "agent_chat_messages"
    | "agent_chat_conversations"
    | "agent_chat_documents"
    | "user_settings",
    AgentEvalRow[]
  >
>;

type AgentEvalWriteAction = "insert" | "update" | "delete" | "rpc";

/**
 * One write an eval recorded: the table, the action and its body.
 */
export interface AgentEvalWrite {
  table: string;
  action: AgentEvalWriteAction;
  body: string;
}

// The eval task's sentence, and when its item was posted.
const evalTaskSentence = "Find small businesses looking for a bookkeeper";
const evalItemPostedAt = "2026-10-04T08:00:00.000Z";

/**
 * One of the eval user's tracking tasks, with the fields a case changes.
 *
 * @param fields - Fields to replace.
 * @returns The task.
 */
export const evalTask = (fields: Partial<TrackingTask> = {}): TrackingTask => ({
  ...newTrackingTask(evalTaskSentence, {
    scanFrequency: "hour",
  }),
  id: evalTaskId,
  sources: [{ kind: "web", query: "looking for a bookkeeper" }],
  createdAt: "2026-10-01T09:00:00.000Z",
  ...fields,
});

/**
 * An opportunity as the opportunities read embeds it: its task's sentence
 * and the item its source returned.
 *
 * @param itemText - The item's text.
 * @param comments - Replies under the item; one may be the match.
 * @param commentId - The matching reply, or "" when the item is the match.
 * @returns The opportunity row.
 */
export const evalOpportunityRow = (
  itemText: string,
  comments: { id: string; text: string }[] = [],
  commentId = ""
) => ({
  id: evalOpportunityId,
  task_id: evalTaskId,
  source: "web",
  item_id: "111",
  comment_id: commentId,
  score: 88,
  intent: "Looking for a bookkeeper for a small bakery",
  reason: "A small business that needs monthly bookkeeping, as the task asks",
  status: "new",
  posted_at: evalItemPostedAt,
  found_at: "2026-10-04T08:31:00.000Z",
  tracking_tasks: {
    sentence: evalTaskSentence,
  },
  task_items: {
    snapshot: {
      source: "web",
      id: "111",
      title: "Bakery looking for a bookkeeper",
      subtitle: null,
      text: itemText,
      price: null,
      place: "Chicago",
      photoUrl: null,
      url: "https://example.com/requests/111",
      postedAt: evalItemPostedAt,
      authorId: "author-1",
      comments: comments.map((comment) => ({
        ...comment,
        createdAt: null,
        authorId: null,
      })),
    },
  },
});

/**
 * One of the eval task's opportunities, as the opportunity store returns it:
 * a small business asking for a bookkeeper.
 *
 * @param fields - Fields to replace.
 * @returns The opportunity.
 */
export const evalOpportunity = (
  fields: Partial<TaskOpportunity> = {}
): TaskOpportunity => ({
  id: evalOpportunityId,
  taskId: evalTaskId,
  taskSentence: evalTaskSentence,
  source: "web",
  itemId: "111",
  commentId: null,
  score: 88,
  intent: "A bakery wants a monthly bookkeeper",
  reason: "A small business that needs monthly bookkeeping, as the task asks",
  status: "new",
  postedAt: evalItemPostedAt,
  foundAt: "2026-10-04T08:31:00.000Z",
  item: {
    source: "web",
    id: "111",
    title: "Bakery looking for a bookkeeper",
    subtitle: null,
    text: "We're a small bakery in Logan Square and need someone to do our books every month. Any recommendations?",
    price: null,
    place: "Chicago",
    photoUrl: null,
    url: "https://example.com/requests/111",
    postedAt: evalItemPostedAt,
    authorId: "author-1",
    comments: [],
  },
  ...fields,
});

/**
 * A web search that answers every query with the same results, for cases
 * that search.
 *
 * @param results - What every search returns.
 * @returns The web search port.
 */
export const evalWebSearch = (
  results: { title: string; url: string; snippet: string }[]
): WebSearch => ({
  search: (_query, maxResults) => Effect.succeed(results.slice(0, maxResults)),
});
