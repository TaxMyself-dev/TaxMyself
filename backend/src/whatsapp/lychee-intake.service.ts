import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Business } from '../business/business.entity';
import { DocumentImportService } from '../document-import/document-import.service';
import { DocumentImportSource } from '../document-import/enums/document-import.enums';
import { lycheeSender } from './lychee-sender';
import { buildBusinessQuestion } from './lychee-business-question';
import { LycheeEventStore, LycheeJob } from './lychee-event.store';
import { LycheeClient } from './lychee-client.service';
import type { LycheeEvent } from './lychee-webhook.controller';
import {
  lycheeLog,
  lycheeStep,
  LycheeStepError,
  safeLycheeError,
} from './lychee-log';

@Injectable()
export class LycheeIntakeService {
  private running = false;
  constructor(
    private readonly store: LycheeEventStore,
    private readonly client: LycheeClient,
    private readonly importer: DocumentImportService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Business)
    private readonly businesses: Repository<Business>,
  ) {}

  async accept(event: LycheeEvent): Promise<void> {
    try {
      const saved = await lycheeStep(
        event.event_id,
        'queue.save',
        'שמירת האירוע בתור העמיד ובדיקת כפילויות',
        () => this.store.enqueue(event),
      );
      lycheeLog(event.event_id, 'queue.save', 'completed', saved === 'DUPLICATE' ?
        'אותו אירוע כבר נשמר; אושר ניסיון המסירה החוזר ללא יצירת עבודת עיבוד נוספת' :
        'האירוע נשמר בתור; אפשר לאשר לספק קבלה');
    } catch (e) {
      if ((e as any)?.getStatus?.() === 409) throw e;
      throw new ServiceUnavailableException(
        'Lychee intake storage unavailable',
      );
    }
  }

  @Interval(10000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    let job: LycheeJob | null = null;
    try {
      job = await this.store.claim();
      if (job) {
        lycheeLog(
          job.event_id,
          'queue.claim',
          'completed',
          'אירוע נלקח לעיבוד',
          { attempts: job.attempts },
        );
        await this.process(job);
        lycheeLog(
          job.event_id,
          'worker',
          'completed',
          'ניסיון העיבוד הסתיים; התוצאה מפורטת בשלבים הקודמים',
        );
      }
    } catch (error) {
      const diagnostic =
        error instanceof LycheeStepError
          ? error.diagnostic
          : safeLycheeError(error);
      lycheeLog(
        job?.event_id,
        error instanceof LycheeStepError
          ? error.stage
          : job
          ? 'document.process'
          : 'queue.claim',
        'failed',
        diagnostic.reason,
        {
          httpStatus: diagnostic.httpStatus,
          code: diagnostic.code,
          attempts: job?.attempts,
        },
      );
      if (job) {
        try {
          await this.store.retry(job);
          lycheeLog(
            job.event_id,
            'queue.retry',
            job.attempts >= 5 ? 'blocked' : 'scheduled',
            job.attempts >= 5
              ? 'חמישה ניסיונות נכשלו; האירוע הועבר ל־FAILED ולא ינסה שוב אוטומטית'
              : 'הניסיון נכשל; ניסיון נוסף מתוכנן בעוד 60 שניות',
            { attempts: job.attempts },
          );
        } catch (retryError) {
          lycheeLog(
            job.event_id,
            'queue.retry',
            'failed',
            'לא ניתן לשמור ניסיון חוזר; שחזור יתאפשר לאחר פקיעת נעילת התור',
            { code: safeLycheeError(retryError).code },
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  async process(job: LycheeJob): Promise<void> {
    const e = job.payload;
    if (e.has_media && !['document', 'image'].includes(e.message_type)) {
      lycheeLog(
        e.event_id,
        'media.type',
        'blocked',
        'סוג ההודעה אינו מסמך או תמונה; לא תבוצע הורדה',
      );
      await this.store.complete(job, 'IGNORED');
      return;
    }
    const normalized = lycheeSender(e);
    if (!normalized) {
      lycheeLog(
        e.event_id,
        'sender.resolve',
        'blocked',
        'מספר השולח חסר, אינו תקין או סותר את מספר איש הקשר',
      );
      await this.store.complete(job, 'REJECTED_SENDER');
      return;
    }
    // Signup phone is the approved account mapping. Reject shared/missing phones.
    const users = await lycheeStep(
      e.event_id,
      'user.lookup',
      'איתור חשבון לפי מספר השולח המנורמל',
      () =>
        this.users
          .createQueryBuilder('u')
          .where(
            "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(u.phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', '') IN (:...phones)",
            { phones: [normalized, '0' + normalized.slice(3)] },
          )
          .take(2)
          .getMany(),
    );
    if (users.length !== 1) {
      lycheeLog(
        e.event_id,
        'user.lookup',
        'blocked',
        users.length
          ? 'מספר הטלפון משויך ליותר מחשבון אחד'
          : 'לא נמצא משתמש רשום עם מספר הטלפון הזה',
        { count: users.length },
      );
      await this.store.complete(job, 'REJECTED_SENDER');
      return;
    }
    const owner = users[0].firebaseId;
    lycheeLog(e.event_id, 'user.lookup', 'completed', 'נמצא חשבון יחיד');
    if (!e.has_media) {
      const selected = await this.store.selectBusiness(e, owner);
      lycheeLog(
        e.event_id,
        'business.reply',
        selected ? 'completed' : 'blocked',
        selected
          ? 'תשובת בחירת העסק זוהתה והמסמך הוחזר לעיבוד'
            : 'בחירת העסק לא התקבלה; הסיבה המפורטת מופיעה בלוג business.reply.match; אין ייבוא',
      );
      await this.store.complete(
        job,
        selected ? 'BUSINESS_SELECTED' : 'IGNORED',
        owner,
      );
      return;
    }
    const businesses = (
      await lycheeStep(
        e.event_id,
        'business.lookup',
        'איתור העסקים שבבעלות המשתמש',
        () => this.businesses.find({ where: { firebaseId: owner } }),
      )
    ).filter((b) => !!b.businessNumber);
    if (!businesses.length) {
      lycheeLog(
        e.event_id,
        'business.lookup',
        'blocked',
        'למשתמש אין עסק בעל מספר עסק שניתן לייבא אליו',
      );
      await this.store.complete(job, 'REJECTED_BUSINESS', owner);
      return;
    }
    lycheeLog(
      e.event_id,
      'business.lookup',
      'completed',
      'נמצאו עסקים מורשים',
      { count: businesses.length },
    );
    const prepared = await this.store.prepared(job);
    if (prepared?.firebase_id && prepared.firebase_id !== owner) {
      lycheeLog(
        e.event_id,
        'business.ownership',
        'blocked',
        'בעל החשבון השתנה מאז שמירת המסמך; הייבוא נעצר',
      );
      await this.store.complete(job, 'REJECTED_SENDER');
      return;
    }
    const selected = prepared?.business_number;
    if (selected && !businesses.some((b) => b.businessNumber === selected)) {
      lycheeLog(
        e.event_id,
        'business.ownership',
        'blocked',
        'העסק שנבחר אינו שייך עוד למשתמש',
      );
      await this.store.complete(job, 'REJECTED_BUSINESS', owner);
      return;
    }
    const file = prepared?.content
      ? {
          content: Buffer.from(prepared.content),
          filename: prepared.filename,
          mimeType: prepared.mime_type,
        }
      : await this.client.download(e.message_id, e.event_id);
    lycheeLog(
      e.event_id,
      'media.ready',
      'completed',
      prepared?.content ? 'נעשה שימוש בקובץ שנשמר בהמתנה' : 'הקובץ הורד ונבדק',
      { bytes: file.content.length },
    );
    if (businesses.length > 1 && !selected) {
      // Prepare a vendor-compatible question, but never send or invent a prompt ID.
      const question = buildBusinessQuestion(e, normalized, businesses);
      await lycheeStep(
        e.event_id,
        'business.wait',
        'שמירת המסמך עד לבחירת עסק',
        () =>
          this.store.waitForBusiness(
            job,
            owner,
            question.choices,
            file,
          ),
      );
      lycheeLog(e.event_id, 'business.prompt.queued', 'completed',
        'שאלת בחירת העסק נשמרה בתור יחד עם המסמך; רכיב השליחה יבדוק הרשאת סביבת דב לפני משלוח',
        { count: question.choices.length });
      lycheeLog(
        e.event_id,
        'business.wait',
        'blocked',
        'יש כמה עסקים; המסמך ממתין לבחירה. שליחת השאלה עדיין אינה ממומשת',
      );
      return;
    }
    const businessNumber = selected || businesses[0].businessNumber;
    const result = await lycheeStep(
      e.event_id,
      'drive.import',
      'הפעלת מנגנון הייבוא: בדיקת תיקיית העסק, כפילות והעלאה לדרייב',
      async () => {
        const imported = await this.importer.importDocument({
          firebaseId: owner,
          businessNumber,
          source: DocumentImportSource.API_IMPORT,
          ...file,
        });
        if (!imported.driveFileId || imported.status === 'SKIPPED') {
          const reason =
            typeof imported.reason === 'string' ? imported.reason : '';
          lycheeLog(
            e.event_id,
            'drive.result',
            'failed',
            /quota|storageQuotaExceeded/i.test(reason)
              ? 'דרייב דחה את ההעלאה בגלל מגבלת נפח האחסון'
              : reason.startsWith('drive_upload_failed:')
              ? 'העלאת הקובץ לדרייב נכשלה; בדוק הרשאות וגישה לתיקיית העסק'
              : 'הייבוא לא אישר שמירה בדרייב; יש לבדוק את שלב השמירה במסד ותיקיית העסק',
          );
          throw new Error('Import failed');
        }
        return imported;
      },
    );
    await lycheeStep(
      e.event_id,
      'queue.complete',
      'שמירת תוצאת הייבוא בתור וניקוי הקובץ הזמני',
      () =>
        this.store.complete(
          job,
          result.status,
          owner,
          businessNumber,
          result.driveFileId,
        ),
    );
    lycheeLog(
      e.event_id,
      'drive.result',
      'completed',
      result.status === 'ALREADY_IMPORTED'
        ? 'המסמך כבר קיים בדרייב; לא נוצר עותק נוסף'
        : 'המסמך נשמר בדרייב ותוצאת הייבוא נשמרה במסד',
    );
  }
}
