// Explicit operator-run KT-105 schema migration for keepintax-dev only.
// Uses raw mysql2 and never imports or boots Nest/TypeORM.
require('dotenv').config();

const mysql = require('mysql2/promise');

const EXPECTED_DATABASE = 'keepintax-dev';
const MODE = process.env.KT105_MODE || 'review';

function assertDevTarget() {
  if (process.env.DB_DATABASE !== EXPECTED_DATABASE) {
    throw new Error(
      `REFUSED: DB_DATABASE must be exactly ${EXPECTED_DATABASE}; received ${JSON.stringify(
        process.env.DB_DATABASE,
      )}`,
    );
  }
  if (!['review', 'apply'].includes(MODE)) {
    throw new Error('REFUSED: KT105_MODE must be review or apply');
  }
}

async function column(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  return rows[0] || null;
}

async function ensureColumn(connection, tableName, columnName, definition) {
  if (await column(connection, tableName, columnName)) return false;
  if (MODE === 'apply') {
    await connection.query(
      `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`,
    );
  }
  return true;
}

async function ensureEnumValue(connection, tableName, columnName, value) {
  const current = await column(connection, tableName, columnName);
  if (!current || !/^enum\(/i.test(current.COLUMN_TYPE)) {
    throw new Error(`Expected ${tableName}.${columnName} to be an enum`);
  }
  const escapedValue = `'${value.replaceAll("'", "''")}'`;
  if (current.COLUMN_TYPE.includes(escapedValue)) return false;
  const nextType = `${current.COLUMN_TYPE.slice(0, -1)},${escapedValue})`;
  if (MODE === 'apply') {
    await connection.query(
      `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ${nextType} NOT NULL`,
    );
  }
  return true;
}

async function inspect(connection) {
  const [profileTable] = await connection.query(
    `SELECT COUNT(*) AS count
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'billing_payer_profile'`,
  );
  return {
    payerProfileTable: Number(profileTable[0].count) === 1,
    providerDescription: Boolean(
      await column(connection, 'billing_attempt', 'provider_description'),
    ),
    payerProfileVersion: Boolean(
      await column(connection, 'billing_attempt', 'payer_profile_version'),
    ),
    payerProfileSnapshot: Boolean(
      await column(connection, 'billing_attempt', 'payer_profile_snapshot'),
    ),
    obligationKind: (await column(connection, 'billing_obligation', 'kind'))
      ?.COLUMN_TYPE,
    attemptTrigger: (await column(connection, 'billing_attempt', 'trigger'))
      ?.COLUMN_TYPE,
    eventType: (await column(connection, 'billing_event', 'event_type'))
      ?.COLUMN_TYPE,
  };
}

async function main() {
  assertDevTarget();
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectTimeout: 10000,
  });

  try {
    const [identity] = await connection.query(
      'SELECT DATABASE() AS db, @@hostname AS host',
    );
    if (identity[0].db !== EXPECTED_DATABASE) {
      throw new Error(
        `REFUSED: actual database is ${JSON.stringify(identity[0].db)}`,
      );
    }

    const before = await inspect(connection);
    console.log(
      JSON.stringify(
        { mode: MODE, database: identity[0].db, host: identity[0].host, before },
        null,
        2,
      ),
    );

    if (MODE === 'apply') {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS \`billing_payer_profile\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`subscription_id\` int NOT NULL,
          \`full_name\` varchar(255) NULL,
          \`identity_number\` varchar(32) NULL,
          \`email\` varchar(255) NULL,
          \`phone\` varchar(32) NULL,
          \`business_number\` varchar(32) NULL,
          \`version\` int NOT NULL DEFAULT 1,
          \`verified_at\` datetime NULL,
          \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
            ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`ux_billing_payer_profile_subscription\` (\`subscription_id\`),
          CONSTRAINT \`fk_billing_payer_profile_subscription\`
            FOREIGN KEY (\`subscription_id\`) REFERENCES \`subscription\` (\`id\`)
            ON DELETE RESTRICT ON UPDATE CASCADE
        ) ENGINE=InnoDB
      `);
    }

    await ensureColumn(
      connection,
      'billing_attempt',
      'provider_description',
      'varchar(500) NULL AFTER `provider_response_code`',
    );
    await ensureColumn(
      connection,
      'billing_attempt',
      'payer_profile_version',
      'int NULL AFTER `provider_description`',
    );
    await ensureColumn(
      connection,
      'billing_attempt',
      'payer_profile_snapshot',
      'json NULL AFTER `payer_profile_version`',
    );
    await ensureEnumValue(
      connection,
      'billing_obligation',
      'kind',
      'MANUAL_ONE_OFF',
    );
    await ensureEnumValue(
      connection,
      'billing_attempt',
      'trigger',
      'MANUAL_ONE_OFF',
    );
    await ensureEnumValue(
      connection,
      'billing_event',
      'event_type',
      'MANUAL_CHARGE_REQUESTED',
    );
    await ensureEnumValue(
      connection,
      'billing_event',
      'event_type',
      'OVERDUE_DEBT_CREATED',
    );

    const after = await inspect(connection);
    console.log(JSON.stringify({ mode: MODE, after }, null, 2));

    if (MODE === 'apply') {
      const complete =
        after.payerProfileTable &&
        after.providerDescription &&
        after.payerProfileVersion &&
        after.payerProfileSnapshot &&
        after.obligationKind?.includes("'MANUAL_ONE_OFF'") &&
        after.attemptTrigger?.includes("'MANUAL_ONE_OFF'") &&
        after.eventType?.includes("'MANUAL_CHARGE_REQUESTED'") &&
        after.eventType?.includes("'OVERDUE_DEBT_CREATED'");
      if (!complete) throw new Error('KT-105 schema verification failed');
      console.log('KT-105 keepintax-dev schema verified successfully');
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`KT-105 migration failed: ${error.code || error.message}`);
  process.exitCode = 1;
});
