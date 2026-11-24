import { AgentDomainService } from '../agent-harness/agent-domain.service';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { AutoClassificationController } from './auto-classification.controller';
import { AutoClassificationService } from './auto-classification.service';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { Delegation } from '../delegation/delegation.entity';
import { User } from '../users/user.entity';
import { assertSelf } from './auto-classification.policy';
describe('automatic classification HTTP authorization', () => {
  let app: any, write: jest.Mock;
  beforeAll(async () => {
    write = jest.fn();
    const service: any = {
      status: async (user: any) => {
        assertSelf(user);
        return { enabled: false };
      },
      consent: async (user: any, enabled: boolean) => {
        assertSelf(user);
        write(enabled);
        return { enabled };
      },
      start: async (user: any) => {
        assertSelf(user);
        write();
        return { queued: true };
      },
    };
    const module = await Test.createTestingModule({
      controllers: [AutoClassificationController],
      providers: [
        FirebaseAuthGuard,
        {
          provide: AgentDomainService,
          useValue: {
            assertAiAccess: async (user: any) => {
              if (user.actorFirebaseId === 'regular')
                throw new ForbiddenException('AI module access required');
            },
          },
        },
        { provide: AutoClassificationService, useValue: service },
        {
          provide: getRepositoryToken(Delegation),
          useValue: {
            findOne: async () => ({
              status: 'ACTIVE',
              scopes: ['DOCUMENTS_READ', 'EXPENSES_APPROVE'],
            }),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: async () => ({ role: [] }) },
        },
      ],
    }).compile();
    const guard = module.get(FirebaseAuthGuard);
    jest
      .spyOn(guard as any, 'validateToken')
      .mockImplementation(async (token: string) => ({
        uid:
          token === 'admin'
            ? 'admin'
            : token === 'regular'
            ? 'regular'
            : 'owner',
      }));
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => write.mockClear());
  it('rejects an anonymous opt-in', async () => {
    await request(app.getHttpServer())
      .post('/api/agent-automation/consent')
      .send({ enabled: true })
      .expect(401);
    expect(write).not.toHaveBeenCalled();
  });
  it('permits owner consent only with a boolean DTO', async () => {
    await request(app.getHttpServer())
      .post('/api/agent-automation/consent')
      .set('Authorization', 'Bearer owner')
      .send({ enabled: true })
      .expect(201);
    expect(write).toHaveBeenCalledWith(true);
  });
  it('refuses a forged owner/business scope in the body', async () => {
    await request(app.getHttpServer())
      .post('/api/agent-automation/consent')
      .set('Authorization', 'Bearer owner')
      .send({ enabled: true, owner: 'victim' })
      .expect(400);
    expect(write).not.toHaveBeenCalled();
  });
  it('denies a current delegate even with expense approval scope', async () => {
    await request(app.getHttpServer())
      .post('/api/agent-automation/consent')
      .set('Authorization', 'Bearer owner')
      .set('x-client-user-id', 'client')
      .send({ enabled: true })
      .expect(403);
    expect(write).not.toHaveBeenCalled();
  });
  it('denies represented-client start as well as opt-in', async () => {
    await request(app.getHttpServer())
      .post('/api/agent-automation/start')
      .set('Authorization', 'Bearer owner')
      .set('x-client-user-id', 'client')
      .send({})
      .expect(403);
    expect(write).not.toHaveBeenCalled();
  });
  it('denies users without AI all automation surfaces even with a valid token', async () => {
    for (const path of [
      '/api/agent-automation',
      '/api/agent-automation/notifications',
      '/api/agent-automation/notifications/id',
    ])
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', 'Bearer regular')
        .expect(403);
    await request(app.getHttpServer())
      .post('/api/agent-automation/consent')
      .set('Authorization', 'Bearer regular')
      .send({ enabled: true })
      .expect(403);
    expect(write).not.toHaveBeenCalled();
  });
});
