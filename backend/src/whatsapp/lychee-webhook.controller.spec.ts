import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { json } from 'express';
import * as request from 'supertest';
import { createHmac } from 'crypto';
import { LycheeWebhookController } from './lychee-webhook.controller';
import { LycheeIntakeService } from './lychee-intake.service';

describe('Lychee HTTP boundary (no external services)', () => {
  let app: INestApplication;
  const original = { ...process.env };
  const accept = jest.fn();
  const raw = JSON.stringify(
    {
      event: 'message.received',
      event_id: 'test-event',
      channel_id: 'channel',
      message_id: 'msg',
      whatsapp_message_id: 'wamid',
      sender_phone: '972501234567',
      contact_phone: '972501234567',
      message_type: 'document',
      has_media: true,
      text: 'test.pdf',
      reply_to_whatsapp_message_id: null,
    },
    null,
    2,
  );
  const signature =
    'sha256=' + createHmac('sha256', 'test-secret').update(raw).digest('hex');
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [LycheeWebhookController],
      providers: [{ provide: LycheeIntakeService, useValue: { accept } }],
    }).compile();
    app = module.createNestApplication({ bodyParser: false });
    app.use(
      '/webhooks/lychee',
      json({
        limit: '256kb',
        inflate: false,
        verify: (req: any, _res, buf) => {
          req.rawBody = buf;
        },
      }),
    );
    await app.init();
  });
  beforeEach(() => {
    process.env.LYCHEE_INTAKE_ENABLED = 'true';
    process.env.LYCHEE_WEBHOOK_SECRET = 'test-secret';
    process.env.LYCHEE_CHANNEL_ID = 'channel';
    accept.mockReset();
  });
  afterAll(async () => {
    process.env = original;
    await app.close();
  });
  it('acknowledges only after durable intake resolves', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/lychee')
      .set('Content-Type', 'application/json')
      .set('x-lychee-signature', signature)
      .send(raw)
      .expect(200);
    expect(accept).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: 'test-event' }),
    );
  });
  it('rejects unsigned requests without storing', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/lychee')
      .send(JSON.parse(raw))
      .expect(401);
    expect(accept).not.toHaveBeenCalled();
  });
  it('fails closed without a secret', async () => {
    delete process.env.LYCHEE_WEBHOOK_SECRET;
    await request(app.getHttpServer())
      .post('/webhooks/lychee')
      .send(JSON.parse(raw))
      .expect(503);
    expect(accept).not.toHaveBeenCalled();
  });
  it('receives signed events without an intake enable flag', async () => {
    delete process.env.LYCHEE_INTAKE_ENABLED;
    await request(app.getHttpServer())
      .post('/webhooks/lychee')
      .set('Content-Type', 'application/json')
      .set('x-lychee-signature', signature)
      .send(raw)
      .expect(200);
    expect(accept).toHaveBeenCalled();
  });
});
