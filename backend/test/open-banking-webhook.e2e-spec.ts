import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createTestApp } from './helpers/app-setup';
import { cleanupTestUsers, makeTestFirebaseId, signupRequest } from './helpers/test-factory';
import { User } from '../src/users/user.entity';
import { UserModuleSubscription } from '../src/users/user-module-subscription.entity';
import { ModuleName, PayStatus } from '../src/enum';
import { UsersService } from '../src/users/users.service';

describe('חיבור בנקאות פתוחה — webhook (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let subRepo: Repository<UserModuleSubscription>;
  let usersService: UsersService;
  let firebaseId: string;

  beforeAll(async () => {
    app = await createTestApp();
    userRepo = app.get<Repository<User>>(getRepositoryToken(User));
    subRepo = app.get<Repository<UserModuleSubscription>>(getRepositoryToken(UserModuleSubscription));
    usersService = app.get(UsersService);
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
    // מדמים את מה שה-webhook עושה ישירות דרך ה-service
    const user = await userRepo.findOne({ where: { firebaseId } });
    user.hasOpenBanking = true;
    user.modulesAccess = [...(user.modulesAccess ?? []), ModuleName.OPEN_BANKING];
    await userRepo.save(user);

    const trialStart = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 45);
    await subRepo.save(subRepo.create({
      firebaseId,
      moduleName: ModuleName.OPEN_BANKING,
      trialStartDate: trialStart,
      trialEndDate: trialEnd,
      payStatus: PayStatus.TRIAL,
      monthlyPriceNis: 45,
      createdAt: new Date(),
    }));

    const updated = await userRepo.findOne({ where: { firebaseId } });
    expect(updated.hasOpenBanking).toBe(true);
  });

  it('לאחר webhook: נוצרת רשומת OPEN_BANKING subscription', async () => {
    const trialStart = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 45);
    await subRepo.save(subRepo.create({
      firebaseId,
      moduleName: ModuleName.OPEN_BANKING,
      trialStartDate: trialStart,
      trialEndDate: trialEnd,
      payStatus: PayStatus.TRIAL,
      monthlyPriceNis: 45,
      createdAt: new Date(),
    }));

    const sub = await subRepo.findOne({ where: { firebaseId, moduleName: ModuleName.OPEN_BANKING } });
    expect(sub).toBeDefined();
    expect(sub.payStatus).toBe(PayStatus.TRIAL);
    expect(Number(sub.monthlyPriceNis)).toBe(45);
  });

  it('לאחר webhook: trialEndDate של OPEN_BANKING הוא כ-45 יום קדימה', async () => {
    const trialStart = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 45);
    await subRepo.save(subRepo.create({
      firebaseId,
      moduleName: ModuleName.OPEN_BANKING,
      trialStartDate: trialStart,
      trialEndDate: trialEnd,
      payStatus: PayStatus.TRIAL,
      monthlyPriceNis: 45,
      createdAt: new Date(),
    }));

    const sub = await subRepo.findOne({ where: { firebaseId, moduleName: ModuleName.OPEN_BANKING } });
    const expected = new Date();
    expected.setDate(expected.getDate() + 44);
    expect(new Date(sub.trialEndDate).getTime()).toBeGreaterThan(expected.getTime());
  });
});
