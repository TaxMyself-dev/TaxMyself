-- ============================================================================
-- KT-089: the agent harness's tables (backend/agent), MySQL 8.
--
-- A port of the agent template's Postgres migration
-- (supabase/migrations/20261022000000_agent_template_schema.sql), table for
-- table and column for column. What Postgres did in the database, the agent
-- package does in code:
--   * Row level security: every user query goes through the agent's MySQL
--     gateway (backend/agent/backend/shared/mysql), which scopes each read and
--     write to the signed-in user's rows and checks that a row naming a
--     conversation names one of theirs.
--   * The database functions (claim_agent_chat_answer, the monitor's claims and
--     scan records): mysql-agent-functions.ts, as transactions with row locks.
--   * auth.users: agent_users maps each Firebase uid to the agent's own uuid,
--     the user_id every other table names.
--
-- Conventions of this repository: DATETIME(6) in UTC, InnoDB, utf8mb4 with the
-- database's standard collation (utf8mb4_0900_ai_ci); ids are uuids as
-- CHAR(36) ascii with a binary collation, so they compare exactly. No CHECK on
-- a column of a cascading foreign key (MySQL 8 error 3823).
--
-- Additive only: it creates new tables and touches no existing one. Every
-- statement is DDL, so it is not transactional; run it once per database.
-- ============================================================================

