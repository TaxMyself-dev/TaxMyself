// EXPENSES_APPROVE delegation-scope backfill (2026-08-17)
//
// Context: approval authority over a client's pending expenses in the
// report-review queue was accidentally gated on DOCUMENTS_WRITE, which is
// NOT granted on view-only delegations (DelegationService.
// grantViewPermissionByEmail, and legacy NULL-scope invite rows). A client
// who granted only "view" access to their accountant left BOTH sides unable
// to ever confirm a classified transaction into a real Expense: the client
// is deliberately redirected away from self-approving once represented by
// an accountant (ReportReviewService.previewCheck), and the accountant was
// separately blocked by FirebaseAuthGuard's write-scope check on
// POST /reports/me/preview and the approve-* endpoints.
//
// Fixed at the code level by introducing a dedicated EXPENSES_APPROVE scope
// (DelegationScope, delegation.entity.ts) that is now granted automatically
// on every delegation-creation path, regardless of the client's chosen
// document permissions — it is not user-configurable (see the doc comment
// on DelegationScope). This script backfills that new scope onto every
// EXISTING ACTIVE delegation row: already-full DOCUMENTS_WRITE accountants
// keep (gain, retroactively) approval capability, and view-only/legacy-NULL
// rows gain it per the new always-on rule. REVOKED rows are left untouched —
// they grant no access regardless of scopes.
//
// Safe to re-run: only touches rows that don't already carry the scope.
//
// MODE=review (default): computes the exact per-row diff inside a
//   transaction, ALWAYS rolls back — writes nothing.
// MODE=apply CONFIRM=yes: applies the same UPDATEs, verifies every ACTIVE
//   row now carries EXPENSES_APPROVE, commits if so (else rolls back and
//   exits non-zero).
//
// Runs against whatever DB_DATABASE/.env currently points at. Review this
// against dev first; running it against production is a separate, explicit
// decision at cutover (no production DB credentials are configured in this
// environment).
//
//   node scripts/migrations/2026-08-17_add-expenses-approve-scope-to-delegations.js
//   MODE=apply CONFIRM=yes node scripts/migrations/2026-08-17_add-expenses-approve-scope-to-delegations.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';
const SCOPE = 'EXPENSES_APPROVE';

async function main() {
  if (MODE === 'apply' && process.env.CONFIRM !== 'yes') {
    throw new Error('MODE=apply requires CONFIRM=yes — refusing to write without explicit confirmation.');
  }
  console.log(`[expenses-approve-scope-backfill] MODE=${MODE} target database: ${process.env.DB_DATABASE}`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  await conn.beginTransaction();
  try {
    const [rows] = await conn.query(
      `SELECT id, userId, agentId, scopes FROM delegation WHERE status = 'ACTIVE' FOR UPDATE`,
    );

    const targets = rows
      .map((r) => {
        const current = (r.scopes ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (current.includes(SCOPE)) return null; // already has it — skip, re-run-safe
        return {
          id: r.id,
          userId: r.userId,
          agentId: r.agentId,
          before: r.scopes,
          after: [...current, SCOPE].join(','),
        };
      })
      .filter(Boolean);

    console.log(
      `[expenses-approve-scope-backfill] ${rows.length} ACTIVE delegation row(s) total; ${targets.length} need the update.`,
    );

    const UPDATE_SQL = `UPDATE delegation SET scopes = ? WHERE id = ?`;
    for (const t of targets) {
      // conn.format() renders the exact SQL mysql2 would send with the
      // placeholders substituted — printed for auditability. The actual
      // query() call below still goes out parameterized (safe against
      // injection); this is a read-only, execution-equivalent render of it.
      console.log(`[expenses-approve-scope-backfill] SQL: ${conn.format(UPDATE_SQL, [t.after, t.id])}`);
      await conn.query(UPDATE_SQL, [t.after, t.id]);
    }

    if (MODE === 'review') {
      await conn.rollback();
      console.table(
        targets.map((t) => ({
          id: t.id,
          userId: t.userId.length >= 8 ? t.userId.slice(0, 8) + '...' : t.userId,
          agentId: t.agentId.length >= 8 ? t.agentId.slice(0, 8) + '...' : t.agentId,
          before: t.before ?? '(null)',
          after: t.after,
        })),
      );
      console.log('\n(dry run — pass MODE=apply CONFIRM=yes to write)');
      await conn.end();
      return;
    }

    // Guard on the FINAL state, not the delta — safe to re-run as a partial
    // repair too. What must always be true after commit: every ACTIVE row
    // carries EXPENSES_APPROVE.
    const [[{ n: missing }]] = await conn.query(
      `SELECT COUNT(*) n FROM delegation WHERE status = 'ACTIVE' AND (scopes IS NULL OR FIND_IN_SET(?, scopes) = 0)`,
      [SCOPE],
    );
    if (Number(missing) !== 0) {
      await conn.rollback();
      console.error(
        `[expenses-approve-scope-backfill] Refusing to commit: ${missing} ACTIVE row(s) still missing ${SCOPE} after the update — rolled back.`,
      );
      await conn.end();
      process.exit(1);
    }

    console.log(
      `[expenses-approve-scope-backfill] Updated ${targets.length} row(s); every ACTIVE delegation now carries ${SCOPE} — committing.`,
    );
    await conn.commit();
    console.log('[expenses-approve-scope-backfill] Committed.');
  } catch (err) {
    await conn.rollback();
    console.error('[expenses-approve-scope-backfill] Error — transaction rolled back.');
    await conn.end();
    throw err;
  }

  const [verify] = await conn.query(
    `SELECT COUNT(*) n FROM delegation WHERE status = 'ACTIVE' AND FIND_IN_SET(?, scopes) > 0`,
    [SCOPE],
  );
  console.log(
    `\n[expenses-approve-scope-backfill] Verification — ACTIVE rows carrying ${SCOPE}:`,
    verify[0].n,
  );

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
