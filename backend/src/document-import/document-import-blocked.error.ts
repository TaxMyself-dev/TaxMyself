import { BadRequestException } from '@nestjs/common';

export type ImportBlockCode =
  | 'DRIVE_FOLDER_MISSING'
  | 'UNSUPPORTED_MEDIA_CONTENT'
  | 'INVALID_MEDIA_SIZE';
export const importBlockReasons: Record<ImportBlockCode, string> = {
  DRIVE_FOLDER_MISSING:
    'לעסק אין עדיין תיקיית דרייב; יש להכין את תיקיית העסק לפני ייבוא',
  UNSUPPORTED_MEDIA_CONTENT: 'תוכן הקובץ אינו PDF, JPEG או PNG',
  INVALID_MEDIA_SIZE: 'הקובץ ריק או חורג ממגבלת 10 MiB',
};
export function isImportBlockCode(code: unknown): code is ImportBlockCode {
  return (
    typeof code === 'string' &&
    Object.prototype.hasOwnProperty.call(importBlockReasons, code)
  );
}
/** Explicit local validation/configuration blockers only; never classify HTTP status or network errors here. */
export class DocumentImportBlockedError extends BadRequestException {
  constructor(readonly blockCode: ImportBlockCode, message: string) {
    super(message);
  }
}
