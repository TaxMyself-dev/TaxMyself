import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createTestApp } from './helpers/app-setup';
import { cleanupTestUsers, makeTestFirebaseId, signupRequest } from './helpers/test-factory';
import { User } from '../src/users/user.entity';
import { UserModuleSubscription } from '../src/users/user-module-subscription.entity';
import { ModuleName, PayStatus } from '../src/enum';
import { UsersService } from '../src/users/users.service';

describe('billing-status וסוף trial (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let subRepo: Repository<UserModuleSubscription>;
  let usersService: UsersService;

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

  it('billing-status: INVOICES בלבד → 15 ₪', async () => {
    const firebaseId = makeTestFirebaseId('BILLING_INV');
    await signupRequest(app, { firebaseId, withBusiness: true });

    const status = await usersService.getBillingStatus(firebaseId);
    expect(status.monthlyTotalNis).toBe(15);
    expect(status.hasCombinedDiscount).toBe(false);
    expect(status.finalAmountNis).toBe(15);
  });

  it('billing-status: INVOICES + OPEN_BANKING → 54 ₪ (combo)', async () => {
    const firebaseId = makeTestFirebaseId('BILLING_COMBO');
    await signupRequest(app, { firebaseId, withBusiness: true });

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 45);
    await subRepo.save(subRepo.create({
      firebaseId,
      moduleName: ModuleName.OPEN_BANKING,
      trialStartDate: new Date(),
      trialEndDate: trialEnd,
      payStatus: PayStatus.TRIAL,
      monthlyPriceNis: 45,
      createdAt: new Date(),
    }));

    const status = await usersService.getBillingStatus(firebaseId);
    expect(status.monthlyTotalNis).toBe(54);
    expect(status.hasCombinedDiscount).toBe(true);
    expect(status.finalAmountNis).toBe(54);
  });

  it('billing-status: הנחה אישית 20% → finalAmountNis = 43.2', async () => {
    const firebaseId = makeTestFirebaseId('BILLING_DISC');
    await signupRequest(app, { firebaseId, withBusiness: true });

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 45);
    await subRepo.save(subRepo.create({
      firebaseId,
      moduleName: ModuleName.OPEN_BANKING,
      trialStartDate: new Date(),
      trialEndDate: trialEnd,
      payStatus: PayStatus.TRIAL,
      monthlyPriceNis: 45,
      createdAt: new Date(),
    }));

    const user = await userRepo.findOne({ where: { firebaseId } });
    user.discountPercent = 20;
    user.discountLabel = 'Friend';
    await userRepo.save(user);

    const status = await usersService.getBillingStatus(firebaseId);
    expect(status.discountPercent).toBe(20);
    expect(status.discountLabel).toBe('Friend');
    expect(status.finalAmountNis).toBe(43.2);
  });

  it('updateExpiredTrials: מודול שפג נמחק מ-modulesAccess', async () => {
    const firebaseId = makeTestFirebaseId('EXPIRED_TRIAL');
    await signupRequest(app, { firebaseId, withBusiness: true });

    // מגדירים trialEndDate בעבר
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const sub = await subRepo.findOne({ where: { firebaseId, moduleName: ModuleName.INVOICES } });
    sub.trialEndDate = pastDate;
    await subRepo.save(sub);

    await usersService.updateExpiredTrials();

    const updatedSub = await subRepo.findOne({ where: { firebaseId, moduleName: ModuleName.INVOICES } });
    expect(updatedSub.payStatus).toBe(PayStatus.PAYMENT_REQUIRED);

    const updatedUser = await userRepo.findOne({ where: { firebaseId } });
    expect(updatedUser.modulesAccess).not.toContain(ModuleName.INVOICES);
  });

  it('ללא עסק → billing-status מחזיר monthlyTotalNis = 0', async () => {
    const firebaseId = makeTestFirebaseId('BILLING_NOBIZ');
    await signupRequest(app, { firebaseId, withBusiness: false });

    const status = await usersService.getBillingStatus(firebaseId);
    expect(status.monthlyTotalNis).toBe(0);
    expect(status.finalAmountNis).toBe(0);
    expect(status.modules).toHaveLength(0);
  });
});
