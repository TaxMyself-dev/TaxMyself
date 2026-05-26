import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createTestApp } from './helpers/app-setup';
import { cleanupTestUsers, makeTestFirebaseId, signupRequest } from './helpers/test-factory';
import { User } from '../src/users/user.entity';
import { UserModuleSubscription } from '../src/users/user-module-subscription.entity';
import { BusinessStatus, ModuleName } from '../src/enum';

describe('הרשמה ללא עסק (e2e)', () => {
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
    firebaseId = makeTestFirebaseId('NO_BIZ');
  });

  it('POST /auth/signup מחזיר 201', async () => {
    const res = await signupRequest(app, { firebaseId, withBusiness: false });
    expect(res.status).toBe(201);
  });

  it('businessStatus = NO_BUSINESS', async () => {
    await signupRequest(app, { firebaseId, withBusiness: false });
    const user = await userRepo.findOne({ where: { firebaseId } });
    expect(user).toBeDefined();
    expect(user.businessStatus).toBe(BusinessStatus.NO_BUSINESS);
  });

  it('modulesAccess עדיין כולל INVOICES ו-OPEN_BANKING (הגדרת ברירת מחדל)', async () => {
    await signupRequest(app, { firebaseId, withBusiness: false });
    const user = await userRepo.findOne({ where: { firebaseId } });
    expect(user.modulesAccess).toContain(ModuleName.INVOICES);
    expect(user.modulesAccess).toContain(ModuleName.OPEN_BANKING);
  });

  it('hasOpenBanking = false בהרשמה', async () => {
    await signupRequest(app, { firebaseId, withBusiness: false });
    const user = await userRepo.findOne({ where: { firebaseId } });
    expect(user.hasOpenBanking).toBe(false);
  });

  it('אין רשומת UserModuleSubscription (ללא עסק = ללא מנוי INVOICES)', async () => {
    await signupRequest(app, { firebaseId, withBusiness: false });
    const sub = await subRepo.findOne({ where: { firebaseId, moduleName: ModuleName.INVOICES } });
    expect(sub).toBeNull();
  });

  it('discountPercent = 0 כברירת מחדל', async () => {
    await signupRequest(app, { firebaseId, withBusiness: false });
    const user = await userRepo.findOne({ where: { firebaseId } });
    expect(Number(user.discountPercent)).toBe(0);
    expect(user.discountLabel).toBeNull();
  });
});
