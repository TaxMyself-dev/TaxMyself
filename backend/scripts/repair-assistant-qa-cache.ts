/** Dev-only cache projection repair. No app boot, provider, approval or reset. */
import 'reflect-metadata';
import 'dotenv/config';
import { resolve } from 'path';
import { DataSource } from 'typeorm';
import { User } from '../src/users/user.entity';
import { QA_EMAIL } from '../src/demo-data/profiles/assistant-qa.profile';
import { synchronizeAssistantQaCache } from '../src/demo-data/assistant-qa-cache';

async function main() {
  if (
    process.env.DB_DATABASE !== 'keepintax-dev' ||
    process.argv.slice(2).join(' ') !== '--apply'
  )
    throw new Error('Requires keepintax-dev and explicit --apply');
  const data = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: 'keepintax-dev',
    timezone: 'Z',
    entities: [resolve(__dirname, '../src/**/*.entity.ts')],
    synchronize: false,
    logging: false,
  });
  await data.initialize();
  try {
    const updated = await data.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { email: QA_EMAIL },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new Error('Named assistant QA demo user not found');
      return synchronizeAssistantQaCache(manager, user.firebaseId);
    });
    console.log(
      JSON.stringify({
        database: 'keepintax-dev',
        cacheRowsProjected: updated,
      }),
    );
  } finally {
    await data.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
