import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { appendFileSync } from 'fs';

const requests = new AsyncLocalStorage<{ requestId: string }>();
export const pdfDiagnosticRequestId = () => requests.getStore()?.requestId;
const enabled = () => process.env.NODE_ENV === 'development';
const emit = (value: object) => {
  if (enabled()) {
    const line = JSON.stringify(value);
    try { console.log(line); } catch {}
    if (process.env.PDF_DIAGNOSTICS_FILE) {
      try { appendFileSync(process.env.PDF_DIAGNOSTICS_FILE, line + '\n'); } catch {}
    }
  }
};

// Development timings only. Never accept/log payloads, URLs, identities or errors.
export function pdfDiagnosticsMiddleware(req: any, res: any, next: () => void) {
  if (!enabled() || req.method !== 'POST' ||
      !['/documents/create-doc', '/documents/preview-doc'].includes(req.path)) return next();
  const requestId = randomUUID();
  const started = performance.now();
  emit({ event: 'pdf_dev_configuration', requestId,
    standaloneService: Boolean(process.env.PDF_SERVICE_URL),
    loopbackService: /^http:\/\/(?:127\.0\.0\.1|localhost):8082\/?$/.test(process.env.PDF_SERVICE_URL || ''),
    signingConfigured: Boolean(process.env.FILLFASTER_API_TOKEN),
    synchronizeDisabled: process.env.DISABLE_SYNCHRONIZE === 'true',
    developmentDatabase: process.env.DB_DATABASE === 'keepintax-dev',
  });
  res.setHeader('X-Pdf-Diagnostic-Id', requestId);
  res.once('finish', () => emit({ event: 'pdf_http_total', requestId,
    operation: req.path.endsWith('/create-doc') ? 'create' : 'preview',
    status: res.statusCode, totalMs: Math.round(performance.now() - started) }));
  requests.run({ requestId }, next);
}

export async function measurePdfStage<T>(stage: string, work: () => Promise<T>,
  renderRequestId?: string): Promise<T> {
  if (!enabled()) return work();
  const started = performance.now();
  let success = false;
  try { const result = await work(); success = true; return result; }
  finally { emit({ event: 'pdf_operation_stage', requestId: pdfDiagnosticRequestId(),
    renderRequestId, stage, success, durationMs: Math.round(performance.now() - started) }); }
}

export function createPdfTimings(event: string) {
  const started = performance.now();
  let previous = started;
  const stagesMs: Record<string, number> = {};
  return {
    mark(stage: string) { const now = performance.now(); stagesMs[stage] = Math.round(now - previous); previous = now; },
    finish() { emit({ event, requestId: pdfDiagnosticRequestId(), stagesMs,
      totalMs: Math.round(performance.now() - started) }); },
  };
}

export function logPdfSigningFailure(details: {
  reason: 'PROVIDER_REQUEST_FAILED' | 'INVALID_SIGNATURE_ENVELOPE';
  status?: number;
  networkCode?: string;
}) {
  emit({ event: 'pdf_signing_failure', requestId: pdfDiagnosticRequestId(), ...details });
}
