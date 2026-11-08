import { Logger } from '@nestjs/common';

export const importStageMessages = {
  'business.resolve': 'בחירת העסק לייבוא',
  'content.hash': 'חישוב חתימת תוכן הקובץ',
  'db.dedup': 'בדיקת כפילות במסד עבור המשתמש והעסק',
  'db.folder_lookup': 'קריאת הגדרות תיקיות העסק מהמסד',
  'drive.provision': 'הכנת תיקיות קליטה ועיבוד בתוך תיקיית העסק הקיימת',
  'db.folder_save': 'שמירת מזהי תיקיות העסק במסד',
  'drive.list': 'קריאת רשימות הקבצים בתיקיות העסק במקביל',
  'drive.recovery.verify':
    'אימות תוכן קובץ קיים לצורך התאוששות ללא העלאה נוספת',
  'drive.upload': 'העלאת קובץ חדש לדרייב',
  'db.import_save': 'שמירת רשומת הייבוא במסד',
  'db.race_lookup': 'קריאת רשומת הייבוא שנשמרה במקביל',
  'drive.cleanup': 'ניקוי העלאה חדשה לאחר כישלון רישום או תחרות ייבוא',
} as const;
const logger = new Logger('DocumentImport');
/** Optional correlation only. Never serialize the request, result or exception; preserve error identity and order. */
export async function traceImportStep<T>(
  eventId: string | undefined,
  stage: keyof typeof importStageMessages,
  work: () => Promise<T>,
): Promise<T> {
  if (!eventId || !/^[A-Za-z0-9_.:-]{1,255}$/.test(eventId)) return work();
  const started = Date.now();
  const emit = (outcome: 'started' | 'completed' | 'failed') => {
    const line = JSON.stringify({
      event_id: eventId,
      stage: `drive.import.${stage}`,
      outcome,
      message: importStageMessages[stage],
      ...(outcome === 'started'
        ? {}
        : { durationMs: Math.max(0, Date.now() - started) }),
    });
    if (outcome === 'failed') logger.warn(line);
    else logger.debug(line);
  };
  emit('started');
  try {
    const result = await work();
    emit('completed');
    return result;
  } catch (error) {
    emit('failed');
    throw error;
  }
}
