import { ConflictException, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Business } from '../business/business.entity';
import { lycheeSender } from './lychee-sender';
import { LycheeEventStore } from './lychee-event.store';
import {
  LycheePromptStore,
  PromptJob,
  promptHash,
} from './lychee-prompt.store';
import { LycheePromptTransport } from './lychee-prompt.transport';
import { lycheeLog, safeLycheeError } from './lychee-log';

@Injectable()
export class LycheePromptService {
  private running = false;
  constructor(
    private readonly outbox: LycheePromptStore,
    private readonly events: LycheeEventStore,
    private readonly transport: LycheePromptTransport,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Business)
    private readonly businesses: Repository<Business>,
  ) {}

  @Interval(10000)
  async tick(): Promise<void> {
    // Registered transport permits only the explicitly authorized development runtime.
    if (!this.transport.available || this.running) return;
    this.running = true;
    let job: PromptJob | null = null;
    let sendStarted = false;
    let receiptKnown = false;
    try {
      job = await this.outbox.claim();
      if (!job) return;
      if (
        job.payload.kind !== 'BUSINESS_QUESTION' ||
        promptHash(job.payload) !== job.payload_hash
      ) {
        await this.outbox.finish(job, 'PROMPT_CANCELLED', 'DRAFT_MISMATCH');
        return;
      }
      if (job.status === 'PROMPT_LINKING') {
        receiptKnown = true;
        await this.link(job);
        return;
      }
      const parent = await this.outbox.parent(job);
      if (parent.prompt_whatsapp_message_id) {
        // Recovery if a valid mapping already exists: never send another question.
        await this.outbox.receipt(job, parent.prompt_whatsapp_message_id);
        receiptKnown = true;
        await this.link(job);
        return;
      }
      const user = await this.users.findOne({
        where: { firebaseId: job.firebase_id },
      });
      const owned = await this.businesses.find({
        where: { firebaseId: job.firebase_id },
      });
      const request = job.payload.request;
      if (
        !user ||
        parent.status !== 'WAITING_FOR_BUSINESS' ||
        lycheeSender({ contact_phone: user.phone }) !== job.sender_phone ||
        parent.sender_phone !== job.sender_phone ||
        request.phone !== job.sender_phone ||
        request.channel_id !== job.channel_id ||
        request.reply_to_whatsapp_message_id !==
          parent.payload.whatsapp_message_id ||
        !Array.isArray(parent.business_choices) ||
        promptHash({ ...job.payload, choices: parent.business_choices }) !==
          job.payload_hash ||
        job.payload.choices.some(
          (c) => !owned.some((b) => b.businessNumber === c.businessNumber),
        )
      ) {
        await this.outbox.finish(
          job,
          'PROMPT_CANCELLED',
          'OWNER_OR_DOCUMENT_CHANGED',
        );
        return;
      }
      lycheeLog(
        job.payload.documentEventId,
        'business.prompt.send',
        'started',
        'מתחיל ניסיון יחיד לשליחת שאלת בחירת עסק',
      );
      sendStarted = true;
      const id = await this.transport.send(request);
      if (typeof id !== 'string' || !id.trim() || id.length > 255)
        throw new Error('Question receipt unavailable');
      // Retry only persistence of this exact receipt, never the external send.
      try {
        await this.outbox.receipt(job, id);
      } catch {
        await this.outbox.receipt(job, id);
      }
      receiptKnown = true;
      await this.link(job);
    } catch (error) {
      if (job) {
        const conflict = (error as any)?.getStatus?.() === 409;
        const status = conflict
          ? 'PROMPT_CANCELLED'
          : receiptKnown
          ? 'PROMPT_LINK'
          : sendStarted
          ? 'PROMPT_UNKNOWN'
          : 'PROMPT_PENDING';
        try {
          await this.outbox.finish(
            job,
            status,
            conflict
              ? 'MAPPING_OR_DOCUMENT_CONFLICT'
              : receiptKnown
              ? 'LINK_RETRY'
              : sendStarted
              ? 'SEND_RESULT_UNKNOWN'
              : 'PREFLIGHT_RETRY',
          );
        } catch {
          /* Expired lease recovery preserves the same no-resend policy. */
        }
        lycheeLog(
          job.payload.documentEventId,
          receiptKnown ? 'business.prompt.link' : 'business.prompt.send',
          'failed',
          conflict
            ? 'קיימת סתירה במסמך או במיפוי השאלה; הטיפול נעצר ללא שליחה נוספת'
            : receiptKnown
            ? 'מזהה השאלה שמור; יתבצע ניסיון קישור נוסף ללא שליחה חוזרת'
            : sendStarted
            ? 'תוצאת השליחה אינה ודאית; השאלה הועברה לבירור ולא תישלח שוב אוטומטית'
            : 'בדיקת השאלה נכשלה לפני שליחה; מתוכנן ניסיון נוסף ללא שליחת הודעה כעת',
        );
      } else {
        const diagnostic = safeLycheeError(error);
        lycheeLog(
          undefined,
          'business.prompt.claim',
          'failed',
          diagnostic.reason,
          { code: diagnostic.code },
        );
      }
    } finally {
      this.running = false;
    }
  }

  private async link(job: PromptJob) {
    const id = job.payload.providerMessageId;
    if (typeof id !== 'string' || !id.trim() || id.length > 255)
      throw new ConflictException('Question receipt unavailable');
    await this.events.recordPrompt(
      job.payload.documentEventId,
      job.channel_id,
      job.firebase_id,
      id,
    );
    await this.outbox.finish(job, 'PROMPT_SENT');
    lycheeLog(
      job.payload.documentEventId,
      'business.prompt.link',
      'completed',
      'מזהה השאלה נשמר וקושר למסמך המתאים',
    );
  }
}
