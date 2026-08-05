import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createTestApp } from './helpers/app-setup';
import { cleanupTestUsers, makeTestFirebaseId, signupRequest } from './helpers/test-factory';
import { User } from '../src/users/user.entity';
import { BusinessStatus, ModuleName } from '../src/enum';
import { BillingService } from '../src/billing/services/billing.service';

describe('הרשמה ללא עסק (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let billingService: BillingService;
  let firebaseId: string;

  beforeAll(async () => {
    app = await createTestApp();
    userRepo = app.get<Repository<User>>(getRepositoryToken(User));
    billingService = app.get(BillingService);
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

  it('Subscription (TRIAL) מעניקה גישה ל-INVOICES ו-OPEN_BANKING גם ללא עסק (הגדרת ברירת מחדל)', async () => {
    await signupRequest(app, { firebaseId, withBusiness: false });
    expect(await billingService.hasModuleAccess(firebaseId, ModuleName.INVOICES)).toBe(true);
    expect(await billingService.hasModuleAccess(firebaseId, ModuleName.OPEN_BANKING)).toBe(true);
  });

  it('hasOpenBanking = false בהרשמה', async () => {
    await signupRequest(app, { firebaseId, withBusiness: false });
    const user = await userRepo.findOne({ where: { firebaseId } });
    expect(user.hasOpenBanking).toBe(false);
  });

  it('discountPercent = 0 כברירת מחדל', async () => {
    await signupRequest(app, { firebaseId, withBusiness: false });
    const user = await userRepo.findOne({ where: { firebaseId } });
    expect(Number(user.discountPercent)).toBe(0);
    expect(user.discountLabel).toBeNull();
  });
});
