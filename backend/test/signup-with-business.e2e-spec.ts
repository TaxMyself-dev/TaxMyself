import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createTestApp } from './helpers/app-setup';
import { cleanupTestUsers, makeTestFirebaseId, signupRequest } from './helpers/test-factory';
import { User } from '../src/users/user.entity';
import { UserModuleSubscription } from '../src/users/user-module-subscription.entity';
import { BusinessStatus, ModuleName, PayStatus } from '../src/enum';

describe('הרשמה עם עסק (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let subRepo: Repository<UserModuleSubscription>;
  let firebaseId: string;

  beforeAll(async () => {
    app = await createTestApp();
    userRepo = app.get<Repository<User>>(getRepositoryToken(User));
    subRepo = app.get<Repository<UserModuleSubscription>>(getRepositoryToken(UserModuleSubscription));
  });

  afterAll(async () => {
    await cleanupTestUsers(app);
    await app.close();
  });

  beforeEach(() => {
    firebaseId = makeTestFirebaseId('WITH_BIZ');
  });

  it('POST /auth/signup מחזיר 201', async () => {
    const res = await signupRequest(app, { firebaseId, withBusiness: true });
    if (res.status !== 201) console.error('SIGNUP 500 BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(201);
  });

  it('businessStatus = SINGLE_BUSINESS', async () => {
    await signupRequest(app, { firebaseId, withBusiness: true });
    const user = await userRepo.findOne({ where: { firebaseId } });
    expect(user).toBeDefined();
    expect(user.businessStatus).toBe(BusinessStatus.SINGLE_BUSINESS);
  });

  it('modulesAccess כולל INVOICES ו-OPEN_BANKING', async () => {
    await signupRequest(app, { firebaseId, withBusiness: true });
    const user = await userRepo.findOne({ where: { firebaseId } });
    expect(user.modulesAccess).toContain(ModuleName.INVOICES);
    expect(user.modulesAccess).toContain(ModuleName.OPEN_BANKING);
  });

  it('hasOpenBanking = false בהרשמה', async () => {
    await signupRequest(app, { firebaseId, withBusiness: true });
    const user = await userRepo.findOne({ where: { firebaseId } });
    expect(user.hasOpenBanking).toBe(false);
  });

  it('נוצרת רשומת UserModuleSubscription עבור INVOICES', async () => {
    await signupRequest(app, { firebaseId, withBusiness: true });
    const sub = await subRepo.findOne({ where: { firebaseId, moduleName: ModuleName.INVOICES } });
    expect(sub).toBeDefined();
    expect(sub.payStatus).toBe(PayStatus.TRIAL);
    expect(Number(sub.monthlyPriceNis)).toBe(15);
  });

  it('trialEndDate של INVOICES הוא כ-45 יום קדימה', async () => {
    await signupRequest(app, { firebaseId, withBusiness: true });
    const sub = await subRepo.findOne({ where: { firebaseId, moduleName: ModuleName.INVOICES } });
    const trialEnd = new Date(sub.trialEndDate);
    const expected = new Date();
    expected.setDate(expected.getDate() + 44); // מרווח של יום אחד
    expect(trialEnd.getTime()).toBeGreaterThan(expected.getTime());
  });

  it('אין רשומת UserModuleSubscription עבור OPEN_BANKING בהרשמה', async () => {
    await signupRequest(app, { firebaseId, withBusiness: true });
    const sub = await subRepo.findOne({ where: { firebaseId, moduleName: ModuleName.OPEN_BANKING } });
    expect(sub).toBeNull();
  });
});
