import { Predicate, Schema } from "effect";

import type {
  AgentSqlDatabase,
  AgentSqlExecutor,
  AgentSqlParameter,
  AgentSqlRow,
  AgentSqlValue,
} from "./mysql-agent-database";
import {
  permissionDeniedError,
  PostgrestGatewayError,
} from "./mysql-agent-errors";
import type { AgentGatewayScope } from "./mysql-agent-scope";
import { mysqlTimestamp, postgrestValue } from "./mysql-agent-values";

// The template's Postgres functions (supabase/migrations/
// 20261022000000_agent_template_schema.sql), which the agent's code calls
// with supabase.rpc, as MySQL transactions. Each keeps its function's
// arguments, answer and guarantees: the chat's answer lease taken in one
// round trip, and the monitor's claims (FOR UPDATE SKIP LOCKED, so several
// workers never scan one task twice), fencing (every write checks the claim
// is still this run's), backoff and one-transaction scan records. The
// template granted the chat's functions to signed-in users and the
// monitor's to the service role only; so does each here.

/**
 * What a function runs with: the database and whose call it is.
 */
export interface AgentFunctionContext {
  readonly database: AgentSqlDatabase;
  readonly scope: AgentGatewayScope;
}

/**
 * A function's arguments, as the rpc call sends them.
 */
export type AgentFunctionArgs = Readonly<Record<string, AgentSqlValue>>;

/**
 * A database function: its arguments as the rpc call sends them, its answer
 * as JSON.
 */
export type AgentDatabaseFunction = (
  context: AgentFunctionContext,
  args: AgentFunctionArgs
) => Promise<AgentSqlValue | undefined>;

const userIdOf = (scope: AgentGatewayScope, fnName: string) => {
  if (scope.role !== "user") {
    throw permissionDeniedError(`function ${fnName}`);
  }

  return scope.userId;
};

const assertService = (scope: AgentGatewayScope, fnName: string) => {
  if (scope.role !== "service") {
    throw permissionDeniedError(`function ${fnName}`);
  }
};

const raise = (message: string, code = "P0001") =>
  new PostgrestGatewayError(400, code, message);

const noRows = "query returned no rows";

const textOf = (value: AgentSqlValue | undefined) =>
  Predicate.isString(value) ? value : null;

const integerOf = (value: AgentSqlValue | undefined) =>
  Predicate.isNumber(value) && Number.isInteger(value) ? value : null;

const isJsonList = Schema.is(Schema.Array(Schema.Json));
const isJsonObject = Schema.is(Schema.Record(Schema.String, Schema.Json));

const listOf = (value: AgentSqlValue | undefined): readonly AgentSqlValue[] =>
  isJsonList(value) ? value : [];

const fieldOf = (value: AgentSqlValue, key: string) =>
  isJsonObject(value) ? value[key] : undefined;

const fieldText = (value: AgentSqlValue, key: string) => {
  const field = fieldOf(value, key);

  return Predicate.isString(field) ? field : null;
};

const fieldNumber = (value: AgentSqlValue, key: string) =>
  Number(fieldOf(value, key));

const fieldJson = (value: AgentSqlValue, key: string) => {
  const field = fieldOf(value, key);

  return field === undefined ? null : JSON.stringify(field);
};

const uuidPattern =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu;

// A uuid argument as Postgres takes one: checked (22P02) and lowercase.
const uuidArgument = (value: AgentSqlValue | undefined) => {
  const text = textOf(value);

  if (text === null || !uuidPattern.test(text)) {
    throw raise(
      `invalid input syntax for type uuid: "${String(text)}"`,
      "22P02"
    );
  }

  return text.toLowerCase();
};

const timestampOf = (value: AgentSqlValue | undefined) => {
  const read = postgrestValue("timestamp", value);

  return Predicate.isString(read) ? read : null;
};

const sqlText = (value: AgentSqlValue | undefined) =>
  Predicate.isString(value) ? value : "";

