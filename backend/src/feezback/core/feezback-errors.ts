import { AxiosError } from 'axios';

export interface FeezbackErrorContext {
  method: string;
  url: string;
  status?: number;
  code?: string;
  message: string;
  responseBody?: unknown;
  headers?: Record<string, unknown>;
  originalError?: unknown;
}

export class FeezbackHttpError extends Error {
  readonly method: string;
  readonly url: string;
  readonly status?: number;
  readonly code?: string;
  readonly responseBody?: unknown;
  readonly headers?: Record<string, unknown>;
  readonly originalError?: unknown;

  constructor(context: FeezbackErrorContext) {
    super(context.message);
    this.name = 'FeezbackHttpError';
    this.method = context.method;
    this.url = context.url;
    this.status = context.status;
    this.code = context.code;
    this.responseBody = context.responseBody;
    this.headers = context.headers;
    this.originalError = context.originalError;
  }
}

export function toFeezbackHttpError(
  method: string,
  url: string,
  error: unknown,
): FeezbackHttpError {
  if (error instanceof FeezbackHttpError) {
    return error;
  }

  const defaultContext: FeezbackErrorContext = {
    method,
    url,
    message: 'Unexpected Feezback HTTP error',
    originalError: error,
  };

  if (isAxiosError(error)) {
    const status = error.response?.status;
    const responseBody = error.response?.data;
    const code = error.code;
    const message = buildAxiosMessage(method, url, status, code, error.message);

    return new FeezbackHttpError({
      ...defaultContext,
      status,
      code,
      message,
      responseBody,
      headers: error.response?.headers as Record<string, unknown> | undefined,
    });
  }

  if (error instanceof Error) {
    return new FeezbackHttpError({
      ...defaultContext,
      message: `${method} ${url} failed: ${error.message}`,
    });
  }

  return new FeezbackHttpError(defaultContext);
}

function buildAxiosMessage(
  method: string,
  url: string,
  status?: number,
  code?: string,
  detail?: string,
): string {
  const parts: string[] = [`${method.toUpperCase()} ${url}`];
  if (status) {
    parts.push(`status=${status}`);
  }
  if (code) {
    parts.push(`code=${code}`);
  }
  if (detail) {
    parts.push(detail);
  }
  return parts.join(' ');
}

function isAxiosError(value: unknown): value is AxiosError {
  return !!value && typeof value === 'object' && (value as AxiosError).isAxiosError === true;
}
