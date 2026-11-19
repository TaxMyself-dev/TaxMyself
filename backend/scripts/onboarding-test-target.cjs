'use strict';
// Shared, fail-closed configuration for the explicitly approved development target.
function developmentOptions(env = process.env) {
  if (
    env.ONBOARDING_APPROVED_DATABASE !== 'keepintax-dev' ||
    env.DB_DATABASE !== 'keepintax-dev'
  ) {
    throw new Error('ONBOARDING_TARGET_NOT_APPROVED');
  }
  const port = Number(env.DB_PORT || 3306);
  if (
    !env.DB_HOST ||
    !env.DB_USERNAME ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error('ONBOARDING_TARGET_CONFIG_INVALID');
  }
  return {
    host: env.DB_HOST,
    port,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: 'keepintax-dev',
    timezone: 'Z',
    connectTimeout: 10000,
  };
}
async function assertDevelopmentDatabase(db) {
  const rows = await db.query('SELECT DATABASE() AS selected_database');
  if (rows[0]?.selected_database !== 'keepintax-dev')
    throw new Error('ONBOARDING_CONNECTED_DATABASE_MISMATCH');
}
const TABLES = [
  'agent_onboarding_profiles',
  'agent_onboarding_proposals',
  'agent_onboarding_changes',
  'agent_onboarding_facts',
  'agent_onboarding_story_versions',
];
async function cleanupOwners(db, owners) {
  if (
    !owners.length ||
    owners.some(
      (owner) =>
        !/^onboarding-qa-[a-f0-9-]+-(alice|bob|seed|http|live)$/.test(owner),
    )
  ) {
    throw new Error('ONBOARDING_CLEANUP_SCOPE_INVALID');
  }
  const marks = owners.map(() => '?').join(',');
  // No DROP, TRUNCATE, LIKE-based deletion or real application user rows.
  await db.transaction(async (manager) => {
    for (const table of [
      'agent_onboarding_story_versions',
      'agent_onboarding_facts',
    ]) {
      await manager.query(
        `DELETE FROM ${table} WHERE profile_id IN (SELECT id FROM agent_onboarding_profiles WHERE owner_uid IN (${marks}))`,
        owners,
      );
    }
    for (const table of [
      'agent_onboarding_proposals',
      'agent_onboarding_changes',
      'agent_onboarding_profiles',
    ]) {
      await manager.query(
        `DELETE FROM ${table} WHERE owner_uid IN (${marks})`,
        owners,
      );
    }
  });
  let remaining = 0;
  for (const table of [
    'agent_onboarding_proposals',
    'agent_onboarding_changes',
    'agent_onboarding_profiles',
  ]) {
    const rows = await db.query(
      `SELECT COUNT(*) AS n FROM ${table} WHERE owner_uid IN (${marks})`,
      owners,
    );
    remaining += Number(rows[0].n);
  }
  if (remaining !== 0) throw new Error('ONBOARDING_CLEANUP_INCOMPLETE');
}
module.exports = {
  developmentOptions,
  assertDevelopmentDatabase,
  cleanupOwners,
  TABLES,
};
