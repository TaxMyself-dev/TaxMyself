import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { Delegation, DelegationStatus } from 'src/delegation/delegation.entity';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { User } from 'src/users/user.entity';
import { UserRole } from 'src/enum';
import { AgentDomainService } from './agent-domain.service';
import { AgentHarnessController } from './agent-harness.controller';
import { AgentHarnessService, AgentHarnessUser } from './agent-harness.service';

// Who reaches the agent, with the real FirebaseAuthGuard in front of it:
// the client's identity comes from the verified token and the delegation
// table, never from a header alone. An accountant whose delegation was
// revoked reaches nothing of the client's agent data — not the chat list,
// not an existing conversation's messages or stream, not a new answer —
// whatever conversation id they send. Firebase's token check is faked; the
// token names the caller.
jest.mock('firebase-admin', () => ({
  auth: () => ({
    verifyIdToken: async (token: string) => {
      if (!token.startsWith('uid:')) {
        throw new Error('invalid token');
      }
      return { uid: token.slice(4) };
    },
  }),
}));

const conversationId = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';

describe('agent access through FirebaseAuthGuard', () => {
  let app: INestApplication;
  const delegations: Partial<Delegation>[] = [];
  const users: Partial<User>[] = [
    { firebaseId: 'admin-uid', role: [UserRole.ADMIN] },
    { firebaseId: 'accountant-uid', role: [UserRole.ACCOUNTANT] },
  ];
  const calls: AgentHarnessUser[] = [];

  const matches = (row: object, where: object) =>
    Object.entries(where).every(
      ([key, value]) => (row as Record<string, unknown>)[key] === value,
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AgentHarnessController],
      providers: [
        FirebaseAuthGuard,
        {
          provide: getRepositoryToken(Delegation),
          useValue: {
            findOne: async ({ where }) =>
              delegations.find((row) => matches(row, where)) ?? null,
            find: async ({ where }) =>
              delegations.filter((row) => matches(row, where)),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: async ({ where }) =>
              users.find((row) => matches(row, where)) ?? null,
          },
        },
        {
          provide: AgentDomainService,
          useValue: { requestBusiness: async () => null },
        },
        {
          provide: AgentHarnessService,
          useValue: {
            handle: async (_request: Request, user: AgentHarnessUser) => {
              calls.push(user);
              return new Response(null, { status: 204 });
            },
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    calls.length = 0;
    delegations.length = 0;
  });

  const asAccountantForClient = (path: string, method: 'get' | 'post' = 'get') =>
    request(app.getHttpServer())
      [method](path)
      .set('authorization', 'Bearer uid:accountant-uid')
      .set('x-client-user-id', 'client-uid');

  const routes: [string, 'get' | 'post'][] = [
    ['/api/agent/fn/listAgentChatConversations', 'get'],
    ['/api/agent/fn/readAgentChatConversationMessages', 'get'],
    ['/api/agent/fn/readAgentMemories', 'get'],
    [`/api/agent/chats/${conversationId}/stream`, 'get'],
    [`/api/agent/chats/${conversationId}/stop`, 'post'],
    [`/api/agent/chats/${conversationId}/steer`, 'post'],
    [`/api/agent/chats/${conversationId}/follow-ups`, 'get'],
    ['/api/agent/chat', 'post'],
  ];

  it('acts for the client only through an ACTIVE delegation, as (accountant, client)', async () => {
    delegations.push({
      userId: 'client-uid',
      agentId: 'accountant-uid',
      status: DelegationStatus.ACTIVE,
      scopes: [] as never,
    });

    const response = await asAccountantForClient(
      '/api/agent/fn/readAgentSession',
    );

    expect(response.status).toBe(204);
    expect(calls).toEqual([
      expect.objectContaining({
        actorFirebaseId: 'accountant-uid',
        firebaseId: 'client-uid',
        isDelegatedAccess: true,
      }),
    ]);
  });

  it.each(routes)(
    'a revoked delegation reaches nothing: %s',
    async (path, method) => {
      delegations.push({
        userId: 'client-uid',
        agentId: 'accountant-uid',
        status: DelegationStatus.REVOKED,
        scopes: [] as never,
      });

      const response = await asAccountantForClient(path, method);

      expect(response.status).toBe(403);
      expect(calls).toHaveLength(0);
    },
  );

  it('a client header with no delegation at all reaches nothing', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/agent/fn/listAgentChatConversations')
      .set('authorization', 'Bearer uid:accountant-uid')
      .set('x-client-user-id', 'someone-else-uid');

    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('a request without a valid token reaches nothing', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/agent/fn/readAgentSession')
      .set('authorization', 'Bearer forged');

    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('an admin impersonates as (admin, client), flagged as such', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/agent/fn/readAgentSession')
      .set('authorization', 'Bearer uid:admin-uid')
      .set('x-client-user-id', 'client-uid');

    expect(response.status).toBe(204);
    expect(calls[0]).toEqual(
      expect.objectContaining({
        actorFirebaseId: 'admin-uid',
        firebaseId: 'client-uid',
        isAdminImpersonation: true,
      }),
    );
  });
});
