import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { ReportsService, UniformFileArtifacts } from '../../reports/reports.service';
import { ShaamEnvironment } from '../shaam.constants';
import { UniformFileSubmission } from '../entities/uniform-file-submission.entity';
import { UniformFileSubmissionState } from '../entities/shaam.enums';

export interface PrepareUniformFileSubmissionInput {
  businessId: number;
  businessNumber: string;
  ownerFirebaseId: string;
  actorFirebaseId: string;
  environment: ShaamEnvironment;
  periodStart: string;
  periodEnd: string;
}

export interface UniformFileSubmissionView {
  id: number;
  businessNumber: string;
  environment: ShaamEnvironment;
  periodStart: string;
  periodEnd: string;
  state: UniformFileSubmissionState;
  iniByteLength: string;
  bkmByteLength: string;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  reused: boolean;
}

interface GeneratedPair {
  artifacts: UniformFileArtifacts;
  iniSha256: string;
  bkmSha256: string;
  generatedAt: Date;
}

@Injectable()
export class UniformFileSubmissionService {
  constructor(
    @InjectRepository(UniformFileSubmission)
    private readonly repo: Repository<UniformFileSubmission>,
    private readonly reports: ReportsService,
  ) {}

  async prepare(input: PrepareUniformFileSubmissionInput): Promise<UniformFileSubmissionView> {
    this.assertPeriod(input.periodStart, input.periodEnd);

    const latest = await this.repo.findOne({
      where: {
        businessId: input.businessId,
        environment: input.environment,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
      order: { generatedAt: 'DESC', id: 'DESC' },
    });

    if (latest) {
      const regenerated = await this.generate(input, new Date(latest.generatedAt));
      if (
        regenerated.iniSha256 === latest.iniSha256 &&
        regenerated.bkmSha256 === latest.bkmSha256
      ) {
        return this.toView(latest, true);
      }
    }

    const generatedAt = this.nextGenerationTimestamp(latest?.generatedAt);
    const generated = await this.generate(input, generatedAt);
    const submission = this.repo.create({
      businessId: input.businessId,
      businessNumberSnapshot: input.businessNumber,
      actorFirebaseId: input.actorFirebaseId,
      environment: input.environment,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      representorCompanyId: null,
      state: UniformFileSubmissionState.GENERATED,
      iniStatus: null,
      bkmStatus: null,
      iniSha256: generated.iniSha256,
      bkmSha256: generated.bkmSha256,
      iniByteLength: String(generated.artifacts.iniBuffer.length),
      bkmByteLength: String(generated.artifacts.bkmvdataBuffer.length),
      shaamUniqueId: null,
      iniFileName: null,
      bkmFileName: null,
      iniFileUniqueId: null,
      bkmFileUniqueId: null,
      errorCategory: null,
      errorCode: null,
      errorMessage: null,
      retryCount: 0,
      generatedAt,
      uploadedAt: null,
      lastPolledAt: null,
      completedAt: null,
    });

    try {
      return this.toView(await this.repo.save(submission), false);
    } catch (error: any) {
      if (!this.isDuplicate(error)) throw error;
      const concurrent = await this.repo.findOne({
        where: {
          environment: input.environment,
          businessId: input.businessId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          iniSha256: generated.iniSha256,
          bkmSha256: generated.bkmSha256,
        },
      });
      if (!concurrent) throw error;
      return this.toView(concurrent, true);
    }
  }

  async status(businessId: number, submissionId: number): Promise<UniformFileSubmissionView> {
    const submission = await this.repo.findOne({
      where: { id: submissionId, businessId },
    });
    if (!submission) throw new NotFoundException('Uniform-file submission not found');
    return this.toView(submission, false);
  }

  private async generate(
    input: PrepareUniformFileSubmissionInput,
    generatedAt: Date,
  ): Promise<GeneratedPair> {
    const uniqueId = this.deriveUniqueId(input, generatedAt);
    const artifacts = await this.reports.createUniformFile(
      input.ownerFirebaseId,
      input.periodStart,
      input.periodEnd,
      input.businessNumber,
      { uniqueId, generatedAt },
    );
    return {
      artifacts,
      iniSha256: this.sha256(artifacts.iniBuffer),
      bkmSha256: this.sha256(artifacts.bkmvdataBuffer),
      generatedAt,
    };
  }

  private deriveUniqueId(
    input: PrepareUniformFileSubmissionInput,
    generatedAt: Date,
  ): string {
    const seed = [
      input.environment,
      input.businessId,
      input.businessNumber,
      input.periodStart,
      input.periodEnd,
      generatedAt.toISOString(),
    ].join('|');
    const digest = createHash('sha256').update(seed, 'utf8').digest('hex');
    // Twelve hex digits fit safely inside JavaScript's integer precision. The
    // offset guarantees an exact 15-digit decimal identifier.
    return String(parseInt(digest.slice(0, 12), 16) + 100000000000000);
  }

  private sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private nextGenerationTimestamp(previous?: Date): Date {
    const now = new Date();
    now.setMilliseconds(0);
    if (!previous) return now;
    const previousTime = new Date(previous).getTime();
    return now.getTime() > previousTime
      ? now
      : new Date(previousTime + 1000);
  }

  private assertPeriod(start: string, end: string): void {
    if (!this.isCanonicalDate(start) || !this.isCanonicalDate(end)) {
      throw new BadRequestException('Uniform-file period must use YYYY-MM-DD');
    }
    const startTime = Date.parse(`${start}T00:00:00Z`);
    const endTime = Date.parse(`${end}T00:00:00Z`);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime) {
      throw new BadRequestException('Invalid uniform-file period');
    }
  }

  private isCanonicalDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  private isDuplicate(error: any): boolean {
    return error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062;
  }

  private toView(
    submission: UniformFileSubmission,
    reused: boolean,
  ): UniformFileSubmissionView {
    return {
      id: submission.id,
      businessNumber: submission.businessNumberSnapshot,
      environment: submission.environment,
      periodStart: submission.periodStart,
      periodEnd: submission.periodEnd,
      state: submission.state,
      iniByteLength: submission.iniByteLength,
      bkmByteLength: submission.bkmByteLength,
      generatedAt: submission.generatedAt,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      reused,
    };
  }
}
