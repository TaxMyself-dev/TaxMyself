import { Logger } from '@nestjs/common';

const logger = new Logger('Lychee');
const known: Record<string, string> = {
  'Lychee API key unavailable': 'חסר מפתח API של ליצ׳י בהגדרות השרת',
  'Untrusted media host': 'קישור ההורדה אינו בדומיין HTTPS מורשה',
  'Untrusted media path': 'נתיב הקובץ אינו בתיקיית המדיה הפרטית המורשית',
  'Non-public media destination': 'בדיקת DNS חסמה כתובת שאינה IPv4 ציבורית',
  'Invalid media size': 'הקובץ ריק או חורג ממגבלת 10 MiB',
  'Unsupported media content': 'תוכן הקובץ אינו PDF, JPEG או PNG',
  'Import failed':
    'מנגנון הייבוא לא אישר שמירה בדרייב; המסמך אינו מסומן כהצלחה',
};

export function safeLycheeError(error: any): {
  reason: string;
  httpStatus?: number;
  code?: string;
} {
  if (typeof error?.message === 'string') {
    if (/has no Drive folder yet/.test(error.message))
      return {
        reason:
          'לעסק אין עדיין תיקיית דרייב; יש להכין את תיקיית העסק לפני ייבוא',
      };
    if (/Business .* not found for this user/.test(error.message))
      return { reason: 'העסק לא נמצא בבעלות המשתמש בזמן הייבוא' };
  }
  const status = error?.response?.status;
  if (Number.isInteger(status) && status >= 100 && status <= 599) {
    const reason =
      status >= 500
        ? 'השרת המרוחק החזיר שגיאת שרת'
        : status === 401 || status === 403
        ? 'השרת המרוחק דחה את הרשאת הגישה או שהקישור פג'
        : status === 404
        ? 'ההודעה או הקובץ לא נמצאו אצל הספק'
        : status === 429
        ? 'הספק הגביל את קצב הבקשות'
        : 'השרת המרוחק דחה את הבקשה';
    return { reason, httpStatus: status };
  }
  const code =
    typeof error?.code === 'string' &&
    /^(ER_[A-Z_]+|E[A-Z_]+|ECONNABORTED)$/.test(error.code)
      ? error.code
      : undefined;
  if (code === 'ER_NO_SUCH_TABLE')
    return {
      code,
      reason:
        'טבלת הקליטה חסרה במסד הנתונים; יש לבדוק שהסכמה הותקנה בסביבה הנכונה',
    };
  if (code === 'ER_ACCESS_DENIED_ERROR')
    return { code, reason: 'מסד הנתונים דחה את הרשאות ההתחברות' };
  if (code)
    return {
      code,
      reason: code.startsWith('ER_')
        ? 'פעולת מסד הנתונים נכשלה'
        : code === 'ENOTFOUND' || code === 'EAI_AGAIN'
        ? 'פתרון כתובת DNS נכשל'
        : code === 'ETIMEDOUT' || code === 'ECONNABORTED'
        ? 'הפעולה חרגה מזמן ההמתנה'
        : 'חיבור רשת או קריאת קובץ נכשלו',
    };
  return {
    reason:
      known[error?.message] ||
      'הפעולה נכשלה; פרטי השגיאה הגולמיים הוסתרו כדי למנוע חשיפת מידע',
  };
}

export function lycheeLog(
  eventId: string | undefined,
  stage: string,
  outcome: string,
  message: string,
  fields: {
    attempts?: number;
    count?: number;
    bytes?: number;
    durationMs?: number;
    httpStatus?: number;
    code?: string;
    providerCode?: string;
    lycheeMessageId?: string;
    providerReason?: string;
    failureKind?: string;
    responseShape?: Record<string, string>;
  } = {},
) {
  // Only caller-controlled messages and an explicit metadata allowlist are logged.
  const safeId =
    eventId && /^[A-Za-z0-9_.:-]{1,255}$/.test(eventId) ? eventId : undefined;
  const line = JSON.stringify({
    event_id: safeId,
    stage,
    outcome,
    message,
    ...fields,
  });
  if (outcome === 'failed' || outcome === 'blocked') logger.warn(line);
  else logger.debug(line); // Debug is enabled in the existing backend bootstrap.
}

export class LycheeStepError extends Error {
  constructor(
    readonly stage: string,
    readonly diagnostic: ReturnType<typeof safeLycheeError>,
  ) {
    super(diagnostic.reason);
  }
}

export async function lycheeStep<T>(
  eventId: string | undefined,
  stage: string,
  message: string,
  work: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  lycheeLog(eventId, stage, 'started', message);
  try {
    const result = await work();
    lycheeLog(eventId, stage, 'completed', 'השלב הסתיים בהצלחה', {
      durationMs: Date.now() - started,
    });
    return result;
  } catch (error) {
    if (error instanceof LycheeStepError) throw error;
    const diagnostic = safeLycheeError(error);
    lycheeLog(eventId, stage, 'failed', diagnostic.reason, {
      httpStatus: diagnostic.httpStatus,
      code: diagnostic.code,
      durationMs: Date.now() - started,
    });
    if ((error as any)?.getStatus?.() === 409) throw error;
    throw new LycheeStepError(stage, diagnostic);
  }
}
