import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { google } from 'googleapis';

export interface DocumentOcrTaskPayload {
  firebaseId: string;
  businessNumber: string;
}

/**
 * Small Cloud Tasks adapter for inbox OCR. The queue is deliberately optional:
 * local development keeps the synchronous path unless it is explicitly enabled.
 */
@Injectable()
export class DocumentOcrQueueService {
  private readonly logger = new Logger(DocumentOcrQueueService.name);

  isEnabled(): boolean {
    return process.env.DOCUMENT_OCR_QUEUE_ENABLED === 'true';
  }

  async enqueue(
    payload: DocumentOcrTaskPayload,
    deduplicationKey?: string,
  ): Promise<{ queued: boolean; duplicate: boolean }> {
    if (!this.isEnabled()) return { queued: false, duplicate: false };

    const projectId = this.requiredEnv('DOCUMENT_OCR_QUEUE_PROJECT_ID');
    const location = this.requiredEnv('DOCUMENT_OCR_QUEUE_LOCATION');
    const queueName = this.requiredEnv('DOCUMENT_OCR_QUEUE_NAME');
    const targetUrl = this.requiredEnv('DOCUMENT_OCR_QUEUE_TARGET_URL');
    const serviceAccountEmail = this.requiredEnv(
      'DOCUMENT_OCR_QUEUE_SERVICE_ACCOUNT_EMAIL',
    );
    const audience = this.audience(targetUrl);

    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = google.cloudtasks({ version: 'v2', auth });
    const parent = `projects/${projectId}/locations/${location}/queues/${queueName}`;
    const taskId = deduplicationKey
      ? `ocr-${createHash('sha256').update(deduplicationKey).digest('hex').slice(0, 32)}`
      : undefined;

    try {
      await client.projects.locations.queues.tasks.create({
        parent,
        requestBody: {
          task: {
            name: taskId ? `${parent}/tasks/${taskId}` : undefined,
            dispatchDeadline: '900s',
            httpRequest: {
              httpMethod: 'POST',
              url: targetUrl,
              headers: { 'Content-Type': 'application/json' },
              body: Buffer.from(JSON.stringify(payload)).toString('base64'),
              oidcToken: {
                serviceAccountEmail,
                audience,
              },
            },
          },
        },
      });
      return { queued: true, duplicate: false };
    } catch (error: any) {
      // Cloud Tasks remembers task names after completion. A Mailgun retry
      // therefore cannot enqueue the same import twice, and is still a
      // successful intake from our point of view.
      if (error?.code === 409 || error?.response?.status === 409) {
        this.logger.debug(`OCR task already exists (${taskId})`);
        return { queued: true, duplicate: true };
      }
      this.logger.error(
        `Failed to enqueue OCR for business=${payload.businessNumber}: ${error?.message ?? error}`,
        error?.stack,
      );
      throw new InternalServerErrorException('Failed to enqueue document OCR');
    }
  }

  async assertAuthorized(authorization: string | undefined): Promise<void> {
    if (!this.isEnabled()) throw new UnauthorizedException();

    const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? '');
    if (!match) throw new UnauthorizedException('Missing task identity token');

    const expectedEmail = this.requiredEnv(
      'DOCUMENT_OCR_QUEUE_SERVICE_ACCOUNT_EMAIL',
    ).toLowerCase();
    const targetUrl = this.requiredEnv('DOCUMENT_OCR_QUEUE_TARGET_URL');

    try {
      const verifier = new google.auth.OAuth2();
      const ticket = await verifier.verifyIdToken({
        idToken: match[1],
        audience: this.audience(targetUrl),
      });
      const claims = ticket.getPayload();
      if (
        claims?.email?.toLowerCase() !== expectedEmail ||
        claims.email_verified !== true
      ) {
        throw new UnauthorizedException('Unexpected task identity');
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid task identity token');
    }
  }

  private audience(targetUrl: string): string {
    return (
      process.env.DOCUMENT_OCR_QUEUE_AUDIENCE?.trim() ||
      new URL(targetUrl).origin
    );
  }

  private requiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new InternalServerErrorException(`${name} is not configured`);
    }
    return value;
  }
}
