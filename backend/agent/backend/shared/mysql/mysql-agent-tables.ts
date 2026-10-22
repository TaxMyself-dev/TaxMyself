// The agent's MySQL tables as the gateway (mysql-postgrest-fetch.ts) reads
// them: each column's kind, so values convert between MySQL and the JSON
// PostgREST answers with; each table's primary key, so a write can read back
// the rows it touched (MySQL has no RETURNING); and who may do what, the
// template's row level security and grants
// (supabase/migrations/20261022000000_agent_template_schema.sql) as data.
// The tables themselves: backend/scripts/migrations/
// 2026-10-22_agent_harness_schema.sql. A column added there is added here.

/**
 * How a column's value is stored in MySQL and read back as JSON.
 * - uuid, text: strings.
 * - boolean: TINYINT(1), read back as true or false.
 * - integer: a number.
 * - json: a JSON column (jsonb in the template), objects and arrays as they are.
 * - array: a JSON array column (text[] in the template).
 * - timestamp: DATETIME(6) in UTC, read back as Postgres writes timestamptz
 *   ("2026-10-22T13:30:51.235123+00:00").
 */
export type AgentColumnKind =
  | "uuid"
  | "text"
  | "boolean"
  | "integer"
  | "json"
  | "array"
  | "timestamp";

/**
 * What a signed-in user may do to a table through the gateway (the template's
 * grants): read, insert, delete, and update every column or only some.
 */
export interface AgentTableUserAccess {
  readonly select: boolean;
  readonly insert: boolean;
  readonly delete: boolean;
  // true: every column; a list: only those (a column-level grant).
  readonly update: boolean | readonly string[];
}

/**
 * A many-to-one foreign key a select may embed (PostgREST's resource
 * embedding, `tracking_tasks(sentence)`): this table's columns and the
 * columns of the table they reference.
 */
export interface AgentTableRelation {
  readonly table: string;
  readonly columns: readonly string[];
  readonly references: readonly string[];
}

/**
 * One table: its columns, primary key, the column naming its owner, the
 * columns a new row gets from the server when left out, and the user's access.
 */
export interface AgentTable {
  readonly columns: Readonly<Record<string, AgentColumnKind>>;
  readonly primaryKey: readonly string[];
  // The column every user query is scoped to (RLS's user_id = auth.uid()).
  readonly owner: "user_id" | null;
  // A conversation_id a user's row names must be one of theirs (the
  // template's "with check" on the chat's tables).
  readonly ownedConversation: boolean;
  // Columns the gateway fills when a row leaves them out: a new uuid.
  readonly generatedUuid: readonly string[];
  readonly user: AgentTableUserAccess;
  // The tables a select may embed, by name.
  readonly relations?: Readonly<Record<string, AgentTableRelation>>;
}

const noUserAccess: AgentTableUserAccess = {
  select: false,
  insert: false,
  delete: false,
  update: false,
};

const fullUserAccess: AgentTableUserAccess = {
  select: true,
  insert: true,
  delete: true,
  update: true,
};

