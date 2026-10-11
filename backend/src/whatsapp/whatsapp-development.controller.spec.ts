import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { WhatsappDevelopmentController } from './whatsapp-development.controller';
import { WhatsappDevelopmentConfig } from './whatsapp-development.config';
import { WhatsappDevelopmentGuard } from './whatsapp-development.guard';
import { WhatsappRoutingService } from './whatsapp-routing.service';

describe('WhatsApp development HTTP boundaries', () => {
  let app: INestApplication;
  const original = { ...process.env };
  const token = 'local-token-at-least-24-characters';
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.WHATSAPP_DEV_ENABLED = 'true';
    process.env.WHATSAPP_DEV_TOKEN = token;
    process.env.WHATSAPP_DEV_CONTACTS = JSON.stringify([{ phone: '0500000001', firebaseId: 'u1', businesses: ['b1'] }]);
    const module = await Test.createTestingModule({
      controllers: [WhatsappDevelopmentController],
      providers: [WhatsappDevelopmentConfig, WhatsappDevelopmentGuard, WhatsappRoutingService],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); process.env = original; });
  it('requires a token before returning health or routing data', async () => {
    await request(app.getHttpServer()).get('/dev/whatsapp/health').expect(401);
    await request(app.getHttpServer()).post('/dev/whatsapp/resolve').send({ from: '0500000001' }).expect(401);
  });
  it('returns routed identity for an authorized development request', async () => {
    const response = await request(app.getHttpServer()).post('/dev/whatsapp/resolve')
      .set('x-whatsapp-dev-token', token).send({ from: '0500000001' }).expect(200);
    expect(response.body).toEqual({ status: 'READY', firebaseId: 'u1', businessNumber: 'b1' });
  });
  it('returns 400 for malformed inputs', async () => {
    await request(app.getHttpServer()).post('/dev/whatsapp/resolve')
      .set('x-whatsapp-dev-token', token).send({ from: 'bad' }).expect(400);
  });
  it('hides the endpoint when disabled or in production', async () => {
    process.env.WHATSAPP_DEV_ENABLED = 'false';
    await request(app.getHttpServer()).get('/dev/whatsapp/health').set('x-whatsapp-dev-token', token).expect(404);
    process.env.WHATSAPP_DEV_ENABLED = 'true';
    process.env.NODE_ENV = 'production';
    await request(app.getHttpServer()).get('/dev/whatsapp/health').set('x-whatsapp-dev-token', token).expect(404);
    process.env.NODE_ENV = 'test';
  });
});
