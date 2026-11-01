import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type BankingStage = 'consent_termination' | 'consent_check' | 'connection_save' | 'transaction_fetch' | 'transaction_save';
export interface BankingIssue {
  code: string;
  errorId: string;
  message: string;
  partial: boolean;
}
const codes: Record<BankingStage, string> = {
  consent_termination: 'OB-05', consent_check: 'OB-01', connection_save: 'OB-02', transaction_fetch: 'OB-03', transaction_save: 'OB-04',
};
const messages: Record<BankingStage, string> = {
  consent_termination: 'לא הצלחנו לאשר שביטול ההרשאה הושלם. ייתכן שהיא עדיין פעילה. יש לרענן את בדיקת ההרשאות לפני ניסיון נוסף.',
  consent_check: 'לא הצלחנו להשלים את בדיקת ההרשאות. המידע שלא אומת נשאר ללא שינוי. אפשר לנסות שוב.',
  connection_save: 'חלק מפרטי החיבור לא נשמרו באפליקציה. פנה לתמיכה.',
  transaction_fetch: 'לא הצלחנו לקבל את כל התנועות. הנתונים עשויים להיות חלקיים. אפשר לנסות שוב.',
  transaction_save: 'חלק מהתנועות לא נשמרו באפליקציה ולכן הנתונים אינם מלאים. פנה לתמיכה.',
};

/** Never serialize exceptions, SQL, provider payloads, credentials or account numbers here. */
export function bankingIssue(logger: Pick<Logger, 'error'>, stage: BankingStage, userId: string,
  reason: string, error?: any, source?: { sourceId?: string; sourceRecordId?: number; connectionRole?: string; consentId?: string },
  counts?: Record<string, number>, partial = true): BankingIssue {
  const issue = { code: codes[stage], errorId: randomUUID(), message: messages[stage], partial };
  const safeCode = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_:-]{1,80}$/.test(value) ? value : undefined;
  const knownMessage = ['Malformed consents','Malformed sources','Invalid Feezback consent response',
    'Invalid Feezback cards response','Source record not found for this user and payment source',
    'Missing webhook payload','Missing webhook consent','Missing webhook user','Missing webhook identifiers']
    .includes(error?.message) ? error.message : undefined;
  logger.error('[OpenBanking] ' + JSON.stringify({ ...issue, stage, userId, reason,
    consentId: safeCode(source?.consentId), sourceRecordId: source?.sourceRecordId, connectionRole: source?.connectionRole,
    source: source?.sourceId ? '***' + source.sourceId.replace(/\D/g, '').slice(-4) : undefined,
    httpStatus: Number.isInteger(error?.status) ? error.status : undefined,
    providerCode: safeCode(error?.responseBody?.error?.code) ?? safeCode(String(error?.responseBody?.error_code ?? '')),
    cause: safeCode(error?.code), exceptionType: safeCode(error?.name), detail:knownMessage,
    providerReason: typeof error?.responseBody?.message === 'string' && /explicit deny in an identity-based policy/.test(error.responseBody.message)
      ? 'explicit_identity_policy_deny' : undefined,
    column: /Data truncated for column '([A-Za-z0-9_]+)'/.exec(error?.sqlMessage ?? error?.message ?? '')?.[1], counts }));
  return issue;
}

export class BankingBatchError extends Error {
  constructor(public readonly issues: BankingIssue[], public readonly completed = 0) {
    super(`${issues[0].code}|${issues[0].errorId}`);
    issues.forEach(issue => issue.partial = completed > 0);
  }
}

export function issueFromReason(reason?: string | null, partial = true): BankingIssue | undefined {
  const match = /^(OB-0[1-5])\|([0-9a-f-]{36})$/.exec(reason ?? '');
  if (!match) return undefined;
  const stage = (Object.keys(codes) as BankingStage[]).find(key => codes[key] === match[1])!;
  const message = !partial && stage === 'transaction_save' ? 'לא הצלחנו לשמור את התנועות באפליקציה. פנה לתמיכה.'
    : !partial && stage === 'transaction_fetch' ? 'לא הצלחנו לקבל את התנועות. המידע הקיים נשמר. אפשר לנסות שוב.' : messages[stage];
  return { code: match[1], errorId: match[2], message, partial };
}
