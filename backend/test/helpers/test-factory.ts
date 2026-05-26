import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../src/users/user.entity';
import { UserModuleSubscription } from '../../src/users/user-module-subscription.entity';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const supertest = require('supertest') as (app: any) => any;

/** Prefix כל firebase IDs של טסטים כדי שיהיה קל לנקות */
export const TEST_PREFIX = 'TEST_E2E_';

/** מייצר firebaseId ייחודי לכל ריצת טסט */
export function makeTestFirebaseId(suffix: string): string {
  return `${TEST_PREFIX}${suffix}_${Date.now()}`;
}

/** פרמטרים לבניית משתמש לטסט */
export interface CreateTestUserOptions {
  firebaseId: string;
  withBusiness?: boolean;
  businessName?: string;
}

/** גוף הבקשה ל-POST /auth/signup */
export function buildSignupBody(opts: CreateTestUserOptions) {
  return {
    personal: {
      firebaseId: opts.firebaseId,
      fName: 'Test',
      lName: 'User',
      email: `${opts.firebaseId}@test.com`,
      phone: '0500000000',
      id: '000000000',
      dateOfBirth: '1990-01-01',
      familyStatus: 'single',
      employmentStatus: 'SELF_EMPLOYED',
      gender: 'male',
      city: 'תל אביב',
      taxReportingType: 'biannual',
      vatReportingType: 'monthly',
      role: ['regular'],
    },
    spouse: null,
    children: { childrenArray: [] },
    business: opts.withBusiness
      ? {
          businessArray: [
            {
              businessName: opts.businessName ?? 'Test Business',
              businessNumber: '999999999',
              businessType: 'EXEMPT',
              businessField: 'technology',
              businessAddress: 'רחוב הבדיקות 1',
              businessDate: '2020-01-01',
              vatReportingType: 'monthly',
              taxReportingType: 'biannual',
              businessInventory: false,
            },
          ],
        }
      : { businessArray: [] },
  };
}

/** מנקה את כל נתוני הטסט מה-DB לאחר הבדיקות.
 *  אם KEEP_TEST_DATA=true — מדלג על הניקיון כדי לאפשר בדיקה ידנית ב-DB. */
export async function cleanupTestUsers(app: INestApplication): Promise<void> {
  if (process.env.KEEP_TEST_DATA === 'true') {
    const userRepo = app.get<Repository<User>>(getRepositoryToken(User));
    const testUsers = await userRepo.find();
    const ids = testUsers
      .filter(u => u.firebaseId?.startsWith(TEST_PREFIX))
      .map(u => u.firebaseId);
    console.log('\n🔍 KEEP_TEST_DATA=true — נתוני הטסט לא נמחקו.');
    console.log(`   firebaseIds שנשמרו: ${ids.join(', ')}`);
    console.log(`   לניקיון ידני: DELETE FROM user WHERE firebaseId LIKE '${TEST_PREFIX}%';\n`);
    return;
  }

  const userRepo = app.get<Repository<User>>(getRepositoryToken(User));
  const subRepo = app.get<Repository<UserModuleSubscription>>(
    getRepositoryToken(UserModuleSubscription),
  );

  const testUsers = await userRepo.find();
  const testFirebaseIds = testUsers
    .filter(u => u.firebaseId?.startsWith(TEST_PREFIX))
    .map(u => u.firebaseId);

  if (testFirebaseIds.length > 0) {
    for (const fid of testFirebaseIds) {
      await subRepo.delete({ firebaseId: fid });
    }
    await userRepo
      .createQueryBuilder()
      .delete()
      .where('firebaseId LIKE :prefix', { prefix: `${TEST_PREFIX}%` })
      .execute();
  }
}

/** POST /auth/signup ומחזיר את ה-status */
export async function signupRequest(
  app: INestApplication,
  opts: CreateTestUserOptions,
) {
  return supertest(app.getHttpServer())
    .post('/auth/signup')
    .send(buildSignupBody(opts));
}
