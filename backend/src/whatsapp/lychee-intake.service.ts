import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Business } from '../business/business.entity';
import { DocumentImportService } from '../document-import/document-import.service';
import { DocumentImportSource } from '../document-import/enums/document-import.enums';
import { normalizeWhatsappPhone } from './whatsapp-development.config';
import { LycheeEventStore, LycheeJob } from './lychee-event.store';
import { LycheeClient } from './lychee-client.service';
import type { LycheeEvent } from './lychee-webhook.controller';

@Injectable()
export class LycheeIntakeService {
  private running = false;
  private readonly logger = new Logger(LycheeIntakeService.name);
  constructor(
    private readonly store: LycheeEventStore,
    private readonly client: LycheeClient,
    private readonly importer: DocumentImportService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Business)
    private readonly businesses: Repository<Business>,
  ) {}

  async accept(event: LycheeEvent): Promise<void> {
    try {
      await this.store.enqueue(event);
    } catch (e) {
      if ((e as any)?.getStatus?.() === 409) throw e;
      throw new ServiceUnavailableException(
        'Lychee intake storage unavailable',
      );
    }
  }

  @Interval(10000)
  async tick(): Promise<void> {
    if (
      this.running ||
      process.env.LYCHEE_INTAKE_ENABLED !== 'true' ||
      process.env.LYCHEE_WORKER_ENABLED !== 'true'
    )
      return;
    this.running = true;
    let job: LycheeJob | null = null;
    try {
      job = await this.store.claim();
      if (job) await this.process(job);
    } catch {
      this.logger.warn(
        'Lychee intake attempt failed; inspect queue status (payload and credentials omitted)',
      );
      if (job) {
        try {
          await this.store.retry(job);
        } catch {
          /* Lease expiry permits recovery. */
        }
      }
    } finally {
      this.running = false;
    }
  }

  async process(job: LycheeJob): Promise<void> {
    const e = job.payload;
    if (e.has_media && !['document', 'image'].includes(e.message_type)) {
      await this.store.complete(job, 'IGNORED');
      return;
    }
    const normalized = normalizeWhatsappPhone(e.sender_phone);
    // Signup phone is the approved account mapping. Reject shared/missing phones.
    const users = await this.users
      .createQueryBuilder('u')
      .where(
        "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(u.phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', '') IN (:...phones)",
        { phones: [normalized, '0' + normalized.slice(3)] },
      )
      .take(2)
      .getMany();
    if (users.length !== 1) {
      await this.store.complete(job, 'REJECTED_SENDER');
      return;
    }
    const owner = users[0].firebaseId;
    if (!e.has_media) {
      const selected = await this.store.selectBusiness(e, owner);
      await this.store.complete(
        job,
        selected ? 'BUSINESS_SELECTED' : 'IGNORED',
        owner,
      );
      return;
    }
    const businesses = (
      await this.businesses.find({ where: { firebaseId: owner } })
    ).filter((b) => !!b.businessNumber);
    if (!businesses.length) {
      await this.store.complete(job, 'REJECTED_BUSINESS', owner);
      return;
    }
    const prepared = await this.store.prepared(job);
    if (prepared?.firebase_id && prepared.firebase_id !== owner) {
      await this.store.complete(job, 'REJECTED_SENDER');
      return;
    }
    const selected = prepared?.business_number;
    if (selected && !businesses.some((b) => b.businessNumber === selected)) {
      await this.store.complete(job, 'REJECTED_BUSINESS', owner);
      return;
    }
    const file = prepared?.content
      ? {
          content: Buffer.from(prepared.content),
          filename: prepared.filename,
          mimeType: prepared.mime_type,
        }
      : await this.client.download(e.message_id);
    if (businesses.length > 1 && !selected) {
      // No send API exists in this adapter. Keep each document separately.
      await this.store.waitForBusiness(
        job,
        owner,
        businesses.map((b) => ({
          businessNumber: b.businessNumber,
          label: b.businessNumber,
          name: b.businessName,
        })),
        file,
      );
      return;
    }
    const businessNumber = selected || businesses[0].businessNumber;
    const result = await this.importer.importDocument({
      firebaseId: owner,
      businessNumber,
      source: DocumentImportSource.API_IMPORT,
      ...file,
    });
    if (!result.driveFileId || result.status === 'SKIPPED')
      throw new Error('Import failed');
    await this.store.complete(
      job,
      result.status,
      owner,
      businessNumber,
      result.driveFileId,
    );
  }
}
