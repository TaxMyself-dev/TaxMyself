/**
 * Dev-only seed script — seeds ledger-test documents + expenses.
 * Bootstraps NestJS in application-context mode (no HTTP server).
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/seed-ledger-test.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DemoDataService } from '../src/demo-data/demo-data.service';
import { LEDGER_TEST_PROFILE } from '../src/demo-data/profiles/ledger-test.profile';

const FIREBASE_ID = 'qEw5g3YQchWfEDJdfQTdAvBFxJn1'; // demo+ledger@keepintax.local

async function main() {
  console.log('[seed-ledger-test] bootstrapping NestJS context…');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  const svc = app.get(DemoDataService);

  console.log('[seed-ledger-test] calling seedDocumentsAndExpenses…');
  await (svc as any).seedDocumentsAndExpenses(FIREBASE_ID, LEDGER_TEST_PROFILE);

  console.log('[seed-ledger-test] done');
  await app.close();
}

main().catch((err) => {
  console.error('[seed-ledger-test] FAILED:', err?.message ?? err);
  process.exit(1);
});