export const agentTables = {
  user_settings: {
    columns: {
      user_id: "uuid",
      profile_kind: "text",
      business_name: "text",
      website: "text",
      languages: "array",
      seeking: "text",
      not_relevant: "text",
      offer: "text",
      areas: "text",
      writing_style: "text",
      scan_frequency: "text",
      agent_action_rules: "json",
      app_locale: "text",
      updated_at: "timestamp",
    },
    primaryKey: ["user_id"],
    owner: "user_id",
    ownedConversation: false,
    generatedUuid: [],
    user: { select: true, insert: true, delete: false, update: true },
  },
  user_page_states: {
    columns: {
      user_id: "uuid",
      page: "text",
      state: "json",
      updated_at: "timestamp",
    },
    primaryKey: ["user_id", "page"],
    owner: "user_id",
    ownedConversation: false,
    generatedUuid: [],
    user: { select: true, insert: true, delete: false, update: true },
  },
  agent_chat_conversations: {
    columns: {
      id: "uuid",
      user_id: "uuid",
      name: "text",
      pinned: "boolean",
      created_at: "timestamp",
      updated_at: "timestamp",
      answering_until: "timestamp",
      active_stream_id: "uuid",
    },
    primaryKey: ["id"],
    owner: "user_id",
    ownedConversation: false,
    generatedUuid: ["id"],
    user: fullUserAccess,
  },
  agent_chat_messages: {
    columns: {
      id: "uuid",
      conversation_id: "uuid",
      user_id: "uuid",
      role: "text",
      parts: "json",
      created_at: "timestamp",
      finished_at: "timestamp",
    },
    primaryKey: ["id"],
    owner: "user_id",
    ownedConversation: true,
    generatedUuid: ["id"],
    user: fullUserAccess,
  },
  agent_chat_documents: {
    columns: {
      id: "uuid",
      conversation_id: "uuid",
      user_id: "uuid",
      filename: "text",
      content: "text",
      created_at: "timestamp",
    },
    primaryKey: ["id"],
    owner: "user_id",
    ownedConversation: true,
    generatedUuid: ["id"],
    user: { select: true, insert: true, delete: false, update: false },
  },
  agent_chat_stream_chunks: {
    columns: {
      stream_id: "uuid",
      seq: "integer",
      conversation_id: "uuid",
      user_id: "uuid",
      chunk: "text",
      created_at: "timestamp",
    },
    primaryKey: ["stream_id", "seq"],
    owner: "user_id",
    ownedConversation: true,
    generatedUuid: [],
    user: { select: true, insert: true, delete: true, update: false },
  },
  agent_chat_steers: {
    columns: {
      id: "uuid",
      conversation_id: "uuid",
      user_id: "uuid",
      stream_id: "uuid",
      text: "text",
      created_at: "timestamp",
    },
    primaryKey: ["id"],
    owner: "user_id",
    ownedConversation: true,
    generatedUuid: [],
    user: { select: true, insert: true, delete: true, update: false },
  },
  agent_memories: {
    columns: {
      id: "uuid",
      user_id: "uuid",
      content: "text",
      conversation_id: "uuid",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    primaryKey: ["id"],
    owner: "user_id",
    ownedConversation: true,
    generatedUuid: ["id"],
    user: fullUserAccess,
  },
  agent_usage: {
    columns: {
      id: "uuid",
      user_id: "uuid",
      conversation_id: "uuid",
      kind: "text",
      model: "text",
      steps: "integer",
      input_tokens: "integer",
      cached_input_tokens: "integer",
      output_tokens: "integer",
      reasoning_tokens: "integer",
      created_at: "timestamp",
    },
    primaryKey: ["id"],
    owner: "user_id",
    ownedConversation: true,
    generatedUuid: ["id"],
    user: { select: true, insert: true, delete: false, update: false },
  },
  tracking_tasks: {
    columns: {
      id: "uuid",
      user_id: "uuid",
      sentence: "text",
      details: "text",
      location: "text",
      budget: "text",
      sources: "json",
      scan_frequency: "text",
      alerts: "boolean",
      status: "text",
      priority: "text",
      labels: "array",
      position: "integer",
      last_scanned_at: "timestamp",
      last_scan_error: "text",
      version: "integer",
      scan_failures: "integer",
      scan_retry_at: "timestamp",
      scan_claimed_until: "timestamp",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    primaryKey: ["id"],
    owner: "user_id",
    ownedConversation: false,
    generatedUuid: ["id"],
    user: fullUserAccess,
  },
  task_items: {
    columns: {
      user_id: "uuid",
      source: "text",
      item_id: "text",
      snapshot: "json",
      found_at: "timestamp",
    },
    primaryKey: ["user_id", "source", "item_id"],
    owner: "user_id",
    ownedConversation: false,
    generatedUuid: [],
    user: { select: true, insert: false, delete: false, update: false },
  },
  task_scanned_items: {
    columns: {
      task_id: "uuid",
      source: "text",
      item_id: "text",
      score: "integer",
      jev_answers: "json",
      scanned_at: "timestamp",
    },
    primaryKey: ["task_id", "source", "item_id"],
    owner: null,
    ownedConversation: false,
    generatedUuid: [],
    user: noUserAccess,
  },
  task_opportunities: {
    columns: {
      id: "uuid",
      user_id: "uuid",
      task_id: "uuid",
      source: "text",
      item_id: "text",
      comment_id: "text",
      score: "integer",
      intent: "text",
      reason: "text",
      status: "text",
      posted_at: "timestamp",
      found_at: "timestamp",
      updated_at: "timestamp",
    },
    primaryKey: ["id"],
    owner: "user_id",
    ownedConversation: false,
    generatedUuid: ["id"],
    user: {
      select: true,
      insert: false,
      delete: true,
      update: ["status", "updated_at"],
    },
    relations: {
      tracking_tasks: {
        table: "tracking_tasks",
        columns: ["task_id"],
        references: ["id"],
      },
      task_items: {
        table: "task_items",
        columns: ["user_id", "source", "item_id"],
        references: ["user_id", "source", "item_id"],
      },
    },
  },
  user_notifications: {
    columns: {
      id: "uuid",
      user_id: "uuid",
      kind: "text",
      title: "text",
      body: "text",
      task_id: "uuid",
      opportunity_id: "uuid",
      read_at: "timestamp",
      created_at: "timestamp",
    },
    primaryKey: ["id"],
    owner: "user_id",
    ownedConversation: false,
    generatedUuid: ["id"],
    user: { select: true, insert: false, delete: true, update: ["read_at"] },
  },
  task_scan_runs: {
    columns: {
      id: "uuid",
      task_id: "uuid",
      user_id: "uuid",
      status: "text",
      sources_scanned: "integer",
      items_scored: "integer",
      matches: "integer",
      error: "text",
      started_at: "timestamp",
      finished_at: "timestamp",
    },
    primaryKey: ["id"],
    owner: "user_id",
    ownedConversation: false,
    generatedUuid: ["id"],
    user: { select: true, insert: false, delete: false, update: false },
  },
} satisfies Record<string, AgentTable>;

const agentTablesByName: ReadonlyMap<string, AgentTable> = new Map(
  Object.entries(agentTables)
);

/**
 * The table by name, or undefined for a name the gateway does not serve.
 *
 * @param name - The table's name, as PostgREST's path names it.
 * @returns The table.
 */
export const agentTable = (name: string) => agentTablesByName.get(name);
