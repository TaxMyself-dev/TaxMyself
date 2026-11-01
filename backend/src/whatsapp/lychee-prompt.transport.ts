import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { DataSource } from 'typeorm';
import type { BusinessQuestionRequest } from './lychee-business-question';

export abstract class LycheePromptTransport {
  abstract readonly available: boolean;
  abstract send(request: BusinessQuestionRequest): Promise<string>;
}

/** Explicit no-send transport retained for offline use. */
@Injectable()
export class NoSendPromptTransport extends LycheePromptTransport {
  readonly available = false;
  async send(): Promise<string> {
    throw new Error('Live question sending is not enabled');
  }
}

/** Low-level adapter: the application can reach it only through the development guard. */
export class LycheeHttpPromptTransport extends LycheePromptTransport {
  readonly available = true;
  async send(request: BusinessQuestionRequest): Promise<string> {
    const key = process.env.LYCHEE_API_KEY;
    if (!key) throw new Error('Lychee API key unavailable');
    // No automatic retry: the provider's idempotency contract is not established.
    const response = await axios.post(
      'https://app.lychee-ltd.com/api/wap/make-send-text',
      request,
      {
        headers: { Authorization: `Bearer ${key}` },
        timeout: 15000,
        maxRedirects: 0,
        maxContentLength: 65536,
        maxBodyLength: 65536,
      },
    );
    const id = response.data?.whatsapp_message_id;
    if (typeof id !== 'string' || !id.trim() || id.length > 255)
      throw new Error('Question receipt unavailable');
    return id;
  }
}

/** User-authorized development activation. No production binding or enable flag. */
@Injectable()
export class DevelopmentOnlyPromptTransport extends LycheePromptTransport {
  private readonly http = new LycheeHttpPromptTransport();
  constructor(private readonly db: DataSource) {
    super();
  }

  get available(): boolean {
    return (
      process.env.NODE_ENV === 'development' &&
      this.db.options.database === 'keepintax-dev' &&
      !!process.env.LYCHEE_API_KEY &&
      !!process.env.LYCHEE_CHANNEL_ID
    );
  }

  async send(request: BusinessQuestionRequest): Promise<string> {
    // Recheck at use, including the actual connection, not just DB_DATABASE from env.
    if (
      !this.available ||
      request.channel_id !== process.env.LYCHEE_CHANNEL_ID ||
      !request.reply_to_whatsapp_message_id
    )
      throw new Error('Development question sending not permitted');
    const rows = await this.db.query('SELECT DATABASE() AS db');
    if (
      rows.length !== 1 ||
      rows[0].db !== 'keepintax-dev' ||
      !this.available
    ) {
      throw new Error('Development question database mismatch');
    }
    return this.http.send(request);
  }
}
