import {
  Controller,
  Post,
  Req,
  HttpCode,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { normalizeWhatsappPhone } from './whatsapp-development.config';
import { LycheeIntakeService } from './lychee-intake.service';

export interface LycheeEvent {
  event: 'message.received';
  event_id: string;
  channel_id: string;
  message_id: string;
  whatsapp_message_id: string;
  sender_phone: string;
  contact_phone: string;
  message_type: string;
  has_media: boolean;
  text: string;
  reply_to_whatsapp_message_id: string | null;
}

export function parseLycheeEvent(
  raw: Buffer,
  header: unknown,
  secret: string,
  channel: string,
): LycheeEvent {
  const expected =
    'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  if (
    typeof header !== 'string' ||
    !/^sha256=[a-f0-9]{64}$/.test(header) ||
    !timingSafeEqual(Buffer.from(header), Buffer.from(expected))
  )
    throw new UnauthorizedException();
  let e: LycheeEvent;
  try {
    e = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new BadRequestException();
  }
  if (
    !e ||
    e.event !== 'message.received' ||
    e.channel_id !== channel ||
    ![e.event_id, e.message_id, e.whatsapp_message_id].every(
      (x) => typeof x === 'string' && x.length > 0 && x.length <= 255,
    ) ||
    typeof e.has_media !== 'boolean' ||
    typeof e.message_type !== 'string' ||
    typeof e.text !== 'string' ||
    e.text.length > 8192 ||
    !(
      e.reply_to_whatsapp_message_id === null ||
      (typeof e.reply_to_whatsapp_message_id === 'string' &&
        e.reply_to_whatsapp_message_id.length <= 255)
    ) ||
    !normalizeWhatsappPhone(e.sender_phone) ||
    normalizeWhatsappPhone(e.sender_phone) !==
      normalizeWhatsappPhone(e.contact_phone)
  ) {
    throw new BadRequestException('Invalid Lychee event');
  }
  return e;
}

@Controller('webhooks/lychee')
export class LycheeWebhookController {
  constructor(private readonly intake: LycheeIntakeService) {}
  @Post()
  @HttpCode(200)
  async receive(@Req() req: Request & { rawBody?: Buffer }) {
    if (process.env.LYCHEE_INTAKE_ENABLED !== 'true')
      throw new NotFoundException();
    const secret = process.env.LYCHEE_WEBHOOK_SECRET;
    const channel = process.env.LYCHEE_CHANNEL_ID;
    if (!secret || !channel) throw new ServiceUnavailableException();
    if (!Buffer.isBuffer(req.rawBody))
      throw new BadRequestException('Raw body unavailable');
    const event = parseLycheeEvent(
      req.rawBody,
      req.headers['x-lychee-signature'],
      secret,
      channel,
    );
    await this.intake.accept(event);
    return { received: true };
  }
}
