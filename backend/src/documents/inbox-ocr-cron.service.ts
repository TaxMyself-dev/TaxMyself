import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Business } from 'src/business/business.entity';
import { DocumentsService } from './documents.service';

const BUSINESS_BATCH_SIZE = 3;

export interface InboxOcrSweepSummary {
  eligibleBusinesses: number;
  processedDocuments: number;
  failedDocuments: number;
  businessErrors: number;
}

/**
 * Polls every provisioned Drive inbox independently of report navigation.
 * DocumentsService keeps the work single-flight across Cloud Run instances
 * with its existing per-business MySQL advisory lock.
 */
@Injectable()
export class InboxOcrCronService {
  private readonly logger = new Logger(InboxOcrCronService.name);
  private sweepRunning = false;

  constructor(
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly documentsService: DocumentsService,
  ) {}

  @Cron('* * * * *', { name: 'documentInboxOcrCron', timeZone: 'Asia/Jerusalem' })
  async runScheduledSweep(): Promise<void> {
    if (this.sweepRunning) return;
    this.sweepRunning = true;
    try {
      const summary = await this.processProvisionedInboxes();
      if (summary.processedDocuments || summary.failedDocuments || summary.businessErrors) {
        this.logger.log(
          `Automatic inbox OCR complete: businesses=${summary.eligibleBusinesses} ` +
          `processed=${summary.processedDocuments} failed=${summary.failedDocuments} ` +
          `businessErrors=${summary.businessErrors}`,
        );
      }
    } finally {
      this.sweepRunning = false;
    }
  }

  async processProvisionedInboxes(): Promise<InboxOcrSweepSummary> {
    const businesses = await this.businessRepo.find({
      where: {
        businessNumber: Not(IsNull()),
        driveInboxFolderId: Not(IsNull()),
        driveProcessedFolderId: Not(IsNull()),
      },
      select: ['id', 'firebaseId', 'businessNumber'],
      order: { id: 'ASC' },
    });
    const summary: InboxOcrSweepSummary = {
      eligibleBusinesses: businesses.length,
      processedDocuments: 0,
      failedDocuments: 0,
      businessErrors: 0,
    };

    for (let i = 0; i < businesses.length; i += BUSINESS_BATCH_SIZE) {
      const batch = businesses.slice(i, i + BUSINESS_BATCH_SIZE);
      const results = await Promise.all(batch.map(async business => {
        try {
          return await this.documentsService.processInboxForUser(
            business.firebaseId,
            business.businessNumber!,
          );
        } catch (error: any) {
          summary.businessErrors += 1;
          this.logger.warn(
            `Automatic inbox OCR failed for business ${business.id}: ${error?.message ?? error}`,
          );
          return null;
        }
      }));
      for (const result of results) {
        if (!result) continue;
        summary.processedDocuments += result.processed;
        summary.failedDocuments += result.failed;
      }
    }

    return summary;
  }
}
