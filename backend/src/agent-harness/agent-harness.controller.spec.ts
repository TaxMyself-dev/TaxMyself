import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AgentDomainService } from './agent-domain.service';
import { AgentHarnessController } from './agent-harness.controller';
import { AgentHarnessService, AgentHarnessUser } from './agent-harness.service';

// The agent harness's Nest edge: what the agent package receives (the
// verified user, the request as a web Request with its raw body) and that
// its Response streams back as it is. The guard is replaced by one that
// signs in a given caller, and the agent package by a fake; the business
// check is the real AgentDomainService over a fake list of businesses.
// agent-harness.access.spec.ts runs the real FirebaseAuthGuard.
describe('AgentHarnessController', () => {
  let app: INestApplication;
  // What the stand-in guard verified for the next request.
  let signedIn: {
    firebaseId: string;
    actorFirebaseId: string;
    businessNumber?: string;
  };
  const businessesOf: Record<
    string,
    { businessNumber: string | null; businessName: string | null }[]
  > = {
    'client-uid': [
      { businessNumber: '515151515', businessName: 'Client studio' },
      { businessNumber: null, businessName: 'Draft business' },
    ],
    'two-businesses-uid': [
      { businessNumber: '100000001', businessName: 'First' },
      { businessNumber: '100000002', businessName: 'Second' },
    ],
  };
  const calls: { request: Request; user: AgentHarnessUser; body: string }[] =
    [];
  let respond: (request: Request) => Response = () =>
    new Response(null, { status: 204 });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AgentHarnessController],
      providers: [
        {
          provide: AgentDomainService,
          useValue: new AgentDomainService(
            {} as never,
            {
              getUserBusinesses: async (owner: string) =>
                businessesOf[owner] ?? [],
            } as never,
            {} as never,
            {} as never,
          ),
        },
        {
          provide: AgentHarnessService,
          useValue: {
            handle: async (webRequest: Request, user: AgentHarnessUser) => {
              const body =
                webRequest.method === 'GET' ? '' : await webRequest.text();
              calls.push({ request: webRequest, user, body });
              return respond(webRequest);
            },
          },
        },
      ],
    })
      .overrideGuard(FirebaseAuthGuard)
      .useValue({
        canActivate: (context) => {
          const req = context.switchToHttp().getRequest();
          req.user = {
            firebaseId: signedIn.firebaseId,
            role: 'agent',
            businessNumber: signedIn.businessNumber,
            actorFirebaseId: signedIn.actorFirebaseId,
            delegationScopes: ['DOCUMENTS_READ'],
          };
          req.isDelegatedAccess =
            signedIn.actorFirebaseId !== signedIn.firebaseId;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    calls.length = 0;
    signedIn = {
      firebaseId: 'client-uid',
      actorFirebaseId: 'accountant-uid',
      businessNumber: '515151515',
    };
  });

  it('hands the agent the verified actor and owner, the URL and the raw body', async () => {
    respond = () => Response.json({ ok: true }, { status: 201 });

    const response = await request(app.getHttpServer())
      .post('/api/agent/fn/updateUserSetting')
      .set('content-type', 'application/json')
      .set('origin', 'http://app.keepintax.test')
      .send('{"userId":"u","change":{"field":"seeking","value":"x"}}');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(new URL(call.request.url).pathname).toBe(
      '/api/agent/fn/updateUserSetting',
    );
    expect(call.request.method).toBe('POST');
    expect(call.request.headers.get('origin')).toBe(
      'http://app.keepintax.test',
    );
    expect(call.body).toBe(
      '{"userId":"u","change":{"field":"seeking","value":"x"}}',
    );
    expect(call.user).toEqual({
      actorFirebaseId: 'accountant-uid',
      firebaseId: 'client-uid',
      businessNumber: '515151515',
      delegationScopes: ['DOCUMENTS_READ'],
      isDelegatedAccess: true,
      isAdminImpersonation: false,
    });
  });

  it("refuses a business that is not the data owner's, before the agent sees the request", async () => {
    // Another client's business number (or the accountant's own), sent
    // while acting for client-uid.
    signedIn.businessNumber = '100000001';

    const response = await request(app.getHttpServer()).get(
      '/api/agent/fn/listAgentChatConversations',
    );

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('AGENT_BUSINESS_FORBIDDEN');
    expect(calls).toHaveLength(0);
  });

  it("uses the owner's only numbered business without a header, and none when they have several", async () => {
    respond = () => new Response(null, { status: 204 });
    delete signedIn.businessNumber;

    await request(app.getHttpServer()).get('/api/agent/fn/readAgentSession');
    expect(calls[0].user.businessNumber).toBe('515151515');

    signedIn = {
      firebaseId: 'two-businesses-uid',
      actorFirebaseId: 'two-businesses-uid',
    };
    await request(app.getHttpServer()).get('/api/agent/fn/readAgentSession');
    expect(calls[1].user.businessNumber).toBeNull();
    expect(calls[1].user.isDelegatedAccess).toBe(false);
  });

  it('streams the agent response through as it comes', async () => {
    respond = () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    };

    const response = await request(app.getHttpServer()).get(
      '/api/agent/chats/0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f/stream',
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.text).toBe(
      'data: {"type":"start"}\n\ndata: [DONE]\n\n',
    );
  });

  it('answers 503 when the agent cannot be loaded', async () => {
    respond = () => {
      throw new Error('AGENT_BUNDLE_UNAVAILABLE');
    };

    const response = await request(app.getHttpServer()).get(
      '/api/agent/fn/readAgentSession',
    );

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AGENT_UNAVAILABLE');
  });
});
