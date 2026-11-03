import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Business } from '../business/business.entity';
import { LycheePromptTransport } from './lychee-prompt.transport';
import { LycheeImmediateQueue } from './lychee-immediate-queue';
import { lycheeLog, safeLycheeError } from './lychee-log';
import { timePromptStage } from './lychee-prompt-timing';
import {
  PromptDeliveryError,
  promptDiagnostic,
} from './lychee-prompt-diagnostic';
import {
  documentResult,
  isPhoneOnlyFailure,
  LycheeNotificationStore,
  ResultJob,
  resultEventId,
  resultHash,
} from './lychee-notification.store';

/** Separate injection token: enabling development business questions does NOT enable result messages. */
export abstract class LycheeNotificationTransport extends LycheePromptTransport {}
@Injectable()
export class NoSendNotificationTransport extends LycheeNotificationTransport {
  readonly available = false;
  async send(): Promise<string> {
    throw new Error('Notification sending is not authorized');
  }
}

@Injectable()
export class LycheeNotificationService {
  private running = false;
  private readonly immediate = new LycheeImmediateQueue(
    () => this.tick(),
    () => this.running,
    () =>
      lycheeLog(
        undefined,
        'notification.wakeup',
        'failed',
        'הפעלת ההתראות נכשלה; הסבב התקופתי ימשיך מהתור השמור',
      ),
  );
  constructor(
    private readonly outbox: LycheeNotificationStore,
    private readonly transport: LycheeNotificationTransport,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Business)
    private readonly businesses: Repository<Business>,
  ) {}
  wake(): void {
    // No reads, writes or external calls while result delivery is not authorized.
    if (this.transport.available) this.immediate.request();
  }
  onModuleDestroy(): void {
    this.immediate.stop();
  }

  @Interval(10000)
  async tick(): Promise<void> {
    if (!this.transport.available || this.running) return;
    this.running = true;
    let job: ResultJob | null = null;
    let sendStarted = false,
      receiptKnown = false;
    try {
      job = await this.outbox.claim();
      if (!job) return;
      const draft = job.payload;
      if (
        !draft?.request ||
        draft.kind !== 'DOCUMENT_RESULT' ||
        resultHash(draft) !== job.payload_hash ||
        resultEventId(draft) !== job.event_id ||
        draft.request.channel_id !== job.channel_id ||
        draft.request.phone !== job.sender_phone ||
        draft.request.buttons !== undefined
      ) {
        await this.cancel(job, 'DRAFT_MISMATCH');
        return;
      }
      if (job.status === 'NOTICE_RECORDING') {
        if (!draft.providerMessageId) {
          await this.cancel(job, 'RECEIPT_MISSING');
          return;
        }
        receiptKnown = true;
        await this.sent(job);
        return; // Persistence recovery only; never send again.
      }
      const parent = await timePromptStage(
        draft.documentEventId,
        'notification.db.document',
        'בדיקת תוצאת הייבוא הסופית לפני דיווח למשתמש',
        () => this.outbox.parent(job!),
      );
      const expected = parent && documentResult(parent);
      if (!expected || resultHash(expected) !== job.payload_hash) {
        await this.cancel(job, 'DOCUMENT_RESULT_CHANGED');
        return;
      }
      const phoneOnlyFailure = isPhoneOnlyFailure(expected);
      // A fixed rejection explains why account resolution failed; requiring a
      // unique account again would silently cancel that very explanation.
      const matches = phoneOnlyFailure
        ? []
        : await timePromptStage(
            draft.documentEventId,
            'notification.db.user',
            'אימות שהנמען עדיין משויך לחשבון יחיד',
            () =>
              this.users
                .createQueryBuilder('u')
                .where(
                  "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(u.phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', '') IN (:...phones)",
                  {
                    phones: [
                      job!.sender_phone,
                      '0' + job!.sender_phone.slice(3),
                    ],
                  },
                )
                .take(2)
                .getMany(),
          );
      if (
        !phoneOnlyFailure &&
        (matches.length !== 1 ||
          (draft.owner && matches[0].firebaseId !== draft.owner))
      ) {
        await this.cancel(job, 'RECIPIENT_CHANGED_OR_AMBIGUOUS');
        return;
      }
      if (draft.business) {
        const business = await timePromptStage(
          draft.documentEventId,
          'notification.db.business',
          'בדיקת בעלות עדכנית על העסק שבמסמך',
          () =>
            this.businesses.findOne({
              where: {
                firebaseId: matches[0].firebaseId,
                businessNumber: draft.business!,
              },
            }),
        );
        if (!business) {
          await this.cancel(job, 'BUSINESS_OWNER_CHANGED');
          return;
        }
      }
      sendStarted = true;
      const id = await timePromptStage(
        draft.documentEventId,
        'notification.send',
        'ניסיון יחיד לשליחת תוצאת שמירת המסמך, בציטוט המסמך המקורי',
        () => this.transport.send(expected.request, job!.event_id),
      );
      // A successful provider response is acceptance, not proof of delivery to the phone.
      await timePromptStage(
        draft.documentEventId,
        'notification.db.receipt',
        'שמירת מזהה הודעת התוצאה במסד',
        async () => {
          try {
            await this.outbox.receipt(job!, id);
          } catch {
            await this.outbox.receipt(job!, id);
          } // Exact receipt only, never repeat HTTP.
        },
      );
      receiptKnown = true;
      await this.sent(job);
    } catch (error) {
      const diagnostic =
        error instanceof PromptDeliveryError
          ? error.diagnostic
          : promptDiagnostic(error, job?.payload?.request);
      const status = receiptKnown
        ? 'NOTICE_RECORD'
        : sendStarted
        ? 'NOTICE_UNKNOWN'
        : 'NOTICE_PENDING';
      lycheeLog(
        job?.payload?.documentEventId,
        'notification.result',
        'failed',
        sendStarted && !receiptKnown
          ? 'תוצאת שליחת ההתראה אינה ודאית; אין שליחה חוזרת אוטומטית'
          : receiptKnown
          ? 'הספק כבר קיבל את ההודעה; יבוצע ניסיון נוסף לשמירת הסטטוס בלבד'
          : 'ההתראה לא נשלחה; בדיקות מקדימות יבוצעו שוב בסבב הבא',
        diagnostic,
      );
      if (job) {
        try {
          await this.outbox.finish(
            job,
            status,
            sendStarted ? 'SEND_RESULT_UNKNOWN' : 'PREFLIGHT_FAILED',
          );
        } catch (persistError) {
          lycheeLog(
            job.payload.documentEventId,
            'notification.db.recovery',
            'failed',
            'שמירת מצב ההתראה נכשלה; הנעילה תפוג וניתן יהיה להתאושש ללא שליחה כפולה',
            { code: safeLycheeError(persistError).code },
          );
        }
      }
    } finally {
      this.running = false;
      this.immediate.idle(!!job);
    }
  }
  private async cancel(job: ResultJob, code: string): Promise<void> {
    await this.outbox.finish(job, 'NOTICE_CANCELLED', code);
    lycheeLog(
      job.payload?.documentEventId,
      'notification.preflight',
      'blocked',
      'ההתראה בוטלה כי המסמך, הנמען או הבעלות אינם תואמים עוד לתוצאה שנשמרה',
      { code },
    );
  }
  private async sent(job: ResultJob): Promise<void> {
    await timePromptStage(
      job.payload.documentEventId,
      'notification.db.complete',
      'שמירת סיום הטיפול בהתראה לאחר אישור קבלה מהספק',
      () => this.outbox.finish(job, 'NOTICE_SENT'),
    );
    lycheeLog(
      job.payload.documentEventId,
      'notification.result',
      'completed',
      'הספק אישר קבלת הודעת התוצאה ומזהה ההודעה נשמר; אין בכך אישור מסירה לטלפון',
    );
  }
}
