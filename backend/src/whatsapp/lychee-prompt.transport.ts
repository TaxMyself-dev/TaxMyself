import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { DataSource } from 'typeorm';
import { createHash } from 'node:crypto';
import { lycheeResponseShape } from './lychee-response-shape';
import { lycheeLog } from './lychee-log';
import { timePromptStage } from './lychee-prompt-timing';
import type { BusinessQuestionRequest } from './lychee-business-question';
import {
  PromptDeliveryError,
  promptDiagnostic,
} from './lychee-prompt-diagnostic';

export interface LycheeDeliveryScope {
  environment: 'development' | 'production';
  database: string;
}
// Existing deployment identities; copies and cross-environment connections are not delivery targets.
const deliveryDatabases = {
  development: 'keepintax-dev',
  production: 'keepintax-prod',
} as const;

export function questionIdempotencyKey(
  channelId: string,
  questionId: string,
  scope?: LycheeDeliveryScope,
): string {
  if (
    typeof questionId !== 'string' ||
    !/^[A-Za-z0-9_.:-]{1,255}$/.test(questionId) ||
    typeof channelId !== 'string' ||
    !channelId.trim() ||
    channelId.length > 255
  )
    throw new Error('Invalid question operation identifier');
  if (scope && deliveryDatabases[scope.environment] !== scope.database)
    throw new Error('Invalid Lychee delivery scope');
  return (
    'lychee-question-' +
    createHash('sha256')
      .update(
        JSON.stringify(
          scope?.environment === 'production'
            ? [
                'lychee.business-question.production.v1',
                scope.database,
                channelId,
                questionId,
              ]
            : ['lychee.business-question.dev.v1', channelId, questionId],
        ),
      )
      .digest('hex')
  );
}

export abstract class LycheePromptTransport {
  abstract readonly available: boolean;
  abstract send(
    request: BusinessQuestionRequest,
    questionId: string,
  ): Promise<string>;
}

/** Only explicitly named WhatsApp fields; never substitute Lychee's internal ID. */
function whatsappReceipt(data: any, allowWaId = false): string | undefined {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    data.ok === false
  )
    return undefined;
  // Lychee confirmed: send.waId is the WhatsApp message ID; messageId is internal.
  // Apply this alias only to send responses, not unrelated read-API fields.
  if (
    allowWaId &&
    typeof data.waId === 'string' &&
    data.waId.length > 0 &&
    data.waId.length <= 255 &&
    !/\s/.test(data.waId)
  )
    return data.waId;
  const ids = [
    data.whatsapp_message_id,
    data.message?.whatsapp_message_id,
  ].filter((id) => id != null);
  if (
    !ids.length ||
    ids.some(
      (id) =>
        typeof id !== 'string' ||
        !id.trim() ||
        id.length > 255 ||
        /\s/.test(id),
    ) ||
    new Set(ids).size !== 1
  )
    return undefined;
  return ids[0];
}

/** Explicit no-send transport retained for offline use. */
@Injectable()
export class NoSendPromptTransport extends LycheePromptTransport {
  readonly available = false;
  async send(): Promise<string> {
    throw new Error('Live question sending is not enabled');
  }
}

