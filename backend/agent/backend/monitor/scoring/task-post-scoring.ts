import { Clock, Effect, Schema } from "effect";
import { forEach as effectForEach } from "effect/Effect";

import type { JevFailure } from "../../shared/ai/jev-request-error";
import { JevClient, jevNewestModel } from "../../shared/ai/typesafe-jev-client";
import { isNonEmptyText } from "../../shared/text/non-empty-text";
import type {
  MonitorUserPreferences,
  MonitoredTask,
} from "../scan/task-monitor-records";
import {
  taskCommentSideKey,
  taskCommentSideQuestion,
  taskExcludedQuestion,
  taskFitLevels,
  taskFitQuestion,
  taskNoulAnswerSchema,
  taskPlaceQuestion,
  taskPostAnswersSchema,
  taskPostCommentLimit,
  taskSideQuestion,
  taskSourceQuestion,
} from "./task-post-jev-questions";
import type { TaskPostJevAnswers } from "./task-post-jev-questions";
import type { TaskScoredPost } from "./task-scored-post";

// Scores a task's new items ("posts") with TypeSafe's Jev, one request per item, all
// at once. Each request asks separate questions, and code composes them
// (TypeSafe's guidance: one narrow judgment per question, the rule in code):
// - fit: how clear, current and complete the request or offer is, on five
//   levels; its position is the 0-100 score that ranks matches;
// - side: whether the writer is the kind of person the task looks for (a
//   buyer, not a seller offering the same thing);
// - place: whether it is about the task's place;
// - excluded (when the user listed what is not relevant): whether it is one
//   of those;
// - source (when the post has comments): which part fits best.
// A failed side, place or exclusion caps the score at 50, below a match.
// One fit score could not tell the sides apart: on eval items a seller's
// listing scored above a buyer's request, while the side question split
// them 0.15 / 0.87.
//
// gpt-6-luna only writes the intent and reason of the matches
// (task-match-description.ts). Requests go through typesafe-jev-client,
// which retries a busy answer once; a failure then fails the source's scan,
// which the next scan retries.

// A post (or one of its comments) scoring at least this is a match: an
// opportunity the user sees and is alerted about. Tasks deliberately have no
// threshold setting; the score ranks matches.
export const taskMatchMinScore = 70;

// A post that fails side, place or exclusion scores at most this.
const taskGateScoreCap = 50;

interface ScoredTaskPost {
  postId: string;
  // The comment that is the match, when it is a comment and not the post.
  commentId: string | null;
  score: number;
  jevAnswers: TaskPostJevAnswers;
}

// Jev reads dates as text and has no clock, so code turns a timestamp into
// an age ("posted 3 hours ago") that the fit levels' "old" is judged on.
const describeTaskPostAge = (createdAt: string | null, nowMs: number) => {
  if (!isNonEmptyText(createdAt)) {
    return "posting time unknown";
  }

  const hours = Math.max(
    0,
    Math.floor((nowMs - Date.parse(createdAt)) / 3_600_000)
  );

  return hours < 48
    ? `posted ${hours} hours ago`
    : `posted ${Math.floor(hours / 24)} days ago`;
};

// The source the items were read from, by the name scoring reads (its kind
// and query), so an item that names no place is judged by its source's.
interface TaskPostSource {
  name: string | null;
}

/**
 * What the scoring reads of a task: its sentence, details, place and budget,
 * and its id for the log. A tracking task is one; so is a one-time
 * request (an agent's search scored the same way).
 */
export type TaskPostScoringRequest = Pick<
  MonitoredTask,
  "id" | "sentence" | "details" | "location" | "budget"
>;

const taskPostState = (
  task: TaskPostScoringRequest,
  preferences: MonitorUserPreferences | null,
  source: TaskPostSource,
  post: TaskScoredPost,
  nowMs: number
) => ({
  task: {
    sentence: task.sentence,
    details: task.details,
    location: task.location,
    budget: task.budget,
  },
  user: preferences && {
    seeking: preferences.seeking,
    notRelevant: preferences.not_relevant,
    offer: preferences.offer,
    areas: preferences.areas,
  },
  source: { name: source.name ?? "" },
  post: {
    age: describeTaskPostAge(post.createdAt, nowMs),
    text: post.text?.slice(0, 3000) ?? "",
    attachments: post.attachments
      .flatMap((attachment) => [attachment.title, attachment.description])
      .filter(Boolean)
      .slice(0, 6),
    comments: post.comments.slice(0, taskPostCommentLimit).map((comment) => ({
      id: comment.id,
      age: describeTaskPostAge(comment.createdAt, nowMs),
      text: comment.text?.slice(0, 500) ?? "",
    })),
  },
});