-- The agent's users: one row per Firebase account that used the agent.
CREATE TABLE `agent_users` (
  `id`          CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `firebase_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at`  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_agent_users_firebase_id` (`firebase_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- The user's settings, one column per setting (user-settings-schema.ts).
-- EXAMPLE columns: keep agent_action_rules and app_locale, add yours.
CREATE TABLE `user_settings` (
  `user_id`            CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `profile_kind`       VARCHAR(20)   NOT NULL DEFAULT 'individual',
  `business_name`      VARCHAR(120)  NOT NULL DEFAULT '',
  `website`            VARCHAR(300)  NOT NULL DEFAULT '',
  `languages`          JSON          NOT NULL DEFAULT (JSON_ARRAY('en')),
  `seeking`            VARCHAR(1000) NOT NULL DEFAULT '',
  `not_relevant`       VARCHAR(1000) NOT NULL DEFAULT '',
  `offer`              VARCHAR(1000) NOT NULL DEFAULT '',
  `areas`              VARCHAR(300)  NOT NULL DEFAULT '',
  `writing_style`      VARCHAR(1000) NOT NULL DEFAULT '',
  `scan_frequency`     VARCHAR(10)   NOT NULL DEFAULT 'hour',
  `agent_action_rules` JSON          NOT NULL DEFAULT (JSON_OBJECT()),
  `app_locale`         VARCHAR(2)    NOT NULL DEFAULT 'en',
  `updated_at`         DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_user_settings_user` FOREIGN KEY (`user_id`)
    REFERENCES `agent_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_user_settings_profile_kind`
    CHECK (`profile_kind` IN ('individual', 'business')),
  CONSTRAINT `ck_user_settings_languages` CHECK (JSON_TYPE(`languages`) = 'ARRAY'),
  CONSTRAINT `ck_user_settings_scan_frequency`
    CHECK (`scan_frequency` IN ('realtime', '5m', '15m', 'hour', '6h', 'day')),
  CONSTRAINT `ck_user_settings_action_rules`
    CHECK (JSON_TYPE(`agent_action_rules`) = 'OBJECT'),
  CONSTRAINT `ck_user_settings_app_locale` CHECK (`app_locale` IN ('he', 'en'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A page's view state per user (user-page-state.ts).
CREATE TABLE `user_page_states` (
  `user_id`    CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `page`       VARCHAR(20) NOT NULL,
  `state`      JSON        NOT NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`user_id`, `page`),
  CONSTRAINT `fk_user_page_states_user` FOREIGN KEY (`user_id`)
    REFERENCES `agent_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_user_page_states_page` CHECK (`page` IN ('tasks', 'search')),
  CONSTRAINT `ck_user_page_states_state` CHECK (
    JSON_TYPE(`state`) = 'OBJECT' AND JSON_STORAGE_SIZE(`state`) <= 65536)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A chat. answering_until is the answer lease (one answer at a time,
-- agent-chat-answer-lease.server.ts); active_stream_id the answer streaming
-- now (agent-chat-answer-stream.server.ts).
CREATE TABLE `agent_chat_conversations` (
  `id`               CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id`          CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name`             VARCHAR(120) NULL,
  `pinned`           TINYINT(1)  NOT NULL DEFAULT 0,
  `created_at`       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `answering_until`  DATETIME(6) NULL,
  `active_stream_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  PRIMARY KEY (`id`),
  KEY `agent_chat_conversations_user_created_idx` (`user_id`, `created_at` DESC),
  CONSTRAINT `fk_agent_chat_conversations_user` FOREIGN KEY (`user_id`)
    REFERENCES `agent_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_agent_chat_conversations_name`
    CHECK (`name` IS NULL OR CHAR_LENGTH(`name`) BETWEEN 1 AND 120)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One AI SDK UI message per row, its parts as they are
-- (agent-chat-message-storage.server.ts).
CREATE TABLE `agent_chat_messages` (
  `id`              CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `conversation_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id`         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `role`            VARCHAR(20) NOT NULL,
  `parts`           JSON        NOT NULL,
  `created_at`      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `finished_at`     DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  KEY `agent_chat_messages_conversation_created_idx` (`conversation_id`, `created_at`),
  KEY `agent_chat_messages_user_idx` (`user_id`),
  CONSTRAINT `fk_agent_chat_messages_conversation` FOREIGN KEY (`conversation_id`)
    REFERENCES `agent_chat_conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agent_chat_messages_user` FOREIGN KEY (`user_id`)
    REFERENCES `agent_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_agent_chat_messages_role` CHECK (`role` IN ('user', 'assistant')),
  CONSTRAINT `ck_agent_chat_messages_parts` CHECK (
    JSON_TYPE(`parts`) = 'ARRAY' AND JSON_STORAGE_SIZE(`parts`) <= 262144)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- An attached document's whole text, read in parts by readAttachedDocument.
CREATE TABLE `agent_chat_documents` (
  `id`              CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `conversation_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id`         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `filename`        VARCHAR(512) NOT NULL,
  `content`         LONGTEXT     NOT NULL,
  `created_at`      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `agent_chat_documents_conversation_idx` (`conversation_id`),
  KEY `agent_chat_documents_user_idx` (`user_id`),
  CONSTRAINT `fk_agent_chat_documents_conversation` FOREIGN KEY (`conversation_id`)
    REFERENCES `agent_chat_conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agent_chat_documents_user` FOREIGN KEY (`user_id`)
    REFERENCES `agent_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_agent_chat_documents_filename`
    CHECK (CHAR_LENGTH(`filename`) BETWEEN 1 AND 512),
  CONSTRAINT `ck_agent_chat_documents_content`
    CHECK (CHAR_LENGTH(`content`) <= 5000000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- An answer's stream, saved chunk by chunk so a page that reloads follows
-- it again (agent-chat-answer-stream.server.ts).
CREATE TABLE `agent_chat_stream_chunks` (
  `stream_id`       CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `seq`             INT         NOT NULL,
  `conversation_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id`         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `chunk`           LONGTEXT    NOT NULL,
  `created_at`      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`stream_id`, `seq`),
  KEY `agent_chat_stream_chunks_conversation_idx` (`conversation_id`),
  KEY `agent_chat_stream_chunks_user_idx` (`user_id`),
  CONSTRAINT `fk_agent_chat_stream_chunks_conversation` FOREIGN KEY (`conversation_id`)
    REFERENCES `agent_chat_conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agent_chat_stream_chunks_user` FOREIGN KEY (`user_id`)
    REFERENCES `agent_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_agent_chat_stream_chunks_seq` CHECK (`seq` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A message the user sent into a running answer, waiting for its next step
-- (agent-chat-user-steers.server.ts).
CREATE TABLE `agent_chat_steers` (
  `id`              CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `conversation_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id`         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `stream_id`       CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `text`            TEXT        NOT NULL,
  `created_at`      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `agent_chat_steers_conversation_idx` (`conversation_id`, `stream_id`, `created_at`),
  KEY `agent_chat_steers_user_idx` (`user_id`),
  CONSTRAINT `fk_agent_chat_steers_conversation` FOREIGN KEY (`conversation_id`)
    REFERENCES `agent_chat_conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agent_chat_steers_user` FOREIGN KEY (`user_id`)
    REFERENCES `agent_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_agent_chat_steers_text` CHECK (CHAR_LENGTH(`text`) BETWEEN 1 AND 5000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- What the agent remembers about the user across chats
-- (long-term-memory.server.ts).
CREATE TABLE `agent_memories` (
  `id`              CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id`         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `content`         VARCHAR(500) NOT NULL,
  `conversation_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at`      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `agent_memories_user_created_idx` (`user_id`, `created_at`),
  KEY `agent_memories_conversation_idx` (`conversation_id`),
  CONSTRAINT `fk_agent_memories_user` FOREIGN KEY (`user_id`)
    REFERENCES `agent_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agent_memories_conversation` FOREIGN KEY (`conversation_id`)
    REFERENCES `agent_chat_conversations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ck_agent_memories_content` CHECK (CHAR_LENGTH(`content`) BETWEEN 1 AND 500)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Token usage per answer, title and summary (agent-usage.server.ts).
CREATE TABLE `agent_usage` (
  `id`                  CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id`             CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `conversation_id`     CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `kind`                VARCHAR(20)  NOT NULL,
  `model`               VARCHAR(100) NOT NULL,
  `steps`               SMALLINT     NOT NULL DEFAULT 1,
  `input_tokens`        INT          NOT NULL DEFAULT 0,
  `cached_input_tokens` INT          NOT NULL DEFAULT 0,
  `output_tokens`       INT          NOT NULL DEFAULT 0,
  `reasoning_tokens`    INT          NOT NULL DEFAULT 0,
  `created_at`          DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `agent_usage_user_created_idx` (`user_id`, `created_at` DESC),
  KEY `agent_usage_conversation_idx` (`conversation_id`),
  CONSTRAINT `fk_agent_usage_user` FOREIGN KEY (`user_id`)
    REFERENCES `agent_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agent_usage_conversation` FOREIGN KEY (`conversation_id`)
    REFERENCES `agent_chat_conversations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ck_agent_usage_kind` CHECK (`kind` IN ('answer', 'title', 'summary'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Tracking tasks and the monitor (EXAMPLE domain) ----------------------------
--
-- Access model (enforced by the gateway, as the template's grants and
-- policies did):
--   * tracking_tasks: owner only, read and written with the user's session.
--   * task_opportunities, user_notifications, task_scan_runs, task_items:
--     the owner reads them, changes a match's status and marks a
--     notification read; only the monitor (the task worker, service scope)
--     creates them.
--   * task_scanned_items: the monitor's record of which items each task has
--     already scored. Service scope only.

CREATE TABLE `tracking_tasks` (
  `id`                 CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id`            CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  -- The task in one sentence; the system turns it into searches.
  `sentence`           VARCHAR(300)  NOT NULL,
  `details`            VARCHAR(1000) NOT NULL DEFAULT '',
  `location`           VARCHAR(200)  NOT NULL DEFAULT '',
  `budget`             VARCHAR(100)  NOT NULL DEFAULT '',
  -- Where the monitor looks each scan (task-source.ts): {kind, query,
  -- filters?}, at most 10.
  `sources`            JSON          NOT NULL DEFAULT (JSON_ARRAY()),
  `scan_frequency`     VARCHAR(10)   NOT NULL DEFAULT 'hour',
  `alerts`             TINYINT(1)    NOT NULL DEFAULT 1,
  `status`             VARCHAR(20)   NOT NULL DEFAULT 'active',
  `priority`           VARCHAR(20)   NOT NULL DEFAULT 'none',
  `labels`             JSON          NOT NULL DEFAULT (JSON_ARRAY()),
  -- The board's manual order, across all statuses.
  `position`           INT           NOT NULL DEFAULT 0,
  -- Set by the monitor after each scan; the error is cleared by a good scan.
  `last_scanned_at`    DATETIME(6)   NULL,
  `last_scan_error`    VARCHAR(500)  NULL,
  -- Bumped by every saved change, so an edit made from an older copy is
  -- refused instead of undoing a newer one.
  `version`            INT           NOT NULL DEFAULT 0,
  -- The monitor's retry and claim (claim_due_tracking_tasks).
  `scan_failures`      INT           NOT NULL DEFAULT 0,
  `scan_retry_at`      DATETIME(6)   NULL,
  `scan_claimed_until` DATETIME(6)   NULL,
  `created_at`         DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`         DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `tracking_tasks_user_position_idx` (`user_id`, `position`),
  KEY `tracking_tasks_active_scan_idx` (`status`, `last_scanned_at`),
  CONSTRAINT `fk_tracking_tasks_user` FOREIGN KEY (`user_id`)
    REFERENCES `agent_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_tracking_tasks_sentence` CHECK (CHAR_LENGTH(`sentence`) BETWEEN 1 AND 300),
  CONSTRAINT `ck_tracking_tasks_sources` CHECK (
    JSON_TYPE(`sources`) = 'ARRAY' AND JSON_LENGTH(`sources`) <= 10),
  CONSTRAINT `ck_tracking_tasks_scan_frequency`
    CHECK (`scan_frequency` IN ('realtime', '5m', '15m', 'hour', '6h', 'day')),
  CONSTRAINT `ck_tracking_tasks_status`
    CHECK (`status` IN ('suggested', 'active', 'paused', 'finished')),
  CONSTRAINT `ck_tracking_tasks_priority`
    CHECK (`priority` IN ('urgent', 'high', 'medium', 'low', 'none')),
  CONSTRAINT `ck_tracking_tasks_labels` CHECK (
    JSON_TYPE(`labels`) = 'ARRAY' AND JSON_LENGTH(`labels`) <= 20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- An item a source returned for one of the user's tasks, as the source
-- returned it (taskItemSchema), for its opportunity's card.
CREATE TABLE `task_items` (
  `user_id`  CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `source`   VARCHAR(60)  CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `item_id`  VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `snapshot` JSON         NOT NULL,
  `found_at` DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`user_id`, `source`, `item_id`),
  CONSTRAINT `fk_task_items_user` FOREIGN KEY (`user_id`)
    REFERENCES `agent_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_task_items_snapshot` CHECK (JSON_TYPE(`snapshot`) = 'OBJECT')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Jev's raw answers (fit level, side, place, excluded, source) are kept
-- beside each score, so the scoring thresholds can be tuned on real scans
-- (task-post-scoring.ts).
CREATE TABLE `task_scanned_items` (
  `task_id`     CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `source`      VARCHAR(60)  CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `item_id`     VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `score`       SMALLINT     NOT NULL,
  `jev_answers` JSON         NULL,
  `scanned_at`  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`task_id`, `source`, `item_id`),
  CONSTRAINT `fk_task_scanned_items_task` FOREIGN KEY (`task_id`)
    REFERENCES `tracking_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_task_scanned_items_score` CHECK (`score` BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- An item (or one of its replies) the AI judged a match for a task.
-- comment_id is '' when the item itself matched.
CREATE TABLE `task_opportunities` (
  `id`         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id`    CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `task_id`    CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `source`     VARCHAR(60)  CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `item_id`    VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `comment_id` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '',
  `score`      SMALLINT     NOT NULL,
  -- What the person wants, and why it fits the task, in the user's language.
  `intent`     VARCHAR(300) NOT NULL,
  `reason`     VARCHAR(500) NOT NULL,
  `status`     VARCHAR(20)  NOT NULL DEFAULT 'new',
  `posted_at`  DATETIME(6)  NULL,
  `found_at`   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  -- Also serves lookups by task_id.
  UNIQUE KEY `uq_task_opportunities_item` (`task_id`, `source`, `item_id`, `comment_id`),
  KEY `task_opportunities_user_found_idx` (`user_id`, `found_at` DESC),
  KEY `task_opportunities_item_idx` (`user_id`, `source`, `item_id`),
  CONSTRAINT `fk_task_opportunities_task` FOREIGN KEY (`task_id`)
    REFERENCES `tracking_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_task_opportunities_user` FOREIGN KEY (`user_id`)
    REFERENCES `agent_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_task_opportunities_item` FOREIGN KEY (`user_id`, `source`, `item_id`)
    REFERENCES `task_items` (`user_id`, `source`, `item_id`) ON DELETE CASCADE,
  CONSTRAINT `ck_task_opportunities_score` CHECK (`score` BETWEEN 0 AND 100),
  CONSTRAINT `ck_task_opportunities_status`
    CHECK (`status` IN ('new', 'in_progress', 'replied', 'closed', 'irrelevant'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `user_notifications` (
  `id`             CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id`        CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `kind`           VARCHAR(20)  NOT NULL,
  `title`          VARCHAR(200) NOT NULL,
  `body`           VARCHAR(500) NOT NULL DEFAULT '',
  `task_id`        CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `opportunity_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `read_at`        DATETIME(6)  NULL,
  `created_at`     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `user_notifications_user_created_idx` (`user_id`, `created_at` DESC),
  KEY `user_notifications_task_idx` (`task_id`),
  KEY `user_notifications_opportunity_idx` (`opportunity_id`),
  KEY `user_notifications_unread_idx` (`user_id`, `read_at`),
  CONSTRAINT `fk_user_notifications_user` FOREIGN KEY (`user_id`)
    REFERENCES `agent_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_notifications_task` FOREIGN KEY (`task_id`)
    REFERENCES `tracking_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_notifications_opportunity` FOREIGN KEY (`opportunity_id`)
    REFERENCES `task_opportunities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_user_notifications_kind` CHECK (`kind` IN ('opportunity', 'task-error'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Every scan is a row: how it ended, what it read and found.
CREATE TABLE `task_scan_runs` (
  `id`              CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `task_id`         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id`         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `status`          VARCHAR(20)  NOT NULL DEFAULT 'running',
  `sources_scanned` INT          NOT NULL DEFAULT 0,
  `items_scored`    INT          NOT NULL DEFAULT 0,
  `matches`         INT          NOT NULL DEFAULT 0,
  `error`           VARCHAR(500) NULL,
  `started_at`      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `finished_at`     DATETIME(6)  NULL,
  PRIMARY KEY (`id`),
  KEY `task_scan_runs_task_started_idx` (`task_id`, `started_at` DESC),
  KEY `task_scan_runs_user_idx` (`user_id`),
  CONSTRAINT `fk_task_scan_runs_task` FOREIGN KEY (`task_id`)
    REFERENCES `tracking_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_task_scan_runs_user` FOREIGN KEY (`user_id`)
    REFERENCES `agent_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_task_scan_runs_status`
    CHECK (`status` IN ('running', 'succeeded', 'failed', 'skipped'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