// The first n characters, as Postgres' left() counts them.
const leftText = (value: string, length: number) => {
  let kept = "";
  let count = 0;

  for (const character of value) {
    if (count === length) {
      break;
    }

    kept += character;
    count += 1;
  }

  return kept;
};

// A task's interval between good scans, in seconds
// (tracking_task_scan_interval): "realtime" is as often as the monitor
// allows, 2 minutes.
const scanIntervals: ReadonlyMap<string, number> = new Map([
  ["realtime", 120],
  ["5m", 300],
  ["15m", 900],
  ["hour", 3600],
  ["6h", 21_600],
  ["day", 86_400],
]);

const scanIntervalSeconds = (scanFrequency: AgentSqlValue | undefined) =>
  scanIntervals.get(sqlText(scanFrequency)) ?? 86_400;

// tracking_task_scan_interval(scan_frequency) added to a time, in SQL.
const afterScanInterval = (time: string, frequency: string) =>
  `CASE ${frequency}
    WHEN 'realtime' THEN ${time} + INTERVAL 2 MINUTE
    WHEN '5m' THEN ${time} + INTERVAL 5 MINUTE
    WHEN '15m' THEN ${time} + INTERVAL 15 MINUTE
    WHEN 'hour' THEN ${time} + INTERVAL 1 HOUR
    WHEN '6h' THEN ${time} + INTERVAL 6 HOUR
    ELSE ${time} + INTERVAL 1 DAY
  END`;

const marks = (count: number) =>
  Array.from({ length: count }, () => "?").join(", ");

