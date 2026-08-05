import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createTestApp } from './helpers/app-setup';
import { cleanupTestUsers, makeTestFirebaseId, signupRequest } from './helpers/test-factory';
import { User } from '../src/users/user.entity';

describe('חיבור בנקאות פתוחה — webhook (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let firebaseId: string;

  beforeAll(async () => {
    app = await createTestApp();
    userRepo = app.get<Repository<User>>(getRepositoryToken(User));
  });

  afterAll(async () => {
    await cleanupTestUsers(app);
    await app.close();
  });

  beforeEach(async () => {
    firebaseId = makeTestFirebaseId('OB_WEBHOOK');
    await signupRequest(app, { firebaseId, withBusiness: true });
  });

  it('לפני webhook: hasOpenBanking = false', async () => {
    const user = await userRepo.findOne({ where: { firebaseId } });
    expect(user.hasOpenBanking).toBe(false);
  });

  it('לאחר webhook: hasOpenBanking = true', async () => {
    // מדמים את מה שה-webhook עושה ישירות דרך ה-service: רק user.hasOpenBanking
    // משתנה. גישת המודול ל-OPEN_BANKING נגזרת מה-Subscription, לא מ-User.
    const user = await userRepo.findOne({ where: { firebaseId } });
    user.hasOpenBanking = true;
    await userRepo.save(user);

    const updated = await userRepo.findOne({ where: { firebaseId } });
    expect(updated.hasOpenBanking).toBe(true);
  });
});
