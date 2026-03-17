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

    const logPayload = {
      severity: status >= 500 ? 'ERROR' : 'WARNING',
      message: 'Request failed',
      error: message,
      statusCode: status,
      path: request?.url ?? request?.path,
      method: request?.method,
      stack: stack ?? undefined,
    };

    this.logger.error(JSON.stringify(logPayload));

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: status, message };

    response.status(status).json(body);
  }
}
