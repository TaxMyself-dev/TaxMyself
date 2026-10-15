require('dotenv').config();
const mysql = require('mysql2/promise');

const tables = ['shaam_connection', 'shaam_oauth_state', 'uniform_file_submission'];

async function main() {
  const database = process.env.DB_DATABASE || '';
  if (!database || /prod/i.test(database)) {
    throw new Error(`Refusing SHAAM migration for DB_DATABASE=${JSON.stringify(database)}`);
  }
  const apply = process.argv.includes('--apply');
  const restoreLegacy = process.argv.includes('--restore-legacy-columns');
  const dropLegacy = process.argv.includes('--drop-legacy-columns');
  if (restoreLegacy && dropLegacy) {
    throw new Error('Choose either --restore-legacy-columns or --drop-legacy-columns');
  }
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database,
  });
  try {
    const [before] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?) ORDER BY TABLE_NAME`,
      tables,
    );
    const [legacy] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='business'
       AND COLUMN_NAME IN ('shaamAccessToken','shaamAccessTokenExp','shaamRefreshToken')`,
    );
    const mode = restoreLegacy ? 'restore-legacy-columns' : apply ? 'apply' : 'inspect';
    console.log(JSON.stringify({ database, mode, existingTables: before.map((r) => r.TABLE_NAME), legacyColumns: legacy.map((r) => r.COLUMN_NAME) }));
    if (restoreLegacy) {
      const definitions = {
        shaamAccessToken: 'varchar(255) NULL DEFAULT NULL',
        shaamAccessTokenExp: 'varchar(255) NULL DEFAULT NULL',
        shaamRefreshToken: 'varchar(255) NULL DEFAULT NULL',
      };
      for (const [column, definition] of Object.entries(definitions)) {
        if (!legacy.some((row) => row.COLUMN_NAME === column)) {
          await connection.query(`ALTER TABLE business ADD COLUMN \`${column}\` ${definition}`);
        }
      }
      const [restored] = await connection.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='business'
         AND COLUMN_NAME IN ('shaamAccessToken','shaamAccessTokenExp','shaamRefreshToken')`,
      );
      if (restored.length !== 3) throw new Error('Legacy SHAAM compatibility-column restore failed');
      console.log(JSON.stringify({ restored: true, legacyColumns: restored.map((row) => row.COLUMN_NAME).sort() }));
      return;
    }
    if (!apply) return;

    await connection.query(`CREATE TABLE IF NOT EXISTS shaam_connection (
      id int NOT NULL AUTO_INCREMENT, business_id int NOT NULL,
      product enum('INVOICE_ALLOCATION','UNIFORM_FILE') NOT NULL,
      environment enum('tsandbox','production') NOT NULL,
      access_token text NULL, refresh_token text NULL, expires_at datetime NULL, scopes text NULL,
      status enum('ACTIVE','REAUTH_REQUIRED','REVOKED') NOT NULL DEFAULT 'ACTIVE',
      connected_by_firebase_id varchar(255) NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id), UNIQUE KEY ux_shaam_connection_business_product_env (business_id,product,environment),
      KEY ix_shaam_connection_status_expiry (status,expires_at),
      CONSTRAINT fk_shaam_connection_business FOREIGN KEY (business_id) REFERENCES business(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE IF NOT EXISTS shaam_oauth_state (
      id int NOT NULL AUTO_INCREMENT, state_hash char(64) NOT NULL, business_id int NOT NULL,
      actor_firebase_id varchar(255) NOT NULL, product enum('INVOICE_ALLOCATION','UNIFORM_FILE') NOT NULL,
      environment enum('tsandbox','production') NOT NULL, expires_at datetime NOT NULL, consumed_at datetime NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (id),
      UNIQUE KEY ux_shaam_oauth_state_hash (state_hash), KEY ix_shaam_oauth_state_expiry (expires_at),
      CONSTRAINT fk_shaam_oauth_state_business FOREIGN KEY (business_id) REFERENCES business(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE IF NOT EXISTS uniform_file_submission (
      id int NOT NULL AUTO_INCREMENT, business_id int NOT NULL, business_number_snapshot varchar(20) NOT NULL,
      actor_firebase_id varchar(255) NOT NULL, environment enum('tsandbox','production') NOT NULL,
      period_start date NOT NULL, period_end date NOT NULL, representor_company_id varchar(20) NULL,
      state enum('GENERATED','AUTH_REQUIRED','LINKS_RESERVED','INI_UPLOADED','PAIR_UPLOADED','PROCESSING','APPROVED','REJECTED','RETRYABLE_FAILURE','UNKNOWN_OUTCOME') NOT NULL DEFAULT 'GENERATED',
      ini_status enum('UPLOADED','APPROVED','REJECTED') NULL, bkm_status enum('UPLOADED','APPROVED','REJECTED') NULL,
      ini_sha256 char(64) NOT NULL, bkm_sha256 char(64) NOT NULL,
      ini_byte_length bigint unsigned NOT NULL, bkm_byte_length bigint unsigned NOT NULL,
      shaam_unique_id varchar(255) NULL, ini_file_name varchar(255) NULL, bkm_file_name varchar(255) NULL,
      ini_file_unique_id varchar(255) NULL, bkm_file_unique_id varchar(255) NULL,
      error_category varchar(64) NULL, error_code varchar(128) NULL, error_message varchar(1000) NULL,
      retry_count int unsigned NOT NULL DEFAULT 0, generated_at datetime NOT NULL, uploaded_at datetime NULL,
      last_polled_at datetime NULL, completed_at datetime NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id),
      UNIQUE KEY ux_uniform_submission_artifact (environment,business_id,period_start,period_end,ini_sha256,bkm_sha256),
      KEY ix_uniform_submission_business_state (business_id,state,created_at),
      CONSTRAINT fk_uniform_submission_business FOREIGN KEY (business_id) REFERENCES business(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB`);

    if (dropLegacy) {
      for (const column of ['shaamAccessToken', 'shaamAccessTokenExp', 'shaamRefreshToken']) {
        if (legacy.some((row) => row.COLUMN_NAME === column)) {
          await connection.query(`ALTER TABLE business DROP COLUMN \`${column}\``);
        }
      }
    }
    const [after] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?) ORDER BY TABLE_NAME`,
      tables,
    );
    const [remaining] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='business'
       AND COLUMN_NAME IN ('shaamAccessToken','shaamAccessTokenExp','shaamRefreshToken')`,
    );
    if (after.length !== 3 || (dropLegacy && remaining.length !== 0)) {
      throw new Error('SHAAM schema verification failed');
    }
    console.log(JSON.stringify({ applied: true, tables: after.map((r) => r.TABLE_NAME), legacyColumnsRemaining: remaining.length }));
  } finally {
    await connection.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
