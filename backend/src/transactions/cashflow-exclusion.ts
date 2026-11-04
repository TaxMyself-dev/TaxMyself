/** Stable catalog identity; never infer exclusion from a merchant/display name. */
export const DIRECT_CARD_SYSTEM_KEY = 'DIRECT_CARD_BANK_PAYMENT';

/** Correlated predicate shared by cache, durable archive, charts and approval guards.
 * Missing source/category provenance conservatively stays visible.
 * Aliases are internal constants, never request input.
 */
export function cashflowExcludedSql(alias: 'c' | 'cache' | 'slim'): string {
  const slimJoin = alias === 'slim' ? '' : `LEFT JOIN slim_transactions cf_slim
    ON cf_slim.userId = ${alias}.userId AND cf_slim.externalTransactionId = ${alias}.externalTransactionId`;
  const categoryId = alias === 'slim' ? 'slim.sub_category_id'
    : `CASE WHEN cf_slim.id IS NOT NULL THEN cf_slim.sub_category_id ELSE ${alias}.sub_category_id END`;
  return `EXISTS (
    SELECT 1 FROM \`user\` cf_user
    INNER JOIN source cf_source ON cf_source.userId = cf_user.firebaseId
    ${slimJoin}
    INNER JOIN sub_category cf_sub ON cf_sub.id = ${categoryId}
    WHERE cf_user.firebaseId = ${alias}.userId
      AND cf_user.excludeDirectCardBankTransactionsFromCashflow = 1
      AND cf_source.id = ${alias}.sourceRecordId
      AND cf_source.sourceType = 'BANK_ACCOUNT'
      AND cf_sub.ownerType = 'SYSTEM'
      AND cf_sub.systemKey = '${DIRECT_CARD_SYSTEM_KEY}'
  )`;
}
