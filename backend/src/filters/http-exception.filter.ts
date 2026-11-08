import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter that logs every unhandled error as structured JSON
 * so Cloud Run / GCP Logging shows the actual error message, stack, path, and status.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? (exception.getResponse() as any)?.message ?? exception.message
        : exception instanceof Error
          ? exception.message
          : String(exception);

    const stack = exception instanceof Error ? exception.stack : undefined;

    // Never log the raw URL: SHAAM routes currently carry the business number
    // in the query string. `path` excludes it; the fallback is defensively
    // stripped for non-Express test/adaptor requests.
    const rawPath = request?.path ?? request?.url ?? '';
    const path = String(rawPath).split(/[?#]/, 1)[0];
    const method = request?.method;

    if (status >= 500) {
      this.logger.error(JSON.stringify({
        severity: 'ERROR',
        message: 'Request failed',
        error: message,
        statusCode: status,
        path,
        method,
        stack,
      }));
    } else if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
      const exceptionResponse =
        exception instanceof HttpException ? exception.getResponse() : undefined;
      const errorCode =
        typeof exceptionResponse === 'object' && exceptionResponse !== null
          ? this.boundedErrorCode((exceptionResponse as any).code)
          : undefined;
      this.logger.warn(JSON.stringify({
        event: 'security_event',
        securityEvent: 'http_authorization_denied',
        severity: 'WARNING',
        statusCode: status,
        path,
        method,
        ...(errorCode ? { errorCode } : {}),
      }));
    } else {
      this.logger.warn(`${status} ${method} ${path} — ${message}`);
    }

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: status, message };

    response.status(status).json(body);
  }

  private boundedErrorCode(value: unknown): string | undefined {
    return typeof value === 'string' && /^[A-Z0-9_]{1,64}$/.test(value)
      ? value
      : undefined;
  }
}