// One round trip before an answer starts: the conversation is created with
// its first message when missing, the answer lease is taken, and the
// answer's stream is marked active. claimed with the lease's expiry, busy
// when another answer holds it, or missing when the conversation is not the
// caller's.
const claimAgentChatAnswer: AgentDatabaseFunction = async (
  { database, scope },
  args
) => {
  const userId = userIdOf(scope, "claim_agent_chat_answer");
  const chatId = uuidArgument(args.chat_id);
  const streamId = uuidArgument(args.answer_stream_id);
  const leaseSeconds = integerOf(args.lease_seconds);

  if (leaseSeconds === null) {
    throw raise("claim_agent_chat_answer: invalid arguments", "22023");
  }

  return await database.transaction(async (executor) => {
    await executor.query(
      `INSERT INTO agent_chat_conversations (id, user_id, name, pinned)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [
        chatId,
        userId,
        textOf(args.chat_name),
        args.chat_pinned === true ? 1 : 0,
      ]
    );

    const claimed = await executor.query(
      `UPDATE agent_chat_conversations
       SET answering_until = NOW(6) + INTERVAL ? SECOND, active_stream_id = ?
       WHERE id = ? AND user_id = ?
         AND (answering_until IS NULL OR answering_until < NOW(6))`,
      [leaseSeconds, streamId, chatId, userId]
    );

    const { rows } = await executor.query(
      "SELECT answering_until FROM agent_chat_conversations WHERE id = ? AND user_id = ?",
      [chatId, userId]
    );

    const [conversation] = rows;

    if (conversation === undefined) {
      return [{ status: "missing", answering_until: null }];
    }

    // The update took the lease only when no live lease held it.
    return claimed.affectedRows > 0
      ? [
          {
            status: "claimed",
            answering_until: timestampOf(conversation.answering_until),
          },
        ]
      : [{ status: "busy", answering_until: null }];
  });
};

// The chat list without its messages: each conversation with the start of
// its first user message (its title until named), newest first.
const listAgentChatConversations: AgentDatabaseFunction = async ({
  database,
  scope,
}) => {
  const userId = userIdOf(scope, "list_agent_chat_conversations");

  const { rows } = await database.query(
    `SELECT
       c.id,
       c.name,
       c.pinned,
       c.created_at,
       (
         SELECT LEFT(part.text, 200)
         FROM agent_chat_messages m,
           JSON_TABLE(m.parts, '$[*]' COLUMNS (
             type VARCHAR(100) PATH '$.type',
             text LONGTEXT PATH '$.text'
           )) AS part
         WHERE m.conversation_id = c.id
           AND m.role = 'user'
           AND part.type = 'text'
         ORDER BY m.created_at
         LIMIT 1
       ) AS first_text,
       EXISTS (
         SELECT 1 FROM agent_chat_messages m WHERE m.conversation_id = c.id
       ) AS has_messages
     FROM agent_chat_conversations c
     WHERE c.user_id = ?
     ORDER BY c.created_at DESC
     LIMIT 200`,
    [userId]
  );

  return rows.map((row) => ({
    id: row.id ?? null,
    name: row.name ?? null,
    pinned: postgrestValue("boolean", row.pinned),
    created_at: timestampOf(row.created_at),
    first_text: row.first_text ?? null,
    has_messages: postgrestValue("boolean", row.has_messages),
  }));
};

// The conversations whose message texts contain the words (the chat
// search), case-insensitively.
const searchAgentChatConversations: AgentDatabaseFunction = async (
  { database, scope },
  args
) => {
  const userId = userIdOf(scope, "search_agent_chat_conversations");

  const words = (textOf(args.words) ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");

  const { rows } = await database.query(
    `SELECT DISTINCT m.conversation_id
     FROM agent_chat_messages m,
       JSON_TABLE(m.parts, '$[*]' COLUMNS (
         type VARCHAR(100) PATH '$.type',
         text LONGTEXT PATH '$.text'
       )) AS part
     WHERE m.user_id = ?
       AND part.type = 'text'
       AND LOWER(part.text) LIKE LOWER(?)
     LIMIT 200`,
    [userId, `%${words}%`]
  );

  return rows.map((row) => ({ conversation_id: row.conversation_id ?? null }));
};

// The board's manual order: the given tasks, in order, take positions 0, 1,
// 2, ... and the status of the column they are in, and each moved task's
// version goes up, so an edit started before the move is refused instead of
// undoing it. Only the caller's own tasks.
const arrangeTrackingTasks: AgentDatabaseFunction = async (
  { database, scope },
  args
) => {
  const userId = userIdOf(scope, "arrange_tracking_tasks");

  const arranged = listOf(args.arranged).flatMap((item, position) => {
    const id = fieldText(item, "id");

    return id === null
      ? []
      : [{ id, position, status: fieldText(item, "status") }];
  });

  if (arranged.length === 0) {
    return;
  }

  const positionCases = arranged.map(() => "WHEN ? THEN ?").join(" ");
  const statusCases = arranged.map(() => "WHEN ? THEN ?").join(" ");

  await database.query(
    `UPDATE tracking_tasks
     SET position = CASE id ${positionCases} END,
       status = CASE id ${statusCases} END,
       version = version + 1,
       updated_at = NOW(6)
     WHERE user_id = ? AND id IN (${marks(arranged.length)})`,
    [
      ...arranged.flatMap(({ id, position }) => [id, position]),
      ...arranged.flatMap(({ id, status }) => [id, status]),
      userId,
      ...arranged.map(({ id }) => id),
    ]
  );
};

// Changes the status or priority of several tasks and bumps their versions.
// Null leaves that field as it is. Only the caller's own tasks.
const changeTrackingTasks: AgentDatabaseFunction = async (
  { database, scope },
  args
) => {
  const userId = userIdOf(scope, "change_tracking_tasks");
  const ids = listOf(args.task_ids).filter((id) => Predicate.isString(id));

  if (ids.length === 0) {
    return;
  }

  await database.query(
    `UPDATE tracking_tasks
     SET status = COALESCE(?, status),
       priority = COALESCE(?, priority),
       version = version + 1,
       updated_at = NOW(6)
     WHERE user_id = ? AND id IN (${marks(ids.length)})`,
    [textOf(args.new_status), textOf(args.new_priority), userId, ...ids]
  );
};

const leaseInRange = (leaseSeconds: number | null) =>
  leaseSeconds !== null && leaseSeconds >= 60 && leaseSeconds <= 3600;

const claimInRange = (claimLimit: number | null) =>
  claimLimit !== null && claimLimit >= 1 && claimLimit <= 100;

// The due tasks this worker takes: active, not claimed, retry or interval
// come, oldest first, skipping rows another worker holds.
// A task is due: active, not claimed, its retry time come or, with no
// retry pending, its interval passed since its last scan.
const dueCondition = `task.status = 'active'
       AND (task.scan_claimed_until IS NULL OR task.scan_claimed_until < NOW(6))
       AND CASE
         WHEN task.scan_retry_at IS NOT NULL THEN task.scan_retry_at <= NOW(6)
         ELSE task.last_scanned_at IS NULL
           OR ${afterScanInterval("task.last_scanned_at", "task.scan_frequency")} <= NOW(6)
       END`;

const dueOrder = `(COALESCE(task.scan_retry_at, task.last_scanned_at) IS NULL) DESC,
       COALESCE(task.scan_retry_at, task.last_scanned_at) ASC`;

// The due tasks this worker takes, oldest first, skipping rows another
// worker holds. InnoDB locks every row a sorted locking read scans, so the
// due tasks are found first without locks, and only those are then locked
// (and checked again): Postgres' FOR UPDATE SKIP LOCKED locks only the rows
// it returns.
const lockDueTasks = async (executor: AgentSqlExecutor, claimLimit: number) => {
  const { rows: candidates } = await executor.query(
    `SELECT task.id FROM tracking_tasks AS task
     WHERE ${dueCondition}
     ORDER BY ${dueOrder}
     LIMIT ${claimLimit * 4}`
  );

  if (candidates.length === 0) {
    return { rows: [], affectedRows: 0 };
  }

  return await executor.query(
    `SELECT task.id, task.user_id, task.sentence, task.details, task.location,
       task.budget, task.sources, task.alerts, task.last_scanned_at
     FROM tracking_tasks AS task
     WHERE task.id IN (${marks(candidates.length)}) AND ${dueCondition}
     ORDER BY ${dueOrder}
     LIMIT ${claimLimit}
     FOR UPDATE SKIP LOCKED`,
    candidates.map((row) => sqlText(row.id))
  );
};

const claimedTask = (runId: string, task: AgentSqlRow) => ({
  run_id: runId,
  id: task.id ?? null,
  user_id: task.user_id ?? null,
  sentence: task.sentence ?? null,
  details: task.details ?? null,
  location: task.location ?? null,
  budget: task.budget ?? null,
  sources: postgrestValue("json", task.sources),
  alerts: postgrestValue("boolean", task.alerts),
  last_scanned_at: timestampOf(task.last_scanned_at),
});

// Claims up to claim_limit due active tasks for lease_seconds and opens a
// scan run for each; reclaiming a crashed worker's task closes its old run
// first. A task is due when its retry time has come, or, with no retry
// pending, when its interval has passed since its last scan. Rows another
// worker holds are skipped, not waited for.
const claimDueTrackingTasks: AgentDatabaseFunction = async (
  { database, scope },
  args
) => {
  assertService(scope, "claim_due_tracking_tasks");
  const leaseSeconds = integerOf(args.lease_seconds);
  const claimLimit = integerOf(args.claim_limit);

  if (
    leaseSeconds === null ||
    claimLimit === null ||
    !leaseInRange(leaseSeconds) ||
    !claimInRange(claimLimit)
  ) {
    throw raise("TASK_MONITOR_INVALID_CLAIM");
  }

  return await database.transaction(async (executor) => {
    const { rows: due } = await lockDueTasks(executor, claimLimit);

    if (due.length === 0) {
      return [];
    }

    const ids = due.map((task) => sqlText(task.id));

    await executor.query(
      `UPDATE tracking_tasks SET scan_claimed_until = NOW(6) + INTERVAL ? SECOND
       WHERE id IN (${marks(ids.length)})`,
      [leaseSeconds, ...ids]
    );

    await executor.query(
      `UPDATE task_scan_runs
       SET status = 'failed', error = 'TASK_MONITOR_CLAIM_EXPIRED', finished_at = NOW(6)
       WHERE status = 'running' AND task_id IN (${marks(ids.length)})`,
      ids
    );

    const runs = due.map((task) => ({ runId: crypto.randomUUID(), task }));

    await executor.query(
      `INSERT INTO task_scan_runs (id, task_id, user_id) VALUES ${runs.map(() => "(?, ?, ?)").join(", ")}`,
      runs.flatMap(({ runId, task }) => [
        runId,
        sqlText(task.id),
        sqlText(task.user_id),
      ])
    );

    return runs.map(({ runId, task }) => claimedTask(runId, task));
  });
};

// Locks the task before reading its run's status: a waiting worker must see
// a finish or replacement that committed while it waited for the lock.
const assertTaskScanClaim = async (
  executor: AgentSqlExecutor,
  scanRunId: string
) => {
  const { rows: tasks } = await executor.query(
    `SELECT claimed.id FROM tracking_tasks claimed
     JOIN task_scan_runs selected ON selected.task_id = claimed.id
     WHERE selected.id = ?
     FOR UPDATE OF claimed`,
    [scanRunId]
  );

  if (tasks.length !== 1) {
    throw raise(noRows, "P0002");
  }

  const { rows } = await executor.query(
    `SELECT run.status,
       (task.scan_claimed_until IS NOT NULL AND task.scan_claimed_until > SYSDATE(6)) AS live,
       EXISTS (
         SELECT 1 FROM task_scan_runs other
         WHERE other.task_id = run.task_id AND other.status = 'running'
           AND other.id <> run.id
       ) AS rival
     FROM task_scan_runs run
     JOIN tracking_tasks task ON task.id = run.task_id
     WHERE run.id = ?`,
    [scanRunId]
  );

  const [run] = rows;
  const live = postgrestValue("boolean", run?.live) === true;
  const rival = postgrestValue("boolean", run?.rival) === true;

  if (run?.status !== "running" || !live || rival) {
    throw raise("TASK_MONITOR_CLAIM_LOST", "55000");
  }
};

const scanRunIdOf = (args: AgentFunctionArgs) => {
  const scanRunId = textOf(args.scan_run_id);

  if (scanRunId === null) {
    throw raise("scan_run_id is required", "22023");
  }

  return scanRunId;
};

const assertTaskScanClaimFunction: AgentDatabaseFunction = async (
  { database, scope },
  args
) => {
  assertService(scope, "assert_task_scan_claim");
  const scanRunId = scanRunIdOf(args);

  await database.transaction(async (executor) => {
    await assertTaskScanClaim(executor, scanRunId);
  });
};

// Extends a live claim while a long scan runs.
const renewTaskScanClaim: AgentDatabaseFunction = async (
  { database, scope },
  args
) => {
  assertService(scope, "renew_task_scan_claim");
  const scanRunId = scanRunIdOf(args);
  const leaseSeconds = integerOf(args.lease_seconds);

  if (leaseSeconds === null || !leaseInRange(leaseSeconds)) {
    throw raise("TASK_MONITOR_INVALID_LEASE");
  }

  await database.transaction(async (executor) => {
    await assertTaskScanClaim(executor, scanRunId);
    await executor.query(
      `UPDATE tracking_tasks SET scan_claimed_until = SYSDATE(6) + INTERVAL ? SECOND
       WHERE id = (SELECT task_id FROM task_scan_runs WHERE id = ?)`,
      [leaseSeconds, scanRunId]
    );
  });
};

// The run's task, read and locked inside the claim's transaction.
const readScanTask = async (executor: AgentSqlExecutor, scanRunId: string) => {
  const { rows } = await executor.query(
    `SELECT task.id, task.user_id, task.sentence, task.alerts,
       task.scan_frequency, task.scan_failures, task.last_scan_error
     FROM tracking_tasks task
     JOIN task_scan_runs run ON run.task_id = task.id
     WHERE run.id = ?
     FOR UPDATE OF task`,
    [scanRunId]
  );

  const [task] = rows;

  if (task === undefined) {
    throw raise(noRows, "P0002");
  }

  return task;
};

// A posted time as the DATETIME(6) the column takes.
const postedAtParameter = (postedAt: string | null) =>
  postedAt === null ? null : mysqlTimestamp(postedAt);

// The source's items, kept (or refreshed) for their opportunities' cards.
const recordScanItems = async (
  executor: AgentSqlExecutor,
  ownerId: string,
  items: readonly AgentSqlValue[]
) => {
  if (items.length === 0) {
    return;
  }

  await executor.query(
    `INSERT INTO task_items (user_id, source, item_id, snapshot)
     VALUES ${items.map(() => "(?, ?, ?, ?)").join(", ")}
     ON DUPLICATE KEY UPDATE snapshot = VALUES(snapshot)`,
    items.flatMap((item): AgentSqlParameter[] => [
      ownerId,
      fieldText(item, "source"),
      fieldText(item, "itemId"),
      fieldJson(item, "snapshot") ?? "null",
    ])
  );
};

// The scores, marking their items as scanned; how many items were new.
const recordScanScores = async (
  executor: AgentSqlExecutor,
  taskId: string,
  scores: readonly AgentSqlValue[]
) => {
  if (scores.length === 0) {
    return 0;
  }

  const keys = scores.map((score) => [
    fieldText(score, "source"),
    fieldText(score, "itemId"),
  ]);

  const { rows: known } = await executor.query(
    `SELECT source, item_id FROM task_scanned_items
     WHERE task_id = ? AND (source, item_id) IN (${keys.map(() => "(?, ?)").join(", ")})`,
    [taskId, ...keys.flat()]
  );

  const scanned = new Set(
    known.map((row) => JSON.stringify([row.source, row.item_id]))
  );

  const fresh = new Set(
    keys.flatMap((key) => {
      const text = JSON.stringify(key);

      return scanned.has(text) ? [] : [text];
    })
  );

  await executor.query(
    `INSERT INTO task_scanned_items (task_id, source, item_id, score, jev_answers)
     VALUES ${scores.map(() => "(?, ?, ?, ?, ?)").join(", ")}
     ON DUPLICATE KEY UPDATE task_id = task_id`,
    scores.flatMap((score): AgentSqlParameter[] => [
      taskId,
      fieldText(score, "source"),
      fieldText(score, "itemId"),
      fieldNumber(score, "score"),
      fieldJson(score, "jevAnswers"),
    ])
  );

  return fresh.size;
};

// The matches, each new one with an in-app alert when the task's alerts are
// on; how many were new. Each gets an id first, so the ones the insert kept
// (not repeats of an existing match) are the ids found after it.
// A match as record_task_source_scan casts it: Postgres fails the scan on
// a missing intent or reason, an invalid time or a score that is not a
// whole number.
const assertMatch = (item: AgentSqlValue) => {
  const score = fieldOf(item, "score");
  const postedAt = fieldText(item, "postedAt");

  if (
    fieldText(item, "intent") === null ||
    fieldText(item, "reason") === null
  ) {
    throw raise("null value in a match's intent or reason", "23502");
  }

  if (!Predicate.isNumber(score) || !Number.isInteger(score)) {
    throw raise(
      `invalid input syntax for type smallint: ${JSON.stringify(score ?? null)}`,
      "22P02"
    );
  }

  if (postedAt !== null && postedAtParameter(postedAt) === null) {
    throw raise(
      `invalid input syntax for type timestamp: "${postedAt}"`,
      "22007"
    );
  }
};

const recordScanMatches = async (
  executor: AgentSqlExecutor,
  task: AgentSqlRow,
  opportunities: readonly AgentSqlValue[]
) => {
  if (opportunities.length === 0) {
    return 0;
  }

  for (const item of opportunities) {
    assertMatch(item);
  }

  const ownerId = sqlText(task.user_id);
  const taskId = sqlText(task.id);

  const matches = opportunities.map((item) => ({
    id: crypto.randomUUID(),
    intent: leftText(fieldText(item, "intent") ?? "", 300),
    item,
  }));

  await executor.query(
    `INSERT INTO task_opportunities
       (id, user_id, task_id, source, item_id, comment_id, score, intent, reason, posted_at)
     VALUES ${matches.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}
     ON DUPLICATE KEY UPDATE id = id`,
    matches.flatMap(({ id, intent, item }): AgentSqlParameter[] => [
      id,
      ownerId,
      taskId,
      fieldText(item, "source"),
      fieldText(item, "itemId"),
      fieldText(item, "commentId") ?? "",
      fieldNumber(item, "score"),
      intent,
      leftText(fieldText(item, "reason") ?? "", 500),
      postedAtParameter(fieldText(item, "postedAt")),
    ])
  );

  const { rows: kept } = await executor.query(
    `SELECT id FROM task_opportunities WHERE id IN (${marks(matches.length)})`,
    matches.map(({ id }) => id)
  );

  const keptIds = new Set(kept.map((row) => row.id));
  const fresh = matches.filter(({ id }) => keptIds.has(id));

  if (fresh.length > 0 && postgrestValue("boolean", task.alerts) === true) {
    const title = leftText(`New match: ${sqlText(task.sentence)}`, 200);

    await executor.query(
      `INSERT INTO user_notifications (id, user_id, kind, title, body, task_id, opportunity_id)
       VALUES ${fresh.map(() => "(?, ?, 'opportunity', ?, ?, ?, ?)").join(", ")}`,
      fresh.flatMap(({ id, intent }) => [
        crypto.randomUUID(),
        ownerId,
        title,
        leftText(intent, 500),
        taskId,
        id,
      ])
    );
  }

  return fresh.length;
};

// One source's scan: its items, their scores and its matches, with a
// notification for each new match when the task's alerts are on, in one
// transaction. Items are kept for every scored item, so a match's card has
// its item; scores mark items as scanned, so the next scan skips them.
// Repeats add nothing. Returns how many matches were new.
const recordTaskSourceScan: AgentDatabaseFunction = async (
  { database, scope },
  args
) => {
  assertService(scope, "record_task_source_scan");
  const scanRunId = scanRunIdOf(args);

  return await database.transaction(async (executor) => {
    await assertTaskScanClaim(executor, scanRunId);
    const task = await readScanTask(executor, scanRunId);

    await recordScanItems(executor, sqlText(task.user_id), listOf(args.items));

    const newItems = await recordScanScores(
      executor,
      sqlText(task.id),
      listOf(args.scores)
    );

    const newMatches = await recordScanMatches(
      executor,
      task,
      listOf(args.opportunities)
    );

    await executor.query(
      `UPDATE task_scan_runs SET
         sources_scanned = sources_scanned + 1,
         items_scored = items_scored + ?,
         matches = matches + ?
       WHERE id = ?`,
      [newItems, newMatches, scanRunId]
    );

    return newMatches;
  });
};

// A failed scan: a retry after 2 minutes doubled per failure in a row,
// capped at the task's interval, and an alert once per new error message.
const scheduleScanRetry = async (
  executor: AgentSqlExecutor,
  task: AgentSqlRow,
  error: string
) => {
  const failures = Number(task.scan_failures) + 1;

  const retrySeconds = Math.min(
    scanIntervalSeconds(task.scan_frequency),
    120 * 2 ** Math.min(failures - 1, 10)
  );

  await executor.query(
    `UPDATE tracking_tasks SET
       last_scan_error = ?, scan_failures = ?,
       scan_retry_at = NOW(6) + INTERVAL ? SECOND, scan_claimed_until = NULL
     WHERE id = ?`,
    [error, failures, retrySeconds, sqlText(task.id)]
  );

  if ((task.last_scan_error ?? null) !== error) {
    await executor.query(
      `INSERT INTO user_notifications (id, user_id, kind, title, body, task_id)
       VALUES (?, ?, 'task-error', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        sqlText(task.user_id),
        leftText(`Scan failed: ${sqlText(task.sentence)}`, 200),
        error,
        sqlText(task.id),
      ]
    );
  }
};

// Ends a scan run. Success clears the failure count and the retry; failure
// schedules a retry (scheduleScanRetry). Either way the claim is released.
const finishTaskScan: AgentDatabaseFunction = async (
  { database, scope },
  args
) => {
  assertService(scope, "finish_task_scan");
  const scanRunId = scanRunIdOf(args);
  const scanError = textOf(args.scan_error);
  const error = scanError === null ? null : leftText(scanError, 500);

  await database.transaction(async (executor) => {
    await assertTaskScanClaim(executor, scanRunId);
    const task = await readScanTask(executor, scanRunId);

    await executor.query(
      `UPDATE task_scan_runs SET status = ?, error = ?, finished_at = NOW(6)
       WHERE id = ?`,
      [error === null ? "succeeded" : "failed", error, scanRunId]
    );

    if (error !== null) {
      await scheduleScanRetry(executor, task, error);

      return;
    }

    await executor.query(
      `UPDATE tracking_tasks SET
         last_scanned_at = NOW(6), last_scan_error = NULL, scan_failures = 0,
         scan_retry_at = NULL, scan_claimed_until = NULL
       WHERE id = ?`,
      [sqlText(task.id)]
    );
  });
};

// Gives a claimed task back without counting a scan (the worker is
// stopping); the task stays due.
const releaseTaskScan: AgentDatabaseFunction = async (
  { database, scope },
  args
) => {
  assertService(scope, "release_task_scan");
  const scanRunId = scanRunIdOf(args);

  await database.transaction(async (executor) => {
    await assertTaskScanClaim(executor, scanRunId);
    const task = await readScanTask(executor, scanRunId);

    await executor.query(
      "UPDATE task_scan_runs SET status = 'skipped', finished_at = NOW(6) WHERE id = ?",
      [scanRunId]
    );
    await executor.query(
      "UPDATE tracking_tasks SET scan_claimed_until = NULL WHERE id = ?",
      [sqlText(task.id)]
    );
  });
};

const agentDatabaseFunctions: ReadonlyMap<string, AgentDatabaseFunction> =
  new Map([
    ["claim_agent_chat_answer", claimAgentChatAnswer],
    ["list_agent_chat_conversations", listAgentChatConversations],
    ["search_agent_chat_conversations", searchAgentChatConversations],
    ["arrange_tracking_tasks", arrangeTrackingTasks],
    ["change_tracking_tasks", changeTrackingTasks],
    ["claim_due_tracking_tasks", claimDueTrackingTasks],
    ["assert_task_scan_claim", assertTaskScanClaimFunction],
    ["renew_task_scan_claim", renewTaskScanClaim],
    ["record_task_source_scan", recordTaskSourceScan],
    ["finish_task_scan", finishTaskScan],
    ["release_task_scan", releaseTaskScan],
  ]);

/**
 * The database function an rpc call names, or undefined for one the
 * template does not have.
 *
 * @param name - The function's name.
 * @returns The function.
 */
export const agentDatabaseFunction = (name: string) =>
  agentDatabaseFunctions.get(name);