/** Low-level adapter: registered only behind the runtime/connection/channel guard. */
export class LycheeHttpPromptTransport extends LycheePromptTransport {
  readonly available = true;
  constructor(private readonly scope?: LycheeDeliveryScope) {
    super();
  }
  async send(
    request: BusinessQuestionRequest,
    questionId: string,
  ): Promise<string> {
    const idempotencyKey = questionIdempotencyKey(
      request.channel_id,
      questionId,
      this.scope,
    );
    const key = process.env.LYCHEE_API_KEY;
    if (!key) throw new Error('Lychee API key unavailable');
    // Normalize old persisted drafts at the wire boundary without editing their
    // immutable payload/hash or requeueing any quarantined question.
    const body = request.buttons
      ? {
          ...request,
          buttons: request.buttons.map((button) => ({
            text: typeof button === 'string' ? button : button.text,
          })),
        }
      : request;
    // Stable outbox identity, independent of leases, attempts, process restarts or API key.
    // Adding the header does not authorize automatic retries of quarantined questions.
    let response;
    try {
      response = await timePromptStage(
        questionId,
        'business.prompt.http.send',
        'בקשת HTTP לשליחת השאלה לליצ׳י והמתנה לתשובה',
        () =>
          axios.post(
            'https://app.lychee-ltd.com/api/wap/make-send-text',
            body,
            {
              headers: {
                Authorization: `Bearer ${key}`,
                'Idempotency-Key': idempotencyKey,
              },
              timeout: 15000,
              maxRedirects: 0,
              maxContentLength: 65536,
              maxBodyLength: 65536,
            },
          ),
      );
    } catch (error) {
      lycheeLog(
        questionId,
        'business.prompt.response',
        'failed',
        'מבנה תשובת שגיאת השליחה בלבד; אין ערכים, כותרות או תוכן הודעה',
        { responseShape: lycheeResponseShape((error as any)?.response?.data) },
      );
      throw new PromptDeliveryError(promptDiagnostic(error, request));
    }
    lycheeLog(
      questionId,
      'business.prompt.response',
      'completed',
      'התקבלה תשובת HTTP לשליחה; נרשמים שמות שדות וסוגים בלבד, לא אישור קישור מזהה',
      {
        httpStatus: response.status,
        responseShape: lycheeResponseShape(response.data),
      },
    );
    const directId = whatsappReceipt(response.data, true);
    if (directId) return directId;

    // Public docs: send returns {ok:true,message_id:<Lychee UUID>}. Resolve the
    // actual WhatsApp ID with a read-only lookup, never by sending again.
    // Live send responses use camelCase messageId. Its namespace is confirmed
    // through message-get when a valid direct WhatsApp receipt is unavailable.
    const references = [
      response.data?.message_id,
      response.data?.messageId,
    ].filter((value) => value != null);
    const reference = references[0];
    if (
      response.data?.ok === true &&
      typeof reference === 'string' &&
      reference.length > 0 &&
      reference.length <= 255 &&
      !/\s/.test(reference) &&
      new Set(references).size === 1
    ) {
      const internalId = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(
        reference,
      )
        ? reference
        : undefined;
      try {
        const lookup = await timePromptStage(
          questionId,
          'business.prompt.http.receipt_lookup',
          'בירור מזהה הודעת השאלה בליצ׳י דרך message-get',
          () =>
            axios.get('https://app.lychee-ltd.com/api/wap/message-get', {
              params: internalId
                ? { message_id: internalId }
                : { whatsapp_message_id: reference },
              headers: { Authorization: `Bearer ${key}` },
              timeout: 15000,
              maxRedirects: 0,
              maxContentLength: 65536,
            }),
        );
        const id = whatsappReceipt(lookup.data);
        // The observed read API returns message_id, whatsapp_message_id and
        // channel_id. Validate identity and channel before linking a document.
        if (
          id &&
          lookup.data?.channel_id === request.channel_id &&
          (internalId
            ? lookup.data?.message_id === internalId
            : id === reference)
        )
          return id;
        throw new PromptDeliveryError(
          {
            httpStatus: lookup.status,
            failureKind: 'missing_receipt',
            lycheeMessageId: internalId,
          },
          'Question receipt unavailable',
        );
      } catch (error) {
        if (error instanceof PromptDeliveryError) throw error;
        throw new PromptDeliveryError({
          ...promptDiagnostic(error, request),
          lycheeMessageId: internalId,
        });
      }
    }
    throw new PromptDeliveryError(
      { httpStatus: response.status, failureKind: 'missing_receipt' },
      'Question receipt unavailable',
    );
  }
}

/** No enable flag: use a matching existing deployment identity and recheck the live connection. */
@Injectable()
export class ConfiguredLycheeTransport extends LycheePromptTransport {
  constructor(private readonly db: DataSource) {
    super();
  }

  get available(): boolean {
    return this.scope() !== null;
  }

  private scope(): LycheeDeliveryScope | null {
    const environment = process.env.NODE_ENV;
    if (environment !== 'development' && environment !== 'production')
      return null;
    const database = deliveryDatabases[environment];
    if (
      process.env.DB_DATABASE !== database ||
      this.db.options.database !== database ||
      !process.env.LYCHEE_API_KEY?.trim() ||
      !process.env.LYCHEE_CHANNEL_ID?.trim()
    )
      return null;
    return { environment, database };
  }

  async send(
    request: BusinessQuestionRequest,
    questionId: string,
  ): Promise<string> {
    // Snapshot configuration, then check the actual connection and changes during the await.
    const scope = this.scope();
    const channel = process.env.LYCHEE_CHANNEL_ID;
    const key = process.env.LYCHEE_API_KEY;
    if (
      !scope ||
      request.channel_id !== channel ||
      !request.reply_to_whatsapp_message_id
    )
      throw new Error('Lychee sending not permitted for this environment');
    const rows = await timePromptStage(
      questionId,
      'business.prompt.db.environment',
      'אימות שמסד הנתונים הפעיל תואם לסביבת השליחה',
      () => this.db.query('SELECT DATABASE() AS db'),
    );
    if (
      rows.length !== 1 ||
      rows[0].db !== scope.database ||
      this.scope()?.environment !== scope.environment ||
      process.env.LYCHEE_CHANNEL_ID !== channel ||
      process.env.LYCHEE_API_KEY !== key
    ) {
      throw new Error('Lychee delivery environment or database mismatch');
    }
    return new LycheeHttpPromptTransport(scope).send(request, questionId);
  }
}
