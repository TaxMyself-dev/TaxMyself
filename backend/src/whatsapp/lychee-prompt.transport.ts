import { Injectable } from '@nestjs/common';
import axios from 'axios';
import type { BusinessQuestionRequest } from './lychee-business-question';

export abstract class LycheePromptTransport {
  abstract readonly available: boolean;
  abstract send(request: BusinessQuestionRequest): Promise<string>;
}

/** The ONLY transport registered in the running app. No env flag enables sends. */
@Injectable()
export class NoSendPromptTransport extends LycheePromptTransport {
  readonly available = false;
  async send(): Promise<string> {
    throw new Error('Live question sending is not enabled');
  }
}

/** Contract implementation, tested with mocked axios only. NOT registered in Nest. */
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