/**
 * A failed scoring request, with the short message the task shows as its
 * last scan error.
 */
export class TaskPostScoringError extends Schema.TaggedError<
  TaskPostScoringError,
  { readonly brand: unique symbol }
>()("TaskPostScoringError", { message: Schema.String }) {}

// The task's scan error for a failed Jev request.
const failTaskPostScoring = Effect.fnUntraced(function* failTaskPostScoring(
  failure: JevFailure
) {
  if (failure === "missing_key") {
    return yield* new TaskPostScoringError({
      message: "The TypeSafe key is missing (TYPESAFE_API_KEY).",
    });
  }

  yield* Effect.logError("TASK_POST_SCORING_FAILED", failure);

  return yield* new TaskPostScoringError({
    message:
      failure === "timeout"
        ? "The scoring request failed or took too long. The next scan tries again."
        : "The scoring came back invalid or was refused. The next scan tries again.",
  });
});

const scoreTaskPost = Effect.fnUntraced(function* scoreTaskPost(
  task: TaskPostScoringRequest,
  preferences: MonitorUserPreferences | null,
  itemSource: TaskPostSource,
  post: TaskScoredPost
): Effect.fn.Return<ScoredTaskPost, TaskPostScoringError, JevClient> {
  const comments = post.comments.slice(0, taskPostCommentLimit);

  const questions = {
    fit: taskFitQuestion,
    side: taskSideQuestion,
    place: taskPlaceQuestion,
    ...((preferences?.not_relevant.trim() ?? "") !== "" && {
      excluded: taskExcludedQuestion,
    }),
    ...(comments.length > 0 && { source: taskSourceQuestion(post) }),
    ...Object.fromEntries(
      comments.map((comment, index) => [
        taskCommentSideKey(index),
        taskCommentSideQuestion(comment.text ?? ""),
      ])
    ),
  };

  const jev = yield* JevClient;
  const nowMs = yield* Clock.currentTimeMillis;

  const { answers } = yield* jev
    .ask(
      {
        model: jevNewestModel,
        state: taskPostState(task, preferences, itemSource, post, nowMs),
        questions,
      },
      taskPostAnswersSchema
    )
    .pipe(
      Effect.catchTag("JevRequestError", (error) =>
        failTaskPostScoring(error.failure)
      )
    );

  const { fit, side, place, excluded, source } = answers;

  const matchComment = comments.find(
    (comment) => comment.id === source?.choice
  );

  const commentSide = matchComment
    ? yield* Schema.decodeUnknownEffect(taskNoulAnswerSchema)(
        answers[taskCommentSideKey(comments.indexOf(matchComment))]
      ).pipe(
        Effect.matchEffect({
          onFailure: () => failTaskPostScoring("invalid"),
          onSuccess: Effect.succeed,
        })
      )
    : undefined;

  const writerSide = commentSide ?? side;
  const fitScore = Math.round((fit.score / (taskFitLevels.length - 1)) * 100);

  const gated =
    writerSide.noul < 0.5 || place.noul < 0.5 || (excluded?.noul ?? 0) >= 0.5;

  return {
    postId: post.id,
    commentId: matchComment?.id ?? null,
    score: gated ? Math.min(fitScore, taskGateScoreCap) : fitScore,
    jevAnswers: {
      fit,
      side,
      place,
      ...(excluded && { excluded }),
      ...(source && { source }),
      ...(commentSide && { commentSide }),
    },
  };
});

/**
 * One 0-100 score per item, in the given order. Fails with a short message
 * the task shows as its last scan error.
 */
export const scoreTaskPosts = Effect.fn("scoreTaskPosts")(
  function* scoreTaskPosts(
    task: TaskPostScoringRequest,
    preferences: MonitorUserPreferences | null,
    source: TaskPostSource,
    posts: readonly TaskScoredPost[]
  ): Effect.fn.Return<ScoredTaskPost[], TaskPostScoringError, JevClient> {
    if (posts.length === 0) {
      return [];
    }

    const scores = yield* effectForEach(
      posts,
      (post) => scoreTaskPost(task, preferences, source, post),
      { concurrency: "unbounded" }
    );

    // How many posts reach the LLM shows in the worker's log.
    const matches = scores.filter((score) => score.score >= taskMatchMinScore);
    yield* Effect.logInfo(
      `TASK_POST_SCORING task ${task.id}: ${matches.length} of ${posts.length} items are matches`
    );

    return scores;
  }
);
