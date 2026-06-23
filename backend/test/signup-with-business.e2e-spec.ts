import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createTestApp } from './helpers/app-setup';
import { cleanupTestUsers, makeTestFirebaseId, signupRequest } from './helpers/test-factory';
import { User } from '../src/users/user.entity';
import { BusinessStatus, ModuleName } from '../src/enum';
import { BillingService } from '../src/billing/services/billing.service';

describe('הרשמה עם עסק (e2e)', () => {
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

  it('Subscription (TRIAL) מעניקה גישה ל-INVOICES ו-OPEN_BANKING', async () => {
    await signupRequest(app, { firebaseId, withBusiness: true });
    expect(await billingService.hasModuleAccess(firebaseId, ModuleName.INVOICES)).toBe(true);
    expect(await billingService.hasModuleAccess(firebaseId, ModuleName.OPEN_BANKING)).toBe(true);
  });

  it('hasOpenBanking = false בהרשמה', async () => {
    await signupRequest(app, { firebaseId, withBusiness: true });
    const user = await userRepo.findOne({ where: { firebaseId } });
    expect(user.hasOpenBanking).toBe(false);
  });
});
