import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { createServer, Server } from 'node:http';
import axios from 'axios';
import request = require('supertest');
import { FeezbackController } from '../feezback.controller';
import { FeezbackService } from '../feezback.service';
import { FeezbackDisconnectionService } from '../feezback-disconnection.service';
import { FeezbackWebhookRouterService } from '../router/feezback-webhook-router.service';
import { FeezbackHttpClient } from './feezback-http.client';
import { FeezbackUserActivityInterceptor } from './feezback-user-activity.interceptor';
import { TransactionsController } from '../../transactions/transactions.controller';
import { TransactionsService } from '../../transactions/transactions.service';
import { TransactionProcessingService } from '../../transactions/transaction-processing.service';
import { UserSyncStateService } from '../../transactions/user-sync-state.service';
import { UsersController } from '../../users/users.controller';
import { UsersService } from '../../users/users.service';
import { AuthService } from '../../users/auth.service';
import { GoogleDriveService } from '../../google-drive/google-drive.service';
import { SharedService } from '../../shared/shared.service';
import { ExpensesService } from '../../expenses/expenses.service';
import { BillingService } from '../../billing/services/billing.service';
import { User } from '../../users/user.entity';
import { FirebaseAuthGuard } from '../../guards/firebase-auth.guard';
import { SubscriptionGuard } from '../../guards/subscription.guard';

describe('PSU IP on real local HTTP through the application controllers', () => {
  let app: INestApplication, upstream: Server, client: FeezbackHttpClient, base: string;
  const seen: { url: string; ip?: string }[] = [];
  const pending: Promise<unknown>[] = [];
  const originalService = process.env.K_SERVICE;
  const read = (id: string, kind = 'consents') => client.get(
    `${base}/tpp/v1/users/${id}_sub@KNCAXnwXk1/${kind}`, { sub: `${id}_sub` });
  beforeAll(async () => {
    // Emulate the Cloud Run ingress with a loopback fake; no external calls.
    process.env.K_SERVICE = 'psu-ip-http-fixture';
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    upstream = createServer((req, res) => {
      seen.push({ url: req.url, ip: req.headers['x-psu-ip-address'] as string | undefined });
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}');
    });
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(upstream.address() as any).port}`;
    client = new FeezbackHttpClient(new HttpService(axios.create({ timeout: 2000, proxy: false })), {
      getTppApiUrl: () => base, getAuthHeaders: async () => ({ Authorization: 'Bearer local-fixture' }),
    } as any);
    const banking = {
      refreshUserSources: async (id: string) => { await read(id); return { complete: true, consents: [] }; },
      retrySource: async (id: string) => { await read(id, 'consents/c/cards/r/transactions'); return { status: 'success' }; },
      triggerFullSync: (id: string) => {
        // Mimic the real async work continuing after the initiating response.
        const work = new Promise<void>(resolve => setImmediate(resolve)).then(() => read(id, 'consents/c/accounts/a/transactions'));
        pending.push(work); return work;
      },
      getAdminAccountsAndCards: async (id: string) => { await read(id, 'accounts'); return {}; },
    };
    const users = {
      signin: async () => ({ hasOpenBanking: true, email: 'fixture@example.invalid' }),
      getDriveProvisioningStatus: async () => ({}),
      findByFirebaseId: async () => ({ email: 'fixture@example.invalid' }),
      findFireUser: async () => ({ hasOpenBanking: true }), isAdmin: async () => true,
    };
    const values: [any, any][] = [
      [FeezbackService, banking], [UsersService, users], [UserSyncStateService, { getSyncState: async () => null }],
      [FeezbackDisconnectionService, {}], [FeezbackWebhookRouterService, {}],
      [TransactionsService, {}], [TransactionProcessingService, {}], [SharedService, {}],
      [ExpensesService, {}], [BillingService, {}], [AuthService, {}], [GoogleDriveService, {}], [getRepositoryToken(User), {}],
    ];
    const module = await Test.createTestingModule({
      controllers: [FeezbackController, TransactionsController, UsersController],
      providers: [...values.map(([provide, useValue]) => ({ provide, useValue })), FeezbackUserActivityInterceptor],
    }).overrideGuard(FirebaseAuthGuard).useValue({ canActivate: context => {
      const req = context.switchToHttp().getRequest();
      // Identity fixtures stand in for Firebase verification in this isolated test.
      const delegated = req.headers['test-view-as'] === 'true';
      req.user = { firebaseId: 'owner', actorFirebaseId: delegated ? 'administrator' : 'owner', role: 'user' };
      req.isAdminImpersonation = delegated;
      return true;
    } }).overrideGuard(SubscriptionGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication(); await app.init();
  });
  afterEach(async () => { await Promise.all(pending.splice(0)); seen.length = 0; });
  afterAll(async () => {
    await app?.close();
    await new Promise<void>(resolve => upstream.close(() => resolve()));
    if (originalService === undefined) delete process.env.K_SERVICE;
    else process.env.K_SERVICE = originalService;
    jest.restoreAllMocks();
  });
  it.each(['/feezback/refresh-permissions', '/transactions/retry-source'])
  ('passes the actual owner IP on %s, ignoring browser PSU header', async route => {
    await request(app.getHttpServer()).post(route)
      .set('X-Forwarded-For', '192.0.2.99, 203.0.113.9').set('X-Psu-IP-Address', '192.0.2.99')
      .send({ type: 'bank', sourceId: 'fixture' }).expect(201);
    expect(seen).toHaveLength(1); expect(seen[0].ip).toBe('203.0.113.9');
  });
  it.each(['/auth/signin?freshLogin=true', '/transactions/trigger-sync'])
  ('keeps the IP for async user-initiated work: %s', async route => {
    const operation = route.startsWith('/auth') ? request(app.getHttpServer()).get(route) : request(app.getHttpServer()).post(route);
    await operation.set('X-Forwarded-For', '203.0.113.10').expect(200);
    await Promise.all(pending); expect(seen).toHaveLength(1); expect(seen[0].ip).toBe('203.0.113.10');
    await read('owner'); expect(seen[1].ip).toBeUndefined();
  });
  it('does not count an admin pulling another owner while acting in their own session', async () => {
    await request(app.getHttpServer()).post('/feezback/admin/refresh-sources/another-owner')
      .set('X-Forwarded-For', '203.0.113.9').send({}).expect(201);
    expect(seen).toHaveLength(1); expect(seen[0].ip).toBeUndefined();
  });
  it('does not count view-as activity on an ordinary owner endpoint', async () => {
    await request(app.getHttpServer()).post('/transactions/trigger-sync')
      .set('test-view-as', 'true').set('X-Forwarded-For', '203.0.113.9').send({}).expect(200);
    await Promise.all(pending); expect(seen).toHaveLength(1); expect(seen[0].ip).toBeUndefined();
  });
  it('does not mark the admin empty-cache preparation sync', async () => {
    await request(app.getHttpServer()).post('/transactions/admin/sync-if-empty/another-owner')
      .set('X-Forwarded-For', '203.0.113.9').send({}).expect(200);
    await Promise.all(pending); expect(seen).toHaveLength(1); expect(seen[0].ip).toBeUndefined();
  });
});
