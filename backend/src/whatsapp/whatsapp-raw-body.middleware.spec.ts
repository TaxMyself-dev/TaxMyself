import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as request from 'supertest';
import { whatsappRawBodyMiddleware } from './whatsapp-raw-body.middleware';

describe('whatsappRawBodyMiddleware', () => {
  it('keeps WhatsApp bytes raw while ordinary JSON remains parsed', async () => {
    const app = express();
    app.use(
      '/webhooks/mailgun',
      bodyParser.urlencoded({ extended: false, limit: '1mb' }),
    );
    app.use('/webhooks/meta/whatsapp', whatsappRawBodyMiddleware());
    app.use((req, res, next) => {
      if (req.body !== undefined) return next();
      return bodyParser.json()(req, res, next);
    });
    app.post('/webhooks/meta/whatsapp', (req: any, res) => {
      res.json({
        bodyIsBuffer: Buffer.isBuffer(req.body),
        rawIsBuffer: Buffer.isBuffer(req.rawBody),
        raw: req.rawBody.toString('utf8'),
      });
    });
    app.post('/ordinary', (req, res) => res.json(req.body));
    app.post('/agent/example', (req, res) => res.json(req.body));
    app.post('/feezback/example', (req, res) => res.json(req.body));
    app.post('/webhooks/mailgun/inbound', (req, res) => res.json(req.body));

    const raw = '{"spaced": true, "value": 1}';
    const whatsapp = await request(app)
      .post('/webhooks/meta/whatsapp')
      .set('content-type', 'application/json')
      .send(raw)
      .expect(200);
    expect(whatsapp.body).toEqual({
      bodyIsBuffer: true,
      rawIsBuffer: true,
      raw,
    });

    await request(app)
      .post('/ordinary')
      .send({ value: 2 })
      .expect(200, { value: 2 });
    await request(app)
      .post('/agent/example')
      .send({ value: 3 })
      .expect(200, { value: 3 });
    await request(app)
      .post('/feezback/example')
      .send({ value: 4 })
      .expect(200, { value: 4 });
    await request(app)
      .post('/webhooks/mailgun/inbound')
      .type('form')
      .send({ value: '5' })
      .expect(200, { value: '5' });
  });
});
