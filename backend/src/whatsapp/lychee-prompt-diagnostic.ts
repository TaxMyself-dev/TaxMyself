import type { BusinessQuestionRequest } from './lychee-business-question';
import { safeLycheeError } from './lychee-log';

export type PromptDiagnostic = {
  lycheeMessageId?: string;
  httpStatus?: number;
  code?: string;
  providerCode?: string;
  providerReason?: string;
  failureKind: 'http' | 'network' | 'missing_receipt' | 'local';
};

// Never serialize Axios errors: they contain request bodies and Authorization.
// Only these scalar response fields may contribute to diagnostics.
export function promptDiagnostic(
  error: any,
  request?: BusinessQuestionRequest,
): PromptDiagnostic {
  const secrets = [
    process.env.LYCHEE_API_KEY,
    process.env.LYCHEE_WEBHOOK_SECRET,
    request?.phone,
    request?.channel_id,
    request?.reply_to_whatsapp_message_id,
    request?.text,
    ...(request?.buttons || []).map((button) =>
      typeof button === 'string' ? button : button.text,
    ),
  ].filter((v): v is string => typeof v === 'string' && !!v);
  function clean(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    let text = value;
    for (const secret of secrets.sort((a, b) => b.length - a.length))
      text = text.split(secret).join('[REDACTED]');
    return text
      .replace(/https?:\/\/[^\s<>"']+/gi, '[URL]')
      .replace(/Bearer\s+[^\s,;]+/gi, '[REDACTED]')
      .replace(
        /(?:Bearer\s+|(?:password|secret|token|api[_ -]?key|authorization)\s*[:=]\s*)[^\s,;]+/gi,
        '[REDACTED]',
      )
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[EMAIL]')
      .replace(/\+?\d[\d ()-]{6,}\d/g, '[NUMBER]')
      .replace(/[A-Za-z0-9_+\/-]{24,}/g, '[REDACTED]')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .slice(0, 400);
  }
  const status = error?.response?.status;
  const httpStatus =
    Number.isInteger(status) && status >= 100 && status <= 599
      ? status
      : undefined;
  const data = error?.response?.data;
  const providerCode = clean(data?.code ?? data?.error?.code);
  const providerReason = clean(
    data?.message ?? data?.error?.message ?? data?.error,
  );
  return {
    httpStatus,
    code: safeLycheeError(error).code,
    providerCode,
    providerReason,
    failureKind: httpStatus ? 'http' : error?.code ? 'network' : 'local',
  };
}

export class PromptDeliveryError extends Error {
  constructor(
    readonly diagnostic: PromptDiagnostic,
    message = 'Question delivery failed',
  ) {
    super(message);
  }
}
