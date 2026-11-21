-- ============================================================================
-- KT-089: scope the agent's data to (actor, data owner) and its
-- conversations to a business. MySQL 8. Runs after
-- 2026-10-22_agent_harness_schema.sql, which is applied and stays unchanged.
--
-- Why: until now the agent's user was the Firebase account acting
-- (agent_users.firebase_id). An accountant acting for client A and then for
-- client B was one agent user, so the conversations, memory and earlier tool
-- results gathered about A were reachable while acting for B.
--
-- What changes:
--   * agent_users gains data_owner_firebase_id: the agent's user is now the
--     pair (the person acting, the data owner they act on), as
--     FirebaseAuthGuard verified it (actorFirebaseId, firebaseId). Every
--     other agent table names agent_users.id, so conversations, messages,
--     stream chunks, steers, documents, memory, settings, usage, tasks and
--     notifications all follow the pair with no change of their own. The
--     unique key moves from (firebase_id) to (firebase_id,
--     data_owner_firebase_id).
--   * agent_chat_conversations gains business_number: the business the
--     conversation started in (the request's business, verified by the
--     Nest backend as one of the data owner's). The MySQL gateway serves a
--     conversation and its content only to requests in that business
--     (backend/agent/backend/shared/mysql, AgentTable.business).
--
-- Legacy rows (decision: quarantine, never reassign):
--   * Existing agent_users rows keep data_owner_firebase_id NULL. Their data
--     may have been created while acting for a client, and the old schema
--     did not record which, so no owner is guessed. The agent looks users up
--     by (firebase_id, data_owner_firebase_id = ?), which never matches NULL:
--     these rows and everything under them stay in the database, unreachable
--     through the agent, until someone decides otherwise. MySQL allows any
--     number of NULLs under the new unique key, so the legacy row never
--     blocks the new (actor, owner) row of the same account.
--   * Existing conversations keep business_number NULL; they belong to a
--     legacy (unreachable) agent user anyway.
--   * To inspect them:  SELECT * FROM agent_users WHERE data_owner_firebase_id IS NULL;
--     To delete them (irreversible, cascades to all their agent data) only
--     after an explicit decision:
--       DELETE FROM agent_users WHERE data_owner_firebase_id IS NULL;
--
-- Production: the agent's tables are not in production yet; apply both
-- scripts there in order at release, by hand, with the team's go-ahead.
-- Every statement is DDL (not transactional); run it once per database.
-- ============================================================================

ALTER TABLE `agent_users`
  ADD COLUMN `data_owner_firebase_id` VARCHAR(128)
    CHARACTER SET ascii COLLATE ascii_bin NULL AFTER `firebase_id`,
  ADD UNIQUE KEY `uq_agent_users_actor_owner` (`firebase_id`, `data_owner_firebase_id`),
  DROP INDEX `uq_agent_users_firebase_id`;

ALTER TABLE `agent_chat_conversations`
  ADD COLUMN `business_number` VARCHAR(32)
    CHARACTER SET ascii COLLATE ascii_bin NULL AFTER `user_id`,
  ADD KEY `agent_chat_conversations_user_business_idx`
    (`user_id`, `business_number`, `created_at` DESC);
