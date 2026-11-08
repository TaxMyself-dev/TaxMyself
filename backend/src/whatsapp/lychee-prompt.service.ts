import { ConflictException, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Business } from '../business/business.entity';
import {
  lycheeAccountsForPhone,
  lycheeAccountHasPhone,
} from './lychee-account-lookup';
import { LycheeEventStore } from './lychee-event.store';
import {
  LycheePromptStore,
  PromptJob,
  promptHash,
} from './lychee-prompt.store';
import { LycheePromptTransport } from './lychee-prompt.transport';
import { LycheeImmediateQueue } from './lychee-immediate-queue';
import { timePromptStage } from './lychee-prompt-timing';
import { lycheeLog, safeLycheeError } from './lychee-log';
import {
  PromptDeliveryError,
  promptDiagnostic,
} from './lychee-prompt-diagnostic';

@Injectable()
export class LycheePromptService {
  private running = false;
  private readonly immediate = new LycheeImmediateQueue(
    () => this.tick(),
    () => this.running,
    () =>
      lycheeLog(
        undefined,
        'business.prompt.wakeup',
        'failed',
        'ההפעלה המיידית של השאלות נכשלה; הסבב התקופתי ימשיך מהתור השמור',
      ),
  );
  constructor(
    private readonly outbox: LycheePromptStore,
    private readonly events: LycheeEventStore,
    private readonly transport: LycheePromptTransport,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Business)
    private readonly businesses: Repository<Business>,
  ) {}

  wake(): void {
    this.immediate.request();
  }
  onModuleDestroy(): void {
    this.immediate.stop();
  }

  @Interval(10000)
  async tick(): Promise<void> {
    // Registered transport requires matching deployment/database identity and valid configuration.
    if (!this.transport.available || this.running) return;
    this.running = true;
    let job: PromptJob | null = null;
    let sendStarted = false;
    let receiptKnown = false;
    const started = Date.now();
    try {
      job = await this.outbox.claim();
      if (!job) return;
      lycheeLog(
        job.payload.documentEventId,
        'business.prompt.db.claim',
        'completed',
        'נטילת השאלה מהתור ונעילתה במסד',
        { durationMs: Math.max(0, Date.now() - started) },
      );
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
      const parent = await timePromptStage(
        job.payload.documentEventId,
        'business.prompt.db.document',
        'קריאת המסמך ומיפוי השאלה מהמסד',
        () => this.outbox.parent(job!),
      );
      if (parent.prompt_whatsapp_message_id) {
        // Recovery if a valid mapping already exists: never send another question.
        await timePromptStage(
          job.payload.documentEventId,
          'business.prompt.db.receipt',
          'שמירת מזהה הודעת השאלה בתור העמיד',
          () => this.outbox.receipt(job!, parent.prompt_whatsapp_message_id),
        );
        receiptKnown = true;
        await this.link(job);
        return;
      }
      const matches = await timePromptStage(
        job.payload.documentEventId,
        'business.prompt.db.user',
        'בדיקת חשבון המשתמש במסד',
        () => lycheeAccountsForPhone(this.users, job!.sender_phone),
      );
      const user = matches.length === 1 ? matches[0] : null;
      const owned = await timePromptStage(
        job.payload.documentEventId,
        'business.prompt.db.businesses',
        'בדיקת העסקים שבבעלות המשתמש במסד',
        () =>
          this.businesses.find({
            where: { firebaseId: job.firebase_id },
          }),
      );
      const request = job.payload.request;
      if (
        !user ||
        user.firebaseId !== job.firebase_id ||
        parent.status !== 'WAITING_FOR_BUSINESS' ||
        !lycheeAccountHasPhone(user, job.sender_phone) ||
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
      sendStarted = true;
      const id = await timePromptStage(
        job.payload.documentEventId,
        'business.prompt.send',
        'ניסיון יחיד לשליחת שאלת בחירת העסק, כולל בדיקת סביבת דב ובירור מזהה אם נדרש',
        () => this.transport.send(request, job!.event_id),
      );
      if (typeof id !== 'string' || !id.trim() || id.length > 255)
        throw new Error('Question receipt unavailable');
      // Retry only persistence of this exact receipt, never the external send.
      await timePromptStage(
        job.payload.documentEventId,
        'business.prompt.db.receipt',
        'שמירת מזהה הודעת השאלה בתור העמיד, כולל ניסיון שמירה נוסף אם נדרש',
        async () => {
          try {
            await this.outbox.receipt(job!, id);
          } catch {
            await this.outbox.receipt(job!, id);
          }
        },
      );
      receiptKnown = true;
      await this.link(job);
    } catch (error) {
      if (job) {
        const diagnostic =
          error instanceof PromptDeliveryError
            ? error.diagnostic
            : promptDiagnostic(error, job.payload.request);
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
          { ...diagnostic, durationMs: Date.now() - started },
        );
      } else {
        const diagnostic = safeLycheeError(error);
        lycheeLog(
          undefined,
          'business.prompt.claim',
          'failed',
          diagnostic.reason,
          {
            code: diagnostic.code,
            durationMs: Math.max(0, Date.now() - started),
          },
        );
      }
    } finally {
      this.running = false;
      this.immediate.idle(!!job);
    }
  }

  private async link(job: PromptJob) {
    const started = Date.now();
    const id = job.payload.providerMessageId;
    if (typeof id !== 'string' || !id.trim() || id.length > 255)
      throw new ConflictException('Question receipt unavailable');
    await timePromptStage(
      job.payload.documentEventId,
      'business.prompt.db.mapping',
      'שמירת הקישור בין מזהה הודעת השאלה למסמך',
      () =>
        this.events.recordPrompt(
          job.payload.documentEventId,
          job.channel_id,
          job.firebase_id,
          id,
        ),
    );
    await timePromptStage(
      job.payload.documentEventId,
      'business.prompt.db.finish',
      'סימון השאלה כנשלחה במסד',
      () => this.outbox.finish(job, 'PROMPT_SENT'),
    );
    lycheeLog(
      job.payload.documentEventId,
      'business.prompt.link',
      'completed',
      'מזהה השאלה נשמר וקושר למסמך המתאים',
      { durationMs: Math.max(0, Date.now() - started) },
    );
  }
}
