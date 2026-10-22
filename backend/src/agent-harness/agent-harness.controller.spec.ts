import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AgentHarnessController } from './agent-harness.controller';
import { AgentHarnessService, AgentHarnessUser } from './agent-harness.service';

// The agent harness's Nest edge: what the agent package receives (the
// verified user, the request as a web Request with its raw body) and that
// its Response streams back as it is. The guard is replaced by one that
// signs in a fixed caller, and the agent package by a fake.
describe('AgentHarnessController', () => {
  let app: INestApplication;
  const calls: { request: Request; user: AgentHarnessUser; body: string }[] =
    [];
  let respond: (request: Request) => Response = () =>
    new Response(null, { status: 204 });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AgentHarnessController],
      providers: [
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
            firebaseId: 'client-uid',
            role: 'agent',
            businessNumber: '515151515',
            actorFirebaseId: 'accountant-uid',
            delegationScopes: ['DOCUMENTS_READ'],
          };
          req.isDelegatedAccess = true;
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
