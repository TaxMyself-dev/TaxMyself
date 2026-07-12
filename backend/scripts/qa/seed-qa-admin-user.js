// QA-access setup: insert a NEW `user` row into keepintax_prodcopy for
// Elazar's DEV Firebase identity, so the copy is reachable without re-linking
// any of the 9 real client businesses. Raw mysql2, bypasses NestJS/TypeORM
// entirely (same safe pattern used throughout the 2026-07-12 incident recovery)
// so this can never trigger synchronize.
//
// Rehearsal-copy QA convenience ONLY — never add this row to cutover.sql.
// Re-run after every re-import of keepintax_prodcopy (see docs/redesign/qa-access.md).
// Idempotent: no-ops if the row already exists.
//
// MODE=review (default): print what would be inserted, no write.
// MODE=apply: perform the INSERT.
require('dotenv').config();
const mysql = require('mysql2/promise');

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';

const NEW_FIREBASE_ID = 'LiVlGGxaC0hefnmw5LinOZvbjvc2';
const NEW_EMAIL = 'harelazar@gmail.com';

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: 'keepintax_prodcopy',
  });

  const [existing] = await conn.query('SELECT `index` FROM user WHERE firebaseId = ?', [NEW_FIREBASE_ID]);
  if (existing.length > 0) {
    console.log(`[qa-admin-user] Row already exists (index=${existing[0].index}) — nothing to do.`);
    await conn.end();
    return;
  }

  const row = {
    fName: 'Elazar (QA-dev)',
    lName: 'Harel',
    id: null,
    dateOfBirth: null,
    phone: '0500000000',
    email: NEW_EMAIL,
    city: null,
    employmentStatus: null,
    familyStatus: null,
    businessStatus: 'NO_BUSINESS',
    firebaseId: NEW_FIREBASE_ID,
    finsiteId: null,
    spouseFName: null,
    spouseLName: null,
    spouseId: null,
    spouseDateOfBirth: null,
    spousePhone: null,
    spouseEmploymentStatus: null,
    role: 'ADMIN',
    createdAt: new Date().toISOString().slice(0, 10),
    userCount: 0,
    gender: null,
    spouseGender: null,
    spouseEmail: null,
    address: null,
    hasOpenBanking: 0,
    lastLoginAt: null,
    previousLoginAt: null,
    drive_folder_id: null,
    isCompany: 0,
  };

  console.log(`[qa-admin-user] MODE=${MODE} against keepintax_prodcopy.`);
  console.log('[qa-admin-user] Row to insert:', JSON.stringify(row, null, 2));

  if (MODE === 'review') {
    console.log('\n(dry run — pass MODE=apply to write)');
    await conn.end();
    return;
  }

  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map(c => row[c]);
  const [result] = await conn.query(
    `INSERT INTO user (${columns.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`,
    values,
  );
  console.log(`[qa-admin-user] Inserted user.index=${result.insertId}`);

  await conn.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
