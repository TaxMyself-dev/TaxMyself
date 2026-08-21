// Adds the reviewed SYSTEM operational card 61400 and its paired SYSTEM
// sub-category. MODE=review is read-only; MODE=apply CONFIRM=yes writes both
// rows atomically. Dev-only: production receives the same rows from the flat
// create-if-missing seed documented in cutover.sql Section 10.
require('dotenv').config();
const mysql = require('mysql2/promise');

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';
const CONFIRMED = process.env.CONFIRM === 'yes';
const CODE = '61400';
const NAME = 'ציוד אלקטרוני מקצועי – פחת 15%';
const CATEGORY_NAME = 'רכוש קבוע (פחת)';

async function main() {
  if (process.env.DB_DATABASE !== 'keepintax-dev') {
    throw new Error(`Refusing to run against DB_DATABASE=${process.env.DB_DATABASE}`);
  }
  if (MODE === 'apply' && !CONFIRMED) {
    throw new Error('MODE=apply requires CONFIRM=yes');
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  try {
    const [[source]] = await conn.query(
      `SELECT * FROM booking_account
       WHERE chartOwnerKey='SYSTEM' AND code='61310' AND isActive=1`,
    );
    if (!source) throw new Error('Source card 61310 was not found');

    const [[category]] = await conn.query(
      `SELECT id FROM category
       WHERE chartOwnerKey='SYSTEM' AND name=? AND type='expense' AND isActive=1`,
      [CATEGORY_NAME],
    );
    if (!category) throw new Error(`SYSTEM category "${CATEGORY_NAME}" was not found`);

    const [[account]] = await conn.query(
      `SELECT id, code, name, reductionPercent, category6111,
              subCategory6111, formPart, visibleBusinessTypes
       FROM booking_account
       WHERE chartOwnerKey='SYSTEM' AND code=?`,
      [CODE],
    );
    const [[subCategory]] = await conn.query(
      `SELECT id, name, accountId FROM sub_category
       WHERE chartOwnerKey='SYSTEM' AND categoryId=? AND name=?`,
      [category.id, NAME],
    );

    console.log(JSON.stringify({
      database: process.env.DB_DATABASE,
      mode: MODE,
      source: { id: source.id, code: source.code, sectionId: source.sectionId },
      category,
      existingAccount: account ?? null,
      existingSubCategory: subCategory ?? null,
      wouldInsertAccount: !account,
      wouldInsertSubCategory: !subCategory,
    }, null, 2));

    if (MODE === 'review') return;
    if (account || subCategory) {
      if (account && subCategory && Number(subCategory.accountId) === Number(account.id)) {
        const metadataFields = ['category6111', 'subCategory6111', 'formPart', 'visibleBusinessTypes'];
        const conflicts = metadataFields.filter((field) => account[field] && account[field] !== source[field]);
        if (conflicts.length) {
          throw new Error(`Existing card has conflicting metadata: ${conflicts.join(', ')}`);
        }
        const missing = metadataFields.filter((field) => !account[field]);
        if (!missing.length) {
          console.log('Already applied consistently; no write needed.');
          return;
        }
        await conn.query(
          `UPDATE booking_account
           SET category6111=?, subCategory6111=?, formPart=?, visibleBusinessTypes=?
           WHERE id=?`,
          [source.category6111, source.subCategory6111, source.formPart, source.visibleBusinessTypes, account.id],
        );
        console.log(JSON.stringify({ updatedAccountId: account.id, backfilledFields: missing }, null, 2));
        return;
      }
      throw new Error('Partial/colliding state found; refusing to write');
    }

    await conn.beginTransaction();
    const [accountResult] = await conn.query(
      `INSERT INTO booking_account
        (code, name, type, pnlCategory, displayOrder, sectionId, code6111,
         category6111, subCategory6111, formPart, vatPercent, taxPercent,
         reductionPercent, isEquipment, recognitionType, reportScope,
         ownerType, chartOwnerKey, accountantId, userId, businessNumber,
         visibilityScope, isActive, visibleBusinessTypes)
       SELECT ?, ?, type, pnlCategory, displayOrder, sectionId, code6111,
         category6111, subCategory6111, formPart, vatPercent, 0,
         15, 1, recognitionType, reportScope, ownerType, chartOwnerKey,
         accountantId, userId, businessNumber, visibilityScope, 1,
         visibleBusinessTypes
       FROM booking_account WHERE id=?`,
      [CODE, NAME, source.id],
    );
    const accountId = accountResult.insertId;

    const [[sourceSubCategory]] = await conn.query(
      `SELECT * FROM sub_category
       WHERE chartOwnerKey='SYSTEM' AND categoryId=? AND name='מחשב' AND isActive=1`,
      [category.id],
    );
    if (!sourceSubCategory) throw new Error('Source sub-category "מחשב" was not found');

    const [subResult] = await conn.query(
      `INSERT INTO sub_category
        (categoryId, name, isPrivate, accountId, necessity, ownerType,
         chartOwnerKey, accountantId, userId, businessNumber, visibilityScope,
         approvalStatus, approvedByUserId, approvedAt, rejectedByUserId,
         rejectedAt, rejectionReason, isDefault, isActive, createdByUserId,
         createdAt, updatedAt)
       SELECT categoryId, ?, 0, ?, necessity, ownerType, chartOwnerKey,
         accountantId, userId, businessNumber, visibilityScope,
         approvalStatus, approvedByUserId, approvedAt, rejectedByUserId,
         rejectedAt, rejectionReason, 1, 1, createdByUserId, NOW(), NOW()
       FROM sub_category WHERE id=?`,
      [NAME, accountId, sourceSubCategory.id],
    );

    await conn.commit();
    console.log(JSON.stringify({ insertedAccountId: accountId, insertedSubCategoryId: subResult.insertId }, null, 2));
  } catch (error) {
    try { await conn.rollback(); } catch {}
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
