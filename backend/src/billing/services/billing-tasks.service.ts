import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';

export type CompletionTaskKind = 'CAPTURE' | 'MAIL';
export const BILLING_TASK_TRANSPORT = Symbol('BILLING_TASK_TRANSPORT');
export interface BillingTaskTransport {
  create(parent: string, task: Record<string, unknown>): Promise<void>;
  verify(token: string, audience: string): Promise<Record<string, any>>;
}

/** Uses the already-installed official Google client; no credentials at import/startup. */
class GoogleBillingTaskTransport implements BillingTaskTransport {
  async create(parent: string, task: Record<string, unknown>): Promise<void> {
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client = await auth.getClient();
    await client.request({ url: `https://cloudtasks.googleapis.com/v2/${parent}/tasks`,
      method: 'POST', data: { task }, timeout: 10000 });
  }
  async verify(token: string, audience: string): Promise<Record<string, any>> {
    const { google } = require('googleapis');
    const ticket = await new google.auth.OAuth2().verifyIdToken({ idToken: token, audience });
    return ticket.getPayload() ?? {};
  }
}

@Injectable()
export class BillingTasksService implements OnModuleInit {
  private readonly logger = new Logger(BillingTasksService.name);
  private readonly transport: BillingTaskTransport;
  constructor(private readonly dataSource: DataSource,
    @Optional() @Inject(BILLING_TASK_TRANSPORT) transport?: BillingTaskTransport) {
    this.transport = transport ?? new GoogleBillingTaskTransport();
  }

  get enabled(): boolean { return process.env.BILLING_TASKS_ENABLED === 'true'; }

  onModuleInit(): void {
    if (process.env.BILLING_TASKS_ENABLED && !['true', 'false'].includes(process.env.BILLING_TASKS_ENABLED)) {
      throw new Error('BILLING_TASKS_ENABLED must be true or false');
    }
    if (this.enabled) this.configuration();
  }

  private configuration() {
    const project = process.env.BILLING_TASKS_PROJECT_ID ?? '';
    const location = process.env.BILLING_TASKS_LOCATION ?? '';
    const queue = process.env.BILLING_TASKS_QUEUE ?? '';
    const target = process.env.BILLING_TASKS_TARGET_URL ?? '';
    const audience = process.env.BILLING_TASKS_AUDIENCE ?? '';
    const email = process.env.BILLING_TASKS_SERVICE_ACCOUNT ?? '';
    const database = process.env.BILLING_TASKS_EXPECTED_DATABASE ?? '';
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) || !/^[a-z0-9-]+$/.test(location) ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(queue) || !email.endsWith(`@${project}.iam.gserviceaccount.com`) ||
      !/^[a-zA-Z0-9-]+@/.test(email) || !database || this.dataSource.options.database !== database) {
      throw new Error('Invalid billing task configuration or database binding');
    }
    for (const address of [target, audience]) {
      const url = new URL(address);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
        throw new Error('Billing task target/audience must be HTTPS URLs without credentials/query/fragment');
      }
    }
    if (new URL(target).pathname !== '/internal/billing/completion') throw new Error('Invalid billing task target path');
    return { parent: `projects/${project}/locations/${location}/queues/${queue}`, target, audience, email };
  }

  /** Called only after the pending state commits. Failure leaves DB authority intact. */
  async enqueue(kind: CompletionTaskKind, id: number, due = new Date(), generation = ''): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      const config = this.configuration();
      if (!['CAPTURE', 'MAIL'].includes(kind) || !Number.isSafeInteger(id) || id < 1 || !Number.isFinite(due.getTime())) throw new Error('Invalid billing task');
      const identity = generation.startsWith('repair-') ? generation : `${due.toISOString()}:${generation}`;
      const suffix = createHash('sha256').update(`${kind}:${id}:${identity}`).digest('hex');
      await this.transport.create(config.parent, {
        name: `${config.parent}/tasks/billing-${suffix}`,
        scheduleTime: new Date(Math.max(Date.now(), due.getTime())).toISOString(),
        dispatchDeadline: '240s',
        httpRequest: { httpMethod: 'POST', url: config.target,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify({ kind, id })).toString('base64'),
          oidcToken: { serviceAccountEmail: config.email, audience: config.audience } },
      });
      return true;
    } catch (error) {
      if ((error as any)?.response?.status === 409 &&
        (error as any)?.response?.data?.error?.status === 'ALREADY_EXISTS') return true;
      this.logger.error(`Billing ${kind} task enqueue failed for #${id}; pending work retained for daily repair`);
      return false;
    }
  }

  async verifyAuthorization(header?: string): Promise<boolean> {
    if (!this.enabled || typeof header !== 'string' || !/^Bearer \S+$/.test(header)) return false;
    try {
      const config = this.configuration();
      const payload = await this.transport.verify(header.slice(7), config.audience);
      return payload.aud === config.audience &&
        ['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) &&
        payload.email === config.email && payload.email_verified === true &&
        typeof payload.sub === 'string' && payload.sub.length > 0 &&
        typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
    } catch { return false; }
  }
}
